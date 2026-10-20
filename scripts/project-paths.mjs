import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existingPath, safeRead, fail } from './instance-files.mjs';

// The master declares app/ explicitly. Generated and older clients keep their
// browser files at the project root, so moving the master does not move clients.
export async function projectPaths(directory = fileURLToPath(new URL('../', import.meta.url))) {
  const projectRoot = await existingPath(directory, 'directory');
  const settings = JSON.parse((await safeRead(projectRoot, 'package.json')).toString('utf8'));
  const relative = settings.appFlow?.browserRoot ?? '.';
  if (!['.', 'app'].includes(relative)) fail('package.json appFlow.browserRoot must be "app" or ".".');
  const browserRoot = await existingPath(path.join(projectRoot, relative), 'directory');
  return { projectRoot, browserRoot };
}
