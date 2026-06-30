# Reviewer's Guide to DataLab

**Who this is for:** anyone looking at this project for the first time and
trying to form a judgment about it — a security approver deciding whether
it's safe to use, an auditor, a new engineer, or a non-technical
stakeholder who just needs to understand *what it is and whether it can be
trusted*. You do **not** need to be a programmer to read this guide. Terms
that might be unfamiliar are explained the first time they appear, and
there's a [glossary](#glossary) at the end.

If you only have five minutes, read the next two sections — **What DataLab
Is** and **The One Promise That Matters**. Everything after that is for
readers who want to go deeper.

---

## What DataLab Is

DataLab is a tool for making charts and doing statistics from spreadsheet
data. You give it a CSV file (a plain-text spreadsheet — the kind Excel can
export), and it draws a wide range of charts — scatter and line charts, bar
charts, histograms, box and violin plots, heatmaps, contour maps,
model-vs-observed ("parity") plots, and pair plots (scatterplot matrices) —
and computes statistics ranging from
averages and correlations to formal group comparisons (t-tests, ANOVA, and
their rank-based equivalents). You can control the appearance in detail —
colors, color scales, fonts, labels, axes — export the results as images, and
save your whole session to reload later.

What makes it unusual is **how** it runs. It is a *single file* —
`datalab.html` — that you open in an ordinary web browser (Chrome, Edge,
Firefox). There is:

- **No installation.** You don't install software; you open a file.
- **No server.** Nothing runs in "the cloud." It all happens inside your
  own browser, on your own computer.
- **No internet.** It works with your network cable unplugged, and it is
  built so that it *cannot* reach the internet even if it wanted to (more
  on this below).

That combination is the whole point. Most charting tools either upload
your data to a website, require installing a program, or require writing
code. DataLab is the option for someone who has a **sensitive spreadsheet**
— confidential, regulated, or proprietary data — and needs to chart it
*without it ever leaving their machine*.

---

## The One Promise That Matters

> **Your data never leaves your computer.**

For a reviewer, this is the claim worth scrutinizing, because it's the
reason the tool exists. DataLab backs it up with **three independent
layers**, each of which would have to fail for data to escape:

1. **The browser is told to block all network access.** Embedded in the
   file is a *Content Security Policy* (CSP) — a standard browser rule set
   — whose first directive is `default-src 'none'`. In plain terms: the
   browser itself refuses to let the page contact any outside address.
   This is enforced by the browser, not by DataLab's own honor system.

2. **The code is checked for network commands before it's ever committed.**
   A *pre-commit hook* (an automated check that runs every time a developer
   saves work to the project's history) scans for any command that could
   open a network connection — and refuses the save if it finds one. So
   forbidden code can't even enter the project.

3. **It is delivered as one inspectable, verifiable file.** The whole tool
   is a single text file you can read. Every official release publishes a
   *SHA-256 hash* — a unique fingerprint of the file. You can compute the
   fingerprint of the file you downloaded and confirm it matches, proving
   the file wasn't altered in transit (see [Verify It
   Yourself](#verify-it-yourself-no-coding-required)).

There is also **no storage**: no cookies, no saved logins, no hidden cache.
Closing the browser tab erases everything except files you deliberately
exported. And there is **no analytics or telemetry** — the tool never
"phones home" to report usage, because (per layer 1) it can't make any call
at all.

**A non-technical reviewer can stop here with a clear takeaway:** the
confidentiality claim is not a promise on paper — it's enforced by the
browser, checked by automation, and independently verifiable by you.

---

## For a Non-Technical Reviewer: What to Check and Ask

You can form a sound judgment without reading a single line of code.

**Three things you can verify yourself:**

- **The fingerprint matches.** Follow [Verify It
  Yourself](#verify-it-yourself-no-coding-required). If the fingerprint of
  your downloaded file matches the published one, you have the genuine,
  unaltered file.
- **It works offline.** Disconnect from the internet (or unplug the
  network), open the file, and use it. If it works fully offline — it does —
  then by definition it isn't depending on any outside service.
- **The source is open.** The code is deliberately left readable (not
  scrambled). The maintainer *invites* security teams to inspect it. A tool
  with something to hide does the opposite.

**Good questions to ask the maintainer or a technical reviewer:**

- "Show me the network-blocking rule." (It's one line in the file — the CSP.)
- "What happens to my data when I close the tab?" (It's gone — nothing is
  saved anywhere.)
- "Who checked the statistics for correctness?" (A designated Data
  Scientist role signs off on every release — see [How Quality Is
  Governed](#how-quality-is-governed).)
- "How do I know the file I downloaded is the real one?" (The published
  SHA-256 hash.)

---

## How It's Built (the Mental Model)

This section is for readers who want to understand the shape of the thing.
It stays conceptual — no code.

DataLab is built on one core idea: **state-first design.**

Think of a single, central "record sheet" that holds *everything* about
your current session — which files you loaded, which charts you defined,
how they're styled. In the code this record sheet is called `appState`.
The screen is always drawn *from* that record sheet. When you change
something, the tool updates the record sheet and then redraws. The screen
never holds the "real" information itself — the record sheet does.

Why this matters to a reviewer: it makes the tool **predictable and
auditable**. There is one place where truth lives. Saving your work is just
writing that record sheet to a file; reloading is reading it back. There's
no hidden state scattered across the screen to get out of sync.

The actual drawing is done by a well-known, widely-used charting library
called **Plotly**, which is bundled inside the file (not downloaded). Each
chart type (scatter, line, parity, etc.) has its own small *renderer* — a
piece of code whose only job is to turn "this series of data" into "these
shapes Plotly should draw." All renderers follow the same agreed-upon
interface, so they're consistent and easy to check one against another.

---

## For a Technical Reviewer: Where to Start Reading

The project is organized as many small source files under `src/js/`, each
under a few hundred lines by deliberate policy. You do **not** need to read
them all. Three files form the spine; read them in this order and the rest
becomes easy to navigate.

> For a complete, file-by-file tour — the build pipeline, the rendering data
> flow, the statistics stack, and a worked end-to-end example — see
> [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md). The spine below is the short
> version.

> Note: the file you run, `datalab.html`, is a *build output* — all the
> `src/` files concatenated together by `build.js`. Review the `src/`
> files, not the generated `datalab.html`.

**1. `src/js/state.js`** *(~155 lines) — the data model. Start here.*
This defines `appState` (the central record sheet described above), the
session-file format, the version number, and `escHtml` (the function that
neutralizes potentially-dangerous text before it's shown — important for
security). Its comment block is the *authoritative* description of the data
model; the planning docs intentionally don't duplicate it. Read this and
you understand what every other file is manipulating.

**2. `src/js/chart.js`** *(~350 lines) — the conductor.*
This is where the central record sheet becomes pixels. Its main function,
`renderPlot()`, walks through your defined charts, calls the right renderer
for each, and assembles the final figure (including multi-panel grids and
secondary axes). If you understand this file, you understand the tool's
flow of control.

**3. `src/js/renderers/shared.js`** *(~275 lines) — the renderer contract +
shared helpers.* The comment at the top is the *contract* every chart type
must satisfy: given a series and the datasets, return either drawable
shapes or a clear error. The file also holds helpers the renderers share —
color mapping, marker styling, grouping data into categories. Once you've
read this, each individual renderer (`scatter.js`, `line.js`,
`parity.js`, …) is a short, predictable variation on a theme.

**After the spine**, follow your interest:

| If you care about… | Read… |
|---|---|
| Reading CSVs, filtering, column typing | `src/js/data.js` |
| The chart-creation dialog (the main UI) | `src/js/modal.js`, `modal-chart-fields.js` |
| Saving / loading sessions, file format | `src/js/sessions.js`, `state.js` |
| The statistics engine (t-tests, ANOVA, etc.) | `src/js/hypothesis.js`, `specfun.js`, `stats.js` |
| Security-sensitive text handling | search for `escHtml` and `innerHTML` |
| The build + integrity checks | `build.js`, `docs/DEPENDENCIES.md` |
| The whole codebase, file by file | [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md) |

**What to look for as you read** (the things this project holds itself to):

- **No network calls, ever.** No `fetch`, `WebSocket`, `XMLHttpRequest`,
  etc. The pre-commit hook blocks these, but verify for yourself.
- **No `eval` or `new Function`.** User input (filter values, computed-column
  formulas) is never turned into executable code. Formulas go through a
  hand-written, sandboxed parser (`src/js/expr.js`), not the language's own
  evaluator.
- **Escaping at every display point.** Any place user-supplied text (a column
  name, a dataset name) is inserted into the page is escaped via `escHtml`
  and carries a comment saying so. This prevents *cross-site scripting* —
  malicious data masquerading as code.
- **Honest statistics and visuals.** No statistic is shown without the context
  needed to read it (a p-value always travels with its effect size and sample
  size; error bars always say what they represent). The same principle covers
  the charts themselves: a color scale must actually be the one its label
  names, and aggregated values must say how they were combined. This is a hard
  rule, not a preference.

---

## How Quality Is Governed

DataLab is maintained by one person (Kalki Sharma), but the work is
organized around **ten named roles** — Engineering Lead, Frontend, Data
Visualization, Data Engineer, QA, UX, Security, Performance, Accessibility,
and Data Scientist. Each release is reviewed through every relevant lens.
For a reviewer, the three guarantees most worth knowing:

- **Security** is enforced in two independent layers (the browser CSP and
  the pre-commit hook), plus an automated XSS test suite that runs on every
  change. The standards live in `STANDARDS.md` §8–§9.
- **Statistical correctness** is owned by a designated Data Scientist role.
  Every statistical feature is checked against hand-computed or
  published reference values, and no release ships statistics without a
  correctness sign-off. See `STANDARDS.md` §20.
- **Accessibility** targets WCAG 2.1 AA and is automatically verified (via a
  tool called *axe*) on every change, with full keyboard operation. See
  `STANDARDS.md` §15.

**An example of the honesty rule in practice.** In a recent release the team
found that several of the color scales in the menu were quietly drawing the
*wrong* colors — the menu said one thing, the chart showed another. Because
"a control must show what it claims" is treated as an honesty rule (the same
rule that governs statistics), this was logged as a defect, fixed in its own
release right away, and a test was added so it can't silently come back. For a
reviewer, the point isn't the bug itself — it's that the project treats a
*visual that misleads* with the same seriousness as a *wrong number*.

The full rulebook is `STANDARDS.md`; the roadmap and history of *what was
built and why* is `PLANNING.md`.

---

## Verify It Yourself (No Coding Required)

**Confirm the file is genuine** — that what you downloaded is exactly what
the maintainer published, byte for byte:

1. Download `datalab.html` from the project's releases page.
2. Compute its fingerprint:
   - **Windows (PowerShell):** `Get-FileHash datalab.html -Algorithm SHA256`
   - **Mac / Linux:** `shasum -a 256 datalab.html`
3. Compare the long string it prints against the **SHA-256** value in that
   release's notes. If they match, the file is authentic and unmodified. If
   they don't, **do not use the file** — it was altered.

**Confirm it's truly offline:** disconnect from the internet entirely, then
open and use the file. Everything works. Nothing it does depends on a
connection.

**(Technical) Build it yourself and reproduce the fingerprint:**

```
git clone <this repository>
cd datalab
git config core.hooksPath .githooks   # activates the security pre-commit hook
node build.js                         # builds datalab.html and prints its SHA-256
```

The build downloads nothing — every dependency is already in the
repository and is verified by hash during the build. Building from source
should reproduce the same fingerprint as the published release.

**(Technical) Run the test suite:**

```
npm install
npx playwright install chromium
npx playwright test                       # functional + security + accessibility tests
BENCH=1 npx playwright test tests/bench.spec.js   # performance benchmarks
```

---

## Where to Go Next

| Document | What it covers |
|---|---|
| [`../README.md`](../README.md) | How to *use* the tool, feature list, security summary |
| [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md) | A full, file-by-file technical walkthrough of the codebase (for engineers and auditors) |
| [`PLANNING.md`](PLANNING.md) | The roadmap, the ten team roles, and the full history of what was built in each release and why |
| [`STANDARDS.md`](STANDARDS.md) | The engineering rulebook — versioning, security, testing, accessibility, statistical honesty |
| [`CHANGELOG.md`](CHANGELOG.md) | Release-by-release history, including data-format changes |
| [`DEPENDENCIES.md`](DEPENDENCIES.md) | The three bundled libraries, pinned by exact version and fingerprint |

**Questions?** Contact the maintainer, Kalki Sharma
<kalkijsharma@gmail.com>.

---

## Glossary

- **Artifact / build output** — the finished file (`datalab.html`) produced
  from the source code. You run the artifact; you review the source.
- **axe** — an industry-standard automated tool for finding accessibility
  problems. DataLab runs it on every change.
- **CSP (Content Security Policy)** — a standard set of rules, embedded in a
  web page, that tells the browser what the page is and isn't allowed to do.
  DataLab's CSP forbids all network access.
- **CSV** — "comma-separated values," a plain-text spreadsheet format that
  Excel and Google Sheets can export. DataLab's only input format.
- **Hash / SHA-256** — a unique "fingerprint" of a file. If even one
  character changes, the fingerprint changes completely, so matching
  fingerprints prove two files are identical.
- **Plotly** — the well-established charting library that does the actual
  drawing, bundled inside the file (not downloaded).
- **Pre-commit hook** — an automated check that runs whenever a developer
  saves changes into the project's history, and can refuse changes that
  break the rules (here: anything resembling a network call).
- **Renderer** — a small piece of code responsible for turning one kind of
  chart's data into shapes to draw. There's one per chart type.
- **State / `appState`** — the single central record of everything in the
  current session. The screen is always drawn from it.
- **WCAG 2.1 AA** — an internationally recognized accessibility standard.
  DataLab targets this level.
- **XSS (cross-site scripting)** — an attack where malicious text disguised
  as data tries to run as code. Prevented here by escaping all
  user-supplied text before display.
</content>
</invoke>
