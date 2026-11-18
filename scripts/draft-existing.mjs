import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existingPath, exists, fail, slug } from './instance-files.mjs';
import { projectPaths } from './project-paths.mjs';

// Turns a folder of screenshots into a data-driven Existing module that Claude (or you)
// then completes by looking at each image: titles, hotspots, notes, and findings.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'Usage: npm run draft-existing -- <screenshot-folder> [--force]\n  Copies .png/.jpg/.webp captures into apps/assets/existing/ and drafts apps/existing.js.\n  Each immediate subfolder (for example 01-signing-up) becomes one journey: a group of screens and a Flow map path;\n  images directly in the folder are grouped as "Captured screens".\n  --force replaces an apps/existing.js that is no longer the untouched scaffold.';
export const scaffoldMarker = 'An unreviewed Existing audit scaffold';
const findingsMarker = 'Placeholder. Replace with a one-sentence summary';
const stylesheet = `/* Screenshot evidence. Hotspots are invisible until hovered or focused; pressing an empty part of the screen reveals them all. */
.phone .shot-screen { position: relative; overflow: hidden; background: #000; }
.phone .shot-image { display: block; width: 100%; height: 100%; object-fit: contain; }
.phone .shot-hotspot { position: absolute; padding: 0; border: 0; border-radius: 8px; background: transparent; transition: box-shadow .15s, background-color .15s; }
@media (hover: hover) { .phone .shot-hotspot:hover { box-shadow: inset 0 0 0 1.5px rgb(10 132 255 / .6); background: rgb(10 132 255 / .05); } }
.phone .shot-screen:active:not(:has(.shot-hotspot:active)) .shot-hotspot { box-shadow: inset 0 0 0 1.5px rgb(10 132 255 / .6); background: rgb(10 132 255 / .05); }
.phone .shot-hotspot:focus-visible { outline: 2px solid #0a84ff; outline-offset: 1px; }
`;
const emptyFindings = `// Audit findings. Each finding links Existing evidence cards to the Future cards that address it.
// items: { id, severity: 'high' | 'medium' | 'low', title, problem, recommendation, evidence: [cardIds], proposal: [cardIds],
//          journey?: journeyId, opportunity?: opportunityId }
// journeys (optional): [{ id, title, summary?, messages? }] tags findings, adds a journey filter, and orders journeys in every view.
//   Capture folders named NN-<id> (01-signing-up) map to these. messages: true marks a journey of emails, push
//   notifications or texts: its drafted screens get channel and supports fields.
// opportunities (optional): [{ id, title, summary, impact: 'high' | 'medium' | 'low' }] groups findings; list order is priority order.
// Cite only what the screenshots show. The Findings view appears once items are added.
export default {
  summary: '',
  evidenceState: 'existing',
  proposalState: 'future',
  journeys: [],
  opportunities: [],
  items: [],
};
`;

export function dimensions(bytes, file) {
  if (bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset < bytes.length - 9;) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  fail(`Could not read image dimensions: ${file}`);
}
const title = name => name.replace(/[-_]+/g, ' ').replace(/^\d+\s*/, '').replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase()) || 'Captured screen';
export const isImage = name => /\.(png|jpe?g|webp)$/i.test(name);
export const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
// "03-groups" -> "groups"; a folder that is only a number keeps its name.
export const folderSlug = name => slug(name.replace(/^\d+[\s._-]*/, '') || name);
const titleCase = name => (name.replace(/^\d+[\s._-]*/, '') || name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b[a-z]/g, c => c.toUpperCase());

// The instance's journey registry (apps/findings.js `journeys`), if any.
export async function journeyRegistry(root, metadata) {
  const file = path.join(root, (metadata.app?.findings || './apps/findings.js').replace(/^\.\//, ''));
  if (!await exists(file)) return [];
  try {
    const journeys = (await import(`${pathToFileURL(file).href}?draft=${Date.now()}`)).default?.journeys;
    return Array.isArray(journeys) ? journeys.filter(item => typeof item?.id === 'string' && typeof item?.title === 'string') : [];
  } catch (error) {
    console.log(`Warning: could not read journeys from ${path.relative(root, file)} (${error.message}); folder names are used as journey titles.`);
    return [];
  }
}

// Carry the current Existing overview into the draft, marking the captures as drafted.
async function currentOverview(modulePath, count) {
  if (!await exists(modulePath)) return null;
  let overview;
  try { overview = (await import(`${pathToFileURL(modulePath).href}?draft=${Date.now()}`)).default?.overview; }
  catch (error) { console.log(`Warning: could not read the current overview (${error.message}); the draft has none.`); return null; }
  if (!overview || typeof overview !== 'object' || Array.isArray(overview)) return null;
  const result = JSON.parse(JSON.stringify(overview));
  const drafted = `${count} captures drafted`;
  const parts = typeof result.eyebrow === 'string' && result.eyebrow.trim() ? result.eyebrow.split(' · ') : ['Existing'];
  result.eyebrow = (parts.length > 1 ? [...parts.slice(0, -1), drafted] : [...parts, drafted]).join(' · ');
  if (typeof result.description === 'string') result.description = result.description.replace(/\s*No captures have been added yet\./, '').trim();
  return result;
}

function moduleText(shots, frame, journeys, journeyTitles, overview) {
  return `// Existing audit drafted from screenshots by npm run draft-existing.
// Edit SHOTS, JOURNEYS and STAGES only. Look at each image, then fill in:
//   title      what the screen is, from its visible content. Filenames are not descriptive (IMG_1234 is
//              fine): always write titles from the image, never from the filename
//   hotspots   one for EVERY visible control (buttons, tabs, rows, toggles, close/back), so the
//              prototype clicks like production. box is [left%, top%, width%, height%]. Then one of:
//                to: 'route'          opens the captured screen the control leads to
//                back: true           returns to the previous screen (Back, Close, Cancel, Done)
//                backPast: [routes]   like back, but keeps going back while the screen reached is one of these
//                                     (closing a multi-step sheet leaves all of its steps at once)
//                note: '...'          the outcome was not captured; the note is shown instead
//              with to, optionally:
//                lateTo: 'route'      opened instead of to once the session is late (state.late): the same control
//                                     led somewhere else at a later point in the same captured session
//                leave: [routes]      when this screen is one of these, back out of them first, so the target
//                                     replaces a stack of forms (Save returns to the list, not to the form)
//                over: 'route'        replace this screen in history with that one first (a one-time setup
//                                     screen that Back should not return to)
//              phase: 'early' | 'late' on any hotspot marks which part of the session its screen belongs to;
//              opening that screen sets state.late to match, so lateTo picks the right destination later on
//   next       optional route for a screen with nothing to tap (loading, generating) that the following
//              capture shows it moving on to by itself; the prototype advances after a moment
//              (nextAfter: milliseconds, default 1200)
//   backTo     optional route that Back/Close returns to when the screen was opened directly (no history)
//   kind       optional: 'dialog' (anything presented over a screen still visibly behind it: alerts,
//              prompts, bottom sheets) | 'empty' | 'error' | 'success'. 'loading' marks a screen that
//              advances by itself; it and the default 'ready' are internal and not shown as metadata
//   approach / rationale   one sentence each: what the screen shows, and what the evidence shows
//   channel / supports   only on screens of a journey with messages: true in findings.js: channel is
//              'push' | 'email' | 'sms', and supports is the id of the journey the message serves (for example
//              'first-task'). Both appear in the screen details as "Push · supports <that journey's title>".
// Composite screens: when no single capture shows a state the prototype needs (a sheet over a different screen),
// you may join unedited captured pixels from two captures into one image. Put "composite" in its route and
// image file name (for example first-task-composite-sheet-over-list); the card is labelled Composite. Never
// paint, retouch or invent content in a composite.
// Keep board and journey as drafted: board is the journey title (one capture subfolder) and journey is its audit
// journey id from findings.js. When you reorder screens or set aside duplicates, fix the JOURNEYS steps to match.
// SHOTS and JOURNEYS stay plain literal arrays (import-captures appends new shots to them); JOURNEYS steps are
// plain lists of route strings, and a journey may have several entries (branches) that share its journey id.
// STAGES (optional): { journeyId: [{ label, routes: [route, ...] }] } draws that journey as a staged tree.
// Never describe behavior the screenshots do not show. Blurred areas are privacy redactions, not UI.
// Put problems in findings.js.
const APP_ID = ${JSON.stringify(shots.appId)};
const APP_NAME = ${JSON.stringify(shots.appName)};
const FRAME = ${JSON.stringify(frame)};
${overview ? `const OVERVIEW = ${JSON.stringify(overview, null, 2)};
` : ''}const JOURNEY_TITLES = ${JSON.stringify(journeyTitles)};
const SHOTS = [
${shots.items.map(shot => `  {
    route: ${JSON.stringify(shot.route)},
    image: ${JSON.stringify(shot.image)},
    size: ${JSON.stringify(shot.size)},
    title: ${JSON.stringify(shot.title)},
    board: ${JSON.stringify(shot.board)},
${shot.journey ? `    journey: ${JSON.stringify(shot.journey)},
` : ''}${shot.messages ? `    channel: '',
    supports: '',
` : ''}    approach: '',
    rationale: '',
    hotspots: [],
  },`).join('\n')}
];

// Ordered journeys for the Flow map. Each step is labelled with the hotspot that leads to the next
// screen, or marked "transition not captured" when no captured control connects them.
const JOURNEYS = ${journeys.length ? `[
${journeys.map(journey => `  { title: ${JSON.stringify(journey.title)}, ${journey.journey ? `journey: ${JSON.stringify(journey.journey)}, ` : ''}steps: ${JSON.stringify(journey.steps)} },`).join('\n')}
]` : '[]'};

// Optional staged Flow map layout per journey: { journeyId: [{ label, routes: [route, ...] }] }.
const STAGES = {};

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action = (shot, index) => \`\${shot.route}--\${index}\`;
const hotspot = (shot, spot, index) => \`<button type="button" class="shot-hotspot" data-action="\${action(shot, index)}" aria-label="\${esc(spot.label)}" style="left:\${spot.box[0]}%;top:\${spot.box[1]}%;width:\${spot.box[2]}%;height:\${spot.box[3]}%"></button>\`;
const composite = shot => /composite/.test(\`\${shot.route} \${shot.image}\`);
const screen = shot => () => \`<div class="app-screen shot-screen"><img class="shot-image" src="\${shot.image}" alt="\${esc(shot.title)} (\${composite(shot) ? 'composite of captured screens' : 'captured screen'})" width="\${shot.size.width}" height="\${shot.size.height}">\${(shot.hotspots || []).map((spot, index) => hotspot(shot, spot, index)).join('')}</div>\`;
const boards = [...new Set(SHOTS.map(shot => shot.board))];
const auto = 'Continues automatically';
const unlinked = 'Next capture (transition not captured)';
const channels = { push: 'Push', email: 'Email', sms: 'SMS' };
const titleOf = route => SHOTS.find(item => item.route === route)?.title || route;
const message = shot => [shot.channel ? channels[shot.channel] || shot.channel : '', shot.supports ? \`supports \${JOURNEY_TITLES[shot.supports] || shot.supports}\` : '']
  .filter(Boolean).join(' · ').replace(/^./, c => c.toUpperCase());
const links = SHOTS.flatMap(shot => [...(shot.hotspots || []).filter(spot => spot.to).map(spot => ({ from: shot.route, to: spot.to, label: spot.label })),
  ...(shot.hotspots || []).filter(spot => spot.lateTo).map(spot => ({ from: shot.route, to: spot.lateTo, label: spot.label })),
  ...(shot.next ? [{ from: shot.route, to: shot.next, label: auto }] : [])]);
// "How you get here": incoming links grouped by control, listing at most three source screens each.
const arrivals = route => {
  const byLabel = new Map();
  for (const link of links.filter(item => item.to === route)) {
    if (!byLabel.has(link.label)) byLabel.set(link.label, []);
    const from = titleOf(link.from);
    if (!byLabel.get(link.label).includes(from)) byLabel.get(link.label).push(from);
  }
  return [...byLabel].map(([label, from]) => \`\${label} on \${from.slice(0, 3).join(', ')}\${from.length > 3 ? \` and \${from.length - 3} more\` : ''}\`).join('; ');
};
const describe = spot => spot.to ? \`Opens \${titleOf(spot.to)}\${spot.lateTo ? \`, or \${titleOf(spot.lateTo)} at a later point in the same session\` : ''}.\`
  : spot.back ? 'Returns to the previous screen.' : spot.backPast ? 'Returns to the screen this was opened from.' : (spot.note || 'This outcome was not captured.');
// Routes a hotspot refers to, so npm run check can confirm each one is a captured screen.
const refs = spot => ({ ...(spot.to ? { to: spot.to } : {}), ...(spot.lateTo ? { lateTo: spot.lateTo } : {}), ...(spot.over ? { over: spot.over } : {}),
  ...(spot.leave ? { leave: spot.leave } : {}), ...(spot.backPast ? { backPast: spot.backPast } : {}) });
// backPast: go back, then keep going back while the screen reached is in the list (bounded; stops if Back cannot move).
const backPast = (ctx, routes) => {
  for (let step = 0; step < 20; step += 1) {
    const from = ctx.state.route;
    ctx.back();
    if (ctx.state.route === from || !routes.includes(ctx.state.route)) return;
  }
};
// to: optionally replace this screen in history with \`over\` first, or leave (back out of) every screen in \`leave\`
// first, so the target takes the place of a one-time setup screen or of saved forms; late sessions use lateTo.
const open = (ctx, spot) => {
  if (spot.over) ctx.go(spot.over, {}, { replace: true });
  if (spot.leave && spot.leave.includes(ctx.state.route)) backPast(ctx, spot.leave);
  ctx.go(spot.lateTo && ctx.state.late ? spot.lateTo : spot.to);
};

export default {
  identity: { id: APP_ID, name: APP_NAME, tagline: 'Captured screens.', description: 'Screens captured from the current product.', version: 'Existing · Screenshots' },
${overview ? `  overview: OVERVIEW,
` : ''}  tokens: {
    light: { background: '#ffffff', surface: '#ffffff', ink: '#111111', muted: '#6b6b6b', border: '#e2e2e2', accent: '#111111', accentSoft: '#f0f0f0', onAccent: '#ffffff', danger: '#b84040' },
  },
  appearances: ['light'],
  presentation: { width: FRAME.width, height: FRAME.height, edgeToEdge: true },
  previewLabel: 'Existing · Captured screenshots',
  library: { paletteNote: 'Not measured yet. Sample source colors before treating them as tokens.' },
  freshState: () => ({ route: SHOTS[0].route, overlay: null, toast: null, late: false }),
  SCREENS: Object.fromEntries(SHOTS.map(shot => [shot.route, screen(shot)])),
  OVERLAYS: {},
  backRoute: Object.fromEntries(SHOTS.filter(shot => shot.backTo).map(shot => [shot.route, shot.backTo])),
  handlers: Object.fromEntries(SHOTS.flatMap(shot => (shot.hotspots || []).map((spot, index) => [action(shot, index),
    ctx => spot.to ? open(ctx, spot) : spot.back ? ctx.back() : spot.backPast ? backPast(ctx, spot.backPast) : ctx.toast(spot.note || 'This outcome was not captured.')]))),
  ACTIONS: Object.fromEntries(SHOTS.flatMap(shot => (shot.hotspots || []).map((spot, index) => [action(shot, index),
    { label: spot.label, description: describe(spot), ...refs(spot) }]))),
  NAV: boards.map(board => ({ id: SHOTS.find(shot => shot.board === board).journey || board.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: board, description: 'Screens captured from the current product.', cards: SHOTS.filter(shot => shot.board === board).map(shot => ({
    id: shot.route, title: shot.title, route: shot.route, kind: shot.kind || (shot.next ? 'loading' : 'ready'), status: 'Captured',
    match: state => state.route === shot.route,
    how: [message(shot), arrivals(shot.route) || 'Open this capture directly; the tap that leads here was not captured.'].filter(Boolean).join('. '),
    ...(shot.approach ? { approach: shot.approach } : {}), ...(shot.rationale ? { rationale: shot.rationale } : {}),
    actions: (shot.hotspots || []).map((spot, index) => action(shot, index)),
  })) })),
  FLOWS: JOURNEYS.length
    ? JOURNEYS.map(journey => ({ title: journey.title, ...(journey.journey ? { journey: journey.journey } : {}), steps: journey.steps.map((route, index) => {
      const next = journey.steps[index + 1];
      const shot = SHOTS.find(item => item.route === route);
      const label = shot?.next === next ? auto : (shot?.hotspots || []).find(item => item.to === next || item.lateTo === next)?.label;
      return { card: route, ...(next ? { label: label || unlinked } : {}) };
    }) }))
    : [{ title: 'Capture order', steps: SHOTS.map(shot => ({ card: shot.route, label: 'Browse to next capture' })) }],
  ...(Object.keys(STAGES).length ? { FLOW_STAGES: Object.fromEntries(Object.entries(STAGES).map(([journey, stages]) => [journey, stages.map(stage => ({ label: stage.label, cards: stage.routes }))])) } : {}),
  onEnter(ctx) {
    const shot = SHOTS.find(item => item.route === ctx.state.route);
    // A screen whose hotspots carry phase belongs to the early or late part of the captured session.
    const phase = (shot?.hotspots || []).find(spot => spot.phase)?.phase;
    if (phase && (phase === 'late') !== !!ctx.state.late) ctx.set({ late: phase === 'late' });
    if (shot?.next) ctx.advance(shot.nextAfter || 1200, () => ctx.go(shot.next));
  },
};
`;
}

// ignore: top-level names to leave out silently (import-captures passes recordings/ and README.txt).
export async function draftExisting(args = [], { ignore = [] } = {}) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const force = args.includes('--force');
  const folders = args.filter(arg => arg !== '--force');
  if (folders.length !== 1 || folders[0].startsWith('-')) fail(usage);
  const { projectRoot: root } = await projectPaths(source);
  const metadataPath = path.join(root, 'instance.json');
  if (!await exists(metadataPath)) fail('Run this in a generated client instance.');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const input = await existingPath(folders[0], 'directory');
  const modulePath = path.join(root, 'apps/existing.js');
  if (await exists(modulePath) && !force && !(await readFile(modulePath, 'utf8')).includes(scaffoldMarker)) fail('apps/existing.js has been edited. Rerun with --force to replace it.');

  // Immediate subfolders become journeys (a screen group and a Flow map path); root images are "Captured screens".
  const skipped = [], groups = [];
  const listing = (await readdir(input, { withFileTypes: true })).filter(item => !ignore.includes(item.name)).sort((a, b) => byName(a.name, b.name));
  const rootImages = listing.filter(item => item.isFile() && isImage(item.name) && !item.name.startsWith('.')).map(item => item.name);
  for (const item of listing) {
    if (item.name === '.DS_Store') continue;
    if (item.name.startsWith('.')) { skipped.push(`${item.name} (hidden)`); continue; }
    if (item.isFile() && !isImage(item.name)) skipped.push(`${item.name} (not a .png, .jpg or .webp image)`);
    else if (!item.isFile() && !item.isDirectory()) skipped.push(`${item.name} (not a regular file or folder)`);
  }
  const registry = await journeyRegistry(root, metadata);
  for (const folder of listing.filter(item => item.isDirectory() && !item.name.startsWith('.'))) {
    const entries = (await readdir(path.join(input, folder.name), { withFileTypes: true })).sort((a, b) => byName(a.name, b.name));
    const names = [];
    for (const item of entries) {
      if (item.name === '.DS_Store') continue;
      const where = `${folder.name}/${item.name}`;
      if (item.name.startsWith('.')) skipped.push(`${where} (hidden)`);
      else if (item.isDirectory()) skipped.push(`${where}/ (nested folders are not read)`);
      else if (!item.isFile() || !isImage(item.name)) skipped.push(`${where} (not a .png, .jpg or .webp image)`);
      else names.push(item.name);
    }
    if (!names.length) { skipped.push(`${folder.name}/ (no images)`); continue; }
    const key = folderSlug(folder.name), journey = registry.find(item => item.id === key);
    if (!journey && registry.length) console.log(`Note: ${folder.name}/ does not match a journey id in findings.js; it is titled from the folder name and listed after the registered journeys.`);
    groups.push({ folder: folder.name, prefix: key, board: journey ? journey.title : titleCase(folder.name), journey: journey?.id, messages: journey?.messages === true, names });
  }
  // A flat folder keeps one "Captured screens" group; with subfolders, stray root images come last.
  if (rootImages.length) groups[groups.length ? 'push' : 'unshift']({ folder: '', prefix: '', board: 'Captured screens', names: rootImages });
  if (skipped.length) console.log(`Skipped ${skipped.length} item${skipped.length === 1 ? '' : 's'}:\n${skipped.map(item => `  ${item}`).join('\n')}`);
  if (groups.reduce((total, group) => total + group.names.length, 0) < 2) fail('Add at least two screenshots (.png, .jpg, or .webp) to the folder.');
  const overview = await currentOverview(modulePath, groups.reduce((total, group) => total + group.names.length, 0));

  // Routes: flat files keep their filename slug; subfolder files are prefixed with the journey (or folder)
  // slug, so the same filename in two folders gives two routes. Asset files are named after the route.
  const routes = new Set(), items = [], journeys = [];
  await mkdir(path.join(root, 'apps/assets/existing'), { recursive: true });
  for (const group of groups) {
    const steps = [];
    for (const name of group.names) {
      const from = path.join(input, group.folder, name);
      const bytes = await readFile(from);
      const base = group.prefix ? slug(`${group.prefix}-${path.parse(name).name}`) : slug(path.parse(name).name) || 'screen';
      let route = base;
      for (let n = 2; routes.has(route); n++) route = `${base}-${n}`;
      routes.add(route);
      const file = `apps/assets/existing/${route}${path.extname(name).toLowerCase().replace('.jpeg', '.jpg')}`;
      if (!await exists(path.join(root, file))) await copyFile(from, path.join(root, file));
      items.push({ route, image: `./${file}`, file, size: dimensions(bytes, name), title: title(path.parse(name).name), board: group.board, journey: group.journey, messages: group.messages });
      steps.push(route);
    }
    if (group.folder && steps.length >= 2) journeys.push({ title: group.board, journey: group.journey, steps });
    else if (group.folder) console.log(`Note: ${group.folder}/ has one capture, so its journey has a screen but no Flow map path yet.`);
  }
  const first = items[0].size, width = 390;
  const frame = { width, height: Math.round(width * first.height / first.width) };
  const journeyTitles = Object.fromEntries(registry.map(item => [item.id, item.title]));
  await writeFile(modulePath, moduleText({ appId: metadata.app.id, appName: metadata.instance?.appName || metadata.app.name, items }, frame, journeys, journeyTitles, overview));
  await writeFile(path.join(root, 'apps/existing.css'), stylesheet);
  const findingsPath = path.join(root, 'apps/findings.js');
  if (!registry.length && await exists(findingsPath) && (await readFile(findingsPath, 'utf8')).includes(findingsMarker)) await writeFile(findingsPath, emptyFindings);

  const add = list => [...new Set([...list, ...items.map(item => item.file)])].sort();
  metadata.files = add(metadata.files);
  if (metadata.exportFiles) metadata.exportFiles = add(metadata.exportFiles);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  const groupCount = groups.length, missing = registry.filter(item => !groups.some(group => group.journey === item.id));
  console.log(`Drafted apps/existing.js from ${items.length} screenshots (${frame.width}×${frame.height} frame) in ${groupCount} group${groupCount === 1 ? '' : 's'} of screens, with ${journeys.length ? `${journeys.length} Flow map path${journeys.length === 1 ? '' : 's'}` : 'one Flow map path in capture order'}.${overview ? ' Kept the Overview.' : ''}${missing.length ? `\nNot captured yet (still listed in every view): ${missing.map(item => item.title).join(', ')}.` : ''}
Copied captures to apps/assets/existing/ and added them to instance.json.
Next: ask Claude to "complete the Existing draft": name each screen from its image, map every visible control, fix journey steps
when reordering or setting aside duplicates${items.some(item => item.messages) ? ', fill channel and supports on message shots' : ''},
and infer the client's design system in apps/design-system.js (the Design library shows a loading state until it is ready).`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await draftExisting(process.argv.slice(2)); }
  catch (error) { console.error(`Could not draft: ${error.message}`); process.exitCode = 1; }
}
