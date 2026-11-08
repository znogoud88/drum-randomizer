// Scans exercises/<category>/ and sounds/ and writes exercises.json for the page.
// Runs in the GitHub Pages workflow on every push; run it locally before `node scripts/serve.mjs`.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CATS = ["hands", "feet", "fills", "beats", "songs"];
const EXT = new Set([".gp", ".gpx", ".gp5", ".gp4", ".gp3"]);
const SOUND_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

const exercises = [];
for (const cat of CATS) {
  const dir = path.join(root, "exercises", cat);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!EXT.has(path.extname(file).toLowerCase())) continue; // subfolders (like songs/later) are skipped too
    const name = path.basename(file, path.extname(file));
    const ex = { id: cat + "/" + file, category: cat, name, url: "exercises/" + cat + "/" + encodeURIComponent(file) };
    if (cat === "songs") {
      // Songs are named band_song_part.gp. A file without a part is a whole song, not a practice piece: left out.
      const [band, song, ...rest] = name.split("_");
      if (!band || !song || !rest.length) { console.warn("  songs/" + file + ": not band_song_part, skipped"); continue; }
      Object.assign(ex, { band, song, part: rest.join("_") });
    }
    exercises.push(ex);
  }
}

// The countdown cue: the first audio file in sounds/, if any. Without one the page synthesizes a cowbell.
let countdownSound = null;
const soundDir = path.join(root, "sounds");
if (fs.existsSync(soundDir)) {
  const f = fs.readdirSync(soundDir).sort().find((n) => SOUND_EXT.has(path.extname(n).toLowerCase()));
  if (f) countdownSound = "sounds/" + encodeURIComponent(f);
}

fs.writeFileSync(path.join(root, "exercises.json"), JSON.stringify({ exercises, countdownSound }, null, 2) + "\n");
console.log("exercises.json: " + exercises.length + " exercises, countdown sound: " + (countdownSound || "built-in cowbell"));
for (const cat of CATS) console.log("  " + cat + ": " + exercises.filter((e) => e.category === cat).length);
