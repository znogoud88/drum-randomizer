// Scans exercises/<category>/ and writes exercises.json for the page.
// Runs in the GitHub Pages workflow on every push; run it locally before `node scripts/serve.mjs`.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CATS = ["hands", "feet", "fills", "songs"];
const EXT = new Set([".gp", ".gpx", ".gp5", ".gp4", ".gp3"]);

const list = [];
for (const cat of CATS) {
  const dir = path.join(root, "exercises", cat);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!EXT.has(path.extname(file).toLowerCase())) continue;
    list.push({
      id: cat + "/" + file,
      category: cat,
      name: path.basename(file, path.extname(file)),
      url: "exercises/" + cat + "/" + encodeURIComponent(file),
    });
  }
}
fs.writeFileSync(path.join(root, "exercises.json"), JSON.stringify(list, null, 2) + "\n");
console.log("exercises.json: " + list.length + " exercises");
for (const cat of CATS) console.log("  " + cat + ": " + list.filter((e) => e.category === cat).length);
