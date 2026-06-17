# Engineering Standards — DataLab

## 1. Commits

- Commit after each **logically complete unit of work** — one feature, one fix, one refactor. Never mid-implementation.
- The build (`datalab.html`) must succeed before committing. Broken builds never land on `master`.
- Once the Playwright suite exists (Phase 0 exit), no commit lands with failing tests.
- Before the Playwright suite exists, commits to any file under `src/js/` require a manual smoke test; describe what was tested in the commit message.
- Never use `--no-verify`. If a hook fails, fix the underlying issue — do not bypass it.
- Commit message format: `type(scope): short description`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `a11y`
  - Example: `feat(scatter): add color-by column support`
- No `WIP` commits on `master`. Use a feature branch.

## 2. Branching

- `master` is always releasable.
- Branch naming: `phase/0-foundation`, `feat/scatter-renderer`, `fix/eschtml-hover`, `hotfix/v0.1.1-filter-crash`
- Feature branches must **rebase onto `master`** before merge. No merge commits from feature branches.
- If `master` has a pre-commit hook failure from an upstream commit, branch off the last clean `master` commit as a rebase target — this is not a policy exception.
- When two feature branches are ready to merge simultaneously, first-merged wins; second branch must rebase before merging.
- Stale branches are reviewed and cleaned at each phase exit.
- A reviewer must review the branch before it merges. If the reviewer and author disagree on a UX or design decision, see §12 for conflict resolution.
- **Solo-maintainer provision** (added at the Phase 11 doc review, reconciling the standard with five phases of actual practice): while the project has a single human maintainer, direct commits to `master` are permitted when the full Playwright suite is green at commit time and the work is a logically complete unit per §1. The branch + reviewer flow becomes mandatory again the moment a second human contributes. Phase-exit review gates (refactor review, security checklist, DS sign-off) are unaffected — they apply in both modes.

## 3. Versioning (Semver)

- **MAJOR** (`1.x.x → 2.x.x`): Breaking change to session JSON schema, OR a change that silently alters the output of existing saved sessions (e.g., changing the behavior of an existing filter `op` string).
- **MINOR** (`x.1.x → x.2.x`): New chart type, new major feature, or a full phase ships.
- **PATCH** (`x.x.1 → x.x.2`): Bug fix, security fix, performance improvement, style tweak.
- Pre-1.0 phases map to minor versions: Phase 1 = `v0.1.0`, Phase 2 = `v0.2.0`, etc.
- Version has exactly one source of truth: `VERSION` constant in `state.js`. Nowhere else.
- **Versions are assigned at ship time, by ship order — never pre-baked.** A scoped-but-unshipped phase carries NO hard version in its PLANNING header (use a placeholder: "version set at exit", "next MINOR when scheduled", or "set by the <X> spike"). The maintainer reorders phases freely, so a pre-assigned version goes stale the moment ship order changes. Added at the v2.11.0 review after "Workspace & Encoding Ergonomics" shipped ahead of the scoped Phase 18/19 and took the `v2.11.0` that Phase 19's header had hard-coded. A phase's **name** is its identity; its **number** tracks plan order and its **version** tracks ship order — the three can legitimately diverge (a named phase may ship between two lower-numbered scoped ones). Shipped phases are never renumbered to make the sequence contiguous — that churns recorded history (the Phase 14 record-correction lesson). Phases 10/12/17/18 already followed this with "version set by outcome/spike"; it is now the rule for all unshipped phases.
- All serialized session state carries a `version` field starting at `1` from day one.
- **Schema change definition:** A migration stub is required when a required field is added, removed, renamed, or changes type. Adding a new optional field with a backward-compatible default does not require a migration. Adding a new filter operator type does not require a migration (parsed values are stored, not formats). Changing the behavior of an existing operator is a MAJOR version bump.
- **Documented-deferral carve-out** (added Phase 13 scoping, log-binning case): when a stored setting is warned-and-ignored with the warning explicitly naming the deferred work, later honoring that setting is **completing the contract, not silently changing it** — MINOR. The user opted in; the warning was the IOU. The Phase 13/14 scoping notes relied on this reasoning before it was written here; now it is policy rather than per-phase argument.
- **Statistical correctness carve-out** (added Phase 8 scoping, NSE finding): a fix that changes displayed statistical output to match the *documented definition* of the statistic is a correctness fix — PATCH (or rides the phase's MINOR), **not** MAJOR, even though re-rendered sessions show different numbers. The session data itself is untouched; only a wrong computation is corrected. Requires: Data Scientist sign-off, a `## Corrections` entry in `CHANGELOG.md` stating old vs new behavior, and updated reference tests. Silently *redefining* a statistic (changing which definition is documented) remains MAJOR.
- Schema changes are logged in `CHANGELOG.md` under a `## Schema` section per version. Owned by the Data Engineer, updated as part of the release checklist. This covers **all file formats the app reads or writes** — session state, style presets, exported CSV conventions — not only session state.

## 4. Releases

- A release = a tagged git commit + a built `datalab.html` artifact.
- Releases happen **at phase exits only** — except hotfixes (see §5).
- Phase 0 is internal only — no release tag.
- Phase exit sequence: refactor review → security checklist → accessibility pass → Data Scientist sign-off → release checklist → tag.
- Release checklist (all must be green before tagging):
  - [ ] All phase exit criteria checked off in the plan
  - [ ] Build passes
  - [ ] Full Playwright suite is green
  - [ ] `bench.spec.js` full benchmark run passes (Phase 2 onward)
  - [ ] Security checklist reviewed
  - [ ] `CHANGELOG.md` updated including `## Schema` section if applicable
  - [ ] Version bumped in `state.js`
  - [ ] Refactor review completed
  - [ ] §6 line-count sweep run over `src/` (`wc -l`) — every file over the ~300 trigger has a recorded review-or-split decision from this phase (added Phase 15 review: wiring.js crossed the trigger unnoticed at the Phase 14 exit while three other files were reviewed by name, and the recorded counts for those three were never true of any committed tree — the trigger was being enforced from memory, not measurement). **Run the command, do not recall the numbers:** at the Phase 16 exit the very first draft of the sweep note again claimed "no file crossed the trigger" while modal-fields.js sat at 357 — the same slip, caught only by actually running `wc -l`. The sweep has now paid for itself twice.
  - [ ] Accessibility pass completed for all panels introduced that phase
  - [ ] Data Scientist sign-off on statistical correctness and exploratory test findings
  - [ ] Release artifact rebuilt from a **clean working tree** as the final step before tagging — `git status` shows `datalab.html` unmodified, i.e. the build output byte-equals the committed blob (added v2.10.0 review: `src/` files are not `-text`, so a checkout flips them LF↔CRLF and a build from freshly-written sources can differ from a build off the checked-out tree; the released artifact must be the one the canonical checked-out tree produces — see §9)
  - [ ] SHA-256 hash of `datalab.html` generated by `build.js` and published in release notes
  - [ ] QA verifies downloaded release file hash matches published hash
  - [ ] `DEPENDENCIES.md` reassessment log appended for this release (even when the entry is "no changes") — added Phase 13 review after the log was created at one review and missed at the very next exit
  - [ ] PLANNING.md file tree reflects files added/removed this phase — added Phase 13 review for the same reason (the schema sketch it accompanied was removed outright; `state.js` is the schema documentation)
  - [ ] Stale branches cleaned
- Tag format: `v0.1.0`, `v1.0.0`, etc.

## 5. Hotfix Process

- A hotfix is a critical bug or security issue in a released version that cannot wait for the next phase exit.
- Cut a branch from the release tag: `hotfix/v0.1.1-description`.
  - **Solo-maintainer carve-out** (added v2.9.1 review, reconciling §5 with the §2 direct-to-master reality): while there is a single human maintainer, a hotfix may be committed directly to `master` *without* a branch-from-tag **only when** every commit on `master` since the last release tag is non-behavioral (docs, tests, planning — nothing that changes `datalab.html`), the full suite is green, and the fix is isolated. Verify with `git diff --stat <lastTag>..HEAD -- src/ lib/` before tagging. If `master` carries **any** unreleased behavioral change that must not ship in the patch, the branch-from-tag flow is mandatory even solo — the patch must contain only the fix. (v2.9.1 met the carve-out: the only `src/` deltas since v2.9.0 were the grid fix and the version bump; the three intervening commits were docs/tests.)
- Fix must include a regression test (or a documented reproduction case for visual/performance issues).
- Gets a PATCH version bump. Creates a new tag (from the hotfix branch, or from `master` under the carve-out above).
- `CHANGELOG.md` updated with a `[hotfix]` entry.
- Dependency CVE policy: critical CVE — patch before any other work resumes (this is a local file:// tool with no server exposure; urgency is real but not emergency). Moderate CVE — next phase exit.
- Each release publishes a SHA-256 hash of `datalab.html` in the GitHub release notes alongside the file. The README instructs users to verify the hash before use. Hash generation is part of `build.js` — output to stdout at build time and included in the release checklist.

## 6. Refactor Reviews

- Triggered when:
  - A phase exits (mandatory — scope is everything written that phase)
  - A source file exceeds ~300 lines (applies to all maintained files under `src/`, including HTML and CSS; generated artifacts like the built `datalab.html` are exempt)
  - A new renderer is added (review `shared.js` + the new renderer together)
- A refactor must **not change behavior** — must be accompanied by a passing test run.
- Scoped to one file or module at a time. No whole-codebase sweeps mid-phase.
- No refactor reviews during Phase 0.

## 7. Renderer Rules

- All renderers must conform to the interface defined in `shared.js`. The interface is a comment block at the top of `shared.js` — it is the contract.
- The Data Visualization Engineer authors the interface definition; the Engineering Lead approves it. Both are **Phase 0 exit criteria** — no Phase 1 renderer work begins without an approved interface.
- "Team review" for renderer interface deviations means: Engineering Lead + at least one domain-relevant role (Data Viz Engineer, Data Scientist, or Data Engineer). Minimum 2 reviewers.
- Log scale guidance for each chart type is documented in a comment at the top of each renderer. Data Viz Engineer writes it; Data Scientist reviews before the renderer merges.

## 8. Security Rules

- `eval()` and `new Function()` are permanently forbidden. No exceptions.
- **Expression evaluation rule** (added at landscape review, ahead of any computed-column feature): any future feature that evaluates user-written expressions (formula columns, custom filters, derived axes) must use a hand-written tokenizer + AST evaluator over an allowlisted operator/function set. No string-to-code path of any kind — no `eval`, no `Function`, no `setTimeout(string)`, no dynamically built `import()`. The parser design requires Security Engineer authorship review *before* implementation begins, modeled on the design-spike process.
- Every `innerHTML` assignment must have an inline comment listing which values are escaped and confirming `escHtml()` coverage.
- `escHtml()` is required on every value interpolated into a **DOM HTML-injection sink** — `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` — including series names, filter values, column names, dataset names, category strings, and renderer error messages before DOM insertion. These are the dropdown menus, the dataset/series lists, the modal, and panel error containers.
- **Plotly trace and layout text is a distinct, separately-enforced case** (clarified at the v2.9.0 doc review, with an injection test as the evidence): values placed into Plotly `hovertemplate` strings, trace `name`s, axis/plot/colorbar **titles**, and legend entries are rendered by Plotly as inert SVG text — embedded HTML and event handlers do **not** execute (verified: a `"><img src=x onerror=…>` column name rendered into a hovertemplate does not fire). These sinks are **not** manually `escHtml()`-escaped, because doing so would double-escape visible text (a column named `A&B` would show `A&amp;B`). Their safety is enforced by the **Playwright XSS injection suite** — which covers column-name-in-hovertemplate, plot title, axis labels, and the colorbar label — *not* by manual escaping. Any new Plotly text sink that carries user data must add an XSS suite case rather than reach for `escHtml()`. (The earlier §8 wording listed "titles, labels, hovertemplate" under the escHtml requirement; no renderer ever did that and the suite proved it unnecessary — the rule now matches six-plus phases of tested practice.)
- Column name escaping contract (see also `parseCSV()`): raw trimmed column names are used for display in dropdown menus. `escHtml()`-escaped versions are used only when interpolated into `innerHTML` contexts. This contract is documented in a comment in `parseCSV()` — that comment is a **Phase 0 deliverable**.
- When committing changes to `ui.js`, `wiring.js`, or any renderer: a pre-commit hook automatically greps for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` and confirms all sites are annotated. This hook must never be bypassed. **Location (amended Phase 11 scoping):** the hook is version-controlled at `.githooks/pre-commit` and activated per clone with `git config core.hooksPath .githooks` (documented in the README) — a hook living only in `.git/hooks` dies on reclone, which is how it was lost to begin with.
- Filter parser changes must include a commit message note: confirm no `eval()` path exists and describe how predicates are evaluated. Reviewer checks this before merging.
- No external `<script src>`, `<link href>`, or `fetch()` calls — permanently forbidden. (The original "for Phase 1–4" qualifier was a fossil from when only four phases were planned, removed at the Phase 15 review — §9 had already made the ban unconditional.) All resources go through `build.js`. `URL.createObjectURL()` is explicitly permitted for local CSV file handling.
- CSS injection rules: dynamically created `<style>` elements are forbidden. No user-controlled data ever reaches CSS text. User data may only reach element styling via the style property API (`element.style.color = value`) — never via string concatenation into CSS text or `setAttribute('style', ...)`. Style API property assignments are safe — browsers parse the value strictly for that property and cannot escape into other declarations.
- **Dataset color validation:** user-supplied color values are validated at input time via regex. Only two formats are accepted:
  - Hex: `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`
  - RGBA (comma-separated, decimal alpha only): `/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/`
  - No named colors, no CSS variables, no color functions, no modern space syntax. Invalid values are rejected with an error message.
- No `localStorage`, `sessionStorage`, or cookies — session-only state.
- Blob URLs revoked after download.
- Playwright XSS injection test runs on every PR once the suite exists.
- Security checklist reviewed at every phase exit.

## 9. Data Confidentiality

DataLab is used by private organisations loading sensitive data. The tool must guarantee that no loaded data — CSV rows, column names, filter values, plot titles, or any derivative — ever leaves the user's machine through any channel.

### Network isolation

- **Content Security Policy:** the built `datalab.html` embeds a `<meta>` CSP tag as the first element inside `<head>`. The approved policy is:
  ```
  default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none';
  ```
  `connect-src` inherits `'none'` from `default-src` — this is the critical directive and blocks all network requests at the browser level as a last line of defence.
- The CSP meta tag is generated by `build.js` and verified by `tests/smoke.spec.js` as an exact string match. Any deviation from the approved policy fails the test.
- **Prohibited network APIs** — permanently forbidden, no exceptions. The pre-commit hook greps both `src/js/**` and `src/index.html` for all of these:
  - `fetch(`, `XMLHttpRequest`, `$.ajax`, `axios`
  - `new WebSocket(`, `WebSocket(`
  - `new RTCPeerConnection(`, `RTCDataChannel`
  - `navigator.sendBeacon(`, `sendBeacon(`
  - `ping=` attribute in HTML files
  - `history.pushState(`, `history.replaceState(` encoding user data
  - Any `new Worker(` call not covered by the worker allowlist (see below)
- **Worker allowlist:** blob: workers used by Plotly are permitted; remote URL workers are not. Every `new Worker(` call in the codebase must be inside a function whose name is declared in a `// WORKER_ALLOWLIST: <functionName>` comment at the top of the same file. The pre-commit hook verifies this. Any unlisted `new Worker(` fails the hook.
- `URL.createObjectURL()` is explicitly permitted for local CSV file handling and Plotly blob: workers — these are local-only browser APIs with no network access.
- **CSP changes** require Security Engineer authorship and Engineering Lead sign-off before merging. The approved CSP string is defined as a constant in `tests/smoke.spec.js` and verified as an exact match against the built HTML on every PR.

### Client-side persistence

- `localStorage`, `sessionStorage`, `indexedDB`, `cacheStorage`, `CookieStore`, and service workers are permanently forbidden. Any of these could persist user data between sessions or across origins.
- Session state lives in `appState` in memory only. It is lost when the tab is closed — by design.
- No state, dataset content, column names, filter values, or any user-derived data may be placed in URL hash, query string, or any URL component. `history.pushState()` and `history.replaceState()` may not encode user data.

### Build and release integrity

- Bundled libraries (Plotly, PapaParse, JSZip) are pinned to exact versions in `DEPENDENCIES.md`. Each entry records: library name, version, source URL, and SHA-256 hash of the file as bundled.
- `build.js` verifies each library file's SHA-256 hash against `DEPENDENCIES.md` before bundling. A hash mismatch aborts the build with an error.
- `DEPENDENCIES.md` is owned by the Security Engineer. Updates require Engineering Lead sign-off.
- The built `datalab.html` SHA-256 hash is output by `build.js` at build time and published in the GitHub release notes. Users are instructed in the README to verify this hash before use.
- **The authoritative hash is the hash of the downloadable release asset** (amended after the first publish, where eol normalization made the committed blob hash differently from the build output). `.gitattributes` marks `datalab.html` and `lib/*.js` as `-text` so the committed blob and release asset keep their exact built bytes — that exemption must never be removed. **The `src/` files are deliberately NOT `-text`** (clarified v2.10.0 review): a checkout flips their line endings per the local autocrlf setting, so `datalab.html` is only reproducible *from the checked-out tree* — a build run against freshly-written, not-yet-normalized sources can hash differently. The released artifact must therefore be the one the **canonical checked-out tree** produces: the final `build.js` run happens on a clean tree and `git status` must show `datalab.html` unmodified before tagging (a §4 release-checklist line). Marking `src/` `-text` to make the build platform-independent was considered at this review and **not adopted** — it would churn every source file's bytes for a solo single-platform repo where the clean-tree gate already guarantees committed blob = asset; revisit if a second contributor or platform joins. Post-publish, QA downloads the asset back and verifies it against the published hash before the release is announced; a mismatch is a release blocker. (Caught at the v2.10.0 exit: a feature-branch build from LF sources hashed differently from the rebuilt blob off the checked-out CRLF tree; the release commit was corrected to the reproducible artifact before tagging.)
- No telemetry, analytics, error reporting, or any third-party tracking is ever included — permanently forbidden. This includes but is not limited to: Google Analytics, Sentry, Mixpanel, Datadog, and any equivalent service.

### Audit guidance

- Because DataLab handles sensitive organisational data, the source code is intentionally readable and unobfuscated. Security-conscious organisations are encouraged to audit `src/` before use.
- The README links to the source repository and explains the build process so organisations can build from source if preferred.

## 10. Dependency Policy

- No dependency updates mid-phase unless patching a CVE.
- Dependencies (Plotly, PapaParse, JSZip) reviewed and updated at phase exits only.
- Any new dependency requires team agreement before it's added.
- The build system (`build.js`) is the sole mechanism for including resources in `datalab.html`. If a resource isn't processed by `build.js`, it cannot appear in the output.

## 11. Performance

- Performance targets are **binding** from the phase they're introduced:
  - Phase 2+: 10 series × 50k rows, **warm render** (memoized path) < 2s
  - Phase 3+: **cold render** < 5s; filter re-evaluation < 500ms at 100k rows
- Warm render benchmark tests the memoized path (post-Phase 2 cache). Cold render path tested separately as informational (soft assertion, no hard failure).
- Freedman-Diaconis IQR computation (histogram, Phase 3+) is included in warm render timing. If it becomes a bottleneck at large scale, a transient render cache (not serialized state) may be added by the Performance Engineer — this does not require a migration.
- Benchmark: `tests/bench.spec.js` in the Playwright suite. Wraps `Plotly.react()` with `performance.now()` markers. Runs 3 times and takes the median. If stddev exceeds 20% of the median, re-run up to 3 full medians (9 total runs). After 9 unreliable runs, file a task to diagnose the environment — the release is not blocked by environment noise, only by genuine performance failures.
- Cold render test is present as a pending test in `tests/bench.spec.js` from Phase 1 forward. It becomes binding in Phase 3.
- Reference environment: Chrome latest, local machine. CI runner results are informational only — not binding.
- `tests/bench.spec.js` runs on release. A smoke render test (load one CSV, add one scatter series, assert no JS errors and a non-empty `<svg>`) runs on every PR — lives in `tests/smoke.spec.js`.
- A commit to a renderer or filter path that regresses a binding target is blocked until fixed.
- Benchmark thresholds are jointly owned: QA writes and maintains the tests; Performance Engineer defines the thresholds and signs off on the benchmark reference dataset spec. Disagreements go to Engineering Lead.

## 12. UX

- Any new modal or major panel requires a written flow description — what the user sees, in what order, what each action does, including error states and empty states — written in the task or issue **before the branch is created**.
- Applies to modals and major new panels. Not required for small UI additions.
- **Conflict resolution:** When a UX or design conflict is identified (reviewer comments "UX conflict" or "design conflict" on the task), an Engineering Lead review task is created. The branch is blocked until the EL task is closed. Both parties write their positions in the task; the Engineering Lead reviews both and decides before the branch merges.
- When the Data Scientist flags a misleading visualization: Data Scientist defines what "correct" looks like; UX Designer owns the redesign if it requires UI changes. Both must agree the fix is correct before it's closed. For default value changes (bin count, axis range, colormap), Data Scientist decides unilaterally — no UX involvement required.

## 13. Bug Fixes

- Every bug fix must include a regression test that would have caught the bug.
- Exception: visual rendering bugs and performance regressions that cannot be caught by Playwright require a documented reproduction case in a GitHub issue instead. The issue number must be referenced in the commit message.
- Same-sitting obvious fixes (< 5 lines, clearly trivial) may skip issue creation but must include a one-sentence reproduction description inline in the commit message.

## 14. Tests

- Test files live in `tests/` at repo root, named `*.spec.js`.
- Smoke render test: `tests/smoke.spec.js`. Performance benchmarks: `tests/bench.spec.js`. All other tests: `tests/*.spec.js`.
- Test naming convention: `describe('module/feature')` → `it('does X when Y')`. Names are timeless — no version numbers, no phase references. **Clarification (Phase 8 scoping):** this governs `describe`/`it` strings. Spec *files* named for the phase that introduced them (`phase3.spec.js` … `phase7.spec.js`) are accepted as historical grouping — five phases shipped with the convention and renaming would churn git history for no behavioral gain. New spec files should prefer feature names (`export.spec.js`, not `phase8.spec.js`).
- **Test data:** real-world and synthetic CSVs used for testing live in `tests/data/`. Committed synthetic datasets max 500KB each. Naming convention: `test_{descriptor}_{rows}rows.csv` (e.g., `test_scatter_1000rows.csv`). `tests/data/README.md` is owned by the QA Engineer and documents what datasets are needed, their specs, and where to obtain real-world datasets (which are not committed).
- **Flaky test policy:** If a test fails intermittently due to a race condition or timing assumption in the code, it is flaky — fix it. If pass/fail depends on factors outside the codebase (system load, wall-clock time, network state), it is inherently non-deterministic — delete it and replace with a deterministic equivalent.

## 15. Accessibility

- **Per-phase basic pass:** any new dynamic panel or modal introduced in a phase is reviewed against `ARIA_CHECKLIST.md` before that phase closes.
- **Phase 4 full audit:** complete ARIA audit of all panels and interactions, plus screen reader behavior testing.
- Screen reader testing: one full manual session with a real screen reader is the requirement. VoiceOver on macOS 13+ or NVDA on Windows — whichever matches the maintainer's hardware — counts as the primary session (amended Phase 8 scoping: the original VoiceOver-mandatory wording assumed macOS hardware the maintainer does not have, which is why the action item has been open since v1.0.0). The other remains best-effort.
- **Automated speech-capture session (amended Phase 15, v2.8.0 — maintainer attestation):** a scripted run that drives a *real* screen reader through the session protocol and captures its actual speech output (`tools/nvda-session.js`, real NVDA via guidepup) **may satisfy the primary-session requirement when the maintainer reviews the transcript and attests it**. It verifies the *mechanical* layer with evidence — role/title/focus announcements, `aria-live` timing, double-speak, unlabeled controls — which is most of what regresses. **It does not verify comprehension** (whether the spoken words make sense at speed); the Accessibility Specialist's position is on record that a transcript is a supplement, not a substitute, and this carve-out exists only because the maintainer owns the call. **The external-report trip-wire stays in force** (Phase 15+ pool): any reported real-world accessibility issue makes a full human listening session immediately blocking for the then-current phase. First exercised at v2.8.0: maintainer accepted the capture (mechanical protocol clean; the new `aria-live` verdict region speaks once and re-announces); the one finding (silent CSV load) is scoped to Phase 16.
- `ARIA_CHECKLIST.md` is owned by the Accessibility Specialist. Changes require sign-off from any two other roles.
- **Visually-hidden text:** use the `.sr-only` CSS class, defined in `style.css`, for all accessibility-only text. Standard implementation:
  ```css
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  ```
- **Plotly annotation accessibility:** Plotly annotations (e.g., NSE/MAE/RMSE stats on parity plots) do not support `aria-label` directly. Duplicate the annotation text in a visually-hidden `.sr-only` `<span>` adjacent to the plot. Implemented from Phase 1 onward; Accessibility Specialist reviews before Phase 1 exits.

**Minimum ARIA checklist (defined in `ARIA_CHECKLIST.md`):**
1. All interactive regions have correct `role` attributes
2. All icon-only controls have `aria-label`
3. Modals and slide-in panels manage focus on open and restore focus on close
4. All list-based UI supports keyboard navigation (arrow keys or Tab)
5. Tab order is logical and matches visual reading order

## 16. Phase Exits

- All exit criteria in the plan must be explicitly checked off before the phase closes.
- **Checkbox verification:** a deliverable is checked off only against evidence — a test that exercises it, a commit that contains it, or the behavior demonstrated. Bulk-checking a phase's checkbox block is forbidden; the Engineering Lead walks the list item by item at exit. (Added after two Phase 1 sub-items — session tabs and plot typography controls — were swept into a checked line without being built and survived four phase exits unnoticed.)
- A deliverable line that bundles several features (e.g. "save/restore; tabs; export") is split into one checkbox per feature before being checked.
- No Phase N+1 work begins until Phase N is tagged and closed. **Exception (added at landscape review): docs-only design spikes** for a future phase — producing planning text, schema drafts, and measurements, touching nothing under `src/` — may run during the current phase at EL discretion. The spike's output lands in PLANNING.md; its approval is a deliverable of the phase it runs in. A docs-only spike **cannot perform verification that requires swapping a dependency or running new code** — e.g. eyeballing render parity on a not-yet-adopted library version; that verification belongs to the implementing phase's re-baseline, not the spike (clarified v2.10.0 review: the Phase 17 Plotly-3.x spike delivered the static API-delta analysis and explicitly deferred render-parity eyeballing to the Phase 18 migration, since a library swap is code).
- Phase exit sequence: refactor review → security checklist → accessibility pass → Data Scientist sign-off → release checklist → tag.
- QA and Performance Engineer jointly confirm performance targets are met before tagging. Disagreements go to Engineering Lead.
- Data Scientist signs off on statistical correctness and exploratory test findings before tagging.

## 17. Document Ownership

- `PLANNING.md` — owned by the Engineering Lead. Updated at every phase exit to reflect closed deliverables, new phase scope, and any architectural decisions made during the phase.
- `STANDARDS.md` — owned by the Engineering Lead. Reviewed and updated at every phase exit.
- `ARIA_CHECKLIST.md` — owned by the Accessibility Specialist. Changes require sign-off from any two other roles.
- `CHANGELOG.md` — updated by whoever makes the change; `## Schema` section owned by the Data Engineer.
- `DEPENDENCIES.md` — owned by the Security Engineer. Updates require Engineering Lead sign-off.
- `build.js` — owned by the Frontend Developer. Security Engineer reviews any changes.
- CSP policy string — owned by the Security Engineer. Changes require Engineering Lead sign-off. The approved string lives in `tests/approved-csp.js` as the single source of truth (Phase 11 review correction: it was previously duplicated across smoke.spec.js and xss.spec.js while claiming singularity); both suites verify the built HTML against it.

## 18. Work Sequencing

- The Engineering Lead is responsible for determining what is worked on next within a phase.
- **Sequencing authority:** deliverables in PLANNING.md are listed in dependency order within each phase — this ordering is EL-maintained and authoritative. Items listed earlier must be completed before dependent items listed later. Items with no dependency between them may be worked in parallel; the EL annotates these with `(parallel-safe)` in the task or plan entry so any agent joining mid-phase can see it without reading every task.
- **Communication:** the EL tracks active and queued work in the session task system. PLANNING.md checkboxes are the permanent record of completion — not a live status board.
- **Blockers:** a blocker is any condition preventing a team member from starting or completing their next deliverable — undefined spec, unresolved conflict, failed dependency, or missing review. The EL identifies and resolves blockers before the blocked deliverable is assigned. Conflicts that are blockers still resolve via §12 — §18 governs when a conflict becomes a blocker, not how it resolves.
- **Security-critical ordering:** the Security Engineer may flag any deliverable as "must precede [concern area] work." The EL moves the flagged item to the earliest possible position — before any deliverable that touches the concern area — without deliberation. If the EL disagrees with the flag, they may ask the Security Engineer to justify with a concrete threat model. If the justification is insufficient, the EL may override — but must document the override and reasoning in the task. The Security Engineer documents their disagreement.
- **Cross-phase scope:** the EL sequences work within the current phase only. Moving a deliverable across phase boundaries requires a formal update to PLANNING.md — not informal reprioritization.
- **Review gate triggers:** the EL tracks when domain reviews are needed and prompts the relevant role. Defined triggers:
  - Data Scientist schema review: when the `appState` schema draft is declared complete by the Data Engineer and confirmed by the EL
  - Data Scientist metrics review: when a renderer PR containing metric calculations is ready to merge
  - Data Scientist colormap review: when a default colormap selection is made
  - Data Scientist exploratory test: when all other phase exit criteria are otherwise complete
  - Accessibility Specialist ARIA pass: when the full Playwright suite is green AND all panels introduced in the phase are feature-complete. The full suite (not just smoke) must be green before the pass begins
- **ARIA pass invalidation:** a panel change invalidates its ARIA pass if the change affects interactive behavior, focus management, DOM structure, or visible labels referenced by `aria-label` or `aria-labelledby`. CSS-only visual changes do not invalidate the pass. An invalidated pass must be re-done before phase exit.
- **Domain expert input:** any team member may flag a sequencing conflict to the EL ("X must come before Y because..."). The EL hears the reasoning and decides. Security-flagged sequencing conflicts are the only ones that move without EL deliberation.

## 19. Code Comments and File Headers

### Philosophy

- Comment the **why**, not the **what**. Function and variable names describe what code does — comments explain why it does it that way: hidden constraints, non-obvious invariants, workarounds for specific bugs, behavior that would surprise a reader.
- If removing a comment wouldn't confuse a future reader, don't write it.
- No commented-out code on `master` — delete it. Code review must reject it before merge.

### File headers

Every file in `src/js/` begins with a single-line header comment:
```js
// filename.js — one-line description of purpose
```
Example: `// data.js — CSV parsing, column classification, and filter evaluation`

No author names, dates, or ownership — that is git's job and PLANNING.md's job. Ownership is defined in the team roster, not in source files.

Exception: files with a formal contract (e.g., `shared.js` renderer interface) may have a multi-line block for the contract itself. This is a documented exception, not a general pattern.

### Function documentation

- No JSDoc by default.
- JSDoc is **required** for exported functions whose parameters or return shape are non-obvious to a reader unfamiliar with the codebase. Format: `@param` and `@returns` only — no `@author`, `@date`, `@version`.
- Self-evident one-liners are exempt even if exported (e.g., `escHtml(str)` → `string`).
- For complex non-exported helpers (> 20 lines, or non-obvious parameters or side effects): one plain comment line above the function describing the why. Not JSDoc.
- Security-contract comment blocks (§8, §9) and JSDoc serve different purposes — both are required where applicable and are not redundant.

### Section headers within files

Use section headers to group related functions when a file has distinct logical sections:
```js
// --- Parsing ---
// --- Classification ---
// --- Filtering ---
```
Use sparingly — if a file needs many sections, it is a signal to split the file instead.

### Pre-commit hook additions

The pre-commit hook greps `src/js/**` for:
- `console.log(` — forbidden on `master`
- `debugger` — forbidden on `master`

`console.warn(` and `console.error(` are permitted for genuine error reporting.

## 20. Statistical Correctness and Exploratory Testing

- The Data Scientist reviews and signs off on statistical correctness at every phase exit. No phase closes without this sign-off.
- **Correctness scope:**
  - Metric calculations: NSE, MAE, RMSE (Phase 1+); correlation, distribution fitting, summary statistics (Phase 5+)
  - Binning strategy: Freedman-Diaconis as default bin count rule for histograms (computed on demand at render time from column values — not cached in state)
  - Whisker and outlier logic for boxplots
  - Error bar semantics (Phase 9+): every error bar states what it represents — SD, SEM, CI, or source column. Unlabeled error bars are a correctness violation, not a style choice
  - Regression/trendline fitting (Phase 9+): formula, goodness-of-fit reporting (R²), and reference tests hand-derived per the reference-value rule below
  - Aggregation defaults (Phase 9+): silent aggregation is forbidden — when a chart aggregates rows, the aggregation is user-chosen and displayed
  - Computed-column evaluation semantics (Phase 12+): NaN propagation follows the missing-value rules; materialization is one-shot (source edits never silently recompute — provenance)
  - Hypothesis-test reporting (Phase 13+): a p-value is never displayed without its effect size and per-group sample sizes — promoted from the Phase 13 scoping decision because it generalizes to every future test, exactly as the no-silent-aggregation rule did
  - Colormap perceptual uniformity and accuracy
  - Axis scale appropriateness (log vs. linear) and axis range defaults
  - Axis range manipulation — auto-range is acceptable for most chart types; parity plots require equal axis ranges (same min/max for X and Y, explicitly set in the renderer, not left to Plotly auto-range)
  - Filter operator behavior on real data
- **Axis scale guidance per chart type:** documented in a comment at the top of each renderer. Data Viz Engineer writes it; Data Scientist reviews before the renderer merges.
- **Statistical methodology:** key calculations (NSE, MAE, RMSE, and all Phase 5+ metrics) are documented in comments at their implementation site. Data Scientist reviews these comments before the PR merges.
- **Reference values are derived from the definition, never from the code** (added Phase 8 scoping, NSE finding): hand-computed reference values in correctness tests must be worked from the documented formula — by hand or with an independent tool — and must not be produced by running the implementation under test. The Phase 1 NSE reference was pinned to the implementation's own (wrong) output, so code and test agreed while both deviated from the standard definition for six releases. The Data Scientist verifies the derivation, not just the match.
- **Exploratory testing:** the Data Scientist loads real-world CSVs and exercises the full workflow each phase — not scripted, not automated. Goal: find issues a Playwright test cannot catch (misleading defaults, confusing workflows, statistically incorrect outputs).
- **Findings format:** each finding is documented as:
  - `dataset`: what CSV was loaded
  - `workflow`: what sequence of actions was taken
  - `finding`: what was observed
  - `severity`: one of `blocks-phase` | `next-phase-specific: <phase>` | `next-phase` | `informational`
- Findings that affect correctness (`blocks-phase`) must be resolved before the phase exits. Other findings are triaged in the task.
- **Misleading visualizations:** the Data Scientist is the sole decision-maker on what constitutes a misleading visualization. A `blocks-phase` flag from the Data Scientist cannot be deferred — it must be fixed before tagging.
- **Phase 5+ ownership:** the Data Scientist defines requirements and acceptance criteria for every statistical feature. No Phase 5+ feature ships without Data Scientist sign-off on both requirements and implementation.
