import { copyFile, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exists, fail, slug } from './instance-files.mjs';
import { projectPaths } from './project-paths.mjs';
import { byName, dimensions, folderSlug, isImage, journeyRegistry } from './draft-existing.mjs';

// npm run import-captures (no flags) on an edited apps/existing.js: adds only the inbox shots that are not in the
// project yet, and never changes an existing card. A shot is matched on its source filename without the NN- prefix
// (03-IMG_0220.PNG and 05-IMG_0220.PNG are the same shot). New cards are text-inserted into the SHOTS array, and
// their routes into that journey's JOURNEYS steps, both positioned by the inbox NN- order. Every other byte of the
// file is kept. The result is imported and compared with the current module before it replaces the file.
export const newMarker = 'NEW, needs completing';
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unprefixed = name => path.parse(name).name.replace(/^\d+[\s._-]*/, '');
const keyOf = name => slug(unprefixed(name));
const titleCase = name => (name.replace(/^\d+[\s._-]*/, '') || name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b[a-z]/g, c => c.toUpperCase());
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- A small JavaScript-aware scanner: finds bracket pairs while skipping strings, templates and comments. ----
function endString(text, i) {
  const quote = text[i];
  for (let j = i + 1; j < text.length; j++) { if (text[j] === '\\') j++; else if (text[j] === quote) return j; else if (text[j] === '\n') break; }
  fail(`Unterminated string at offset ${i}.`);
}
function endTemplate(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '`') return j;
    else if (text[j] === '$' && text[j + 1] === '{') j = matchClose(text, j + 1);
  }
  fail(`Unterminated template at offset ${i}.`);
}
// Index after a string, template or comment starting at i, or -1 if none starts there.
function skipLiteral(text, i) {
  const c = text[i];
  if (c === '"' || c === "'") return endString(text, i) + 1;
  if (c === '`') return endTemplate(text, i) + 1;
  if (c === '/' && text[i + 1] === '/') { const end = text.indexOf('\n', i); return end < 0 ? text.length : end; }
  if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); if (end < 0) fail('Unterminated comment.'); return end + 2; }
  return -1;
}
function matchClose(text, open) {
  const pairs = { '[': ']', '{': '}', '(': ')' }, stack = [];
  for (let i = open; i < text.length; i++) {
    const skip = skipLiteral(text, i);
    if (skip >= 0) { i = skip - 1; continue; }
    const c = text[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ']' || c === '}' || c === ')') {
      if (stack.pop() !== c) fail(`Unbalanced "${c}" at offset ${i}.`);
      if (!stack.length) return i;
    }
  }
  fail(`No closing bracket for offset ${open}.`);
}
function skipSpace(text, i) {
  for (;;) {
    while (/\s/.test(text[i] || '')) i++;
    if (text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) i = skipLiteral(text, i); else return i;
  }
}
// The one top-level `const NAME = [` line (searched by line, since the rest of the module has regex literals the
// scanner does not parse), and the top-level object literals of that array.
function arrayDeclaration(text, name) {
  const found = [...text.matchAll(new RegExp(`^const\\s+${name}\\s*=\\s*\\[`, 'gm'))].map(m => m.index + m[0].length - 1);
  if (found.length !== 1) return null;
  const open = found[0], close = matchClose(text, open), items = [];
  let i = skipSpace(text, open + 1);
  while (i < close) {
    if (text[i] !== '{') fail(`${name} holds something other than plain { ... } entries near offset ${i}; add the new shots by hand.`);
    const end = matchClose(text, i) + 1;
    let after = skipSpace(text, end), comma = null;
    if (text[after] === ',') {
      comma = after + 1;
      const rest = /^[ \t]*(?:\/\/[^\n]*)?(?=\n)/.exec(text.slice(comma));
      if (rest) comma += rest[0].length; // keep a trailing same-line comment with its entry
      after = skipSpace(text, after + 1);
    }
    const body = text.slice(i, end);
    const indent = /([ \t]*)$/.exec(text.slice(0, i))[1];
    items.push({ start: i, end, comma, body, indent });
    i = after;
  }
  return { open, close, items };
}
const field = (body, key) => new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`).exec(body)?.[2];

// Insertions: { pos, text } applied in position order; equal positions keep list order.
function applyInsertions(text, insertions) {
  const sorted = insertions.map((item, seq) => ({ ...item, seq })).sort((a, b) => a.pos - b.pos || a.seq - b.seq);
  let out = '', last = 0;
  for (const item of sorted) { out += text.slice(last, item.pos) + item.text; last = item.pos; }
  return out + text.slice(last);
}

// Place each new route into an ordered list: after the nearest earlier inbox shot already placed, else before the
// nearest later one, else with fallback(order). Returns the full order.
function place(order, inboxRoutes, newRoutes, fallback) {
  const result = [...order];
  for (const route of inboxRoutes.filter(item => newRoutes.includes(item))) {
    const at = inboxRoutes.indexOf(route);
    const before = inboxRoutes.slice(0, at).reverse().find(item => result.includes(item));
    const after = inboxRoutes.slice(at + 1).find(item => result.includes(item) && !newRoutes.includes(item));
    if (before) result.splice(result.indexOf(before) + 1, 0, route);
    else if (after) result.splice(result.indexOf(after), 0, route);
    else result.splice(fallback(result), 0, route);
  }
  return result;
}
// Turn a final order into insertions: each run of new routes goes after the existing entry before it, or before the first.
function runs(order, isNew) {
  const result = [];
  for (let i = 0; i < order.length; i++) {
    if (!isNew(order[i])) continue;
    const run = [];
    while (i < order.length && isNew(order[i])) run.push(order[i++]);
    result.push({ run, after: order[i - run.length - 1] ?? null, before: order[i] ?? null });
  }
  return result;
}

async function snapshot(file) {
  const app = (await import(`${pathToFileURL(file).href}?import=${Date.now()}-${Math.random()}`)).default;
  if (!app || !Array.isArray(app.NAV) || typeof app.SCREENS !== 'object') fail(`${path.basename(file)} does not export NAV and SCREENS.`);
  const cards = new Map();
  for (const group of app.NAV) for (const card of group.cards || []) {
    let image = null;
    try { image = /\bsrc="([^"]+)"/.exec(app.SCREENS[card.route || card.id]?.() || '')?.[1] || null; } catch { image = null; }
    cards.set(card.id, { journey: group.id, board: group.title, image, json: JSON.stringify(card) });
  }
  const flows = (app.FLOWS || []).map(flow => ({ key: flow.journey || flow.title, cards: (flow.steps || []).map(step => step.card) }));
  return { cards, flows };
}
const isSubsequence = (small, big) => { let i = 0; for (const item of big) if (item === small[i]) i++; return i === small.length; };

export async function addNewCaptures(inbox, { folders, dryRun = false } = {}) {
  const { projectRoot: root } = await projectPaths(source);
  const metadataPath = path.join(root, 'instance.json'), modulePath = path.join(root, 'apps/existing.js');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const original = await readFile(modulePath, 'utf8');
  const registry = await journeyRegistry(root, metadata);
  const order = id => { const at = registry.findIndex(item => item.id === id); return at < 0 ? registry.length : at; };

  // The project as it is: cards from the module itself, entries and steps from the file text.
  const current = await snapshot(modulePath);
  const shots = arrayDeclaration(original, 'SHOTS');
  if (!shots) fail('Could not find a single `const SHOTS = [ ... ]` in apps/existing.js; add the new shots by hand.');
  for (const item of shots.items) item.route = field(item.body, 'route');
  if (shots.items.some(item => !item.route || !current.cards.has(item.route))) fail('A SHOTS entry has no route that the module lists as a card; add the new shots by hand.');
  const journeysDecl = arrayDeclaration(original, 'JOURNEYS');
  const assetDir = path.join(root, 'apps/assets/existing');
  const assetFiles = (await exists(assetDir)) ? (await readdir(assetDir)).filter(isImage) : [];
  const prefixes = [...new Set([...folders.map(folderSlug), ...registry.map(item => item.id), ...[...current.cards.values()].map(card => card.journey)])].sort((a, b) => b.length - a.length);
  const projectKey = file => { let stem = path.parse(file).name; const prefix = prefixes.find(item => stem.startsWith(`${item}-`)); if (prefix) stem = stem.slice(prefix.length + 1); return keyOf(stem); };
  const cardsByKey = new Map();
  for (const [route, card] of current.cards) cardsByKey.set(projectKey(card.image ? path.basename(card.image) : route), { route, ...card });
  const imagesWithCards = new Set([...current.cards.values()].map(card => card.image && path.basename(card.image)).filter(Boolean));
  const loneAssets = new Map(assetFiles.filter(file => !imagesWithCards.has(file)).map(file => [projectKey(file), file]));

  // The inbox: journey folders in registry order (as given by import-captures), each in NN- order.
  const inboxShots = [];
  for (const folder of folders) {
    const names = (await readdir(path.join(inbox, folder), { withFileTypes: true })).filter(item => item.isFile() && isImage(item.name) && !item.name.startsWith('.')).map(item => item.name).sort(byName);
    for (const name of names) inboxShots.push({ folder, name, where: `${folder}/${name}`, key: keyOf(name), journey: folderSlug(folder) });
  }
  const loose = (await readdir(inbox, { withFileTypes: true })).filter(item => item.isFile() && isImage(item.name) && !item.name.startsWith('.')).map(item => item.name);
  const seen = new Map();
  for (const shot of inboxShots) seen.set(shot.key, [...(seen.get(shot.key) || []), shot.where]);

  const report = { changed: [], moved: [], missing: [], lone: [], duplicate: [], loose };
  const added = [], usedRoutes = new Set([...current.cards.keys()]), usedFiles = new Set(assetFiles);
  for (const shot of inboxShots) {
    if (seen.get(shot.key).length > 1) { if (seen.get(shot.key)[0] === shot.where) report.duplicate.push(seen.get(shot.key)); continue; }
    const card = cardsByKey.get(shot.key);
    if (card) {
      shot.route = card.route;
      if (card.journey !== shot.journey) { report.moved.push(`${shot.where} is in journey "${card.journey}" in the project (${card.route})`); shot.route = null; continue; }
      const file = card.image && path.join(root, card.image.replace(/^\.\//, ''));
      if (file && await exists(file) && !(await readFile(file)).equals(await readFile(path.join(inbox, shot.where)))) report.changed.push(`${shot.where} differs from ${card.image.replace(/^\.\//, '')}`);
      continue;
    }
    if (loneAssets.has(shot.key)) { report.lone.push(`${shot.where}: apps/assets/existing/${loneAssets.get(shot.key)} exists but has no card (set aside?)`); continue; }
    // New: same naming convention as draft-existing (journey slug + filename slug), kept unique.
    const ext = path.extname(shot.name).toLowerCase().replace('.jpeg', '.jpg');
    const base = slug(`${shot.journey}-${path.parse(shot.name).name}`);
    let route = base;
    for (let n = 2; usedRoutes.has(route) || usedFiles.has(`${route}${ext}`); n++) route = `${base}-${n}`;
    usedRoutes.add(route); usedFiles.add(`${route}${ext}`);
    const group = [...current.cards.values()].find(item => item.journey === shot.journey);
    const registered = registry.find(item => item.id === shot.journey);
    shot.route = route;
    added.push({ ...shot, route, file: `apps/assets/existing/${route}${ext}`, size: dimensions(await readFile(path.join(inbox, shot.where)), shot.name),
      board: group?.board || registered?.title || titleCase(shot.folder), registered: Boolean(registered), messages: registered?.messages === true });
  }
  const inboxKeys = new Set(inboxShots.map(shot => shot.key));
  for (const [key, card] of cardsByKey) if (!inboxKeys.has(key)) report.missing.push(`${card.route} (${card.image?.replace(/^\.\//, '') || 'no image'})`);

  const print = () => {
    const section = (heading, list) => list.length && console.log(`${heading}\n${list.map(item => `  ${item}`).join('\n')}`);
    section('Changed in the inbox (left as is in the project):', report.changed);
    section('In a different journey folder than in the project (left as is):', report.moved);
    section('In the project but not in the inbox (left as is):', report.missing);
    section('Image already in the project without a card (not added):', report.lone);
    section('Same shot in more than one inbox folder (not added):', report.duplicate.map(list => list.join(', ')));
    section('Not in a journey folder (move into one to import):', report.loose);
  };
  if (!added.length) { console.log('Nothing new: every screenshot in the inbox is already in the project.'); print(); return { added }; }

  // SHOTS: one draft card per new shot, inserted by inbox order within its journey.
  const newRoutes = added.map(item => item.route), isNew = route => newRoutes.includes(route);
  const routeJourney = route => added.find(item => item.route === route)?.journey ?? current.cards.get(route)?.journey;
  let shotOrder = shots.items.map(item => item.route);
  for (const journey of [...new Set(added.map(item => item.journey))]) {
    const inboxRoutes = inboxShots.filter(shot => shot.journey === journey && shot.route).map(shot => shot.route);
    shotOrder = place(shotOrder, inboxRoutes, newRoutes.filter(route => routeJourney(route) === journey), list => {
      const own = list.map(routeJourney).lastIndexOf(journey);
      if (own >= 0) return own + 1;
      const later = list.findIndex(route => order(routeJourney(route)) > order(journey));
      return later < 0 ? list.length : later;
    });
  }
  const indent = shots.items[0]?.indent ?? '  ', inner = `${indent}  `, today = new Date().toLocaleDateString('en-CA');
  const card = shot => [
    `${indent}// import-captures ${today}: ${newMarker} (title, approach, rationale, hotspots${shot.messages ? ', channel, supports' : ''}). Source: ${shot.where}`,
    `${indent}{`,
    `${inner}route: ${JSON.stringify(shot.route)},`,
    `${inner}image: ${JSON.stringify(`./${shot.file}`)},`,
    `${inner}size: ${JSON.stringify(shot.size)},`,
    `${inner}title: ${JSON.stringify(`${newMarker}: ${unprefixed(shot.name).replace(/[-_]+/g, ' ')}`)},`,
    `${inner}board: ${JSON.stringify(shot.board)},`,
    ...(shot.registered ? [`${inner}journey: ${JSON.stringify(shot.journey)},`] : []),
    ...(shot.messages ? [`${inner}channel: '',`, `${inner}supports: '',`] : []),
    `${inner}approach: '',`, `${inner}rationale: '',`, `${inner}hotspots: [],`,
    `${indent}},`].join('\n');
  const byRoute = new Map(shots.items.map(item => [item.route, item]));
  const insertions = runs(shotOrder, isNew).map(({ run, after, before }) => {
    const text = run.map(route => card(added.find(item => item.route === route))).join('\n');
    if (after) { const entry = byRoute.get(after); return { pos: entry.comma ?? entry.end, text: `${entry.comma ? '' : ','}\n${text}` }; }
    if (before) { const at = shots.items.indexOf(byRoute.get(before)); const prev = shots.items[at - 1];
      return prev ? { pos: prev.comma ?? prev.end, text: `${prev.comma ? '' : ','}\n${text}` } : { pos: shots.open + 1, text: `\n${text}` }; }
    return { pos: shots.open + 1, text: `\n${text}` };
  });

  // JOURNEYS: add each new route to its journey's steps (Flow map path), by inbox order.
  const flowNotes = [];
  if (!journeysDecl) flowNotes.push('No `const JOURNEYS = [ ... ]` found: add the new screens to the Flow map by hand.');
  else for (const journey of [...new Set(added.map(item => item.journey))]) {
    const routes = newRoutes.filter(route => routeJourney(route) === journey);
    const inboxRoutes = inboxShots.filter(shot => shot.journey === journey && shot.route).map(shot => shot.route);
    const entry = journeysDecl.items.find(item => field(item.body, 'journey') === journey) || journeysDecl.items.find(item => field(item.body, 'title') === added.find(shot => shot.journey === journey).board);
    if (!entry) {
      const all = shotOrder.filter(route => routeJourney(route) === journey);
      if (all.length < 2) { flowNotes.push(`${journey}: one screen, so no Flow map path yet.`); continue; }
      const shot = added.find(item => item.journey === journey);
      const next = journeysDecl.items.find(item => order(field(item.body, 'journey')) > order(journey));
      const line = `{ title: ${JSON.stringify(shot.board)}, ${shot.registered ? `journey: ${JSON.stringify(journey)}, ` : ''}steps: ${JSON.stringify(all)} },`;
      const prev = next ? journeysDecl.items[journeysDecl.items.indexOf(next) - 1] : journeysDecl.items.at(-1);
      const ind = journeysDecl.items[0]?.indent ?? '  ';
      insertions.push(prev ? { pos: prev.comma ?? prev.end, text: `${prev.comma ? '' : ','}\n${ind}${line}` } : { pos: journeysDecl.open + 1, text: `\n${ind}${line}` });
      flowNotes.push(`${journey}: new Flow map path with ${plural(all.length, 'step')}.`);
      continue;
    }
    const stepsAt = /\bsteps\s*:\s*\[/.exec(entry.body);
    if (!stepsAt) { flowNotes.push(`${journey}: its JOURNEYS entry has no steps array; add ${routes.join(', ')} by hand.`); continue; }
    const open = entry.start + stepsAt.index + stepsAt[0].length - 1, close = matchClose(original, open);
    const literals = [...original.slice(open + 1, close).matchAll(/(['"])([^'"\n]*)\1/g)].map(m => ({ value: m[2], start: open + 1 + m.index, end: open + 1 + m.index + m[0].length }));
    if (original.slice(open + 1, close).replace(/(['"])([^'"\n]*)\1/g, '').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').trim().replace(/,/g, '').trim()) { flowNotes.push(`${journey}: its steps are not a plain list of routes; add ${routes.join(', ')} by hand.`); continue; }
    const steps = literals.map(item => item.value);
    const final = place(steps, inboxRoutes, routes, list => list.length);
    for (const { run, after, before } of runs(final, isNew)) {
      const quoted = run.map(route => JSON.stringify(route));
      if (after) insertions.push({ pos: literals.find(item => item.value === after).end, text: quoted.map(item => `,${item}`).join('') });
      else if (before) insertions.push({ pos: literals.find(item => item.value === before).start, text: quoted.map(item => `${item},`).join('') });
      else insertions.push({ pos: open + 1, text: quoted.join(',') });
    }
    flowNotes.push(`${journey}: ${plural(routes.length, 'new step')} in its Flow map path.`);
  }
  const updated = applyInsertions(original, insertions);

  console.log(`${dryRun ? 'Would add' : 'Adding'} ${plural(added.length, 'new screenshot')}:`);
  for (const shot of added) console.log(`  ${shot.where.padEnd(40)} -> ${shot.route}`);
  for (const note of flowNotes) console.log(`  ${note}`);
  print();
  if (dryRun) { console.log('\nDry run: nothing was written.'); return { added }; }

  // Check the result before replacing anything: every current card unchanged, every current Flow map path intact.
  const temp = path.join(root, 'apps', `.existing-import-check-${process.pid}.js`);
  await writeFile(temp, updated);
  try {
    const next = await snapshot(temp);
    for (const [route, card] of current.cards) if (next.cards.get(route)?.json !== card.json) fail(`the update would change the existing card ${route}.`);
    for (const route of newRoutes) if (!next.cards.has(route)) fail(`the new card ${route} did not appear in the module.`);
    if (next.cards.size !== current.cards.size + newRoutes.length) fail('the update changed the number of cards unexpectedly.');
    // A journey may have several paths (branches) under one key: each must survive in one of them.
    for (const flow of current.flows) if (!next.flows.some(item => item.key === flow.key && isSubsequence(flow.cards, item.cards))) fail(`the update would change the Flow map path "${flow.key}".`);
    for (const route of newRoutes) if (journeysDecl && !next.flows.some(flow => flow.cards.includes(route)) && !flowNotes.some(note => note.includes(route) || note.includes('one screen'))) flowNotes.push(`${route} is in JOURNEYS but not in FLOWS; check how FLOWS is built.`);
  } catch (error) { await unlink(temp).catch(() => {}); fail(`Nothing was changed: ${error.message}`); }

  // Copy the images, list them in instance.json, then swap the module in, unless someone edited it meanwhile.
  const copied = [], metadataText = await readFile(metadataPath, 'utf8');
  try {
    for (const shot of added) { await copyFile(path.join(inbox, shot.where), path.join(root, shot.file)); copied.push(shot.file); }
    const add = list => [...new Set([...list, ...added.map(item => item.file)])].sort();
    metadata.files = add(metadata.files);
    if (metadata.exportFiles) metadata.exportFiles = add(metadata.exportFiles);
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    if (await readFile(modulePath, 'utf8') !== original) fail('apps/existing.js changed while importing (someone is editing it); rerun when they are done.');
    await rename(temp, modulePath);
  } catch (error) {
    await unlink(temp).catch(() => {});
    for (const file of copied) await unlink(path.join(root, file)).catch(() => {});
    await writeFile(metadataPath, metadataText);
    fail(`Nothing was changed: ${error.message}`);
  }
  console.log(`\nAdded ${plural(added.length, 'card')} to apps/existing.js, copied the images to apps/assets/existing/ and listed them in instance.json.
Existing cards were not touched. The Overview capture count was not updated.
Next: ask Claude to complete the new screens (search apps/existing.js for "${newMarker}"), then run npm run check.`);
  for (const note of flowNotes.filter(note => note.includes('not in FLOWS'))) console.log(`Warning: ${note}`);
  return { added };
}
