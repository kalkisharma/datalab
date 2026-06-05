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
- **Dev-only dependencies** (`@playwright/test`, `@axe-core/playwright`) are not
  bundled, never ship to users, and are out of scope for this table. They follow
  the normal npm lockfile.
- **Currency (Phase 11 review):** Plotly 2.32.0 is pinned two major versions behind
  current. Deliberate for now — a Plotly 3.x migration is its own future phase
  (breaking API review, full regression + benchmark re-baseline), not a routine
  bump. Reassessed at each phase exit per STANDARDS §10; CVE policy in §5 overrides.

## Updating a library

1. Replace the file in `lib/` from its official source URL.
2. Recompute the hash:
   `node -e "const c=require('crypto'),f=require('fs'); console.log(c.createHash('sha256').update(f.readFileSync('lib/<file>')).digest('hex'))"`
   (or `Get-FileHash lib/<file> -Algorithm SHA256` / `shasum -a 256 lib/<file>`)
3. Update the table row — version, source URL, and hash together.
4. Security Engineer + Engineering Lead sign-off before merging (STANDARDS §9).
