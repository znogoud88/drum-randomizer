// Local preview: node scripts/build-manifest.mjs && node scripts/serve.mjs, then open http://localhost:5178
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const port = Number(process.argv[2] || 5178);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json",
  ".txt": "text/plain", ".woff2": "font/woff2", ".sf2": "application/octet-stream",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log("Drum Randomizer: http://localhost:" + port));
