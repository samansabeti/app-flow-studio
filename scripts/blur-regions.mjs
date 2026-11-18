import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// macOS only. Redacts parts of a screenshot with an irreversible blur: heavy pixelation, then a strong Gaussian blur.
// The image work is done by scripts/blur-regions.swift, which uses CoreImage and ImageIO through the swift command
// from Apple's command line tools. Nothing is installed.
// The original is never changed; the blurred copy goes to a new path.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(projectRoot, 'scripts/blur-regions.swift');
const usage = `Usage: npm run blur-regions -- <image> <output.png> <x,y,w,h> [<x,y,w,h> ...] [options]
       npm run blur-regions -- --spec <jobs.json> [options]
  macOS only: uses the image tools built into macOS through Swift (xcode-select --install).
  Rectangles are in image pixels from the top-left corner (an iPhone screenshot is 1206 × 2622).
  The blurred copy is written as PNG; the original is left untouched and the output may not replace it.
  jobs.json: [{ "input": "...", "output": "...", "rects": [[x, y, w, h], ...] }, ...]

  --block <px>   Pixelation block size. Default 32 (minimum 24, so text cannot be read back).
  --sigma <px>   Gaussian blur radius applied after pixelating. Default 24.
  --pad <px>     Extra margin added around every rectangle. Default 8.`;

class Problem extends Error {}
const fail = message => { throw new Problem(message); };
const here = target => path.resolve(process.env.INIT_CWD || process.cwd(), target);
const rectOf = (text, where) => {
  const parts = String(text).split(',').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) fail(`${where}: "${text}" is not x,y,width,height in pixels.`);
  return parts;
};

async function parse(argv) {
  const options = { block: 32, sigma: 24, pad: 8 };
  const positional = [];
  let spec;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { const next = argv[++i]; if (next === undefined) fail(`${arg} needs a value.`); return next; };
    if (arg === '--help' || arg === '-h') return null;
    if (arg === '--spec') spec = value();
    else if (['--block', '--sigma', '--pad'].includes(arg)) {
      const n = Number(value());
      if (!Number.isFinite(n) || n < 0) fail(`${arg} must be a positive number.`);
      options[arg.slice(2)] = n;
    } else if (arg.startsWith('--')) fail(`Unknown option ${arg}.`);
    else positional.push(arg);
  }
  if (options.block < 24) fail('--block must be at least 24 so blurred text cannot be read back.');
  let jobs;
  if (spec) {
    if (positional.length) fail('Use either --spec or an image with rectangles, not both.');
    const file = here(spec);
    jobs = JSON.parse(await readFile(file, 'utf8')).map((job, n) => ({
      input: path.resolve(path.dirname(file), job.input), output: path.resolve(path.dirname(file), job.output),
      rects: (job.rects || []).map(rect => rectOf(Array.isArray(rect) ? rect.join(',') : rect, `job ${n + 1}`)),
    }));
  } else {
    if (positional.length < 3) return null;
    const [input, output, ...rects] = positional;
    jobs = [{ input: here(input), output: here(output), rects: rects.map(rect => rectOf(rect, 'rectangle')) }];
  }
  for (const job of jobs) {
    if (!existsSync(job.input)) fail(`Could not find ${job.input}`);
    if (path.resolve(job.input) === path.resolve(job.output)) fail(`The output must not replace the original: ${job.input}`);
    if (!job.rects.length) fail(`No rectangles given for ${job.input}`);
    await mkdir(path.dirname(job.output), { recursive: true });
  }
  return { ...options, jobs };
}

try {
  const settings = await parse(process.argv.slice(2));
  if (!settings) { console.log(usage); process.exit(0); }
  if (process.platform !== 'darwin') fail('blur-regions is macOS only: it uses the image frameworks built into macOS. On another system, blur with an image editor (pixelate first, so the text cannot be read back).');
  await new Promise((resolve, reject) => {
    const child = spawn('swift', [helper, JSON.stringify(settings)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stdout.on('data', chunk => String(chunk).trim().split('\n').forEach(line => {
      try { const item = JSON.parse(line); console.log(`Blurred ${item.regions} region${item.regions === 1 ? '' : 's'} -> ${item.written}`); } catch { console.log(line); }
    }));
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', error => reject(new Problem(error.code === 'ENOENT' ? 'Could not run Swift. Install Apple\'s command line tools with "xcode-select --install", then try again.' : error.message)));
    child.on('close', code => code === 0 ? resolve() : reject(new Problem(errors.trim() || `The blur helper stopped (exit ${code}).`)));
  });
} catch (error) {
  console.error(`Could not blur: ${error.message}`);
  process.exitCode = 1;
}
