import http from 'node:http';
import registry from './config.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
let requestedPort = process.env.PORT ?? '8002';
let phoneMode = false;
let requestedHost;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port') requestedPort = args[++i];
  else if (args[i].startsWith('--port=')) requestedPort = args[i].slice(7);
  else if (args[i] === '--phone') phoneMode = true;
  else if (args[i] === '--host') requestedHost = args[++i] ?? '';
  else if (args[i].startsWith('--host=')) requestedHost = args[i].slice(7);
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: npm run dev -- [--port 8002]\n       npm run dev:phone -- [--port 8003] [--host 192.168.1.10]\nUse --port 0 for an automatically assigned port. Busy ports fall forward.\nPhone preview uses one private network address and serves only allowlisted preview assets.');
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${args[i]}`);
    process.exit(1);
  }
}
if (requestedHost !== undefined && !phoneMode) {
  console.error('--host is only available with --phone. The normal preview stays on 127.0.0.1.');
  process.exit(1);
}
if (!/^\d+$/.test(String(requestedPort)) || Number(requestedPort) > 65535) {
  console.error('Port must be a whole number from 0 to 65535.');
  process.exit(1);
}

const isPrivateAddress = address => {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
function phoneAddress() {
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    (entries || []).filter(entry => !entry.internal && (entry.family === 'IPv4' || entry.family === 4) && isPrivateAddress(entry.address))
      .map(entry => ({ name, address: entry.address }))
  );
  if (requestedHost !== undefined) {
    const selected = addresses.find(entry => entry.address === requestedHost);
    if (!selected) throw new Error('--host must be a private IPv4 address currently assigned to this computer.');
    return selected;
  }
  const virtual = /^(?:lo\d*|utun|tun|tap|ipsec|ppp|awdl|llw|bridge|docker|veth|virbr|vmnet|vbox|tailscale|wg|zt)/i;
  const rank = name => name === 'en0' ? 0 : /^(?:en\d+|eth\d+|wlan\d+|wl[px]|en[opsx])/.test(name) ? 1 : 2;
  const selected = addresses.filter(entry => !virtual.test(entry.name))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))[0];
  if (!selected) throw new Error('No private Wi-Fi or Ethernet address was found. Connect this computer and your phone to the same network, then try again.');
  return selected;
}

let host = '127.0.0.1';
let phoneInterface;
let phoneFiles;
let phoneRead;
let phoneConfig;
let qrSvg;
if (phoneMode) {
  try {
    const selected = phoneAddress();
    host = selected.address;
    phoneInterface = selected.name;
    const { STATIC_CORE, validateManifest, validateStudioConfig, configText, label, contentFile, isShareContent, safeRead, exists } = await import('./scripts/instance-files.mjs');
    let content;
    if (await exists(path.join(root, 'instance.json'))) {
      const metadata = JSON.parse((await safeRead(root, 'instance.json')).toString('utf8'));
      const manifest = validateManifest(metadata);
      content = (manifest.exportFiles ?? manifest.files).filter(isShareContent);
    } else {
      if (!Array.isArray(registry.previewFiles) || !registry.previewFiles.length) {
        throw new Error('Phone preview requires instance.json or an explicit config.previewFiles content allowlist.');
      }
      content = registry.previewFiles.map(contentFile);
      if (new Set(content.map(file => file.toLowerCase())).size !== content.length || content.some(file => !isShareContent(file))) {
        throw new Error('config.previewFiles must contain unique browser content paths.');
      }
    }
    // Preserve only validated browser settings. Local inventories and unrelated
    // config metadata must not be exposed just because config.js is allowlisted.
    if (!Array.isArray(registry.apps) || !registry.apps.length) throw new Error('Phone preview needs at least one registered app.');
    const apps = registry.apps.map(app => validateManifest({ app, files: content }).app);
    if (new Set(apps.map(app => app.id)).size !== apps.length) throw new Error('Registered app IDs must be unique.');
    const studio = validateStudioConfig(registry.studio);
    if (studio?.icon && !content.includes(studio.icon.replace(/^\.\//, ''))) {
      throw new Error('The Studio icon must be included in the phone preview content allowlist.');
    }
    phoneConfig = Buffer.from(configText({
      studioName: label(registry.studioName || 'App Flow Studio'),
      defaultApp: apps.find(app => app.id === registry.defaultApp)?.id || apps[0].id,
      apps,
      ...(studio ? { studio } : {})
    }));
    phoneFiles = new Set([...STATIC_CORE, 'config.js', ...content]);
    phoneRead = safeRead;
    ({ qrSvg } = await import('./scripts/qr-code.mjs'));
  } catch (error) {
    console.error(`Could not start phone preview: ${error.message}`);
    process.exit(1);
  }
}

const previewUrl = () => {
  const url = new URL(`http://${host}:${server.address().port}/`);
  const app = registry.apps?.find(entry => entry.id === registry.defaultApp) || registry.apps?.[0];
  if (app) {
    url.searchParams.set('app', app.id);
    if (app.defaultVariant) url.searchParams.set('state', app.defaultVariant);
  }
  return url.href;
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function phonePage() {
  const url = escapeHtml(previewUrl());
  const title = escapeHtml(registry.studio?.headerTitle || registry.studioName || 'App Flow Studio');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phone preview · ${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fafafa;color:#17212a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:520px;margin:8vh auto;padding:32px 24px}header{margin-bottom:30px}header p{color:#66717a;font-size:14px;margin:0 0 12px}h1{font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 14px}p{margin:0 0 16px}.qr{display:block;background:white;border:1px solid #e3e7e9;border-radius:20px;padding:16px;width:280px;max-width:100%;height:auto;margin:0 auto 28px}.open{display:block;background:#26333d;border-radius:12px;text-align:center;color:white;font-weight:600;padding:14px 20px;text-decoration:none}.address{display:block;margin:16px 0 28px;color:#36566b;font-size:14px;overflow-wrap:anywhere;text-align:center}ol{padding-left:22px;margin:0;color:#4c5962}li{padding-left:5px;margin-bottom:10px}.note{font-size:13px;color:#66717a;margin:24px 0 0}a:focus-visible{outline:3px solid #1585c7;outline-offset:4px}@media(max-width:420px){main{margin:24px auto;padding:24px}h1{font-size:30px}}
</style></head><body><main><header><p>${title}</p><h1>Preview on your phone.</h1><p>Scan this code with your phone’s camera to open the live preview.</p></header><img class="qr" src="/phone/qr.svg" width="280" height="280" alt="QR code linking to the local app preview"><a class="open" href="${url}">Open preview</a><a class="address" href="${url}">${url}</a><ol><li>Connect your phone and this computer to the same Wi-Fi.</li><li>Keep this computer awake and Phone preview running.</li><li>Refresh on your phone to see the latest changes.</li></ol><p class="note">Served directly from this computer. Nothing is uploaded. Other devices on this network can open the preview while it runs. Stop Phone preview to close this link.</p></main></body></html>`;
}
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};
const withinRoot = candidate => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  // Reject foreign Host headers, including DNS rebinding to the local server.
  const allowedHosts = phoneMode ? [host] : ['127.0.0.1', 'localhost'];
  const authorities = allowedHosts.map(name => `${name}:${server.address().port}`);
  if (server.address().port === 80) authorities.push(...allowedHosts);
  if (!authorities.includes(req.headers.host?.toLowerCase())) return reply(403, 'Unrecognized preview host.');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return reply(405, 'Method not allowed.');
  }
  try {
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reply(400, 'Invalid request.');
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname.includes('\0') || pathname.includes('\\')) return reply(400, 'Invalid path.');
    if (pathname.split('/').some(part => part.startsWith('.'))) return reply(404, 'Not found.');
    if (phoneMode && ['/phone', '/phone/', '/phone/qr.svg'].includes(pathname)) {
      const isQr = pathname === '/phone/qr.svg';
      const content = isQr ? qrSvg(previewUrl()) : phonePage();
      res.writeHead(200, {
        'Content-Type': isQr ? 'image/svg+xml' : 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Referrer-Policy': 'no-referrer'
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    }
    if (phoneMode) {
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!phoneFiles.has(relative)) return reply(404, 'Not found.');
      // safeRead rejects symlinks in every path segment, even aliases to allowed files.
      let content;
      try { content = relative === 'config.js' ? phoneConfig : await phoneRead(root, relative); }
      catch { return reply(404, 'Not found.'); }
      res.writeHead(200, {
        'Content-Type': types[path.extname(relative).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': content.byteLength
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    }
    let target = path.resolve(root, `.${pathname}`);
    if (!withinRoot(target)) return reply(404, 'Not found.');
    target = await realpath(target);
    if (!withinRoot(target)) return reply(404, 'Not found.');
    let info = await stat(target);
    if (info.isDirectory()) {
      target = await realpath(path.join(target, 'index.html'));
      if (!withinRoot(target)) return reply(404, 'Not found.');
      info = await stat(target);
    }
    if (!info.isFile()) return reply(404, 'Not found.');
    const content = req.method === 'HEAD' ? null : await readFile(target);
    res.writeHead(200, {
      'Content-Type': types[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': content ? content.byteLength : info.size
    });
    res.end(content);
  } catch (error) {
    if (error instanceof URIError || error instanceof TypeError) return reply(400, 'Invalid request.');
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) return reply(404, 'Not found.');
    console.error('Unable to serve request:', error.message);
    reply(500, 'Unable to read this file.');
  }
});

let port = Number(requestedPort);
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port > 0 && port < 65535) {
    console.log(`Port ${port} is busy; trying ${port + 1}.`);
    port += 1;
    server.listen(port, host);
  } else {
    console.error(`Could not start local preview: ${error.message}`);
    process.exitCode = 1;
  }
});
server.on('listening', () => {
  if (phoneMode) {
    console.log(`${registry.studioName || 'App Flow Studio'} phone preview (${phoneInterface}): ${previewUrl()}`);
    console.log(`Scan the QR code: http://${host}:${server.address().port}/phone`);
    console.log('Use the same Wi-Fi and keep this computer awake. Network devices can access this preview. Nothing is uploaded. Press Ctrl+C to stop.');
  } else {
    console.log(`${registry.studioName || 'App Flow Studio'}: http://127.0.0.1:${server.address().port}`);
    console.log('Local files only. Press Ctrl+C to stop.');
  }
});
server.listen(port, host);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
