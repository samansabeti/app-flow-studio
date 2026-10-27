import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fail } from './instance-files.mjs';
import { exportShare } from './export-share.mjs';
import { projectPaths } from './project-paths.mjs';

// One command from checked source to a Vercel deployment of the exported bundle.
// Publishing is outward-facing: it prints the audience and asks for confirmation.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = `Usage: npm run share -- [--project <vercel-project>] [--scope <vercel-team>] [--password] [--dry-run] [--yes]

  --project   Vercel project to deploy to. Saved in instance.json after the first share.
  --scope     Vercel team or account slug. Saved with the project.
  --password  Require a password. Set it once with: vercel env add SHARE_PASSWORD production
  --dry-run   Check, export, and stage the bundle without deploying.
  --yes       Skip the confirmation prompt.`;

// Vercel Routing Middleware runs before static files and asks for HTTP Basic credentials.
// Any username is accepted; only the password is compared. Missing configuration fails closed.
const middleware = `export const config = { matcher: '/:path*' };
export default function middleware(request) {
  const password = process.env.SHARE_PASSWORD;
  const [scheme, encoded] = (request.headers.get('authorization') || '').split(' ');
  if (password && scheme === 'Basic' && encoded) {
    try {
      const supplied = atob(encoded).split(':').slice(1).join(':');
      if (supplied === password) return;
    } catch {}
  }
  return new Response(password ? 'A password is required to view this review.' : 'This review is not configured yet.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Review", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}
`;

function options(args) {
  const result = { password: false, dryRun: false, yes: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return null;
    if (arg === '--password') result.password = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--yes') result.yes = true;
    else if (['--project', '--scope'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) result[arg.slice(2)] = args[++i];
    else fail(`Unknown or incomplete argument: ${arg}\n${usage}`);
  }
  for (const key of ['project', 'scope']) {
    if (result[key] !== undefined && !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(result[key])) fail(`--${key} must be a Vercel slug.`);
  }
  return result;
}
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') fail(`${command} is not installed. Install the Vercel CLI and sign in with: vercel login`);
  if (result.status !== 0) fail(`${command} ${args[0]} failed.`);
  return result.stdout || '';
}

export async function share(args = []) {
  const opts = options(args);
  if (!opts) { console.log(usage); return; }
  const { projectRoot: root } = await projectPaths(source);
  const metadataPath = path.join(root, 'instance.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const hosting = { provider: 'vercel', ...metadata.hosting };
  if (opts.project) hosting.project = opts.project;
  if (opts.scope) hosting.scope = opts.scope;
  if (!hosting.project) fail(`Name the Vercel project for this client the first time.\n${usage}`);
  const scope = hosting.scope ? ['--scope', hosting.scope] : [];

  run(process.execPath, [path.join(root, 'scripts/check.mjs')], root);
  const output = await exportShare([]);
  const stage = await mkdtemp(path.join(os.tmpdir(), 'app-flow-share-'));
  let keepStage = false;
  try {
    await cp(output, stage, { recursive: true });
    if (opts.password) await writeFile(path.join(stage, 'middleware.js'), middleware);
    const access = opts.password ? 'Password required (SHARE_PASSWORD on the Vercel project)' : 'PUBLIC: anyone with the link can view it';
    console.log(`\nReady to share ${metadata.instance?.name || 'this review'}
  Vercel project: ${hosting.scope ? `${hosting.scope}/` : ''}${hosting.project} (production)
  Access:         ${access}
  Bundle:         ${output}`);
    if (opts.dryRun) { keepStage = true; console.log(`  Staged at:      ${stage}\nDry run: nothing was deployed.`); return null; }
    if (!opts.yes) {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await prompt.question(`Type the project name (${hosting.project}) to publish: `);
      prompt.close();
      if (answer.trim() !== hosting.project) fail('Not confirmed. Nothing was deployed.');
    }
    run('vercel', ['link', '--yes', '--project', hosting.project, ...scope], stage);
    if (opts.password && !/\bSHARE_PASSWORD\b/.test(run('vercel', ['env', 'ls', 'production', ...scope], stage, true))) {
      fail(`SHARE_PASSWORD is not set on ${hosting.project}. Set it, then share again:\n  vercel env add SHARE_PASSWORD production${hosting.scope ? ` --scope ${hosting.scope}` : ''}`);
    }
    const url = run('vercel', ['deploy', '--prod', '--yes', ...scope], stage, true).trim().split('\n').at(-1);
    metadata.hosting = { ...hosting, lastShared: { at: new Date().toISOString(), url, password: opts.password } };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`\nPublished: ${url}\n${opts.password ? 'Open it in a private window and confirm it asks for the password before sending it.' : 'This link is public.'}`);
    return url;
  } finally {
    if (!keepStage) await rm(stage, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await share(process.argv.slice(2)); }
  catch (error) { console.error(`Could not share: ${error.message}`); process.exitCode = 1; }
}
