import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Lists the fonts an app actually ships, so the design system can cite them instead of guessing.
//   App bundle: a .app (an iPhone app installed on a Mac lives at /Applications/<App>.app/Wrapper/<App>.app),
//   an .ipa, or a folder. Reads font files, Info.plist UIAppFonts, and Flutter's FontManifest.json.
//   Website:    --url https://example.com lists @font-face families, Google Fonts, and Typekit links.
// Fonts used on screen but absent from the bundle are almost certainly Apple system fonts (SF Pro, New York).
const usage = `Usage: npm run scan-fonts -- <App.app | app.ipa | folder> [--url https://site] [--json]
  Example: npm run scan-fonts -- /Applications/Client.app --url https://app.example.com`;
const FONT = /\.(ttf|otf|ttc)$/i, WEBFONT = /\.(woff2?)$/i;
// Electron apps pack their UI into app.asar: a JSON index followed by file bytes.
function asarFiles(bytes) {
  const headerSize = bytes.readUInt32LE(4), jsonLength = bytes.readUInt32LE(12), base = 8 + headerSize;
  const index = JSON.parse(bytes.toString('utf8', 16, 16 + jsonLength)), files = [];
  const visit = (node, prefix) => {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const file = `${prefix}${name}`;
      if (entry.files) visit(entry, `${file}/`);
      else if (!entry.unpacked && entry.offset !== undefined) files.push({ file, read: () => bytes.subarray(base + Number(entry.offset), base + Number(entry.offset) + entry.size) });
    }
  };
  visit(index, '');
  return files;
}
const faceFamilies = css => [...css.matchAll(/@font-face\s*{([^}]*)}/gi)].map(block => block[1].match(/font-family:\s*([^;]+)/i)?.[1]?.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

function names(bytes, offset = 0) {
  // TrueType/OpenType name table: family (1), style (2), full (4), PostScript (6), typographic family (16).
  const tables = bytes.readUInt16BE(offset + 4), out = {};
  for (let i = 0; i < tables; i++) {
    const record = offset + 12 + i * 16;
    if (bytes.toString('latin1', record, record + 4) !== 'name') continue;
    const table = bytes.readUInt32BE(record + 8), count = bytes.readUInt16BE(table + 2), strings = table + bytes.readUInt16BE(table + 4);
    for (let j = 0; j < count; j++) {
      const at = table + 6 + j * 12, platform = bytes.readUInt16BE(at), id = bytes.readUInt16BE(at + 6);
      const length = bytes.readUInt16BE(at + 8), start = strings + bytes.readUInt16BE(at + 10);
      if (![1, 2, 4, 6, 16].includes(id) || (out[id] && platform !== 3)) continue;
      const raw = bytes.subarray(start, start + length);
      out[id] = platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
    }
  }
  return { family: out[16] || out[1], style: out[2], full: out[4], postscript: out[6] };
}
function fontInfo(bytes) {
  if (bytes.toString('latin1', 0, 4) === 'ttcf') {
    const count = bytes.readUInt32BE(8);
    return Array.from({ length: count }, (_, i) => names(bytes, bytes.readUInt32BE(12 + i * 4)));
  }
  return [names(bytes)];
}
async function walk(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walk(full, found);
    else found.push(full);
  }
  return found;
}
function plist(file) {
  const result = spawnSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
  try { return result.status === 0 ? JSON.parse(result.stdout) : null; } catch { return null; }
}

export async function scanBundle(input) {
  let root = path.resolve(input), temp = null;
  if (/\.ipa$/i.test(root)) {
    temp = await mkdtemp(path.join(os.tmpdir(), 'scan-fonts-'));
    const unzip = spawnSync('unzip', ['-q', root, '-d', temp]);
    if (unzip.status !== 0) throw new Error('Could not unzip the .ipa.');
    root = temp;
  } else if (!(await stat(root)).isDirectory()) throw new Error(`Not a folder, .app, or .ipa: ${input}`);
  try {
    const files = await walk(root);
    const fonts = [];
    for (const file of files.filter(item => FONT.test(item))) {
      try { for (const info of fontInfo(await readFile(file))) fonts.push({ file: path.relative(root, file), ...info }); }
      catch { fonts.push({ file: path.relative(root, file), error: 'Unreadable font file' }); }
    }
    // Electron: fonts and @font-face rules inside app.asar.
    const web = [], faces = new Set();
    for (const archive of files.filter(file => file.endsWith('.asar'))) {
      for (const entry of asarFiles(await readFile(archive))) {
        if (FONT.test(entry.file)) { try { for (const info of fontInfo(entry.read())) fonts.push({ file: `${path.basename(archive)}/${entry.file}`, ...info }); } catch {} }
        else if (WEBFONT.test(entry.file)) web.push(`${path.basename(archive)}/${entry.file}`);
        else if (/\.(css|js|html)$/i.test(entry.file) && entry.read().length < 8e6) faceFamilies(entry.read().toString('utf8')).forEach(name => faces.add(name));
      }
    }
    for (const file of files.filter(item => WEBFONT.test(item))) web.push(path.relative(root, file));
    const declared = files.filter(file => path.basename(file) === 'Info.plist').flatMap(file => plist(file)?.UIAppFonts || []);
    const flutter = [];
    for (const file of files.filter(item => path.basename(item) === 'FontManifest.json')) {
      try { for (const item of JSON.parse(await readFile(file, 'utf8'))) flutter.push(item.family); } catch {}
    }
    // The app's own Info.plist is the shallowest one (frameworks nest deeper).
    const app = files.filter(file => path.basename(file) === 'Info.plist').sort((a, b) => a.split(path.sep).length - b.split(path.sep).length).map(plist).find(info => info?.CFBundleIdentifier);
    return { bundle: app ? `${app.CFBundleDisplayName || app.CFBundleName} (${app.CFBundleIdentifier}) ${app.CFBundleShortVersionString || ''}`.trim() : path.basename(input), fonts, web: [...new Set(web)], faces: [...faces], declared: [...new Set(declared)], flutter: [...new Set(flutter)], electron: files.some(file => file.endsWith('.asar')) };
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}

export async function scanSite(url) {
  // Read-only: fetches the page and its same-site stylesheets, then lists declared families and their source.
  const page = await (await fetch(url)).text();
  const sheets = [...page.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)].map(match => match[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean);
  const inline = [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
  const families = new Map(), add = (name, source) => { name = name.trim().replace(/^['"]|['"]$/g, ''); if (name) (families.get(name) || families.set(name, new Set()).get(name)).add(source); };
  const read = (css, source) => {
    for (const block of css.matchAll(/@font-face\s*{([^}]*)}/gi)) { const family = block[1].match(/font-family:\s*([^;]+)/i)?.[1]; if (family) add(family, source); }
    for (const match of css.matchAll(/fonts\.googleapis\.com\/css2?\?([^"')\s]+)/gi)) for (const family of new URLSearchParams(match[1].replace(/&amp;/g, '&')).getAll('family')) add(family.split(':')[0].replace(/\+/g, ' '), 'Google Fonts');
  };
  inline.forEach(css => read(css, 'inline'));
  read(page, 'page');
  for (const href of sheets.slice(0, 20)) {
    const sheet = new URL(href, url);
    if (/fonts\.googleapis\.com/.test(sheet.host)) { read(sheet.href, 'Google Fonts'); continue; }
    if (/use\.typekit\.net|p\.typekit\.net/.test(sheet.host)) { add(`Adobe Fonts kit ${sheet.pathname}`, 'Typekit'); continue; }
    try { read(await (await fetch(sheet)).text(), sheet.host === new URL(url).host ? 'self-hosted' : sheet.host); } catch {}
  }
  return { url, families: [...families].map(([family, sources]) => ({ family, sources: [...sources] })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), json = args.includes('--json');
  const urlIndex = args.indexOf('--url'), url = urlIndex >= 0 ? args[urlIndex + 1] : null;
  const target = args.find((arg, index) => !arg.startsWith('--') && (urlIndex < 0 || index !== urlIndex + 1));
  if (!target && !url) { console.log(usage); process.exit(0); }
  try {
    const result = { bundle: target ? await scanBundle(target) : null, site: url ? await scanSite(url) : null };
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      if (result.bundle) {
        const b = result.bundle;
        console.log(`App: ${b.bundle}\nBundled font files (${b.fonts.length}):`);
        for (const font of b.fonts) console.log(`  ${font.family || '?'} ${font.style || ''} · PostScript ${font.postscript || '?'} · ${font.file}${font.error ? ` (${font.error})` : ''}`);
        if (!b.fonts.length && !b.web.length) console.log('  none: on-screen text uses Apple system fonts (SF Pro / New York) or fonts loaded at runtime.');
        if (b.web.length) {
          // Group web font files by family: @fontsource/<family>/... or the file name before its weight.
          const groups = new Map();
          for (const file of b.web) {
            const family = file.match(/@fontsource(?:-variable)?\/([^/]+)/)?.[1] || path.basename(file).replace(/\.(woff2?)$/i, '').replace(/[-_](latin|cyrillic|greek|vietnamese|ext|\d{3}|normal|italic|regular|bold|medium|light|semibold|variable).*$/i, '');
            const weight = file.match(/-(\d{3})-(normal|italic)/);
            const group = groups.get(family) || groups.set(family, { files: 0, weights: new Set() }).get(family);
            group.files++; if (weight) group.weights.add(`${weight[1]}${weight[2] === 'italic' ? 'i' : ''}`);
          }
          console.log(`Web font families (${b.web.length} files):`);
          for (const [family, group] of groups) console.log(`  ${family} · ${group.files} files${group.weights.size ? ` · weights ${[...group.weights].sort().join(' ')}` : ''}`);
        }
        if (b.faces.length) console.log(`@font-face families in the app's web code: ${b.faces.join(', ')}`);
        if (b.electron) console.log('Note: this is an Electron (desktop web) app, not the iPhone app. Its fonts are strong evidence, not proof, for iOS.');
        if (b.declared.length) console.log(`Info.plist UIAppFonts: ${b.declared.join(', ')}`);
        if (b.flutter.length) console.log(`Flutter font families: ${b.flutter.join(', ')}`);
      }
      if (result.site) {
        console.log(`\nSite: ${result.site.url}`);
        for (const item of result.site.families) console.log(`  ${item.family} · ${item.sources.join(', ')}`);
        if (!result.site.families.length) console.log('  no declared web fonts found');
      }
    }
  } catch (error) { console.error(`Could not scan: ${error.message}`); process.exitCode = 1; }
}
