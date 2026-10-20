import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { STUDIO_VERSION, STATIC_CORE, INSTANCE_CORE, TEMPLATE_FILES, label, slug, existingPath, exists, safeRead, digest, json, configText, validateManifest, isShareContent, checkLocalDependencies, writeNewTree, fail } from './instance-files.mjs';
import { projectPaths } from './project-paths.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'npm run create-instance -- <new-destination> --name "Client App Flow" --app-name "Client" --port 8003 [--from <source-folder> --manifest <manifest.json>]';
function options(args, legacy) {
  const result = {}, flags = new Set(['--name', '--app-name', '--port', '--from', '--manifest']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (flags.has(arg)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) fail(`Missing value for ${arg}.`);
      const key = arg.slice(2);
      if (result[key] !== undefined) fail(`Repeated option: ${arg}`);
      result[key] = args[++i];
    } else if (!arg.startsWith('-') && !result.destination) result.destination = arg;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!result.destination) fail(`Provide a new destination.\nUsage: ${usage}`);
  if (!!result.from !== !!result.manifest) fail('--from and --manifest must be supplied together.');
  result.name = label(result.name || (legacy ? 'My App' : 'Client App Flow'), 'Instance name');
  result.appName = label(result['app-name'] || (legacy ? result.name : result.name.replace(/ App Flow$/, '')), 'App name');
  result.port ??= 8003;
  if (!/^\d+$/.test(String(result.port)) || Number(result.port) > 65535) fail('Port must be a whole number from 0 to 65535.');
  result.port = Number(result.port);
  return result;
}
function defaultManifest(appName) {
  return { app: { id: slug(appName), name: appName, module: './apps/existing.js', stylesheet: './apps/existing.css', variants: [
    { id: 'existing', name: 'Existing', module: './apps/existing.js', stylesheet: './apps/existing.css' },
    { id: 'future', name: 'Future', module: './apps/future.js', stylesheet: './apps/future.css' }
  ], defaultVariant: 'existing' }, files: TEMPLATE_FILES.map(file => `apps/${file}`) };
}
function documents(opts, manifest, kind) {
  const studio = manifest.studio ?? (kind === 'template' ? { showOverview: true, defaultView: 'overview', sidebar: { collapsible: true } } : undefined);
  const files = new Map(), config = { studioName: opts.name, ...(studio ? { studio } : {}), defaultApp: manifest.app.id, apps: [manifest.app] };
  files.set('config.js', configText(config));
  files.set('package.json', json({ name: slug(opts.name), version: '1.0.0', private: true, type: 'module', description: `${opts.name}: an isolated local App Flow Studio instance.`, scripts: {
    dev: `node server.mjs --port ${opts.port}`,
    'dev:phone': `node server.mjs --phone --port ${opts.port > 0 && opts.port < 65535 ? opts.port + 1 : 0}`,
    check: 'node scripts/check.mjs', 'check:phone': 'node scripts/check-phone-preview.mjs', 'export-share': 'node scripts/export-share.mjs',
    'create-instance': 'node scripts/create-instance.mjs', 'create-app': 'node scripts/create-app.mjs'
  }, engines: { node: '>=18' } }));
  files.set('.gitignore', '# Local and generated files\nnode_modules/\n.env\n.env.*\n!.env.example\n.DS_Store\n*.log\ndist/\n.app-flow-exports/\n.app-flow-export-*/\n');
  files.set('.codex/environments/environment.toml', `version = 1\nname = ${JSON.stringify(opts.name)}\n\n[setup]\nscript = ""\n\n[[actions]]\nname = "Run"\nicon = "run"\ncommand = "npm run dev"\n\n[[actions]]\nname = "Phone preview"\nicon = "run"\ncommand = "npm run dev:phone"\n\n[[actions]]\nname = "Check"\ncommand = "npm run check"\n\n[[actions]]\nname = "Export"\ncommand = "npm run export-share"\n`);
  files.set('README.md', `# ${opts.name}

An independent local workspace for ${opts.appName}, generated with App Flow Studio ${STUDIO_VERSION}. Client content and changes stay in this folder. The product master and other clients are unchanged.

## Run

Requires Node.js 18 or later. Run \`npm run dev\`; no install or build step is needed. The preview binds to 127.0.0.1, starts at port ${opts.port}, and tries the next port if busy. Open the URL printed in the terminal. Stop with Ctrl+C. Use \`npm run dev -- --port 0\` to choose an available port.

Add this folder as a Codex local project. The included environment file defines Run, Phone preview, Check, and Export actions; action detection depends on the host and has not been verified by the generator.

Phone preview is opt-in: \`npm run dev:phone\` binds to an available private LAN address and prints a local QR page. Open that page on this computer, then scan it from a phone on the same trusted network. Browser resources are restricted to the static runtime and the exported app inventory. Anyone on that network who can reach the address can view the prototype while this separate server is running; stop it with Ctrl+C. The ordinary Run command stays loopback-only. Run \`npm run check:phone\` to check server access rules and QR generation.

## Work here

Read AGENTS.md and KICKOFF.md. The registry is config.js; start with ${manifest.app.module.slice(2)}. Existing and Future are separate design states. ${kind === 'import' ? 'Imported content comes only from the explicit import allowlist. Imported file bytes and the default design state stay unchanged; --app-name sets the registry display name without rewriting module identity or screen copy. Preserve supplied evidence and distinguish it from locally simulated transitions.' : 'A new client opens the Existing Overview. Existing is an evidence placeholder, not a production audit. Future is an editable two-screen proposal. Replace these small templates with the client’s journey.'} Returning browsers keep their saved design-state selection.

Use Overview, Screens, Flow map, and Design library together. Overview is optional app metadata, separate from screen cards. config.js can set \`studio.showOverview\`, \`defaultView\`, \`headerTitle\`, \`headerSubtitle\`, \`showDesignLibrary\`, and \`sidebar: { collapsible, scope }\`. Set \`studio.appearance\` to light or dark for a fixed Studio appearance, or omit it to keep switching available. A local \`studio.icon\` must be an image under apps/ and included in the exported inventory. These preferences do not change app appearance.

Keep screen markup, action metadata, context, and journeys aligned. Start card and overlay detail panels with two concise sentences: \`approach\` describes what the screen does, and \`rationale\` explains why. These summaries appear above entry instructions and interactions. Legacy \`rationale\` arrays and \`notes\` remain supported. Use stable, descriptive route names and card IDs as implementation and flow references; keep them consistent across SCREENS, NAV, ACTIONS, and FLOWS when changing display copy.

Every visible control should work or explain the intentionally unbuilt outcome. All interactions are simulated locally. Keep loading and saving as separate cards. Use \`ctx.advance(milliseconds, callback)\` for their automatic completion; each loading card advances once while the prototype is open. The callback synchronously applies the result with \`ctx.set\`, \`ctx.go\`, or both.

Reset or R restores the latest loading snapshot, otherwise the selected card. Back restores the loading state before completion, including its simulated data and entered draft, and holds it for inspection. Backward card browsing also holds loading; close and reopen the prototype to replay. Use \`ctx.later\` for incidental timed updates. Both timer methods cancel pending work on reset, back, navigation, and closing the prototype. Run \`npm run check\` after changes, then inspect affected interactions and layouts in a browser. Automated checks do not establish visual quality or production behavior.

## Local static export

Run \`npm run export-share\` to create dist/ from the browser runtime and this app’s explicit files list in instance.json. Optionally set \`exportFiles\` to an explicit subset of \`files\` when the local evidence inventory is larger than the review bundle. The subset must contain every currently registered module, stylesheet, Studio icon, and required browser asset. Omitting \`exportFiles\` preserves the original full-inventory behavior. Add new app modules and assets to both lists when a subset is in use.

The current config.js registry and validated Studio presentation settings are preserved and must remain a JSON-compatible export. Static imports, CSS URLs, and literal asset references are checked for missing files; computed resource names still require inventory review and browser testing. Documentation, tools, editor settings, source manifests, and secrets are excluded; bundled asset licenses are retained when listed. Nothing is uploaded or deployed. Review the output before separately authorizing publication. Serve the folder through a static HTTP server to review it.

A later export replaces only a previously generated, unmodified output. It refuses an existing unowned folder, symlinks, extra files, and manual changes. Use \`npm run export-share -- --out review-dist\` for a new direct child folder; add custom output names to .gitignore. Ownership records live outside the bundle in .app-flow-exports/.

## Lineage

instance.json records the generator version, instance ID, source kind, registry, and explicit client file allowlist. This is a standalone copy with no automatic link or update process. To create another isolated client, run \`npm run create-instance -- ../another-client --name "Another App Flow" --app-name "Another" --port 8004\`. The destination must not exist.
`);
  files.set('AGENTS.md', `# ${opts.name} instructions

Read README.md, config.js, instance.json, and the active app module before changing this client. Use KICKOFF.md for the working brief.

- Work in this client folder. Do not edit the product master or another client.
- Existing holds source evidence; Future holds proposed changes. Preserve supplied originals and distinguish screenshot-confirmed content from simulated transitions and draft copy. Never fabricate missing evidence.
- Keep behavior local unless the user explicitly authorizes a real integration or publication. Do not authenticate, purchase, upload, deploy, or send messages merely because this is a prototype.
- Keep plain HTML/CSS/JavaScript and the dependency-free server. Shared studio behavior belongs in studio.js/studio.css; client state, screens, tokens, actions, overlays, boards, and journeys belong in the app module.
- Use pure renderers. Use ctx.set, ctx.go, ctx.back, ctx.overlay, ctx.toast, and managed timers for behavior. Keep ACTIONS, NAV context, and FLOWS consistent with working controls.
- Keep loading and saving as separate cards. Use ctx.advance for automatic completion once per loading card per open prototype, with a synchronous completion callback. Reset/R restores the latest loading snapshot or selected card; Back and backward card browsing hold restored loading, including draft values. Close and reopen to replay. Use ctx.later for incidental timed updates.
- Begin card and overlay details with concise approach and rationale strings: what the screen does and why. Keep entry instructions and interactions below this summary. Legacy rationale arrays and notes remain supported.
- Use stable route names and card IDs as implementation references. Keep SCREENS, NAV, ACTIONS, and FLOWS synchronized when renaming one; changes to display copy should not require new IDs.
- Preserve independent Studio and App appearances, keyboard access, readable contrast, and useful focus behavior. Keep source frame proportions and native chrome intact when using screenshots.
- Add client assets and modules to instance.json’s explicit files list, and its optional exportFiles subset when needed by the browser. Every active module, stylesheet, icon, and asset must be exported. Never add secrets, another client, source directories, or tool/editor files. Keep config.js as a JSON-compatible export default object.
- Run stays loopback-only. Phone preview is a separate opt-in command for a trusted private LAN; it makes allowlisted app content available to reachable devices while running. Do not start it unless requested.
- Run npm run check and inspect affected screens, actions, reset/back, timers, overlays, keyboard navigation, and narrow layouts when a browser is available. State honestly when browser verification was unavailable.
- npm run export-share creates a local static bundle only. Do not interpret export as permission to publish. Change source files and export again instead of manually editing dist or its ownership record.

Report the actual preview URL, client directory, changes, checks run, and material limits.
`);
  files.set('KICKOFF.md', `# ${opts.name} kickoff

Use this brief to continue this client instance:

> Work only in this ${opts.name} folder. Read README.md, AGENTS.md, config.js, instance.json, and the active app modules first. Preserve Existing evidence and build proposals in Future. Keep the flow map, boards, interactions, design library, and contextual notes consistent. Start with the smallest complete journey. Keep loading and saving as separate cards, using ctx.advance for automatic completion once per open prototype and ctx.later for incidental timers. Reset/R and Back restore held loading for inspection; closing and reopening permits replay. Use fictional data for invented examples, explicit evidence limits for supplied screenshots, and local simulations for all behavior. Keep the dependency-free runtime. Run checks and review affected interactions before reporting completion. Do not publish or connect external services without explicit authorization.

## Client brief

- Product and intended user:
- Task the user needs to complete:
- Existing evidence and source locations:
- Proposed journey and success state:
- Required branches, empty states, and errors:
- Design references and constraints:
- Questions that materially block the design:

Add app content to instance.json’s files list as it is introduced. If exportFiles is present, maintain that explicit subset with all active browser resources while keeping unused source evidence out. Use the optional app overview for the proposal and evidence limits, not as an invented production screen. Write each detail summary as a short approach sentence and rationale sentence above its entry instructions and interactions, and use stable route names and card IDs to connect the implementation, screen cards, and flows. This copy is independent; changes do not update the product master or another client.
`);
  return files;
}
export async function createInstance(args, { legacy = false } = {}) {
  const opts = options(args, legacy);
  if (opts.help) { console.log(`Usage: ${usage}\nCreates a new isolated instance; never overwrites. Manifest: {app: <registry entry>, files: ["apps/relative-file"], exportFiles?: [<browser subset>], studio?: <presentation options>}.`); return; }
  const { projectRoot: root, browserRoot } = await projectPaths(source);
  const destination = path.resolve(opts.destination);
  const parent = await existingPath(path.dirname(destination), 'directory');
  if (await exists(destination)) fail(`Nothing was overwritten. Destination already exists: ${destination}`);
  if (destination === root || destination.startsWith(`${root}${path.sep}`)) fail('Create the instance outside the source project.');
  let manifest, sourceKind = 'template', importedFrom, importDigest;
  const content = new Map();
  if (opts.from) {
    const importRoot = await existingPath(opts.from, 'directory');
    if (destination === importRoot || destination.startsWith(`${importRoot}${path.sep}`)) fail('Create the instance outside the imported source folder.');
    const bytes = await readFile(await existingPath(opts.manifest, 'file'));
    manifest = validateManifest(JSON.parse(bytes.toString('utf8')), opts.appName);
    for (const file of manifest.files) content.set(file, await safeRead(importRoot, file));
    sourceKind = 'import'; importedFrom = importRoot; importDigest = digest(bytes);
  } else {
    manifest = validateManifest(defaultManifest(opts.appName));
    for (const file of TEMPLATE_FILES) {
      let bytes = await safeRead(root, `templates/client/${file}`);
      if (file.endsWith('.js')) {
        let text = bytes.toString('utf8');
        for (const [sentinel, value] of [['__APP_ID__', manifest.app.id], ['__APP_NAME__', opts.appName]]) {
          if (!text.includes(JSON.stringify(sentinel))) fail(`Template ${file} is missing ${sentinel}.`);
          text = text.replaceAll(JSON.stringify(sentinel), () => JSON.stringify(value));
        }
        bytes = Buffer.from(text);
      }
      content.set(`apps/${file}`, bytes);
    }
  }
  const instanceId = randomUUID(), files = documents(opts, manifest, sourceKind);
  for (const file of INSTANCE_CORE) files.set(file, await safeRead(STATIC_CORE.includes(file) ? browserRoot : root, file));
  for (const [file, bytes] of content) files.set(file, bytes);
  files.set('instance.json', json({ schemaVersion: 1, studioVersion: STUDIO_VERSION, instance: { id: instanceId, name: opts.name, appName: opts.appName, port: opts.port }, lineage: { generator: 'App Flow Studio', version: STUDIO_VERSION, sourceKind, ...(importedFrom ? { importedFrom, importManifestSha256: importDigest } : {}) }, app: manifest.app, files: manifest.files, ...(manifest.exportFiles ? { exportFiles: manifest.exportFiles } : {}) }));
  const browserFiles = [...STATIC_CORE, 'config.js', ...(manifest.exportFiles ?? manifest.files).filter(isShareContent)];
  checkLocalDependencies(new Map(browserFiles.map(file => [file, files.get(file)])));
  // Finish all reads and validation before exclusively creating the destination.
  await existingPath(parent, 'directory');
  await mkdir(destination);
  try { await writeNewTree(destination, files); }
  catch (error) { fail(`A new partial instance remains at ${destination}; inspect it before removing it. ${error.message}`); }
  console.log(`Created ${opts.name} at ${destination}\nRun npm run dev from that folder. No npm install is needed.\nDefault preview port: ${opts.port}. Source files were not changed.`);
  return destination;
}
export async function runCreateInstance(args, opts) {
  try { return await createInstance(args, opts); }
  catch (error) { console.error(`Could not create instance: ${error.message}`); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runCreateInstance(process.argv.slice(2));
