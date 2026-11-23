// A static site of the built examples, so the figures can be opened in a browser
// without cloning the repository: `node scripts/site.mjs` writes `.site/`, which
// holds every built page plus a small index. Nothing here builds a figure; it
// only copies what the examples' own build scripts wrote.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "examples");
const OUT = join(ROOT, ".site");

// every page an example build writes, in the order the gallery lists them
const PAGE = /\.html$/;
// the examples in the order the README's table lists them, then anything else
const ORDER = [
  "dial-indicator",
  "desk-computer",
  "arcade-cabinet",
  "raptor-engine",
  "ripple-tank",
  "push-button",
  "turning-dial",
  "thermodynamics-engine",
];
 // the print sheets are built per format on demand, and the -verify page is a
// working sheet for the checks, not a figure
// (the stress sheet is a benchmark, not a figure)
const SKIP = /-(a4|letter|verify|stress)(-light)?\.html$/;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const pages = [];
const names = readdirSync(EXAMPLES).sort();
const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
for (const name of names) {
  const folder = join(EXAMPLES, name);
  let entries;
  try {
    entries = readdirSync(folder);
  } catch {
    continue; // not a folder, or not readable
  }
  for (const file of entries.filter((entry) => PAGE.test(entry) && !SKIP.test(entry)).sort()) {
    const light = /-light\.html$/.test(file);
    cpSync(join(folder, file), join(OUT, file));
    pages.push({ example: name, file, light });
  }
  // the lone SVG of a figure is worth serving too: it is the drawing on its own
  for (const file of entries.filter((entry) => entry.endsWith(".svg")).sort()) {
    cpSync(join(folder, file), join(OUT, file));
  }
}

const title = (name) => name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const row = ({ example, file, light }) =>
  `      <li><a href="./${file}"><b>${title(example)}</b><span>${light ? "light" : "dark"}</span></a></li>`;

const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anatomy — built figures</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body {
    margin: 0; min-height: 100vh; background: #0b0b0b; color: #a3a3a3;
    font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: min(720px, 100% - 48px); margin: 96px auto }
  h1 { margin: 0; font: 500 20px/1.3 ui-sans-serif, system-ui, sans-serif; color: #e6e6e6; letter-spacing: -.01em }
  p.lede { margin: 10px 0 40px; max-width: 54ch; color: #6e6e6e }
  ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid #1c1c1c }
  a {
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
    padding: 15px 2px; border-bottom: 1px solid #1c1c1c;
    color: #d4d4d4; text-decoration: none; transition: color .15s ease;
  }
  a:hover b { color: #fff }
  b { font-weight: 500; color: #c9c9c9 }
  span { font: 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; color: #5c5c5c }
  footer { margin-top: 40px; font: 11px/1.7 ui-monospace, monospace; color: #4a4a4a }
  footer a { display: inline; padding: 0; border: 0; color: #6e6e6e }
</style>
</head>
<body>
  <main>
    <h1>Anatomy — built figures</h1>
    <p class="lede">Standalone pages written by each example's own build script. Every figure is one self-contained file: no scripts, fonts or styles come from the network.</p>
    <ul>
${pages.map(row).join("\n")}
    </ul>
    <footer>Source: github.com/Ukisuke79/anatomy-3d-designs- · built ${pages.length} pages</footer>
  </main>
</body>
</html>
`;

writeFileSync(join(OUT, "index.html"), index);
// Vercel serves a folder of static files from here without further configuration
if (!existsSync(join(OUT, "index.html"))) throw new Error("index.html was not written");
console.log(`wrote .site/ — ${pages.length} pages and index.html`);
