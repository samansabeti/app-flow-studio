import { mkdir, readFile, writeFile, rename, rm, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { STATIC_CORE, existingPath, exists, safeRead, digest, json, configText, parseConfig, validateManifest, label, isShareContent, checkLocalDependencies, writeNewTree, treeHashes, fail } from './instance-files.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function outputName(args) {
  let result = 'dist';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') return null;
    if (args[i] === '--out' && args[i + 1]) result = args[++i];
    else fail(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(result) || ['apps', 'scripts', 'templates', 'work', 'outputs', 'node_modules'].includes(result.toLowerCase())) fail('--out must be a new direct child folder name, such as dist or review-dist.');
  return result;
}
function sameHashes(actual, expected) {
  const a = Object.keys(actual).sort(), b = Object.keys(expected).sort();
  return JSON.stringify(a) === JSON.stringify(b) && a.every(file => actual[file] === expected[file]);
}
export async function exportShare(args = []) {
  const name = outputName(args);
  if (name === null) { console.log('Usage: npm run export-share -- [--out dist]\nCreates a local static bundle from an instance’s allowlist. Replaces only its unchanged, previously owned output.'); return; }
  const root = await existingPath(source, 'directory');
  let metadata;
  try { metadata = JSON.parse((await safeRead(root, 'instance.json')).toString('utf8')); }
  catch (error) { fail(`Static export requires a generated client instance with instance.json. ${error.message}`); }
  if (metadata.schemaVersion !== 1 || typeof metadata.instance?.id !== 'string' || !metadata.instance.id) fail('Unsupported or incomplete instance metadata.');
  const config = parseConfig((await safeRead(root, 'config.js')).toString('utf8'));
  if (!Array.isArray(config.apps) || config.apps.length !== 1 || config.apps[0].id !== metadata.app?.id || config.defaultApp !== metadata.app.id) fail('An instance export must contain exactly its own registered app.');
  const manifest = validateManifest({ app: config.apps[0], files: metadata.files, exportFiles: metadata.exportFiles, studio: config.studio });
  const files = new Map();
  for (const file of STATIC_CORE) files.set(file, await safeRead(root, file));
  for (const file of manifest.exportFiles ?? manifest.files) {
    const bytes = await safeRead(root, file);
    if (isShareContent(file)) files.set(file, bytes);
  }
  files.set('config.js', configText({
    studioName: label(config.studioName || metadata.instance.name, 'Studio name'),
    ...(manifest.studio ? { studio: manifest.studio } : {}),
    defaultApp: manifest.app.id,
    apps: [manifest.app],
  }));
  checkLocalDependencies(files);
  const hashes = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [file, digest(bytes)]));
  const output = path.join(root, name), state = path.join(root, '.app-flow-exports');
  if (await exists(state)) await existingPath(state, 'directory');
  else await mkdir(state);
  const recordPath = path.join(state, `${name}.json`), lockPath = path.join(state, `${name}.lock`);
  const lock = await open(lockPath, 'wx').catch(error => fail(error.code === 'EEXIST' ? `An export lock already exists: ${lockPath}. Check whether another export is running.` : error.message));
  const stage = path.join(root, `.app-flow-export-${randomUUID()}`), backup = path.join(root, `.app-flow-export-${randomUUID()}`), recordTemp = path.join(state, `${name}.${randomUUID()}.tmp`);
  let backedUp = false, installed = false, finished = false;
  try {
    let record = null;
    if (await exists(recordPath)) record = JSON.parse(await readFile(await existingPath(recordPath, 'file'), 'utf8'));
    if (record && (record.schemaVersion !== 1 || record.instanceId !== metadata.instance.id || record.output !== name || !record.files || typeof record.files !== 'object')) fail('Output ownership record does not match this instance.');
    if (await exists(output)) {
      await existingPath(output, 'directory');
      if (!record) fail(`Refusing to overwrite an unowned output: ${output}`);
      if (!sameHashes(await treeHashes(output), record.files)) fail(`Refusing to overwrite modified output: ${output}. Export to a new --out folder.`);
    }
    await mkdir(stage);
    await writeNewTree(stage, files);
    if (await exists(output)) { await rename(output, backup); backedUp = true; }
    await rename(stage, output); installed = true;
    await writeFile(recordTemp, json({ schemaVersion: 1, instanceId: metadata.instance.id, output: name, files: hashes }), { flag: 'wx' });
    await rename(recordTemp, recordPath);
    finished = true;
    if (backedUp) await rm(backup, { recursive: true });
    console.log(`Exported ${files.size} files to ${output}\nLocal static files only; nothing was uploaded or deployed.\nDocumentation, tools, editor settings, and instance/source manifests were excluded.`);
    return output;
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
  try { await exportShare(process.argv.slice(2)); }
  catch (error) { console.error(`Could not export: ${error.message}`); process.exitCode = 1; }
}
