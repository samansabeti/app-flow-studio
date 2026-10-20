import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_CORE } from './instance-files.mjs';
import { qrSvg } from './qr-code.mjs';

// Only this isolated fictional fixture is exposed during the checks. No client
// screenshots or user data are copied, and existing preview processes stay intact.
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'app-flow-phone-check-')));
const fixture = path.join(temporary, 'client');
const children = new Set();
let blocker;
let checks = 0;

function check(label, run) {
  try { run(); checks += 1; }
  catch (error) { throw new Error(`${label}: ${error.message}`, { cause: error }); }
}
async function write(relative, content) {
  await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true });
  await writeFile(path.join(fixture, relative), content);
}
async function copy(relative) {
  await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true });
  await copyFile(path.join(source, relative), path.join(fixture, relative));
}
function start(args) {
  const child = spawn(process.execPath, ['server.mjs', ...args], {
    cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'], env: process.env
  });
  children.add(child);
  child.output = '';
  child.stdout.on('data', bytes => { child.output += bytes; });
  child.stderr.on('data', bytes => { child.output += bytes; });
  return child;
}
async function listening(args) {
  const child = start(args);
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`Startup timed out: ${child.output}`)), 10000);
    const onData = () => {
      const match = child.output.match(/http:\/\/[0-9.]+:\d+(?:\/\?app=[^\s]+)?/);
      if (match) done(null, new URL(match[0]));
    };
    const onExit = code => done(new Error(`Server exited ${code}: ${child.output}`));
    const onError = error => done(error);
    function done(error, result) {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) reject(error); else resolve(result);
    }
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
    onData();
  });
  return { child, url };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await closed;
  clearTimeout(timer);
}
function request(base, requestPath, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    // Raw paths preserve traversal probes that URL constructors would normalize.
    const req = http.request({
      hostname: base.hostname, port: base.port, path: requestPath, method,
      headers, agent: false, timeout: 4000
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
    req.end();
  });
}
async function rejected(args, expected) {
  const child = start(args);
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  const [code, signal] = await once(child, 'exit');
  clearTimeout(timer);
  check(`Reject ${args.join(' ')}`, () => {
    assert.equal(signal, null);
    assert.notEqual(code, 0);
    assert.match(child.output, expected);
  });
}

const app = {
  id: 'sample', name: 'Sample', module: './apps/existing.js',
  variants: [
    { id: 'existing', name: 'Existing', module: './apps/existing.js', stylesheet: './apps/sample.css' },
    { id: 'future', name: 'Future', module: './apps/future.js', stylesheet: './apps/sample.css' }
  ],
  defaultVariant: 'future'
};
const content = ['apps/existing.js', 'apps/future.js', 'apps/sample.css', 'apps/font.ttf',
  'apps/icon.svg', 'apps/qa-outside.svg', 'apps/qa-private.svg', 'apps/qa-alias.svg',
  'apps/linked/icon.svg'];
const metadata = { app, files: [...content, 'apps/source-notes.md', 'apps/source-only.svg'], exportFiles: content };
const config = { studioName: 'Sample Studio', defaultApp: 'sample', apps: [app], studio: { headerTitle: 'Sample <Review>', icon: './apps/icon.svg' }, localNotes: 'DO_NOT_EXPOSE_CONFIG_NOTES' };
const writeConfig = value => write('config.js', `export default ${JSON.stringify(value)};\n`);
const writeManifest = value => write('instance.json', JSON.stringify(value));
const sentinel = 'PHONE_PREVIEW_PRIVATE_SENTINEL';

try {
  await mkdir(fixture);
  for (const file of [...STATIC_CORE, 'server.mjs', 'scripts/instance-files.mjs',
    'scripts/qr-code.mjs', 'scripts/vendor/qrcodegen.mjs']) await copy(file);
  await write('package.json', '{"type":"module"}');
  await writeConfig(config);
  await writeManifest(metadata);
  await write('apps/existing.js', 'export default {};');
  await write('apps/future.js', 'export default {};');
  await write('apps/sample.css', 'body{color:#17212a}');
  await write('apps/font.ttf', 'Fictional fixture bytes, not a font.');
  await write('apps/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await write('apps/source-only.svg', sentinel);
  await write('apps/source-notes.md', sentinel);
  await write('README.md', sentinel);
  await write('.env', sentinel);
  await write('credentials.json', sentinel);
  await writeFile(path.join(temporary, 'outside.svg'), sentinel);
  await symlink(path.join(temporary, 'outside.svg'), path.join(fixture, 'apps/qa-outside.svg'));
  await symlink(path.join(fixture, 'README.md'), path.join(fixture, 'apps/qa-private.svg'));
  await symlink(path.join(fixture, 'apps/icon.svg'), path.join(fixture, 'apps/qa-alias.svg'));
  await symlink(path.join(fixture, 'apps'), path.join(fixture, 'apps/linked'));

  const normal = await listening(['--port', '0']);
  check('Normal preview remains loopback-only', () => assert.equal(normal.url.hostname, '127.0.0.1'));
  check('Normal preview assigns a port', () => assert.ok(Number(normal.url.port) > 0));
  assert.equal((await request(normal.url, '/')).status, 200);
  assert.equal((await request(normal.url, '/phone')).status, 404);
  assert.equal((await request(normal.url, '/', 'GET', { Host: `localhost:${normal.url.port}` })).status, 200);
  assert.equal((await request(normal.url, '/', 'GET', { Host: 'example.invalid' })).status, 403);
  checks += 4;
  await stop(normal.child);

  await rejected(['--host', '127.0.0.1', '--port', '0'], /only available with --phone/);
  for (const host of ['0.0.0.0', '127.0.0.1', '8.8.8.8', 'not-an-address', '192.168.999.1']) {
    await rejected(['--phone', '--host', host, '--port', '0'], /private IPv4 address currently assigned/);
  }
  for (const port of ['-1', '65536', 'abc']) await rejected(['--port', port], /whole number/);

  const phone = await listening(['--phone', '--port', '0']);
  check('Phone URL uses private IPv4 and selects the configured app/version', () => {
    assert.match(phone.url.hostname, /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/);
    assert.equal(phone.url.searchParams.get('app'), app.id);
    assert.equal(phone.url.searchParams.get('state'), app.defaultVariant);
  });
  for (const file of [...STATIC_CORE, 'config.js', ...content.filter(file => !/qa-|linked/.test(file))]) {
    const response = await request(phone.url, `/${file}`);
    check(`Phone runtime ${file}`, () => assert.equal(response.status, 200));
  }
  const main = await request(phone.url, '/');
  check('Phone cache/security headers', () => {
    assert.equal(main.status, 200);
    assert.equal(main.headers['cache-control'], 'no-store');
    assert.equal(main.headers['x-content-type-options'], 'nosniff');
  });
  const publicConfig = await request(phone.url, '/config.js');
  check('Phone config contains only validated browser settings', () => {
    assert.match(publicConfig.body, /"defaultApp": "sample"/);
    assert.match(publicConfig.body, /"headerTitle": "Sample <Review>"/);
    assert.doesNotMatch(publicConfig.body, /localNotes|DO_NOT_EXPOSE_CONFIG_NOTES|previewFiles/);
  });
  const font = await request(phone.url, '/apps/font.ttf', 'HEAD');
  check('Phone font and HEAD behavior', () => {
    assert.equal(font.status, 200);
    assert.equal(font.headers['content-type'], 'font/ttf');
    assert.ok(Number(font.headers['content-length']) > 0);
    assert.equal(font.body, '');
  });
  const page = await request(phone.url, '/phone');
  check('Phone page uses actual app URL and escapes its title', () => {
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(`href="${phone.url.href.replaceAll('&', '&amp;')}"`));
    assert.match(page.body, /Sample &lt;Review&gt;/);
    assert.match(page.body, /src="\/phone\/qr\.svg"/);
    assert.match(page.body, /same Wi-Fi/);
    assert.equal(page.headers['referrer-policy'], 'no-referrer');
  });
  const qr = await request(phone.url, '/phone/qr.svg');
  check('QR encodes the actual listening URL locally', () => {
    assert.equal(qr.status, 200);
    assert.equal(qr.headers['content-type'], 'image/svg+xml');
    assert.equal(qr.body, qrSvg(phone.url.href));
    assert.match(qr.body, /viewBox="0 0 \d+ \d+"/);
    assert.doesNotMatch(qr.body, /https?:\/\/[^"]+(?:src|href)/);
  });
  for (const url of ['/phone/', '/phone/qr.svg']) {
    const response = await request(phone.url, url, 'HEAD');
    check(`HEAD ${url}`, () => {
      assert.equal(response.status, 200);
      assert.ok(Number(response.headers['content-length']) > 0);
      assert.equal(response.body, '');
    });
  }
  for (const file of [
    '/README.md', '/KICKOFF.md', '/instance.json', '/server.mjs', '/package.json',
    '/scripts/check.mjs', '/scripts/qr-code.mjs', '/scripts/vendor/qrcodegen.mjs',
    '/apps/source-notes.md', '/apps/source-only.svg', '/.env', '/credentials.json',
    '/.git/config', '/.codex/environments/environment.toml', '/%2eenv', '/%2egit/config',
    '/%2e%2e/index.html', '/%252e%252e/index.html', '/apps/../index.html', '/apps/%2e%2e/index.html',
    '/apps/qa-outside.svg', '/apps/qa-private.svg', '/apps/qa-alias.svg', '/apps/linked/icon.svg',
    '/apps/', '/scripts/', '/phone/unknown'
  ]) {
    const response = await request(phone.url, file);
    check(`Phone excludes ${file}`, () => {
      assert.equal(response.status, 404);
      assert.ok(!response.body.includes(sentinel));
    });
  }
  for (const malformed of ['/%E0%A4%A', '/%00', '/apps%5csecret', '//index.html', 'http://example.invalid/']) {
    const response = await request(phone.url, malformed);
    check(`Reject malformed request ${malformed}`, () => assert.equal(response.status, 400));
  }
  for (const host of ['example.invalid', `localhost:${phone.url.port}`, `${phone.url.hostname}:1`]) {
    const response = await request(phone.url, '/', 'GET', { Host: host });
    check(`Reject foreign Host ${host}`, () => assert.equal(response.status, 403));
  }
  for (const url of ['/', '/phone', '/phone/qr.svg']) {
    const response = await request(phone.url, url, 'POST');
    check(`Read-only ${url}`, () => {
      assert.equal(response.status, 405);
      assert.equal(response.headers.allow, 'GET, HEAD');
    });
  }
  blocker = http.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, phone.url.hostname, resolve);
  });
  const occupied = blocker.address().port;
  const fallback = await listening(['--phone', '--host', phone.url.hostname, '--port', String(occupied)]);
  check('Busy port falls forward on the same selected interface', () => {
    assert.ok(Number(fallback.url.port) > occupied);
    assert.equal(fallback.url.hostname, phone.url.hostname);
    assert.match(fallback.child.output, new RegExp(`Port ${occupied} is busy`));
  });
  const fallbackQr = await request(fallback.url, '/phone/qr.svg');
  check('Fallback QR uses the assigned port', () => assert.equal(fallbackQr.body, qrSvg(fallback.url.href)));
  await stop(fallback.child);
  await stop(phone.child);

  // Legacy instances still use their full (filtered) inventory.
  await writeManifest({ app, files: metadata.files });
  const legacy = await listening(['--phone', '--port', '0']);
  assert.equal((await request(legacy.url, '/apps/source-only.svg')).status, 200);
  assert.equal((await request(legacy.url, '/apps/source-notes.md')).status, 404);
  checks += 2;
  await stop(legacy.child);

  // The reusable product can opt in with an explicit browser content allowlist.
  await rm(path.join(fixture, 'instance.json'));
  await writeConfig({ ...config, previewFiles: content });
  const master = await listening(['--phone', '--port', '0']);
  assert.equal((await request(master.url, '/apps/future.js')).status, 200);
  assert.equal((await request(master.url, '/apps/source-only.svg')).status, 404);
  assert.doesNotMatch((await request(master.url, '/config.js')).body, /previewFiles|localNotes/);
  checks += 3;
  await stop(master.child);
  await writeConfig(config);
  await rejected(['--phone', '--port', '0'], /explicit config.previewFiles/);
  await writeConfig({ ...config, previewFiles: [...content, 'apps/source-notes.md'] });
  await rejected(['--phone', '--port', '0'], /unique browser content/);
  await writeConfig({ ...config, previewFiles: content.filter(file => file !== 'apps/future.js') });
  await rejected(['--phone', '--port', '0'], /allowlisted file/);
} catch (error) {
  console.error(`Phone preview check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all([...children].map(stop));
  if (blocker?.listening) await new Promise(resolve => blocker.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
if (!process.exitCode) console.log(`Phone preview: ${checks} integration checks passed. Temporary servers and files cleaned up.`);
