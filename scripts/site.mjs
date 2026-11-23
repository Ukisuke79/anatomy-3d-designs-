// A static site of the built examples, so the figures can be opened in a browser
// without cloning the repository: `node scripts/site.mjs` writes `.site/`, which
// holds every built page plus a small index. Nothing here builds a figure; it
// only copies what the examples' own build scripts wrote.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "examples");
const OUT = join(ROOT, ".site");

// every page an example build writes
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
// the print sheets are built per format on demand, the -verify page is a working
// sheet for the checks and the -stress page is a benchmark; none is a figure
const SKIP = /-(a4|letter|verify|stress)(-light)?\.html$/;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// With --build, every example is rebuilt from its own script first, in both
// themes, so a host can serve figures made from the current source rather than
// from pages committed earlier. A figure whose build fails is reported and
// skipped; the rest of the site still goes out.
const BUILD = process.argv.includes("--build");
const failures = [];

const names = readdirSync(EXAMPLES).sort();
const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

if (BUILD) {
  for (const name of names) {
    const script = join(EXAMPLES, name, "build.mjs");
    if (!existsSync(script)) continue;
    for (const theme of [[], ["--light"]]) {
      const run = spawnSync(process.execPath, [script, ...theme], { cwd: ROOT, encoding: "utf8" });
      if (run.status !== 0) {
        const why = (run.stderr || "").trim().split("\n").slice(-3).join(" ");
        failures.push(`${name} ${theme.join(" ") || "dark"}: ${why}`);
        console.error(`site: ${name} ${theme.join(" ") || "dark"} failed to build`);
      }
    }
  }
}

const pages = [];
const svgs = [];
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
  // several examples name the loose drawing output.svg, so flattening them into
  // one folder would keep only the last one written
  for (const file of entries.filter((entry) => entry.endsWith(".svg")).sort()) {
    const stem = file.slice(0, -4).replace(/^output(?:-|$)/, "");
    const light = stem === "light" || /-light$/.test(stem);
    const served = `${name}${light ? "-light" : ""}.svg`;
    cpSync(join(folder, file), join(OUT, served));
    svgs.push({ example: name, file: served, light });
  }
}

const title = (name) => name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

const figures = [];
for (const page of pages) {
  let figure = figures.find((entry) => entry.example === page.example);
  if (!figure) figures.push((figure = { example: page.example, pages: {}, drawing: null }));
  figure.pages[page.light ? "light" : "dark"] = page.file;
}
for (const entry of svgs) {
  const figure = figures.find((candidate) => candidate.example === entry.example);
  if (figure && !figure.drawing) figure.drawing = entry.file;
}

const link = (href, label, what) =>
  `<a class="t" href="./${href}" aria-label="${what}, ${label}">${label}</a>`;

const swipe = (figure, theme) =>
  figure.pages[theme] ? link(figure.pages[theme], theme, title(figure.example)) : "";

// the drawing on its own is a third link: the same geometry with no page around it
const drawing = (figure) => (figure.drawing ? link(figure.drawing, "svg", title(figure.example)) : "");

const row = (figure) =>
  `      <li><b>${title(figure.example)}</b><p>${swipe(figure, "dark")}${swipe(figure, "light")}${drawing(figure)}</p></li>`;

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
  li {
    display: flex; justify-content: space-between; align-items: baseline; gap: 20px;
    padding: 15px 2px; border-bottom: 1px solid #1c1c1c;
  }
  li > b { font-weight: 500; color: #d4d4d4 }
  li > p { display: flex; gap: 6px; margin: 0; flex: none }
  a.t {
    font: 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    letter-spacing: .08em; text-transform: uppercase; color: #8a8a8a; text-decoration: none;
    padding: 5px 8px; border: 1px solid #242424; border-radius: 3px;
    transition: color .15s ease, border-color .15s ease;
  }
  a.t:hover { color: #e6e6e6; border-color: #3a3a3a }
  span.t.off { color: #3a3a3a; border: 1px solid transparent; padding: 5px 8px;
    font: 11px/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase }
  footer { margin-top: 40px; font: 11px/1.7 ui-monospace, monospace; color: #4a4a4a }
  footer a { color: #6e6e6e; text-decoration: none }
  footer a:hover { color: #a3a3a3 }
</style>
</head>
<body>
  <main>
    <h1>Anatomy — built figures</h1>
    <p class="lede">Standalone pages written by each example's own build script, in a dark and a light drawing. Every figure is one self-contained file — no scripts, fonts or styles come from the network — and every part moves from the same model that prints the numbers.</p>
    <ul>
${figures.map(row).join("\n")}
    </ul>
    <footer>Source: <a href="https://github.com/Ukisuke79/anatomy-3d-designs-">Ukisuke79/anatomy-3d-designs-</a> · ${figures.length} figures, ${pages.length} pages</footer>
  </main>
</body>
</html>
`;

writeFileSync(join(OUT, "index.html"), index);
for (const failure of failures) console.error(`site: ${failure}`);
console.log(`wrote .site/ — ${figures.length} figures, ${pages.length} pages, index.html`);
