// Packs /extension into public/anki-ji-extension.zip (downloadable from Settings). Run: npm run build:extension
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension");
const out = path.join(root, "public", "anki-ji-extension.zip");
const zip = new JSZip();
const date = new Date("2026-01-01T00:00:00Z"); // stable timestamps → reproducible zip
const walk = (dir, rel = "") => {
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`);
    else if (!f.endsWith(".d.ts")) zip.file(`${rel}${f}`, readFileSync(p), { date });
  }
};
walk(src);
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
writeFileSync(out, buf);
console.log(`wrote ${path.relative(root, out)} (${buf.length} bytes, ${Object.keys(zip.files).length} files)`);
