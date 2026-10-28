import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existingPath, exists, fail, slug } from './instance-files.mjs';
import { projectPaths } from './project-paths.mjs';

// Turns a folder of screenshots into a data-driven Existing module that Claude (or you)
// then completes by looking at each image: titles, hotspots, notes, and findings.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'Usage: npm run draft-existing -- <screenshot-folder> [--force]\n  Copies .png/.jpg/.webp captures into apps/assets/existing/ and drafts apps/existing.js.\n  --force replaces an apps/existing.js that is no longer the untouched scaffold.';
const scaffoldMarker = 'An unreviewed Existing audit scaffold';
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
// { id, severity: 'high' | 'medium' | 'low', title, problem, recommendation, evidence: [cardIds], proposal: [cardIds] }
// Cite only what the screenshots show. The Findings view appears once items are added.
export default {
  summary: '',
  evidenceState: 'existing',
  proposalState: 'future',
  items: [],
};
`;

function dimensions(bytes, file) {
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

function moduleText(shots, frame) {
  return `// Existing audit drafted from screenshots by npm run draft-existing.
// Edit SHOTS and JOURNEYS only. Look at each image, then fill in:
//   title      what the screen is, from its visible content
//   hotspots   one for EVERY visible control (buttons, tabs, rows, toggles, close/back), so the
//              prototype clicks like production. box is [left%, top%, width%, height%]. Then one of:
//                to: 'route'   opens the captured screen the control leads to
//                back: true    returns to the previous screen (Back, Close, Cancel, Done)
//                note: '...'   the outcome was not captured; the note is shown instead
//   next       optional route for a screen with nothing to tap (loading, generating) that the following
//              capture shows it moving on to by itself; the prototype advances after a moment
//   approach / rationale   one sentence each: what the screen shows, and what the evidence shows
// Never describe behavior the screenshots do not show. Put problems in findings.js.
const APP_ID = ${JSON.stringify(shots.appId)};
const APP_NAME = ${JSON.stringify(shots.appName)};
const FRAME = ${JSON.stringify(frame)};
const SHOTS = [
${shots.items.map(shot => `  {
    route: ${JSON.stringify(shot.route)},
    image: ${JSON.stringify(shot.image)},
    size: ${JSON.stringify(shot.size)},
    title: ${JSON.stringify(shot.title)},
    board: 'Captured screens',
    approach: '',
    rationale: '',
    hotspots: [],
  },`).join('\n')}
];

// Ordered journeys for the Flow map. Each step is labelled with the hotspot that leads to the next
// screen, or marked "transition not captured" when no captured control connects them.
const JOURNEYS = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action = (shot, index) => \`\${shot.route}--\${index}\`;
const hotspot = (shot, spot, index) => \`<button type="button" class="shot-hotspot" data-action="\${action(shot, index)}" aria-label="\${esc(spot.label)}" style="left:\${spot.box[0]}%;top:\${spot.box[1]}%;width:\${spot.box[2]}%;height:\${spot.box[3]}%"></button>\`;
const screen = shot => () => \`<div class="app-screen shot-screen"><img class="shot-image" src="\${shot.image}" alt="\${esc(shot.title)} (captured screen)" width="\${shot.size.width}" height="\${shot.size.height}">\${shot.hotspots.map((spot, index) => hotspot(shot, spot, index)).join('')}</div>\`;
const boards = [...new Set(SHOTS.map(shot => shot.board))];
const auto = 'Continues automatically';
const links = SHOTS.flatMap(shot => [...shot.hotspots.filter(spot => spot.to).map(spot => ({ from: shot.route, to: spot.to, label: spot.label })),
  ...(shot.next ? [{ from: shot.route, to: shot.next, label: auto }] : [])]);

export default {
  identity: { id: APP_ID, name: APP_NAME, tagline: 'Captured evidence.', description: 'Screens captured from the current product.', version: 'Existing · Screenshots' },
  tokens: {
    light: { background: '#ffffff', surface: '#ffffff', ink: '#111111', muted: '#6b6b6b', border: '#e2e2e2', accent: '#111111', accentSoft: '#f0f0f0', onAccent: '#ffffff', danger: '#b84040' },
  },
  appearances: ['light'],
  presentation: { width: FRAME.width, height: FRAME.height, edgeToEdge: true },
  previewLabel: 'Existing · Captured screenshots',
  library: { paletteNote: 'Placeholder values. Sample source colors before treating them as tokens.' },
  freshState: () => ({ route: SHOTS[0].route, overlay: null, toast: null }),
  SCREENS: Object.fromEntries(SHOTS.map(shot => [shot.route, screen(shot)])),
  OVERLAYS: {},
  handlers: Object.fromEntries(SHOTS.flatMap(shot => shot.hotspots.map((spot, index) => [action(shot, index),
    ctx => spot.to ? ctx.go(spot.to) : spot.back ? ctx.back() : ctx.toast(spot.note || 'This outcome was not captured.')]))),
  ACTIONS: Object.fromEntries(SHOTS.flatMap(shot => shot.hotspots.map((spot, index) => [action(shot, index),
    { label: spot.label, description: spot.to ? \`Opens \${SHOTS.find(item => item.route === spot.to)?.title || spot.to}.\` : spot.back ? 'Returns to the previous screen.' : (spot.note || 'This outcome was not captured.') }]))),
  NAV: boards.map(board => ({ id: board.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: board, description: 'Screenshots of the current product.', cards: SHOTS.filter(shot => shot.board === board).map(shot => ({
    id: shot.route, title: shot.title, route: shot.route, kind: shot.next ? 'loading' : 'ready', status: 'Captured',
    match: state => state.route === shot.route,
    how: links.filter(link => link.to === shot.route).map(link => \`\${link.label} on \${SHOTS.find(item => item.route === link.from).title}\`).join('; ') || 'Open this capture directly.',
    ...(shot.approach ? { approach: shot.approach } : {}), ...(shot.rationale ? { rationale: shot.rationale } : {}),
    actions: shot.hotspots.map((spot, index) => action(shot, index)),
  })) })),
  FLOWS: JOURNEYS.length
    ? JOURNEYS.map(journey => ({ title: journey.title, steps: journey.steps.map((route, index) => {
      const next = journey.steps[index + 1];
      const shot = SHOTS.find(item => item.route === route);
      const label = shot?.next === next ? auto : shot?.hotspots.find(item => item.to === next)?.label;
      return { card: route, ...(next ? { label: label || 'Next capture (transition not captured)' } : {}) };
    }) }))
    : [{ title: 'Capture order', steps: SHOTS.map(shot => ({ card: shot.route, label: 'Browse to next capture' })) }],
  onEnter(ctx) {
    const shot = SHOTS.find(item => item.route === ctx.state.route);
    if (shot?.next) ctx.advance(1200, () => ctx.go(shot.next));
  },
};
`;
}

export async function draftExisting(args = []) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(usage); return; }
  const force = args.includes('--force');
  const folders = args.filter(arg => arg !== '--force');
  if (folders.length !== 1 || folders[0].startsWith('-')) fail(usage);
  const { projectRoot: root } = await projectPaths(source);
  const metadataPath = path.join(root, 'instance.json');
  if (!await exists(metadataPath)) fail('Run this in a generated client instance.');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const input = await existingPath(folders[0], 'directory');
  const images = (await readdir(input)).filter(name => /\.(png|jpe?g|webp)$/i.test(name) && !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (images.length < 2) fail('Add at least two screenshots (.png, .jpg, or .webp) to the folder.');
  const modulePath = path.join(root, 'apps/existing.js');
  if (await exists(modulePath) && !force && !(await readFile(modulePath, 'utf8')).includes(scaffoldMarker)) fail('apps/existing.js has been edited. Rerun with --force to replace it.');

  const routes = new Set(), items = [];
  await mkdir(path.join(root, 'apps/assets/existing'), { recursive: true });
  for (const name of images) {
    const bytes = await readFile(path.join(input, name));
    const base = slug(path.parse(name).name) || 'screen';
    let route = base;
    for (let n = 2; routes.has(route); n++) route = `${base}-${n}`;
    routes.add(route);
    const file = `apps/assets/existing/${route}${path.extname(name).toLowerCase().replace('.jpeg', '.jpg')}`;
    if (!await exists(path.join(root, file))) await copyFile(path.join(input, name), path.join(root, file));
    items.push({ route, image: `./${file}`, file, size: dimensions(bytes, name), title: title(path.parse(name).name) });
  }
  const first = items[0].size, width = 390;
  const frame = { width, height: Math.round(width * first.height / first.width) };
  await writeFile(modulePath, moduleText({ appId: metadata.app.id, appName: metadata.instance?.appName || metadata.app.name, items }, frame));
  await writeFile(path.join(root, 'apps/existing.css'), stylesheet);
  const findingsPath = path.join(root, 'apps/findings.js');
  if (await exists(findingsPath) && (await readFile(findingsPath, 'utf8')).includes(findingsMarker)) await writeFile(findingsPath, emptyFindings);

  const add = list => [...new Set([...list, ...items.map(item => item.file)])].sort();
  metadata.files = add(metadata.files);
  if (metadata.exportFiles) metadata.exportFiles = add(metadata.exportFiles);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Drafted apps/existing.js from ${items.length} screenshots (${frame.width}×${frame.height} frame).
Copied captures to apps/assets/existing/ and added them to instance.json.
Next: ask Claude to "complete the Existing draft": name and order each screen, map every visible control, and add journeys for the Flow map.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await draftExisting(process.argv.slice(2)); }
  catch (error) { console.error(`Could not draft: ${error.message}`); process.exitCode = 1; }
}
