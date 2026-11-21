import { lstat, readFile, readdir, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const STUDIO_VERSION = '1.3.0';
export const STATIC_CORE = ['index.html', 'studio.js', 'studio.css', 'app.css', 'ui.js'];
export const TEMPLATE_FILES = ['existing.js', 'future.js', 'existing.css', 'future.css', 'findings.js', 'design-system.js'];
export const INSTANCE_CORE = [...STATIC_CORE, 'server.mjs', 'scripts/check.mjs',
  'scripts/create-instance.mjs', 'scripts/create-app.mjs', 'scripts/export-share.mjs', 'scripts/share.mjs', 'scripts/draft-existing.mjs', 'scripts/scan-fonts.mjs',
  'scripts/captures-inbox.mjs', 'scripts/import-captures.mjs', 'scripts/add-captures.mjs', 'scripts/extract-frames.mjs', 'scripts/extract-frames.swift',
  'scripts/blur-regions.mjs', 'scripts/blur-regions.swift',
  'scripts/instance-files.mjs', 'scripts/project-paths.mjs', 'scripts/check-phone-preview.mjs', 'scripts/qr-code.mjs',
  'scripts/vendor/qrcodegen.mjs', ...TEMPLATE_FILES.map(file => `templates/client/${file}`)];
const extensions = new Set(['.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.md', '.txt']);
const privateName = /^(?:\.?(?:env|git|codex|ssh|aws)(?:[.-]|$)|(?:secrets?|credentials?|tokens?)(?:[.-]|$))/i;

export function fail(message) { throw new Error(message); }
export function label(value, description = 'Name') {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f]/.test(value)) fail(`${description} must contain 1–80 characters without control characters.`);
  return value.trim();
}
export function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'client-app'; }
export function relativeFile(value) {
  if (typeof value !== 'string' || !value || /[\\:\x00-\x1f\x7f]/.test(value) || path.posix.isAbsolute(value)) fail(`Unsafe relative file path: ${value}`);
  if (value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || privateName.test(part))) fail(`Unsafe relative file path: ${value}`);
  return value;
}
export function contentFile(value) {
  const file = relativeFile(value);
  if (!file.startsWith('apps/') || !extensions.has(path.extname(file).toLowerCase())) fail(`Client content must be an approved file under apps/: ${file}`);
  if (/(?:^|[._-])(?:secret|credentials?|private-key)(?:[._-]|$)/i.test(path.basename(file))) fail(`Private content is not accepted: ${file}`);
  return file;
}
export function isShareContent(file) {
  if (path.extname(file).toLowerCase() === '.md') return false;
  if (path.extname(file).toLowerCase() === '.txt') return /^(?:OFL|LICENSE|LICENCE|COPYING)(?:[.-].*)?\.txt$/i.test(path.basename(file));
  return !/(?:^|[._-])manifest(?:[._-]|$)/i.test(path.basename(file));
}
export async function existingPath(target, type) {
  const absolute = path.resolve(target);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) fail(`Symlinks are not accepted: ${cursor}`);
  }
  const info = await lstat(absolute);
  if (type === 'directory' && !info.isDirectory()) fail(`Expected a directory: ${absolute}`);
  if (type === 'file' && !info.isFile()) fail(`Expected a regular file: ${absolute}`);
  return realpath(absolute);
}
export async function exists(target) {
  try { return await lstat(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function safeRead(root, relative) {
  const target = await existingPath(path.join(root, relativeFile(relative)), 'file');
  if (!target.startsWith(`${root}${path.sep}`)) fail(`File escapes its source: ${relative}`);
  return readFile(target);
}
export function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
export function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function configText(config) { return `// Independent App Flow Studio client instance.\nexport default ${JSON.stringify(config, null, 2)};\n`; }
export function parseConfig(text) {
  const match = text.match(/^\s*(?:\/\/[^\n]*\n\s*)*export\s+default\s+([\s\S]*?)\s*;?\s*$/);
  if (!match) fail('config.js must use the generated export default JSON object format.');
  try { return JSON.parse(match[1]); } catch { fail('config.js must use JSON-compatible property names and values after export default.'); }
}
export function validateStudioConfig(studio) {
  if (studio === undefined) return undefined;
  function fields(value, schema, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object.`);
    const result = {};
    for (const [key, setting] of Object.entries(value)) {
      if (!Object.hasOwn(schema, key)) fail(`Unsupported ${name} field: ${key}`);
      const rule = schema[key];
      if (Array.isArray(rule)) {
        if (!rule.includes(setting)) fail(`${name}.${key} must be one of: ${rule.join(', ')}.`);
      } else if (typeof rule === 'object') {
        result[key] = fields(setting, rule, `${name}.${key}`);
        continue;
      } else if (typeof setting !== rule) fail(`${name}.${key} must be a ${rule}.`);
      if (typeof setting === 'string' && (setting.length > 500 || /[\x00-\x1f\x7f]/.test(setting))) fail(`${name}.${key} must be at most 500 characters without control characters.`);
      result[key] = setting;
    }
    return result;
  }
  const result = fields(studio, {
    appearance: ['light', 'dark'],
    headerTitle: 'string',
    headerSubtitle: 'string',
    icon: 'string',
    showOverview: 'boolean',
    defaultView: ['overview', 'findings', 'screens', 'map', 'library'],
    showDesignLibrary: 'boolean',
    sidebar: { collapsible: 'boolean', scope: 'string' },
    about: { preparedFor: 'string', preparedBy: 'string', date: 'string', scope: 'string', note: 'string' },
  }, 'studio');
  if (result.icon !== undefined) {
    const file = contentFile(result.icon.replace(/^\.\//, ''));
    if (!/\.(?:svg|png|jpe?g|webp|gif|ico)$/i.test(file)) fail('studio.icon must be a local image under apps/.');
    result.icon = `./${file}`;
  }
  return result;
}
export function validateManifest(value, nameOverride) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.app) fail('Manifest requires app and a nonempty files allowlist.');
  function inventory(input, name) {
    if (!Array.isArray(input) || !input.length) fail(`${name} must be a nonempty file allowlist.`);
    const result = input.map(contentFile);
    if (new Set(result.map(file => file.toLowerCase())).size !== result.length) fail(`${name} paths must be unique, including case.`);
    return result.sort();
  }
  const files = inventory(value.files, 'Manifest files');
  const exportFiles = value.exportFiles === undefined ? undefined : inventory(value.exportFiles, 'exportFiles');
  if (exportFiles) {
    for (const file of exportFiles) {
      if (!files.includes(file)) fail(`Export file is not in the instance allowlist: ${file}`);
      if (!isShareContent(file)) fail(`exportFiles cannot include documentation or source manifests: ${file}`);
    }
  }
  const shared = exportFiles ?? files;
  function modulePath(input, description, extension) {
    if (typeof input !== 'string' || !input.startsWith('./')) fail(`${description} must start with ./apps/.`);
    const file = contentFile(input.slice(2));
    if (!extension.test(file) || !files.includes(file)) fail(`${description} must reference an allowlisted file: ${input}`);
    if (!shared.includes(file)) fail(`${description} must be included in exportFiles: ${input}`);
    return `./${file}`;
  }
  function entry(input, variant = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid app registry entry.');
    const allowed = new Set(variant ? ['id', 'name', 'module', 'stylesheet'] : ['id', 'name', 'module', 'stylesheet', 'findings', 'designSystem', 'variants', 'defaultVariant']);
    for (const key of Object.keys(input)) if (!allowed.has(key)) fail(`Unsupported registry field: ${key}`);
    if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id)) fail('App and variant IDs must use lowercase letters, numbers, and hyphens.');
    const result = { id: input.id, name: label(!variant && nameOverride ? nameOverride : input.name), module: modulePath(input.module, 'Module', /\.(?:m?js)$/) };
    if (input.stylesheet !== undefined) result.stylesheet = modulePath(input.stylesheet, 'Stylesheet', /\.css$/);
    if (!variant && input.findings !== undefined) result.findings = modulePath(input.findings, 'Findings module', /\.(?:m?js)$/);
    if (!variant && input.designSystem !== undefined) result.designSystem = modulePath(input.designSystem, 'Design system module', /\.(?:m?js)$/);
    if (!variant && input.variants !== undefined) {
      if (!Array.isArray(input.variants) || !input.variants.length) fail('Variants must be a nonempty array.');
      result.variants = input.variants.map(item => entry(item, true));
      if (new Set(result.variants.map(item => item.id)).size !== result.variants.length) fail('Variant IDs must be unique.');
      if (!result.variants.some(item => item.module === result.module)) fail('Base module must match one variant.');
      if (!result.variants.some(item => item.id === input.defaultVariant)) fail('defaultVariant must name a variant.');
      result.defaultVariant = input.defaultVariant;
    } else if (input.defaultVariant !== undefined) fail('defaultVariant requires variants.');
    return result;
  }
  const app = entry(value.app), studio = validateStudioConfig(value.studio);
  if (studio?.icon && !shared.includes(studio.icon.slice(2))) fail(`studio.icon must be included in the exported file allowlist: ${studio.icon}`);
  return { app, files, ...(exportFiles ? { exportFiles } : {}), ...(studio ? { studio } : {}) };
}
// Check statically declared browser resources without executing imported client code.
// Computed filenames still need the full inventory and a browser check.
export function checkLocalDependencies(files) {
  const available = new Set(files.keys());
  function requireFile(reference, owner, relativeTo = owner) {
    if (!reference || reference.includes('${') || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) return;
    let name;
    try { name = decodeURIComponent(reference.split(/[?#]/)[0]); }
    catch { fail(`Invalid resource URL in ${owner}: ${reference}`); }
    if (!name) return;
    if (name.includes('\\') || /[\x00-\x1f\x7f]/.test(name)) fail(`Unsafe browser resource in ${owner}: ${reference}`);
    const resolved = name.startsWith('/') ? name.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(relativeTo), name));
    relativeFile(resolved);
    if (!available.has(resolved)) fail(`Missing browser dependency: ${owner} requires ${resolved}. Add it to files and exportFiles when used.`);
  }
  for (const [file, bytes] of files) {
    const extension = path.extname(file).toLowerCase();
    if (!['.js', '.mjs', '.css', '.html', '.svg'].includes(extension)) continue;
    const text = bytes.toString();
    if (['.js', '.mjs'].includes(extension)) {
      for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) requireFile(match[1] ?? match[2], file);
      for (const match of text.matchAll(/\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) requireFile(match[1], file);
      // Browser markup URLs resolve against index.html even when declared in an app module.
      for (const match of text.matchAll(/['"`](\.?\/?apps\/[^'"`\s<>]+)['"`]/g)) requireFile(match[1], file, 'index.html');
    }
    if (extension === '.css' || extension === '.html' || extension === '.svg') {
      for (const match of text.matchAll(/\burl\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+['"]([^'"]+)['"]/g)) requireFile((match[2] ?? match[3]).trim(), file);
    }
    for (const match of text.matchAll(/\b(?:src|poster)\s*=\s*(['"])(.*?)\1/g)) requireFile(match[2], file, ['.js', '.mjs'].includes(extension) ? 'index.html' : file);
    if (extension === '.html') {
      for (const match of text.matchAll(/<link\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/g)) requireFile(match[2], file);
    }
  }
}
export async function writeNewTree(root, files) {
  for (const [file, buffer] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), buffer, { flag: 'wx' });
  }
}
export async function treeHashes(root) {
  const hashes = {};
  async function walk(directory, prefix = '') {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) fail(`Output contains a symlink: ${relative}`);
      if (item.isDirectory()) await walk(path.join(directory, item.name), relative);
      else if (item.isFile()) hashes[relative] = digest(await readFile(path.join(directory, item.name)));
      else fail(`Output contains a non-regular file: ${relative}`);
    }
  }
  await walk(root);
  return hashes;
}

// Findings review: a person's accept, edit or reject decisions, saved beside the findings module and laid over its draft.
// apps/findings.js keeps the draft; apps/findings-review.json holds { [findingId]: { decision, edits?, reason?, reviewedOn? } }.
export const reviewFile = findings => findings.replace(/^\.\//, '').replace(/\.m?js$/, '-review.json');
const REVIEW_EDITS = { severity: 20, title: 300, problem: 4000, recommendation: 4000 };
export function validateReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Findings review must be an object keyed by finding id.');
  const text = (input, limit, name) => {
    if (typeof input !== 'string' || !input.trim() || input.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input)) fail(`${name} must be 1–${limit} characters of text.`);
    return input.trim();
  };
  const result = {};
  for (const [id, record] of Object.entries(value)) {
    if (!id || id.length > 120 || /[\x00-\x1f\x7f]/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) fail('Findings review has an invalid finding id.');
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`Review of ${id} must be an object.`);
    for (const key of Object.keys(record)) if (!['decision', 'edits', 'reason', 'reviewedOn'].includes(key)) fail(`Review of ${id} has an unsupported field: ${key}`);
    if (!['accepted', 'rejected'].includes(record.decision)) fail(`Review of ${id} needs decision "accepted" or "rejected".`);
    const entry = { decision: record.decision };
    if (record.edits !== undefined) {
      if (!record.edits || typeof record.edits !== 'object' || Array.isArray(record.edits)) fail(`Review of ${id}: edits must be an object.`);
      const edits = {};
      for (const [field, edit] of Object.entries(record.edits)) {
        if (!Object.hasOwn(REVIEW_EDITS, field)) fail(`Review of ${id} cannot edit ${field}.`);
        edits[field] = text(edit, REVIEW_EDITS[field], `Review of ${id}: ${field}`);
      }
      if (edits.severity !== undefined && !['high', 'medium', 'low'].includes(edits.severity)) fail(`Review of ${id}: severity must be high, medium, or low.`);
      if (Object.keys(edits).length) entry.edits = edits;
    }
    if (record.reason !== undefined && record.reason !== '') entry.reason = text(record.reason, 500, `Review of ${id}: reason`);
    if (record.reviewedOn !== undefined) {
      if (typeof record.reviewedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedOn)) fail(`Review of ${id}: reviewedOn must be a YYYY-MM-DD date.`);
      entry.reviewedOn = record.reviewedOn;
    }
    result[id] = entry;
  }
  return result;
}
// What a shared copy carries once a review exists: accepted findings with their edits, and the opportunities they belong to.
export function applyReview(data, review) {
  const items = (Array.isArray(data?.items) ? data.items : []).filter(item => review[item?.id]?.decision === 'accepted')
    .map(item => ({ ...item, ...(review[item.id].edits || {}) }));
  const used = new Set(items.map(item => item.opportunity));
  return { ...data, ...(Array.isArray(data.opportunities) ? { opportunities: data.opportunities.filter(record => used.has(record?.id)) } : {}), items, reviewed: true };
}
// Replace each reviewed findings module in a browser bundle with its accepted findings. The review file itself, and every
// unreviewed or rejected finding, stays out of the bundle. Findings without a review are copied unchanged.
export async function shareReviewedFindings(browserRoot, apps, files) {
  const notes = [];
  for (const app of apps) {
    if (typeof app.findings !== 'string') continue;
    const file = app.findings.slice(2), sidecar = reviewFile(app.findings);
    files.delete(sidecar);
    if (!files.has(file) || !(await exists(path.join(browserRoot, sidecar)))) continue;
    let review;
    try { review = validateReview(JSON.parse((await safeRead(browserRoot, sidecar)).toString('utf8'))); }
    catch (error) { fail(`${sidecar}: ${error.message}`); }
    if (!Object.keys(review).length) continue;
    const bytes = files.get(file);
    const data = (await import(`${pathToFileURL(path.join(browserRoot, file)).href}?review=${digest(bytes).slice(0, 12)}`)).default;
    if (!data || typeof data !== 'object' || !isDeepStrictEqual(JSON.parse(JSON.stringify(data)), data)) fail(`${file} must be plain data (text, numbers, lists) to share reviewed findings.`);
    const shared = applyReview(data, review), total = Array.isArray(data.items) ? data.items.length : 0;
    const rejected = (data.items || []).filter(item => review[item?.id]?.decision === 'rejected').length;
    files.set(file, Buffer.from(`// Reviewed findings: accepted findings only.\nexport default ${JSON.stringify(shared, null, 2)};\n`));
    notes.push(`${app.name}: ${shared.items.length} accepted of ${total} findings included; ${total - shared.items.length - rejected} unreviewed and ${rejected} rejected left out.`);
  }
  return notes;
}
