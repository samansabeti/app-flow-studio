import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readdir, readFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { addNewCaptures } from './add-captures.mjs';
import { capturesDir, heicFolder, inboxReadme, journeyFolders, orderFolders, projectRoot, reservedFolders } from './captures-inbox.mjs';
import { draftExisting, folderSlug, scaffoldMarker } from './draft-existing.mjs';

// npm run import-captures: brings the captures inbox (scripts/captures-inbox.mjs) into Existing, no path needed.
// HEIC shots are first converted to PNG with macOS sips, the original moved to heic-originals/ in the inbox;
// on other systems HEIC files are skipped with a note (export them as PNG or JPEG instead). Then:
//   - apps/existing.js missing or still the untouched scaffold: drafts it from the whole inbox (as draft-existing).
//   - apps/existing.js edited: adds only the shots not in the project yet (scripts/add-captures.mjs), as draft cards
//     marked "NEW, needs completing"; existing cards are never changed. --dry-run shows what it would add.
//   - --force: regenerates apps/existing.js from the whole inbox, discarding every hand edit (backup in the temp folder).
const usage = `Usage: npm run import-captures [-- --dry-run | --force]
  Adds new shots from the captures inbox to Existing. --dry-run only reports; --force regenerates Existing and
  discards hand edits (the current file is copied to the temp folder first).
  The inbox is CAPTURES_DIR, or "capturesDir" in instance.json, and must be outside this project.
  Name its subfolders NN-<journey id> in the order of the journeys in apps/findings.js (for example 01-signing-up).
  To use any other folder once: npm run draft-existing -- <folder>`;
const isImage = name => /\.(png|jpe?g|webp)$/i.test(name) && !name.startsWith('.');
const isHeic = name => /\.heic$/i.test(name) && !name.startsWith('.');
const images = async dir => (await readdir(dir, { withFileTypes: true })).filter(item => item.isFile() && isImage(item.name)).map(item => item.name);
const present = file => access(file).then(() => true, () => false);

async function convertHeic(inbox, folders) {
  const found = [];
  for (const folder of ['', ...folders]) {
    for (const item of await readdir(path.join(inbox, folder), { withFileTypes: true })) if (item.isFile() && isHeic(item.name)) found.push({ folder, name: item.name });
  }
  if (!found.length) return;
  if (process.platform !== 'darwin') {
    console.log(`Skipped ${found.length} HEIC shot${found.length === 1 ? '' : 's'}: converting HEIC uses macOS sips, which this system does not have.
Export them as PNG or JPEG into the same folders instead:\n${found.map(item => `  ${path.join(item.folder, item.name)}`).join('\n')}\n`);
    return;
  }
  const originals = path.join(inbox, heicFolder);
  let converted = 0;
  for (const { folder, name } of found) {
    const dir = path.join(inbox, folder), from = path.join(dir, name), where = path.join(folder, name);
    const to = path.join(dir, `${path.parse(name).name}.PNG`);
    if (await present(to) || await present(to.replace(/\.PNG$/, '.png'))) { console.log(`  ${where}: a PNG with this name already exists; left the HEIC in place.`); continue; }
    try { await promisify(execFile)('sips', ['-s', 'format', 'png', from, '--out', to]); }
    catch (error) { throw new Error(`Could not convert ${where} to PNG with sips (macOS only): ${error.stderr?.trim() || error.message}`); }
    await mkdir(originals, { recursive: true });
    let keep = path.join(originals, name);
    for (let n = 2; await present(keep); n++) keep = path.join(originals, `${path.parse(name).name}-${n}${path.extname(name)}`);
    await rename(from, keep);
    converted++;
  }
  if (converted) console.log(`Converted ${converted} HEIC shot${converted === 1 ? '' : 's'} to PNG; originals moved to ${originals}\n`);
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }
  const force = args.includes('--force'), dryRun = args.includes('--dry-run');
  if (args.some(arg => !['--force', '--dry-run'].includes(arg)) || (force && dryRun)) throw new Error(usage);
  if (!await present(path.join(projectRoot, 'instance.json'))) throw new Error('Run this in a generated client instance (npm run create-instance).');
  const inbox = await capturesDir();
  const registry = await journeyFolders();
  let entries;
  try { entries = await readdir(inbox, { withFileTypes: true }); }
  catch {
    throw new Error(`Could not find the captures inbox at ${inbox}. Create it${registry.length ? ` with one folder per journey:\n${registry.map(item => `  ${item.folder}`).join('\n')}` : ', with one subfolder per journey (for example 01-signing-up).'}`);
  }

  const folders = orderFolders(entries.filter(item => item.isDirectory() && !item.name.startsWith('.') && !reservedFolders.includes(item.name)).map(item => item.name), registry);
  if (dryRun) console.log('Dry run: HEIC shots are not converted, so any still in the inbox are not counted.\n');
  else await convertHeic(inbox, folders);
  const counts = await Promise.all(folders.map(async name => [name, (await images(path.join(inbox, name))).length]));
  const loose = await images(inbox);
  const total = counts.reduce((sum, [, n]) => sum + n, 0) + loose.length;
  const missing = registry.filter(item => !folders.some(name => folderSlug(name) === item.id));
  const width = Math.max(26, ...folders.map(name => name.length + 2), ...missing.map(item => item.folder.length + 2));
  if (!total) {
    console.log(`No screenshots in the captures inbox yet: ${inbox}`);
    if (missing.length) console.log(`Journey folders to create:\n${missing.map(item => `  ${item.folder}`).join('\n')}`);
    process.exit(0);
  }

  console.log(`Captures inbox: ${inbox}`);
  for (const [name, n] of counts) console.log(`  ${name.padEnd(width)} ${n ? n : '-  (not captured yet)'}`);
  for (const item of missing) console.log(`  ${item.folder.padEnd(width)} -  (no folder yet)`);
  if (loose.length) console.log(`  ${'not in a journey folder'.padEnd(width)} ${loose.length}  (${loose.join(', ')})`);
  console.log('');

  const ignore = [...reservedFolders, inboxReadme];
  const modulePath = path.join(projectRoot, 'apps/existing.js');
  const scaffold = !await present(modulePath) || (await readFile(modulePath, 'utf8')).includes(scaffoldMarker);
  if (force) {
    let backup = '';
    if (await present(modulePath) && !scaffold) {
      backup = path.join(os.tmpdir(), `existing-before-force-${new Date().toISOString().replace(/[:.]/g, '-')}.js`);
      await copyFile(modulePath, backup);
    }
    console.log(`WARNING: --force regenerates apps/existing.js from the whole inbox. Every hand edit (titles, approach and
rationale, hotspots, journey steps, set-aside screens) is replaced by blank drafts.${backup ? `\nThe current file was copied to ${backup}; git also has the last committed version.` : ''}
To add only new shots and keep the edits, run npm run import-captures without --force.\n`);
    await draftExisting([inbox, '--force'], { ignore });
  } else if (scaffold) {
    if (dryRun) console.log('Dry run: apps/existing.js is still the untouched scaffold, so a full draft would be made from the inbox.');
    else await draftExisting([inbox], { ignore });
  } else {
    await addNewCaptures(inbox, { folders, dryRun });
  }
} catch (error) {
  console.error(`Could not import captures: ${error.message}`);
  process.exitCode = 1;
}
