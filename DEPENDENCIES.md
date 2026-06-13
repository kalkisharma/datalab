# DataLab — Bundled Library Dependencies

All libraries are bundled into `datalab.html` at build time. `build.js` verifies each
file's SHA-256 hash against this table before bundling — a mismatch aborts the build.

| Library | Version | File | Source URL (hash-verified) | SHA-256 |
|---------|---------|------|----------------------------|---------|
| Plotly.js | 2.32.0 | `lib/plotly.min.js` | https://cdn.plot.ly/plotly-2.32.0.min.js | `0a17719a72751704861215da0e5c5cdb3f9a8d50eff5cb84cb6f8b80786682b0` |
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
- **Currency (Phase 11 review):** Plotly 2.32.0 is pinned two major versions behind
  current. Deliberate for now — a Plotly 3.x migration is its own future phase
  (breaking API review, full regression + benchmark re-baseline), not a routine
  bump. Reassessed at each phase exit per STANDARDS §10; CVE policy in §5 overrides.
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

## Updating a library

1. Replace the file in `lib/` from its official source URL.
2. Recompute the hash:
   `node -e "const c=require('crypto'),f=require('fs'); console.log(c.createHash('sha256').update(f.readFileSync('lib/<file>')).digest('hex'))"`
   (or `Get-FileHash lib/<file> -Algorithm SHA256` / `shasum -a 256 lib/<file>`)
3. Update the table row — version, source URL, and hash together.
4. Security Engineer + Engineering Lead sign-off before merging (STANDARDS §9).
