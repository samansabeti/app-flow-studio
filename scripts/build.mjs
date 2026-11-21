import { mkdir, open, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectPaths } from './project-paths.mjs';
import { STATIC_CORE, checkLocalDependencies, configText, digest, existingPath, exists, fail,
  isShareContent, json, label, parseConfig, safeRead, treeHashes, validateManifest,
  validateStudioConfig, writeNewTree, shareReviewedFindings } from './instance-files.mjs';

// Build a browser-only snapshot. Never recursively copy the repository or app/.
export async function browserFiles(directory) {
  const { projectRoot, browserRoot } = await projectPaths(directory);
  if (await exists(path.join(projectRoot, 'instance.json'))) {
    fail('Client instances use npm run export-share. This build is for the Studio master.');
  }
  const config = parseConfig((await safeRead(browserRoot, 'config.js')).toString('utf8'));
  if (!Array.isArray(config.apps) || !config.apps.length) fail('The build needs at least one registered app.');
  const studio = validateStudioConfig(config.studio);
  const manifests = config.apps.map(app => validateManifest({ app, files: config.previewFiles, studio }));
  const content = manifests[0].files;
  if (content.some(file => !isShareContent(file))) fail('previewFiles must contain only browser content, not notes or source manifests.');
  const apps = manifests.map(manifest => manifest.app);
  if (new Set(apps.map(app => app.id)).size !== apps.length) fail('Registered app IDs must be unique.');
  if (!apps.some(app => app.id === config.defaultApp)) fail('defaultApp must name a registered app.');
  const files = new Map();
  for (const file of [...STATIC_CORE, ...content]) files.set(file, await safeRead(browserRoot, file));
  files.set('config.js', Buffer.from(configText({
    studioName: label(config.studioName, 'Studio name'),
    defaultApp: config.defaultApp,
    apps,
    ...(studio ? { studio } : {}),
  })));
  const reviewNotes = await shareReviewedFindings(browserRoot, apps, files);
  checkLocalDependencies(files);
  return { projectRoot, files, reviewNotes };
}

function sameHashes(actual, expected) {
  const a = Object.keys(actual).sort(), b = Object.keys(expected).sort();
  return JSON.stringify(a) === JSON.stringify(b) && a.every(file => actual[file] === expected[file]);
}

export async function buildStudio(directory) {
  // Read and validate every input before touching existing output.
  const { projectRoot, files, reviewNotes } = await browserFiles(directory);
  const hashes = Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)]));
  const output = path.join(projectRoot, 'dist');
  const state = path.join(projectRoot, '.app-flow-exports');
  if (await exists(state)) await existingPath(state, 'directory');
  else await mkdir(state);
  const recordPath = path.join(state, 'studio-build.json');
  const lockPath = path.join(state, 'studio-build.lock');
  const lock = await open(lockPath, 'wx').catch(error => fail(error.code === 'EEXIST'
    ? 'A Studio build lock exists. Check whether another build is running.' : error.message));
  const stage = path.join(projectRoot, `.app-flow-export-${randomUUID()}`);
  const backup = path.join(projectRoot, `.app-flow-export-${randomUUID()}`);
  const recordTemp = path.join(state, `studio-build-${randomUUID()}.tmp`);
  let backedUp = false, installed = false, finished = false;
  try {
    let record;
    if (await exists(recordPath)) record = JSON.parse(await readFile(await existingPath(recordPath, 'file'), 'utf8'));
    if (record && (record.schemaVersion !== 1 || record.kind !== 'studio-build' || !record.files || typeof record.files !== 'object')) {
      fail('Studio build ownership record is invalid.');
    }
    if (await exists(output)) {
      await existingPath(output, 'directory');
      if (!record) fail('Refusing to replace an unowned dist/ folder. Move it aside before building.');
      if (!sameHashes(await treeHashes(output), record.files)) {
        fail('Refusing to replace modified dist/ files. Preserve your edits elsewhere, then rebuild from source.');
      }
    }
    await mkdir(stage);
    await writeNewTree(stage, files);
    if (await exists(output)) { await rename(output, backup); backedUp = true; }
    await rename(stage, output); installed = true;
    await writeFile(recordTemp, json({ schemaVersion: 1, kind: 'studio-build', files: hashes }), { flag: 'wx' });
    await rename(recordTemp, recordPath);
    finished = true;
    if (backedUp) await rm(backup, { recursive: true });
    return { output, files: Object.keys(hashes).sort(), reviewNotes };
  } catch (error) {
    if (!finished && installed) await rm(output, { recursive: true, force: true });
    if (!finished && backedUp) await rename(backup, output);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(recordTemp, { force: true });
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail('Usage: npm run build');
    const result = await buildStudio();
    for (const note of result.reviewNotes) console.log(note);
    console.log(`Built ${result.files.length} browser files in ${result.output}.\nLocal output only; nothing was uploaded or deployed.`);
  } catch (error) {
    console.error(`Could not build: ${error.message}`);
    process.exitCode = 1;
  }
}
