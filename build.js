// build.js — assembles src/ + lib/ into a single distributable datalab.html
// Usage: node build.js
// Output: datalab.html (overwritten in place)

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT    = __dirname;
const read    = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readBuf = f => fs.readFileSync(path.join(ROOT, f));

// Version: single source of truth is the VERSION constant in src/js/state.js
// (STANDARDS.md §3). Parsed here rather than duplicated.
const versionMatch = read('src/js/state.js').match(/const VERSION = '([^']+)'/);
if (!versionMatch) {
  console.error('Could not find VERSION constant in src/js/state.js — aborting.');
  process.exit(1);
}
const VERSION = versionMatch[1];

// ── Library hash verification (DEPENDENCIES.md) ───────────────────────────
const DEPS = {
  'lib/plotly.min.js':     '0a17719a72751704861215da0e5c5cdb3f9a8d50eff5cb84cb6f8b80786682b0',
  'lib/papaparse.min.js':  'b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb',
  'lib/jszip.min.js':      'acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e',
};

Object.entries(DEPS).forEach(([file, expected]) => {
  const actual = crypto.createHash('sha256').update(readBuf(file)).digest('hex');
  if (actual !== expected) {
    console.error(`\nHash mismatch: ${file}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
    console.error('\nUpdate DEPENDENCIES.md and get Security + EL sign-off before proceeding.');
    process.exit(1);
  }
});

// ── Libraries (escape </script> so the HTML parser doesn't close early) ───
const libs = ['lib/papaparse.min.js', 'lib/plotly.min.js', 'lib/jszip.min.js']
  .map(f => {
    const content = read(f).replace(/<\/script>/g, '<\\/script>');
    return `<script>${content}</script>`;
  })
  .join('\n');

// ── CSS ───────────────────────────────────────────────────────────────────
const style = `<style>\n${read('src/style.css')}\n</style>`;

// ── App JS — concatenated in dependency order ─────────────────────────────
const appJs = [
  'src/js/state.js',
  'src/js/data.js',
  'src/js/ui.js',
  'src/js/modal.js',
  'src/js/chart.js',
  'src/js/saves.js',
  'src/js/wiring.js',
  'src/js/renderers/shared.js',
  'src/js/renderers/scatter.js',
  'src/js/renderers/line.js',
  'src/js/renderers/parity.js',
  'src/js/renderers/contour.js',
  'src/js/renderers/histogram.js',
  'src/js/renderers/boxplot.js',
].map(read).join('\n\n');

// ── Assemble ──────────────────────────────────────────────────────────────
// Use function replacements so $ characters in Plotly's minified code are
// not misinterpreted as backreference patterns by String.replace.
let html = read('src/index.html');
html = html.replace(/%%VERSION%%/g,          () => VERSION);
html = html.replace('<!-- INJECT:LIBS -->',  () => libs);
html = html.replace('<!-- INJECT:STYLE -->', () => style);
html = html.replace('/* INJECT:SCRIPT */',   () => appJs);

// ── Write ─────────────────────────────────────────────────────────────────
const outPath = path.join(ROOT, 'datalab.html');
fs.writeFileSync(outPath, html, 'utf8');

const kb   = (fs.statSync(outPath).size / 1024).toFixed(0);
const hash = crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex');

console.log(`Built datalab.html  (${kb} KB)  v${VERSION}`);
console.log(`SHA-256: ${hash}`);
console.log('\nPublish this hash in the GitHub release notes so users can verify the download.');
