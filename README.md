# DataLab

A standalone, single-file data visualization tool for CSV data. Open
`datalab.html` in any modern browser — **no server, no install, no internet
connection required or used.**

Maintainer: Kalki Sharma <kalkijsharma@gmail.com>

## Getting started

1. Download `datalab.html` from the [releases page](../../releases)
2. **Verify the file** (recommended, see Security below):
   ```
   # Windows PowerShell
   Get-FileHash datalab.html -Algorithm SHA256
   # macOS / Linux
   shasum -a 256 datalab.html
   ```
   Compare the output against the SHA-256 published in the release notes.
3. Open the file in Chrome, Edge, or Firefox
4. Drop CSV files onto the Datasets panel, click **+ Add Series**, pick a
   chart type, and render

## Features

- **Chart types:** scatter (with bubble sizes — marker area proportional
  to a column), line, bar (explicit aggregation — count, sum, mean,
  median), parity (model-vs-observed with NSE/MAE/RMSE stats and error
  bands; colorable and sizeable by a column from the observed dataset),
  contour (pre-gridded data), histogram (Freedman-Diaconis
  auto-binning), box plot (Tukey whiskers), violin, heatmap (category ×
  category with explicit aggregation)
- **Self-describing encodings:** color a series by a column — categories
  get a named legend, numbers a labeled colorbar (editable label) — and
  size markers by a column with a min/median/max size key in the legend;
  override any series' legend text directly
- **Analysis on the plot:** distribution fits on histograms (normal,
  lognormal, Weibull MLE) with KDE overlay; trendlines with R² (linear,
  quadratic, cubic) — overall or one linear fit per color group; error
  bars from a ± column or computed SD/SEM (always labeled with what they
  represent); per-plot log axes with true log-space histogram binning
- **Subplot figures:** any plot becomes an r × c grid of subplots with
  optional shared axes — one canvas, one exported image
- **Plot annotations and dual axes:** free-text notes (draggable,
  persisted), and a per-series right Y axis with color-coupled axis
  titles for distinct quantities
- **Filters:** per-series predicates with AND/OR logic, comparisons, numeric
  ranges, and categorical sets
- **Datetime axes:** ISO 8601, MM/DD/YYYY, DD/MM/YYYY — ambiguous formats
  prompt once per column
- **Multiple datasets and series**, reorderable, individually styleable,
  color-blind-safe default palette (Okabe-Ito)
- **Data tools (Σ per dataset):** summary statistics, paginated data
  preview, cleaning operations (rename, drop, cast, missing values),
  cast to datetime, column reorder, computed columns, group comparison
  (parametric: Welch t-test / one-way ANOVA; rank-based: Mann–Whitney U /
  Kruskal–Wallis; paired columns: paired t / Wilcoxon signed-rank — every
  p-value reported with its effect size and sample sizes),
  Pearson correlation heatmap, cleaned-CSV export
- **Export:** PNG, SVG, **Export all** (one numbered PNG per visible plot —
  your browser may ask once to allow multiple downloads), ZIP of saved
  plots, full-session JSON (reload your entire workspace later), style
  presets with selectable categories (style / export size / typography /
  frame & grid)
- **Working with Excel data:** DataLab reads CSV only (a deliberate
  security decision — see PLANNING.md). In Excel: File → Save As →
  CSV UTF-8, then drop the file in
- **Performance:** WebGL rendering above 10k points; 10 series × 50k rows
  renders in well under a second
- **Accessibility:** WCAG 2.1 AA (axe-verified), full keyboard operation —
  press **?** in the app for shortcuts

## Security and data confidentiality

DataLab is designed for sensitive data. Your data **never leaves your
machine**:

- A Content Security Policy embedded in the file blocks all network access
  at the browser level (`default-src 'none'`)
- No analytics, telemetry, or error reporting of any kind
- No cookies, localStorage, or any persistence — closing the tab erases
  everything except files you explicitly exported
- Every release publishes the artifact's SHA-256 hash; bundled libraries
  (Plotly 2.32.0, PapaParse 5.4.1, JSZip 3.10.1) are pinned by hash in
  `DEPENDENCIES.md` and verified at build time
- The source is intentionally unobfuscated — security teams are encouraged
  to audit `src/` before approving use

## Building from source

```
git clone <this repository>
cd datalab
git config core.hooksPath .githooks   # one-time: activates the security pre-commit hook
node build.js          # produces datalab.html and prints its SHA-256
```

No dependencies are downloaded at build time — everything is in the
repository. Tests (requires `npm install` for Playwright, dev-only):

```
npm install
npx playwright install chromium
npx playwright test                       # functional suite
BENCH=1 npx playwright test tests/bench.spec.js   # release benchmarks
```

## Project documentation

- `PLANNING.md` — roadmap, team roles, phase history
- `STANDARDS.md` — engineering standards (security, testing, accessibility)
- `CHANGELOG.md` — release history with state-schema notes
- `DEPENDENCIES.md` — pinned library versions and hashes

## License

MIT
