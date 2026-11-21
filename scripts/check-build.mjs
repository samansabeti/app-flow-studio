import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { browserFiles, buildStudio } from './build.mjs';
import { projectPaths } from './project-paths.mjs';
import { treeHashes } from './instance-files.mjs';

const source = await browserFiles();
const { browserRoot } = await projectPaths();
const expected = ['app.css', 'apps/blank.js', 'apps/daylight-findings.js', 'apps/daylight.js', 'config.js', 'index.html', 'studio.css', 'studio.js', 'ui.js'];

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'app-flow-build-check-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'app/apps'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', appFlow: { browserRoot: 'app' } }));
  for (const file of source.files.keys()) await copyFile(path.join(browserRoot, file), path.join(root, 'app', file));
  return root;
}

test('build exports only the approved browser inventory and sanitized config', async t => {
  const root = await fixture(t);
  for (const file of ['AGENTS.md', 'private-notes.txt', '.env', 'app/notes.md', 'app/apps/source-notes.md']) {
    await writeFile(path.join(root, file), 'PRIVATE_BUILD_SENTINEL');
  }
  const result = await buildStudio(root);
  assert.deepEqual(result.files, expected);
  assert.deepEqual(Object.keys(await treeHashes(result.output)).sort(), expected);
  const config = await readFile(path.join(result.output, 'config.js'), 'utf8');
  assert.doesNotMatch(config, /previewFiles|PRIVATE_BUILD_SENTINEL/);
  for (const file of expected) assert.deepEqual(await readFile(path.join(result.output, file)), source.files.get(file));
});

test('rebuild is reproducible and picks up source edits', async t => {
  const root = await fixture(t);
  const { output } = await buildStudio(root);
  const first = await treeHashes(output);
  await buildStudio(root);
  assert.deepEqual(await treeHashes(output), first);
  await writeFile(path.join(root, 'app/studio.css'), '/* revised source */');
  await buildStudio(root);
  assert.equal(await readFile(path.join(output, 'studio.css'), 'utf8'), '/* revised source */');
});

test('unowned or manually modified output is preserved', async t => {
  const root = await fixture(t);
  const output = path.join(root, 'dist');
  await mkdir(output);
  await writeFile(path.join(output, 'keep.txt'), 'keep this');
  await assert.rejects(buildStudio(root), /unowned dist/);
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'keep this');
  await rm(output, { recursive: true });
  await buildStudio(root);
  await writeFile(path.join(output, 'keep.txt'), 'manual edit');
  await assert.rejects(buildStudio(root), /modified dist/);
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'manual edit');
});

test('missing dependencies fail before replacing good output', async t => {
  const root = await fixture(t);
  const { output } = await buildStudio(root);
  const first = await treeHashes(output);
  await writeFile(path.join(root, 'app/ui.js'), "import './missing.js';");
  await assert.rejects(buildStudio(root), /Missing browser dependency/);
  assert.deepEqual(await treeHashes(output), first);
});

test('symlinked browser input and output are rejected', async t => {
  const root = await fixture(t);
  const input = path.join(root, 'app/ui.js');
  await rm(input);
  await symlink(path.join(browserRoot, 'ui.js'), input);
  await assert.rejects(buildStudio(root), /Symlinks/);
  await rm(input);
  await copyFile(path.join(browserRoot, 'ui.js'), input);
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'keep.txt'), 'untouched');
  await symlink(outside, path.join(root, 'dist'));
  await assert.rejects(buildStudio(root), /Symlinks/);
  assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'untouched');
});

test('notes cannot be added to the browser inventory', async t => {
  const root = await fixture(t);
  const configPath = path.join(root, 'app/config.js');
  const config = await readFile(configPath, 'utf8');
  await writeFile(configPath, config.replace('"apps/blank.js"]', '"apps/blank.js", "apps/notes.md"]'));
  await writeFile(path.join(root, 'app/apps/notes.md'), 'private notes');
  await assert.rejects(buildStudio(root), /only browser content/);
});

test('project paths default to flat clients and reject escaping roots', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  assert.deepEqual(await projectPaths(root), { projectRoot: root, browserRoot: root });
  await writeFile(path.join(root, 'package.json'), '{"appFlow":{"browserRoot":"../outside"}}');
  await assert.rejects(projectPaths(root), /must be/);
});

test('a saved findings review ships accepted findings only and never the review file', async t => {
  const root = await fixture(t);
  const draft = (await import(pathToFileURL(path.join(root, 'app/apps/daylight-findings.js')).href)).default;
  const [accepted, edited, rejected] = draft.items;
  await writeFile(path.join(root, 'app/apps/daylight-findings-review.json'), JSON.stringify({
    [accepted.id]: { decision: 'accepted', reviewedOn: '2026-01-05' },
    [edited.id]: { decision: 'accepted', edits: { title: 'REVIEW_EDITED_TITLE' }, reviewedOn: '2026-01-05' },
    [rejected.id]: { decision: 'rejected', reason: 'REVIEW_REJECT_REASON' },
  }));
  const result = await buildStudio(root);
  assert.deepEqual(result.files, expected);
  const text = await readFile(path.join(result.output, 'apps/daylight-findings.js'), 'utf8');
  const shared = (await import(pathToFileURL(path.join(result.output, 'apps/daylight-findings.js')).href)).default;
  assert.deepEqual(shared.items.map(item => item.id), [accepted.id, edited.id]);
  assert.equal(shared.items[1].title, 'REVIEW_EDITED_TITLE');
  assert.equal(shared.reviewed, true);
  assert.deepEqual(shared.opportunities.map(record => record.id), [...new Set([accepted.opportunity, edited.opportunity])]);
  for (const hidden of [rejected.title, draft.items.at(-1).title, edited.title, 'REVIEW_REJECT_REASON']) assert.ok(!text.includes(hidden), `shared findings leak: ${hidden}`);
  assert.equal(result.reviewNotes.length, 1);
});

test('findings without a review are copied unchanged, and a malformed review stops the build', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'app/apps/daylight-findings-review.json'), '{}');
  const { output } = await buildStudio(root);
  assert.deepEqual(await readFile(path.join(output, 'apps/daylight-findings.js')), source.files.get('apps/daylight-findings.js'));
  await writeFile(path.join(root, 'app/apps/daylight-findings-review.json'), JSON.stringify({ any: { decision: 'maybe' } }));
  await assert.rejects(buildStudio(root), /decision/);
});
