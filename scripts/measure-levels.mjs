// Measures how loud the drums and the other instruments of every exercise are, and stores it in exercises.json
// as `levels: { drums, others }` (LUFS, ITU-R BS.1770 with gating). The page uses it to bring every file's drums
// to the same loudness and to keep the other instruments a few LU under the drums.
//
// Renders with alphaTab's own synthesizer and the same soundfont as the page (vendor/sonivox.sf2).
// Needs @coderline/alphatab 1.8.4 installed somewhere: AT_DIR=<folder with node_modules> node scripts/measure-levels.mjs
// Runs after build-manifest.mjs in the Pages workflow. If anything fails the page simply plays files unchanged.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const atDir = process.env.AT_DIR || root;
const core = path.join(atDir, "node_modules", "@coderline", "alphatab", "dist", "alphaTab.core.mjs");
const SECONDS = 8; // enough for a loop or two of an exercise
const RATE = 44100; // lower rates make some sonivox voices produce NaN

// The offline renderer is internal in alphaTab 1.8.4; expose it from a temporary copy of the core module.
const tmp = path.join(os.tmpdir(), "alphatab-core-levels.mjs");
fs.writeFileSync(tmp, fs.readFileSync(core, "utf8") +
  "\nexport { AlphaSynthAudioExporter as __Exporter, AudioExportOptions as __Options, MidiFileGenerator as __Generator, AlphaSynthMidiFileHandler as __Handler, MidiFile as __Midi, ScoreLoader as __Loader, Settings as __Settings };\n");
const at = await import(pathToFileURL(tmp).href);
const settings = new at.__Settings();
const soundFont = new Uint8Array(fs.readFileSync(path.join(root, "vendor", "sonivox.sf2")));

function render(score, tracks) {
  const midi = new at.__Midi();
  const gen = new at.__Generator(score, settings, new at.__Handler(midi));
  gen.applyTranspositionPitches = false;
  gen.generate();
  const opt = new at.__Options();
  opt.sampleRate = RATE;
  const ex = new at.__Exporter(opt);
  ex.loadMidiFile(midi);
  ex.applyTranspositionPitches(gen.transpositionPitches);
  for (const t of score.tracks) for (const ch of [t.playbackInfo.primaryChannel, t.playbackInfo.secondaryChannel]) ex.channelSetMixVolume(ch, 0);
  for (const t of tracks) for (const ch of [t.playbackInfo.primaryChannel, t.playbackInfo.secondaryChannel]) ex.channelSetMixVolume(ch, 1);
  ex.loadSoundFont(soundFont);
  ex.setup();
  const parts = [];
  let len = 0;
  for (let ms = 0; ms < SECONDS * 1000; ms += 500) {
    const c = ex.render(500);
    if (!c) break;
    parts.push(c.samples);
    len += c.samples.length;
  }
  const all = new Float32Array(len);
  let p = 0;
  for (const s of parts) { all.set(s, p); p += s.length; }
  return all;
}

// Integrated loudness of interleaved stereo samples: K-weighting, 400 ms blocks with 75% overlap, -70 LUFS and -10 LU gates.
function lufs(samples, fs = RATE) {
  const bq = (b0, b1, b2, a0, a1, a2) => ({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 });
  let w = 2 * Math.PI * 1681.974 / fs, A = 10 ** (3.99984 / 40), c = Math.cos(w), al = Math.sin(w) / (2 * 0.7071752), sA = 2 * Math.sqrt(A) * al;
  const shelf = bq(A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA),
    (A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA);
  w = 2 * Math.PI * 38.13547 / fs; c = Math.cos(w); al = Math.sin(w) / (2 * 0.500327);
  const hp = bq((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  const frames = samples.length / 2, blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const sq = new Float64Array(frames);
  for (let ch = 0; ch < 2; ch++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < frames; i++) {
      const x = samples[2 * i + ch];
      const y = shelf.b0 * x + shelf.b1 * x1 + shelf.b2 * x2 - shelf.a1 * y1 - shelf.a2 * y2;
      const z = hp.b0 * y + hp.b1 * y1 + hp.b2 * y2 - hp.a1 * z1 - hp.a2 * z2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; z2 = z1; z1 = z;
      sq[i] += z * z;
    }
  }
  const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + sq[i];
  const blocks = [];
  for (let s = 0; s + blk <= frames; s += hop) blocks.push((pre[s + blk] - pre[s]) / blk);
  const L = (z) => -0.691 + 10 * Math.log10(z);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  let g = blocks.filter((z) => L(z) > -70);
  if (!g.length) return null;
  const rel = L(mean(g)) - 10;
  g = g.filter((z) => L(z) > rel);
  const v = L(mean(g));
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

const manifestPath = path.join(root, "exercises.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const hasNotes = (t) => t.staves.some((s) => s.bars.some((b) => b.voices.some((v) => v.beats.some((bt) => bt.notes.length))));
for (const ex of manifest.exercises) {
  try {
    const file = path.join(root, "exercises", ex.category, ex.id.slice(ex.category.length + 1));
    const score = at.__Loader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(file)), settings);
    const drums = score.tracks.filter((t) => t.staves.some((s) => s.isPercussion) && hasNotes(t));
    const others = score.tracks.filter((t) => !t.staves.some((s) => s.isPercussion) && hasNotes(t));
    ex.levels = {
      drums: drums.length ? lufs(render(score, drums)) : null,
      others: others.length ? lufs(render(score, others)) : null,
    };
    console.log(ex.id.padEnd(60), JSON.stringify(ex.levels));
  } catch (e) {
    console.warn(ex.id, "not measured:", e.message);
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
