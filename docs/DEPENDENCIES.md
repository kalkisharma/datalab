# DataLab — Bundled Library Dependencies

All libraries are bundled into `datalab.html` at build time. `build.js` verifies each
file's SHA-256 hash against this table before bundling — a mismatch aborts the build.

| Library | Version | File | Source URL (hash-verified) | SHA-256 |
|---------|---------|------|----------------------------|---------|
| Plotly.js | 3.6.0 | `lib/plotly.min.js` | https://cdn.plot.ly/plotly-3.6.0.min.js | `41a395c2d558d13d3655a1ebafaa67a072c2c1ac8c269e0ee67e18c9a137ac99` |
| Papa Parse | 5.4.1 | `lib/papaparse.min.js` | https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js | `b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb` |
| JSZip | 3.10.1 | `lib/jszip.min.js` | https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

Source URLs were recorded retroactively at the Phase 11 doc review (STANDARDS §9
requires them; the original table lacked the column) and verified by downloading
each URL and confirming an exact hash match against the pinned values. **The hash,
not the URL, is authoritative** — a CDN can change; the bytes cannot.

## Notes

- **Line endings:** `lib/*.js` are exempt from git eol normalization via
  `.gitattributes` — conversion on a fresh clone would change the bytes and abort
  every build. Do not remove that exemption.
- **Dev-only dependencies** (`@playwright/test`, `@axe-core/playwright`, and
  `@guidepup/guidepup` — the NVDA speech-capture harness added at v2.8.0) are
  not bundled, never ship to users, and are out of scope for this table. They
  follow the normal npm lockfile. `@guidepup/guidepup` drives a real,
  separately-installed NVDA (via `npx @guidepup/setup`) and pulls in no
  runtime code — it is a test tool, not an app dependency.
- **Currency:** Plotly.js is **current at 3.6.0** (migrated at Phase 18, v2.12.0 —
  the long-standing "two major versions behind" note is retired). The API-delta
  spike (Phase 17) found DataLab's surface clean against every 3.0.0 breaking
  change; the v2.12.0 re-baseline (full suite + axe + benchmarks, with WebGL
  rendering verified under the CSP) confirmed no behavior change. Reassessed at
  each phase exit per STANDARDS §10; CVE policy in §5 overrides.
- **Reassessment log** (§10 requires the reassessment; this log makes it auditable —
  added at the Phase 12 doc review after the v2.4.0 reassessment went unrecorded):
  - v2.4.0 exit: no changes — Plotly 2.32.0 covers the violin trace natively;
    no applicable CVEs flagged for the pinned versions; the decision above stands.
  - v2.5.0 exit: no changes — the computed-column expression engine is
    hand-written by design (a parser library was considered and rejected at the
    Phase 11 security spike: third-party parsers are exactly the supply surface
    §9 minimizes); zero new dependencies; pins stand. *(Recorded at the Phase 13
    review — the entry was missed at the exit itself, which is why the
    reassessment log is now a §4 release-checklist line.)*

  - v2.6.0 exit: no changes — the t/F p-value numerics (log-gamma,
    regularized incomplete beta) are hand-written like the Phase 12 parser,
    same §9 reasoning; zero new dependencies; pins stand.

  - v2.7.0 exit: no changes — heatmap and dual-Y use Plotly 2.32.0 natives
    (heatmap trace, overlaying axes); zero new dependencies; pins stand.

  - v2.8.0 exit: no changes — the rank/paired test numerics (normal CDF,
    regularized incomplete gamma) are hand-written like the Phase 12/13
    numerics, same §9 reasoning; zero new dependencies; pins stand. The
    Plotly 3.x migration is now formally scheduled (its API-delta spike
    runs during the interpolated-contour phase), which answers this note's
    currency question with a plan rather than another reassessment.

  - v2.9.0 exit: no changes — the legend/colorbar work uses Plotly 2.32.0
    natives (discrete legend traces, `marker.colorbar`, `legend.itemsizing`)
    and the `@guidepup/guidepup` NVDA harness added at v2.8.0 stays a
    dev-only, never-bundled tool; zero new bundled dependencies; pins stand.
  - v2.9.1 hotfix: no changes — a one-line grid-visibility fix, no
    dependency surface touched.
  - v2.10.0 exit: no changes — interpolated contours are hand-written
    (`gridScattered`: binned-mean gridding + convex-hull mask + harmonic
    Laplace fill, `grid-interp.js`), zero new bundled dependencies. The
    Plotly 3.x API-delta spike ran this phase (LOW RISK — DataLab's surface
    is clean against every 3.0.0 removal; target 3.6.0; see PLANNING Phase
    18); the migration itself remains Phase 18. Pins stand.
  - v2.11.0 exit: no changes — the Workspace & Encoding Ergonomics features
    (copy/paste series, legend/stats/plot visibility toggles, on-screen export
    sizing, subplot shared encoding, optional scatter join) use Plotly 2.32.0
    natives and reuse the existing parity `innerJoinRows`; zero new bundled
    dependencies. Pins stand.
  - v2.12.0 exit: **Plotly.js 2.32.0 → 3.6.0** (the planned Phase 18 migration).
    New pin + source URL + SHA-256 recorded in the table above; `build.js` hash
    verification updated and green; full re-baseline (suite + axe + benchmarks,
    WebGL under the CSP) clean. PapaParse and JSZip unchanged. Security + EL
    signed off on the new pin (§9).
  - v2.13.0 exit: no changes — Stabilization A (correctness/honesty fixes,
    same-dataset parity, line color-by) added no bundled dependencies. Pins
    stand. *(Recorded at the v2.14.0 release — this line was missed at the
    v2.13.0 tag; the §4 checklist item caught the gap on the next pass.)*
  - v2.14.0 exit: no changes — the encoding & style controls (size-by law/
    range/legend, marker shape, line marker-toggle/colour/style) are all
    client-side Plotly rendering options; zero new bundled dependencies.
    Pins stand.
  - v2.15.0–v2.21.0 (Visualization & Encoding Polish batches; recorded together
    at the v2.26.0 doc review — the per-release lines were missed at each tag):
    no changes across the span — parity fits/exports, best-fit styling, contour
    shading + colorbar controls, the colormap fix (`colorscales.js`
    `resolveColorscale`, hand-written) and per-plot/series colormap overrides,
    and the parity readout controls are all client-side Plotly render options +
    hand-written mapping; zero new bundled dependencies. Pins stand.
  - v2.22.0 exit: no changes — per-subplot labels/titles + plot-level shared
    colorbar use Plotly `layout.grid` + `coloraxis`/`colorbar` natives; zero new
    bundled dependencies. Pins stand.
  - v2.23.0 exit: no changes — the parity 3-way bridge join reuses the existing
    hand-written `innerJoinRows`/`bridgeJoinRows`; zero new bundled dependencies.
    Pins stand.
  - v2.24.0 exit: no changes — pair plots / SPLOM used a Plotly `splom` (WebGL)
    trace; zero new bundled dependencies. Pins stand.
  - v2.25.0 exit: no changes — the pair plot was rebuilt on **native SVG
    `scatter` + `histogram` grid traces** (replacing the `splom` WebGL trace that
    dead-ended on no-WebGL browsers); still a Plotly render-option change, zero
    new bundled dependencies. Pins stand.
  - v2.26.0 exit: no changes — statistical diagnostics (Q–Q, residual, CI/PI
    bands) add two hand-written `specfun.js` functions (`normalInv` Acklam
    approximation, `tQuantile` bisection on the existing t CDF — same §9
    "hand-write the numerics, don't add a stats library" reasoning as the
    Phase 6/8 p-value work) and use Plotly `scatter`/filled-`toself` traces;
    zero new bundled dependencies. Plotly stays **3.6.0**, PapaParse 5.4.1,
    JSZip 3.10.1. Pins stand.

## Updating a library

1. Replace the file in `lib/` from its official source URL.
2. Recompute the hash:
   `node -e "const c=require('crypto'),f=require('fs'); console.log(c.createHash('sha256').update(f.readFileSync('lib/<file>')).digest('hex'))"`
   (or `Get-FileHash lib/<file> -Algorithm SHA256` / `shasum -a 256 lib/<file>`)
3. Update the table row — version, source URL, and hash together.
4. Security Engineer + Engineering Lead sign-off before merging (STANDARDS §9).
