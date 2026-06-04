# DataLab — Bundled Library Dependencies

All libraries are bundled into `datalab.html` at build time. `build.js` verifies each
file's SHA-256 hash against this table before bundling — a mismatch aborts the build.

To update a library: replace the file in `lib/`, recompute the hash with
`node -e "const c=require('crypto'),f=require('fs'); console.log(c.createHash('sha256').update(f.readFileSync('lib/<file>')).digest('hex'))"`,
update the entry below, and get Security Engineer + Engineering Lead sign-off before merging.

| Library | Version | File | SHA-256 |
|---------|---------|------|---------|
| Plotly.js | 2.32.0 | `lib/plotly.min.js` | `0a17719a72751704861215da0e5c5cdb3f9a8d50eff5cb84cb6f8b80786682b0` |
| Papa Parse | 5.4.1 | `lib/papaparse.min.js` | `b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb` |
| JSZip | 3.10.1 | `lib/jszip.min.js` | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
