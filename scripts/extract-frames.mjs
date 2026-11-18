import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capturesDir, inside, journeyFolders, recordingsFolder } from './captures-inbox.mjs';

// macOS only. Turns a phone screen recording into one PNG per screen that stayed still, ready for draft-existing.
// The video work is done by scripts/extract-frames.swift, which uses the video frameworks built into macOS
// (AVFoundation, CoreImage) through the swift command from Apple's command line tools. Nothing is installed.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(projectRoot, 'scripts/extract-frames.swift');
const videoTypes = /\.(mov|mp4|m4v)$/i;
const sensitivities = {
  // settle: share of the picture allowed to move while a screen counts as still (spinners, cursor, clock)
  // distinct: share that must differ for two still pictures to count as different screens (a toggle)
  low: { settle: 0.01, distinct: 0.0025 },
  normal: { settle: 0.006, distinct: 0.001 },
  high: { settle: 0.003, distinct: 0.0004 },
};
const usage = `Usage: npm run extract-frames -- [recording or folder of recordings] [options]
  macOS only: uses the video tools built into macOS through Swift (xcode-select --install).
  Saves one full-size PNG for each screen that stays still for about half a second.
  Transitions, scrolling and animations are left out, and repeats of the screen just saved are skipped.
  With no recording, reads every video in the captures inbox's recordings/ folder: frames go to
  recordings/<name>-frames/, or straight into the inbox journey folders when --marks is given.

  --out <folder>            Where to save. Default: a new "<recording>-frames" folder beside the recording.
  --force                   Allow an output folder that already has files. Frames saved earlier from the
                            same recording are replaced; nothing else in the folder is touched.
  --marks "0:00=01-signing-up,12:30=02-first-task"
                            Sort frames into journey subfolders by time in the recording. Frames before the
                            first mark stay in the output folder itself. One recording at a time. Folder names
                            are the journey folders (NN-<journey id>, in apps/findings.js journeys order).
  --skip-matching <folder>  Leave out frames that look the same as a screenshot already in this folder
                            (subfolders included). The status bar is ignored when comparing.
  --fps <number>            Checks per second of video, 1 to 30. Default 5.
  --sensitivity <level>     low, normal (default) or high. High keeps smaller differences (a toggle,
                            one typed word) as separate frames; low keeps fewer frames.

Recordings and frames must stay outside this project folder.`;

class Problem extends Error {}
const missingSwift = 'Could not run Swift, which this command uses to read the video. Install Apple\'s command line tools with "xcode-select --install", then try again.';
const fail = message => { throw new Problem(message); };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// npm runs scripts from the project folder; resolve paths from where the command was typed.
const here = target => path.resolve(process.env.INIT_CWD || process.cwd(), target);

function parseArgs(argv) {
  const options = { force: false, fps: 5, sensitivity: 'normal' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) fail(`${arg} needs a value. Run "npm run extract-frames -- --help" for examples.`);
      return next;
    };
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--force') options.force = true;
    else if (arg === '--out') options.out = value();
    else if (arg === '--marks') options.marks = value();
    else if (arg === '--skip-matching') options.skipMatching = value();
    else if (arg === '--fps') {
      const raw = value(), fps = Number(raw);
      if (!Number.isFinite(fps) || fps < 1 || fps > 30) fail(`--fps must be a number from 1 to 30 (got "${raw}").`);
      options.fps = fps;
    } else if (arg === '--sensitivity') {
      options.sensitivity = value().toLowerCase();
      if (!sensitivities[options.sensitivity]) fail(`--sensitivity must be low, normal or high (got "${options.sensitivity}").`);
    } else if (arg.startsWith('-')) fail(`Unknown option ${arg}. Run "npm run extract-frames -- --help" to see the options.`);
    else positional.push(arg);
  }
  if (positional.length > 1) fail('Give one recording or one folder at a time. Put quotes around a path that contains spaces.');
  return { ...options, input: positional[0] };
}

// "1:05" or "1:02:05" or "65" (seconds, decimals allowed) -> seconds.
function parseTime(text, entry) {
  const parts = text.trim().split(':');
  if (parts.length > 3 || parts.some(part => !/^\d+(\.\d+)?$/.test(part))) fail(`--marks: "${entry}" has an unreadable time. Write minutes:seconds, for example 12:30.`);
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
function parseMarks(text, journeys) {
  const marks = text.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const at = entry.indexOf('=');
    if (at < 1) fail(`--marks: "${entry}" should look like 12:30=02-first-task.`);
    const name = entry.slice(at + 1).trim();
    if (journeys.length && !journeys.includes(name)) fail(`--marks: "${name}" is not a journey folder name. Use one of:\n  ${journeys.join('\n  ')}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === recordingsFolder) fail(`--marks: "${name}" is not a usable folder name. Use letters, numbers, dots, dashes and underscores, for example 01-signing-up.`);
    return { time: parseTime(entry.slice(0, at), entry), name };
  }).sort((a, b) => a.time - b.time);
  if (!marks.length) fail('--marks is empty. Example: --marks "0:00=01-signing-up,12:30=02-first-task"');
  marks.forEach((mark, i) => { if (i && mark.time === marks[i - 1].time) fail(`--marks: two marks share the time ${mark.time} seconds.`); });
  return marks;
}

// Nearest existing folder, resolved through symlinks, so a not-yet-created output can be checked.
async function resolveExisting(target) {
  let cursor = path.resolve(target);
  const rest = [];
  while (!existsSync(cursor)) { rest.unshift(path.basename(cursor)); cursor = path.dirname(cursor); }
  return path.join(await realpath(cursor), ...rest);
}

const stampPattern = /-\d{2,}m\d{2}s\d{3}\.png$/;
const prefixFor = name => path.parse(name).name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'recording';
const shortTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

async function extractFrames(argv) {
  const options = parseArgs(argv);
  if (options.help) { console.log(usage); return; }
  if (process.platform !== 'darwin') fail('extract-frames is macOS only: it reads the video with the frameworks built into macOS. On another system, take screenshots instead, or export still frames with another tool and run npm run draft-existing on them.');
  if (options.input) return extractFrom(options);

  // No path: the captures inbox (CAPTURES_DIR or instance.json capturesDir; see scripts/captures-inbox.mjs).
  const inbox = await capturesDir(), folder = path.join(inbox, recordingsFolder);
  if (!existsSync(folder) || !(await stat(folder)).isDirectory()) fail(`Could not find the recordings folder of the captures inbox: ${folder}`);
  const videos = (await readdir(folder, { withFileTypes: true }))
    .filter(item => item.isFile() && !item.name.startsWith('.') && videoTypes.test(item.name))
    .map(item => path.join(folder, item.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
  if (!videos.length) { console.log(`No recordings (.mov or .mp4) in ${folder}`); return; }
  if (options.out) return extractFrom({ ...options, input: folder });
  if (options.marks) {
    if (videos.length > 1) fail(`--marks works with one recording at a time, and ${folder} has ${videos.length}:\n${videos.map(video => `  ${path.basename(video)}`).join('\n')}\nGive the one to sort: npm run extract-frames -- "${videos[0]}" --marks "..." --out "${inbox}"`);
    return extractFrom({ ...options, input: videos[0], out: inbox }, { inbox });
  }
  for (const video of videos) {
    const out = path.join(folder, `${path.parse(video).name}-frames`);
    if (!options.force && existsSync(out) && (await readdir(out)).some(name => name !== '.DS_Store')) { console.log(`Skipping ${path.basename(video)}: frames already saved in ${out} (add --force to redo).`); continue; }
    await extractFrom({ ...options, input: video }, { inbox, nextStep: `Next: move the frames you want into the journey folders in ${inbox}, then run npm run import-captures.` });
    if (videos.length > 1) console.log('');
  }
}

// inbox: set when frames go to the captures inbox (its journey folders and README are expected to be there).
async function extractFrom(options, { inbox = null, nextStep = null } = {}) {

  // Recordings.
  const input = here(options.input);
  let info;
  try { info = await stat(input); } catch { fail(`Could not find "${options.input}". Check the path; put quotes around it if it contains spaces.`); }
  let videos;
  if (info.isDirectory()) {
    videos = (await readdir(input, { withFileTypes: true }))
      .filter(item => item.isFile() && !item.name.startsWith('.') && videoTypes.test(item.name))
      .map(item => path.join(input, item.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
    if (!videos.length) fail(`No .mov or .mp4 recordings in ${input}.`);
  } else if (info.isFile()) {
    if (!videoTypes.test(input)) fail(`${path.basename(input)} is not a .mov or .mp4 video. Screen recordings from an iPhone are .mov or .mp4.`);
    videos = [input];
  } else fail(`${input} is not a file or folder.`);
  const journeys = (await journeyFolders()).map(item => item.folder);
  const marks = options.marks ? parseMarks(options.marks, journeys) : null;
  if (marks && videos.length > 1) fail('--marks works with one recording at a time, because each recording has its own clock. Run the recordings one by one.');
  for (const video of videos) if (inside(await resolveExisting(video), await realpath(projectRoot))) console.log(`Warning: ${path.basename(video)} is inside the project folder. Move recordings out of it (for example to Documents) so they never end up in git.`);

  let skipDir = null;
  if (options.skipMatching) {
    skipDir = here(options.skipMatching);
    if (!existsSync(skipDir) || !(await stat(skipDir)).isDirectory()) fail(`--skip-matching: could not find the folder ${options.skipMatching}.`);
  }

  // Output folder.
  const out = here(options.out ?? (info.isDirectory() ? `${input}-frames` : path.join(path.dirname(input), `${path.parse(input).name}-frames`)));
  if (inside(await resolveExisting(out), await realpath(projectRoot))) fail(`The output folder ${out} is inside the project folder. Frames must stay outside it: use --out with a folder in Documents, Desktop or Downloads.`);
  const used = new Set();
  const plan = videos.map(video => {
    let prefix = prefixFor(path.basename(video));
    for (let n = 2; used.has(prefix); n++) prefix = `${prefixFor(path.basename(video))}-${n}`;
    used.add(prefix);
    return { path: video, prefix };
  });
  if (existsSync(out)) {
    if (!(await stat(out)).isDirectory()) fail(`${out} exists and is not a folder. Choose another --out.`);
    const contents = (await readdir(out)).filter(name => name !== '.DS_Store');
    const intoInbox = inbox && out === inbox;
    if (contents.length && !options.force && !intoInbox) fail(`${out} already has files in it. Choose another --out, or add --force to replace frames saved earlier from the same recording (other files are kept).`);
    // --force: remove only frames this command wrote earlier for the same recordings.
    const ours = name => stampPattern.test(name) && plan.some(item => name.startsWith(`${item.prefix}-`) && /^\d/.test(name.slice(item.prefix.length + 1)));
    const subfolders = (await readdir(out, { withFileTypes: true })).filter(item => item.isDirectory() && !item.name.startsWith('.') && item.name !== recordingsFolder).map(item => item.name);
    for (const folder of ['', ...subfolders]) {
      const dir = path.join(out, folder);
      if (!existsSync(dir)) continue;
      const earlier = (await readdir(dir)).filter(ours);
      if (earlier.length && !options.force) fail(`Frames from this recording are already in the captures inbox (${folder || 'loose'}). Add --force to replace them.`);
      for (const name of earlier) await rm(path.join(dir, name));
      if (folder && earlier.length && !intoInbox && !(await readdir(dir)).filter(name => name !== '.DS_Store').length) await rm(dir, { recursive: true });
    }
  }
  const created = !existsSync(out);
  await mkdir(out, { recursive: true });

  // Run the video helper.
  const preset = sensitivities[options.sensitivity];
  const settings = { videos: plan, out, fps: options.fps, hold: 0.4, settle: preset.settle, distinct: preset.distinct, cellDelta: 10, matchDelta: 24, skipDir, skipTop: 0.06 };
  console.log(`Reading ${videos.length === 1 ? path.basename(videos[0]) : plural(videos.length, 'recording')}...`);
  const started = Date.now();
  const frames = [], results = [];
  const removeIfEmpty = async () => { if (created && !(await readdir(out)).length) await rm(out, { recursive: true }); };
  await new Promise((resolve, reject) => {
    const child = spawn('swift', [helper, JSON.stringify(settings)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffered = '', errors = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line);
        if (message.frame) frames.push(message);
        else if (message.done) results.push(message);
        else if (message.progress !== undefined && process.stdout.isTTY) process.stdout.write(`\r  ${path.basename(message.video)}: ${Math.round(message.progress * 100)}%   `);
      }
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', error => reject(new Problem(error.code === 'ENOENT' ? missingSwift : `Could not start the video helper: ${error.message}`)));
    child.on('close', code => {
      if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
      if (code === 0) resolve();
      else if (code === 2) reject(new Problem(errors.trim()));
      else if (/xcrun: error|active developer path/.test(errors)) reject(new Problem(missingSwift));
      else reject(new Problem(`The video helper stopped with an error:\n${errors.trim()}`));
    });
  }).catch(async error => { await removeIfEmpty(); throw error; });

  // Sort into journey subfolders.
  if (marks) {
    for (const frame of frames) {
      const mark = marks.filter(item => item.time <= frame.time + 1e-6).pop();
      if (!mark) continue;
      await mkdir(path.join(out, mark.name), { recursive: true });
      await rename(path.join(out, frame.frame), path.join(out, mark.name, frame.frame));
      frame.folder = mark.name;
    }
  }

  // Summary.
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const total = key => results.reduce((sum, item) => sum + item[key], 0);
  const length = results.reduce((sum, item) => sum + item.duration, 0);
  console.log(`Saved ${plural(frames.length, 'frame')} from ${shortTime(length)} of video in ${seconds}s (${results.map(item => `${item.width}×${item.height}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}).`);
  console.log(`Skipped ${plural(total('duplicates'), 'repeat')} of the screen just saved${skipDir ? ` and ${plural(total('matching'), 'frame')} matching a screenshot in ${skipDir}` : ''}.`);
  if (marks) {
    const counts = [...new Set(marks.map(mark => mark.name))].map(name => [name, frames.filter(frame => frame.folder === name).length]).filter(([, n]) => n);
    const loose = frames.filter(frame => !frame.folder).length;
    console.log(`Sorted: ${[...counts.map(([name, n]) => `${name} ${n}`), ...(loose ? [`not sorted (before the first mark) ${loose}`] : [])].join(', ') || 'nothing to sort'}.`);
  }
  console.log(`Output: ${out}`);
  if (!frames.length) { console.log('No screen stayed still long enough. Try --sensitivity low, or check that this is a screen recording.'); return; }
  console.log('Look through the frames and delete any you do not want (for example Control Center at the start or end). Blur private details (names, emails, account numbers) with npm run blur-regions before importing.');
  if (await realpath(out) !== out) console.log('Note: draft-existing does not accept folders under a linked path such as /tmp. Copy the frames to a folder in Documents first.');
  console.log(nextStep || (inbox ? 'Next: npm run import-captures' : `Next: npm run draft-existing -- "${out}"`));
}

try { await extractFrames(process.argv.slice(2)); }
catch (error) {
  console.error(error instanceof Problem ? error.message : `Could not extract frames: ${error.message}`);
  process.exitCode = 1;
}
