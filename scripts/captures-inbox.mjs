import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, fail } from './instance-files.mjs';
import { byName, folderSlug, journeyRegistry } from './draft-existing.mjs';

// The "captures inbox": one folder outside the project where screenshots and screen recordings are dropped,
// so import-captures and extract-frames need no path. Node scripts only: never imported by the browser and
// never listed in instance.json files, so exports never include it.
//
// Where the inbox is, first match wins:
//   1. the CAPTURES_DIR environment variable (relative paths resolve from where the command is typed)
//   2. "capturesDir" in instance.json (relative paths resolve from the project folder, e.g. "../my-app-captures")
// The inbox must be outside the project, so captures never end up in git or in a shared export.
//
// Layout: one subfolder per journey, named NN-<journey id> in the order of the journeys registry in the app's
// findings module (journeys: [{ id, title }]), for example 01-signing-up, 02-first-task, 03-managing-settings. A folder
// matches a journey by its name without the NN- prefix. With no registry, every subfolder is a journey.
// recordings/ holds screen recordings for extract-frames; heic-originals/ keeps HEIC files once converted.
export const recordingsFolder = 'recordings';
export const heicFolder = 'heic-originals';
export const inboxReadme = 'README.txt';
export const reservedFolders = [recordingsFolder, heicFolder];
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const setupHelp = `Set the captures inbox (a folder outside this project) in one of two ways:
  - add "capturesDir": "../my-app-captures" to instance.json (relative paths resolve from the project folder)
  - or run the command with CAPTURES_DIR=/path/to/captures in front of it`;

async function metadataOf(root) {
  const file = path.join(root, 'instance.json');
  if (!await exists(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}
// Real path of the nearest existing ancestor plus the rest, so a folder that does not exist yet can be compared.
async function resolved(target) {
  let cursor = path.resolve(target);
  const rest = [];
  while (!existsSync(cursor)) { rest.unshift(path.basename(cursor)); cursor = path.dirname(cursor); }
  return path.join(await realpath(cursor), ...rest);
}
export const inside = (child, parent) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

export async function capturesDir(root = projectRoot) {
  let inbox, from;
  const env = process.env.CAPTURES_DIR?.trim();
  if (env) { inbox = path.resolve(process.env.INIT_CWD || process.cwd(), env); from = 'CAPTURES_DIR'; }
  else {
    const setting = (await metadataOf(root))?.capturesDir;
    if (setting !== undefined && (typeof setting !== 'string' || !setting.trim())) fail(`instance.json capturesDir must be a folder path.\n${setupHelp}`);
    if (!setting) fail(`No captures inbox is set.\n${setupHelp}`);
    inbox = path.resolve(root, setting.trim()); from = 'instance.json capturesDir';
  }
  if (inside(await resolved(inbox), await realpath(root))) fail(`The captures inbox (${from}: ${inbox}) is inside the project folder. Keep it outside, so screenshots never end up in git.\n${setupHelp}`);
  return inbox;
}
export const recordingsDir = async (root = projectRoot) => path.join(await capturesDir(root), recordingsFolder);
export const heicOriginalsDir = async (root = projectRoot) => path.join(await capturesDir(root), heicFolder);

// The journeys registry and the inbox folder name suggested for each journey: NN-<id> in registry order.
export async function journeyFolders(root = projectRoot) {
  const registry = await journeyRegistry(root, (await metadataOf(root)) || {});
  return registry.map((journey, index) => ({ ...journey, folder: `${String(index + 1).padStart(2, '0')}-${journey.id}` }));
}
// Present inbox folders ordered like the registry; folders that match no journey come after, by name.
export function orderFolders(folders, registry) {
  const rank = name => { const at = registry.findIndex(item => item.id === folderSlug(name)); return at < 0 ? registry.length : at; };
  return [...folders].sort((a, b) => rank(a) - rank(b) || byName(a, b));
}
