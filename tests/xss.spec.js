// xss.spec.js — XSS injection tests
//
// Insertion points (5): series name, column name, filter value, plot title,
// axis labels. Rationale: all are user-controlled strings that reach the DOM
// via innerHTML — the highest-risk injection surface in the app.
//
// Payloads (2):
//   PAYLOAD_SCRIPT  — classic script injection
//   PAYLOAD_IMG     — attribute break-out + event handler
//
// These tests become active in Phase 1 once the series modal and plot UI
// exist. They are skipped in Phase 0 (empty shell — no UI to inject into).
// Remove test.skip() calls as each insertion point is implemented.
//
// The CSP test runs immediately — it verifies the browser-level defence is
// in place regardless of phase.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const PAYLOAD_SCRIPT = '<script>window.__xss=1</script>';
const PAYLOAD_IMG    = '"><img src=x onerror="window.__xss=1">';

// ── CSP verification (runs from Phase 0) ─────────────────────────────────

const APPROVED_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; worker-src blob:; object-src 'none'; " +
  "base-uri 'none'; form-action 'none';";

test('CSP meta tag is present with approved policy', async ({ page }) => {
  await page.goto(FILE_URL);
  const csp = await page.$eval(
    'meta[http-equiv="Content-Security-Policy"]',
    el => el.getAttribute('content').replace(/\s+/g, ' ').trim()
  );
  expect(csp).toBe(APPROVED_CSP);
});

test('connect-src blocks outbound fetch', async ({ page }) => {
  await page.goto(FILE_URL);
  // A fetch() to any URL should be blocked by CSP connect-src 'none'
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return false; // should never reach here
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});

// ── Series name injection (active from Phase 1) ───────────────────────────

test.skip('series name: PAYLOAD_SCRIPT does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: add a series with name = PAYLOAD_SCRIPT via the modal
  // then assert window.__xss === undefined
});

test.skip('series name: PAYLOAD_IMG does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: add a series with name = PAYLOAD_IMG via the modal
  // then assert window.__xss === undefined
});

// ── Column name injection (active from Phase 1) ───────────────────────────

test.skip('column name: PAYLOAD_SCRIPT does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: load a CSV whose header contains PAYLOAD_SCRIPT
  // then assert window.__xss === undefined after column is displayed
});

test.skip('column name: PAYLOAD_IMG does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: load a CSV whose header contains PAYLOAD_IMG
  // then assert window.__xss === undefined after column is displayed
});

// ── Filter value injection (active from Phase 1) ──────────────────────────

test.skip('filter value: PAYLOAD_SCRIPT does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: add a filter with value = PAYLOAD_SCRIPT
  // then assert window.__xss === undefined
});

test.skip('filter value: PAYLOAD_IMG does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: add a filter with value = PAYLOAD_IMG
  // then assert window.__xss === undefined
});

// ── Plot title injection (active from Phase 1) ────────────────────────────

test.skip('plot title: PAYLOAD_SCRIPT does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: set plot title = PAYLOAD_SCRIPT
  // then assert window.__xss === undefined
});

test.skip('plot title: PAYLOAD_IMG does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: set plot title = PAYLOAD_IMG
  // then assert window.__xss === undefined
});

// ── Axis label injection (active from Phase 1) ────────────────────────────

test.skip('axis labels: PAYLOAD_SCRIPT does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: set X and Y axis labels = PAYLOAD_SCRIPT
  // then assert window.__xss === undefined
});

test.skip('axis labels: PAYLOAD_IMG does not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  // TODO Phase 1: set X and Y axis labels = PAYLOAD_IMG
  // then assert window.__xss === undefined
});
