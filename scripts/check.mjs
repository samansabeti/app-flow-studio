import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { validateStudioConfig, validateManifest, safeRead, STATIC_CORE, checkLocalDependencies, contentFile, isShareContent } from './instance-files.mjs';
import { projectPaths } from './project-paths.mjs';

// Contract checks for the app data, not a substitute for trying the prototype.
// This reads the registry, so it also works in a fresh copy with only a blank app.
const { projectRoot, browserRoot } = await projectPaths();
const root = pathToFileURL(`${browserRoot}${path.sep}`);
const failures = [];
const builtIns = new Set(['back', 'dismiss-overlay', 'dismiss-toast']);
let checks = 0;
let cardCount = 0;
const cardIndex = new Map(), comparisons = [];

function check(label, run) {
  checks += 1;
  try { return run(); }
  catch (error) { failures.push(`${label}: ${error.message}`); }
}

function actionNames(html) {
  return [...html.matchAll(/\bdata-(?:action|submit)\s*=\s*(["'])(.*?)\1/g)].map(match => match[2]);
}

function checkMarkup(app, html, label) {
  check(`${label} renders HTML`, () => assert.equal(typeof html, 'string'));
  if (typeof html !== 'string') return;
  check(`${label} has content`, () => assert.ok(html.trim().length > 0));
  for (const name of new Set(actionNames(html))) {
    check(`${label} action ${name}`, () => {
      assert.ok(builtIns.has(name) || typeof app.handlers?.[name] === 'function', 'missing handler');
      assert.ok(builtIns.has(name) || app.ACTIONS?.[name], 'missing ACTIONS context');
    });
  }
}

function checkNotes(context) {
  if (context.approach !== undefined) assert.equal(typeof context.approach, 'string', 'approach must be text');
  if (context.rationale !== undefined) assert.ok(
    typeof context.rationale === 'string' || (Array.isArray(context.rationale) && context.rationale.every(item => typeof item === 'string')),
    'rationale must be text or a legacy list of strings'
  );
  if (context.notes !== undefined) assert.ok(Array.isArray(context.notes) && context.notes.every(item => typeof item === 'string'), 'notes must contain strings');
}

function checkContext(app, context) {
  assert.ok(context.title && context.how, 'context needs a title and entry description');
  assert.ok(['ready', 'loading', 'empty', 'error', 'success', 'dialog', 'sheet', 'toast'].includes(context.kind), 'context needs a valid state kind');
  checkNotes(context);
  assert.ok(Array.isArray(context.actions), 'actions must be an array');
  for (const action of context.actions) {
    assert.ok(builtIns.has(action) || typeof app.handlers?.[action] === 'function', `missing handler ${action}`);
    assert.ok(builtIns.has(action) || app.ACTIONS?.[action], `missing ACTIONS context ${action}`);
  }
}

const registry = (await import(new URL('config.js', root))).default;
const rootPath = fileURLToPath(root).replace(/\/$/, '');
check('Studio configuration', () => validateStudioConfig(registry.studio));
check('Registry apps', () => assert.ok(Array.isArray(registry.apps) && registry.apps.length));
check('Registry default app', () => assert.ok(registry.apps.some(app => app.id === registry.defaultApp)));
check('Registry unique IDs', () => assert.equal(new Set(registry.apps.map(app => app.id)).size, registry.apps.length));
try {
  let files;
  if (existsSync(path.join(projectRoot, 'instance.json'))) {
    const raw = JSON.parse(readFileSync(path.join(projectRoot, 'instance.json'), 'utf8'));
    const manifest = validateManifest({ ...raw, studio: registry.studio });
    check('Instance registry matches config', () => {
      assert.equal(registry.apps.length, 1);
      assert.deepEqual(registry.apps[0], manifest.app);
      assert.equal(registry.defaultApp, manifest.app.id);
    });
    // Read the full inventory to reject stale entries, then check the export subset.
    for (const file of manifest.files) await safeRead(rootPath, file);
    files = (manifest.exportFiles ?? manifest.files).filter(isShareContent);
  } else if (registry.previewFiles !== undefined) {
    check('Preview file inventory', () => {
      assert.ok(Array.isArray(registry.previewFiles) && registry.previewFiles.length);
      registry.previewFiles.forEach(contentFile);
      assert.equal(new Set(registry.previewFiles).size, registry.previewFiles.length);
    });
    files = registry.previewFiles;
  }
  if (files) {
    const browserFiles = new Map();
    for (const file of [...STATIC_CORE, 'config.js', ...files]) browserFiles.set(file, await safeRead(rootPath, file));
    check('Browser file dependencies', () => checkLocalDependencies(browserFiles));
    if (registry.studio?.icon) check('Studio icon inventory', () => assert.ok(files.includes(registry.studio.icon.replace(/^\.\//, ''))));
  }
} catch (error) {
  check('Instance/preview file inventory', () => { throw error; });
}

const configurations = [];
for (const entry of registry.apps) {
  if (entry.variants === undefined) {
    check(`${entry.id} default variant`, () => assert.equal(entry.defaultVariant, undefined, 'defaultVariant requires variants'));
    configurations.push({ ...entry, label: entry.id });
    continue;
  }
  check(`${entry.id} variants`, () => {
    assert.ok(Array.isArray(entry.variants) && entry.variants.length, 'variants must be a nonempty array');
    assert.equal(new Set(entry.variants.map(variant => variant.id)).size, entry.variants.length, 'variant IDs must be unique');
    if (entry.defaultVariant !== undefined) assert.ok(entry.variants.some(variant => variant.id === entry.defaultVariant), 'defaultVariant must name a registered variant');
  });
  check(`${entry.id} fallback module`, () => {
    assert.ok(typeof entry.module === 'string' && entry.module.trim(), 'fallback module is required');
    const fallback = new URL(entry.module, root);
    assert.equal(fallback.protocol, 'file:', 'fallback module must be local');
    assert.ok(statSync(fallback).isFile(), 'fallback module must exist');
  });
  if (!Array.isArray(entry.variants)) continue;
  for (const variant of entry.variants) {
    check(`${entry.id} variant ${variant?.id}`, () => {
      assert.ok(typeof variant?.id === 'string' && variant.id.trim(), 'variant id is required');
      assert.ok(typeof variant.name === 'string' && variant.name.trim(), 'variant name is required');
      assert.ok(typeof variant.module === 'string' && variant.module.trim(), 'variant module is required');
    });
    if (variant && typeof variant === 'object') configurations.push({ ...entry, ...variant, id: entry.id, label: `${entry.id}/${variant.id}` });
  }
}

// A variant registry supersedes its base module; the Existing fallback is not checked twice.
for (const registered of configurations) {
  const prefix = registered.label;
  check(`${prefix} module`, () => {
    assert.ok(typeof registered.module === 'string' && registered.module.trim(), 'module must be a local path');
    const module = new URL(registered.module, root);
    assert.equal(module.protocol, 'file:', 'module must be a local file');
    assert.ok(statSync(module).isFile(), 'module must exist');
  });
  if (registered.stylesheet) {
    check(`${prefix} stylesheet`, () => {
      assert.equal(typeof registered.stylesheet, 'string', 'stylesheet must be a local path');
      const stylesheet = new URL(registered.stylesheet, root);
      assert.equal(stylesheet.protocol, 'file:', 'stylesheet must be a local file');
      assert.ok(statSync(stylesheet).isFile(), 'stylesheet must exist');
    });
  }
  let app;
  try { app = (await import(new URL(registered.module, root))).default; }
  catch (error) { failures.push(`${prefix} import: ${error.message}`); continue; }
  check(`${prefix} identity`, () => assert.ok(app.identity?.name && app.identity?.id === registered.id));
  check(`${prefix} freshState`, () => assert.equal(typeof app.freshState, 'function'));
  check(`${prefix} SCREENS`, () => assert.ok(app.SCREENS && Object.keys(app.SCREENS).length));
  check(`${prefix} NAV`, () => assert.ok(Array.isArray(app.NAV) && app.NAV.length));
  if (!app.SCREENS || !Array.isArray(app.NAV) || typeof app.freshState !== 'function') continue;

  const appearances = app.appearances ?? ['light', 'dark'];
  check(`${prefix} appearances`, () => {
    assert.ok(Array.isArray(appearances) && appearances.length, 'appearances must be a nonempty array');
    assert.equal(new Set(appearances).size, appearances.length, 'appearances must be unique');
    assert.ok(appearances.every(mode => ['light', 'dark'].includes(mode)), 'appearances must use light or dark');
  });
  if (app.presentation) {
    check(`${prefix} presentation`, () => {
      for (const dimension of ['width', 'height']) {
        assert.ok(Number.isFinite(app.presentation[dimension]) && app.presentation[dimension] > 0, `${dimension} must be a finite positive number`);
      }
      if ('edgeToEdge' in app.presentation) assert.equal(typeof app.presentation.edgeToEdge, 'boolean', 'edgeToEdge must be a boolean');
    });
  }
  for (const mode of Array.isArray(appearances) ? appearances : []) {
    for (const token of ['background', 'surface', 'ink', 'muted', 'border', 'accent', 'accentSoft', 'onAccent', 'danger']) {
      check(`${prefix} ${mode} token ${token}`, () => assert.ok(typeof app.tokens?.[mode]?.[token] === 'string' && app.tokens[mode][token].trim()));
    }
  }
  check(`${prefix} fresh state independence`, () => {
    const first = app.freshState();
    const second = app.freshState();
    assert.notEqual(first, second, 'freshState must create a new object');
    assert.deepEqual(first, second, 'freshState must be deterministic');
    assert.ok(app.SCREENS[first.route], 'initial route has no renderer');
  });

  if (app.library) {
    const typography = app.library.typography ?? [];
    const components = app.library.components ?? [];
    check(`${prefix} library collections`, () => {
      assert.ok(Array.isArray(typography), 'typography must be an array');
      assert.ok(Array.isArray(components), 'components must be an array');
    });
    for (const specimen of Array.isArray(typography) ? typography : []) {
      check(`${prefix} typography ${specimen.name}`, () => {
        assert.ok(typeof specimen.name === 'string' && specimen.name.trim(), 'name is required');
        if ('render' in specimen) {
          assert.equal(typeof specimen.render, 'function', 'render must be a function');
          const state = app.freshState();
          const before = structuredClone(state);
          const html = specimen.render(state);
          assert.ok(typeof html === 'string' && html.trim(), 'render must return nonempty HTML');
          assert.deepEqual(state, before, 'typography renderer must not mutate state');
          assert.deepEqual(app.freshState(), before, 'typography renderer must not mutate shared initial data');
          return;
        }
        for (const field of ['sample', 'fontFamily']) {
          assert.ok(typeof specimen[field] === 'string' && specimen[field].trim(), `${field} is required`);
        }
        assert.ok(typeof specimen.fontSize === 'number' ? specimen.fontSize > 0 : typeof specimen.fontSize === 'string' && specimen.fontSize.trim(), 'fontSize must be a positive number or CSS size');
      });
    }
    if (Array.isArray(components)) {
      check(`${prefix} library component IDs`, () => assert.equal(new Set(components.map(component => component.id)).size, components.length));
      for (const component of components) {
        check(`${prefix} component ${component.id}`, () => {
          assert.ok(typeof component.id === 'string' && component.id.trim(), 'id is required');
          assert.ok(typeof component.name === 'string' && component.name.trim(), 'name is required');
          assert.equal(typeof component.render, 'function', 'render must be a function');
          const state = app.freshState();
          const before = structuredClone(state);
          const html = component.render(state);
          assert.ok(typeof html === 'string' && html.trim(), 'render must return nonempty HTML');
          assert.deepEqual(state, before, 'component renderer must not mutate state');
          assert.deepEqual(app.freshState(), before, 'component renderer must not mutate shared initial data');
        });
      }
    }
  }

  const cards = app.NAV.flatMap(board => board.cards || []);
  if (app.overview !== undefined) {
    check(`${prefix} overview`, () => {
      assert.ok(app.overview && typeof app.overview === 'object' && !Array.isArray(app.overview), 'overview must be an object');
      for (const field of ['eyebrow', 'title', 'description', 'rationale', 'approachTitle']) {
        if (app.overview[field] !== undefined) assert.equal(typeof app.overview[field], 'string', `${field} must be text`);
      }
      if (app.overview.strategies !== undefined) assert.ok(Array.isArray(app.overview.strategies) && app.overview.strategies.every(item => typeof item === 'string'), 'strategies must contain text');
      if (app.overview.reference !== undefined) {
        const reference = app.overview.reference;
        assert.ok(reference && typeof reference.url === 'string', 'reference requires a URL');
        assert.ok(['http:', 'https:'].includes(new URL(reference.url).protocol), 'reference must use HTTP or HTTPS');
        if (reference.label !== undefined) assert.equal(typeof reference.label, 'string');
      }
    });
  }
  if (app.dismissOverlay !== undefined) check(`${prefix} dismissOverlay`, () => assert.equal(typeof app.dismissOverlay, 'function'));
  check(`${prefix} unique board IDs`, () => assert.equal(new Set(app.NAV.map(board => board.id)).size, app.NAV.length));
  check(`${prefix} unique card IDs`, () => assert.equal(new Set(cards.map(card => card.id)).size, cards.length));
  const cardIDs = new Set(cards.map(card => card.id));
  cardIndex.set(prefix, cardIDs);
  for (const card of cards) if (card.compare !== undefined) comparisons.push({ entry: registered, prefix, card });
  for (const route of Object.keys(app.SCREENS)) {
    check(`${prefix} route ${route} has context`, () => assert.ok(cards.some(card => card.route === route), 'each route needs a state card'));
  }
  for (const [route, destination] of Object.entries(app.backRoute || {})) {
    check(`${prefix} back route ${route}`, () => assert.ok(app.SCREENS[route] && app.SCREENS[destination], 'back routes must reference existing screens'));
  }
  for (const board of app.NAV) {
    check(`${prefix} board ${board.id}`, () => assert.ok(board.id && board.title && Array.isArray(board.cards) && board.cards.length));
  }
  for (const [action, context] of Object.entries(app.ACTIONS || {})) {
    check(`${prefix} ACTIONS.${action}`, () => {
      assert.ok(builtIns.has(action) || typeof app.handlers?.[action] === 'function', 'missing handler');
      assert.ok(context.label && context.description, 'action needs a label and description');
      if (context.to) assert.ok(app.SCREENS[context.to], `unknown destination ${context.to}`);
    });
  }
  for (const action of Object.keys(app.handlers || {})) {
    check(`${prefix} handler ${action} has context`, () => assert.ok(app.ACTIONS?.[action]));
    check(`${prefix} handler ${action} is available`, () => assert.ok(!builtIns.has(action), 'runtime built-ins cannot be overridden'));
  }
  for (const [overlay, context] of Object.entries(app.overlayContext || {})) {
    check(`${prefix} overlay context ${overlay}`, () => {
      assert.equal(typeof app.OVERLAYS?.[overlay], 'function', 'context must name an overlay renderer');
      checkContext(app, context);
      if (context.resolve !== undefined) assert.equal(typeof context.resolve, 'function');
    });
    check(`${prefix} overlay context ${overlay} resolved states`, () => {
      const states = cards.map(card => {
        const state = app.freshState();
        state.route = card.route;
        card.setup?.(state);
        return state;
      }).filter(state => state.overlay === overlay);
      if (!states.length) states.push({ ...app.freshState(), overlay });
      for (const state of states) {
        const before = structuredClone(state);
        const resolved = context.resolve?.(state);
        assert.ok(resolved === undefined || (resolved && typeof resolved === 'object' && !Array.isArray(resolved)), 'resolve must return context or undefined');
        assert.deepEqual(state, before, 'resolve must not mutate state');
        checkContext(app, { ...context, ...resolved });
      }
    });
  }

  for (const card of cards) {
    cardCount += 1;
    const label = `${prefix}/${card.id}`;
    const state = app.freshState();
    const untouched = structuredClone(app.freshState());
    check(`${label} metadata`, () => {
      assert.ok(card.id && card.title && card.route && card.how, 'id, title, route, and how are required');
      assert.ok(['ready', 'loading', 'empty', 'error', 'success', 'dialog', 'sheet', 'toast'].includes(card.kind), `unknown state kind ${card.kind}`);
      assert.ok(typeof card.status === 'string' && card.status.trim(), 'design status is required');
      assert.ok(Array.isArray(card.actions), 'actions must be an array');
      checkNotes(card);
      assert.equal(typeof card.match, 'function', 'match must identify the live state');
    });
    check(`${label} setup`, () => {
      state.route = card.route;
      if (card.setup) card.setup(state);
      assert.equal(state.route, card.route, 'setup must retain the card route');
      assert.equal(typeof app.SCREENS[state.route], 'function', 'route has no renderer');
      assert.deepEqual(app.freshState(), untouched, 'setup must not mutate shared initial data');
      if (card.match) assert.equal(card.match(state), true, 'match must recognize its own setup');
      const resolved = cards.find(candidate => candidate.route === state.route && candidate.match?.(state));
      assert.equal(resolved?.id, card.id, 'an earlier card match would display the wrong context');
    });
    for (const action of card.actions || []) {
      check(`${label} declared action ${action}`, () => {
        assert.ok(builtIns.has(action) || typeof app.handlers?.[action] === 'function', 'missing handler');
        assert.ok(builtIns.has(action) || app.ACTIONS?.[action], 'missing interaction context');
      });
    }
    check(`${label} rendering`, () => {
      const before = JSON.stringify(state);
      checkMarkup(app, app.SCREENS[state.route](state), label);
      if (state.overlay) {
        assert.equal(typeof state.overlay, 'string', 'overlay must name an OVERLAYS renderer');
        const key = state.overlay;
        assert.equal(typeof app.OVERLAYS?.[key], 'function', `overlay ${key} has no renderer`);
        checkMarkup(app, app.OVERLAYS[key](state), `${label} overlay`);
      }
      assert.equal(JSON.stringify(state), before, 'renderers must not mutate state');
    });
  }
  check(`${prefix} FLOWS`, () => assert.ok(Array.isArray(app.FLOWS) && app.FLOWS.length));
  for (const flow of app.FLOWS || []) {
    check(`${prefix} flow ${flow.title}`, () => {
      assert.ok(flow.title && Array.isArray(flow.steps) && flow.steps.length >= 2);
      for (const step of flow.steps) assert.ok(cardIDs.has(step.card), `unknown card ${step.card}`);
      for (const step of flow.steps.slice(0, -1)) assert.ok(step.label, 'each outgoing edge needs a label');
    });
  }
}

// Findings and comparisons connect cards across design states.
const stateCards = (entry, state) => entry.variants ? cardIndex.get(`${entry.id}/${state}`) : cardIndex.get(entry.id);
for (const { entry, prefix, card } of comparisons) {
  check(`${prefix}/${card.id} compare`, () => {
    assert.ok(entry.variants, 'compare requires design states');
    assert.ok(typeof card.compare?.state === 'string' && typeof card.compare.card === 'string', 'compare must be { state, card }');
    assert.ok(stateCards(entry, card.compare.state)?.has(card.compare.card), `unknown ${card.compare.state} card ${card.compare.card}`);
  });
}
for (const entry of registry.apps) {
  if (entry.findings === undefined) continue;
  let data;
  try { data = (await import(new URL(entry.findings, root))).default; }
  catch (error) { failures.push(`${entry.id} findings import: ${error.message}`); continue; }
  const states = { evidence: data?.evidenceState || 'existing', proposal: data?.proposalState || 'future' };
  check(`${entry.id} findings`, () => {
    assert.ok(Array.isArray(data?.items), 'findings need an items array');
    if (data.summary !== undefined) assert.equal(typeof data.summary, 'string', 'summary must be text');
    if (entry.variants) for (const state of Object.values(states)) assert.ok(entry.variants.some(variant => variant.id === state), `unknown design state ${state}`);
    assert.equal(new Set(data.items.map(item => item?.id)).size, data.items.length, 'finding IDs must be unique');
  });
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    check(`${entry.id} finding ${item?.id}`, () => {
      assert.ok(typeof item?.id === 'string' && item.id && typeof item.title === 'string' && item.title.trim(), 'id and title are required');
      assert.ok(['high', 'medium', 'low'].includes(item.severity), 'severity must be high, medium, or low');
      for (const field of ['problem', 'recommendation']) if (item[field] !== undefined) assert.equal(typeof item[field], 'string', `${field} must be text`);
      for (const [field, state] of [['evidence', states.evidence], ['proposal', states.proposal]]) {
        const ids = item[field] ?? [];
        assert.ok(Array.isArray(ids), `${field} must list card IDs`);
        for (const id of ids) assert.ok(stateCards(entry, state)?.has(id), `${field} references unknown ${state} card ${id}`);
      }
    });
  }
}

// The inferred design system: pending until Claude writes it, then every value and evidence crop is checked.
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const box = value => Array.isArray(value) && value.length === 4 && value.every(n => typeof n === 'number' && n >= 0 && n <= 100) && value[0] + value[2] <= 100.5 && value[1] + value[3] <= 100.5 && value[2] > 0 && value[3] > 0;
for (const entry of registry.apps) {
  if (entry.designSystem === undefined) continue;
  let ds;
  try { ds = (await import(new URL(entry.designSystem, root))).default; }
  catch (error) { failures.push(`${entry.id} design system import: ${error.message}`); continue; }
  const state = ds?.evidenceState || 'existing';
  const evidence = (where, list) => {
    if (list === undefined) return;
    assert.ok(Array.isArray(list), `${where} evidence must be a list`);
    for (const item of list) {
      assert.ok(stateCards(entry, state)?.has(item?.card), `${where} evidence references unknown ${state} card ${item?.card}`);
      assert.ok(box(item.box), `${where} evidence box must be [left%, top%, width%, height%] inside the frame`);
    }
  };
  check(`${entry.id} design system`, () => {
    assert.ok(['pending', 'ready'].includes(ds?.status), "status must be 'pending' or 'ready'");
    if (entry.variants) assert.ok(entry.variants.some(variant => variant.id === state), `unknown design state ${state}`);
    if (ds.status !== 'ready') return;
    assert.ok(typeof ds.name === 'string' && ds.name.trim() && typeof ds.summary === 'string', 'name and summary are required');
    assert.ok(Array.isArray(ds.colors) && ds.colors.length, 'colors need at least one group');
    for (const group of ds.colors) for (const color of group.items || []) {
      assert.ok(typeof color.name === 'string' && hex(color.hex), `color ${color?.name} needs a name and #rrggbb hex`);
      evidence(`color ${color.name}`, color.evidence);
    }
    assert.ok(Array.isArray(ds.typography) && ds.typography.length, 'typography needs at least one style');
    for (const type of ds.typography) {
      assert.ok(typeof type.name === 'string' && typeof type.size === 'number', `type ${type?.name} needs a name and numeric size`);
      evidence(`type ${type.name}`, type.evidence);
    }
    for (const item of ds.spacing?.scale || []) assert.ok(typeof item.value === 'number', 'spacing values must be numbers');
    for (const item of ds.radii || []) assert.ok(typeof item.name === 'string' && typeof item.value === 'number', 'radii need a name and number');
    for (const item of ds.components || []) { assert.ok(typeof item.name === 'string', 'components need a name'); evidence(`component ${item.name}`, item.evidence); }
    evidence('iconography', ds.iconography?.evidence);
    if (ds.tokens) {
      assert.ok(ds.tokens.light, 'tokens need a light mode');
      for (const [mode, values] of Object.entries(ds.tokens)) for (const key of ['background', 'surface', 'ink', 'muted', 'border', 'accent', 'accentSoft', 'onAccent', 'danger'])
        assert.ok(hex(values[key]), `${mode} token ${key} must be a #rrggbb hex`);
    }
  });
}

if (failures.length) {
  console.error(`Failed ${failures.length} of ${checks} checks:\n${failures.map(failure => `  - ${failure}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Passed ${checks} checks across ${registry.apps.length} apps (${configurations.length} module configurations) and ${cardCount} cards.`);
  console.log(`Checked registry variants, presentation, tokens, design library, isolated setup, renderers, handlers, context, and map references in ${path.basename(projectRoot)}.`);
  console.log('Also open the browser to verify layout, keyboard navigation, timers, and complete flows.');
}
