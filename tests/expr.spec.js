// expr.spec.js — computed-column expression engine (Phase 12)
//
// Two halves: arithmetic correctness (hand-derived per §20 — these are
// exact algebra, no estimation) and the §8 security contract: everything
// that is not in the grammar is rejected AT PARSE TIME, including every
// classic reach for a string-to-code or prototype path.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const H = ['x', 'y', 'flow rate']; // test headers (one with a space)

async function evalOn(page, src, row) {
  return page.evaluate(([src, headers, row]) => {
    const { ast, error } = parseExpr(src, headers);
    return error ? { error } : { value: evalExpr(ast, row) };
  }, [src, H, row]);
}

async function parseErr(page, src) {
  return page.evaluate(([src, headers]) => parseExpr(src, headers).error, [src, H]);
}

test('arithmetic: precedence, right-assoc power, unary minus, functions, backtick columns', async ({ page }) => {
  await page.goto(FILE_URL);
  const row = { x: 4, y: 3, 'flow rate': 10 };

  expect((await evalOn(page, '2 + 3 * 4', row)).value).toBe(14);
  expect((await evalOn(page, '(2 + 3) * 4', row)).value).toBe(20);
  expect((await evalOn(page, '2 ^ 3 ^ 2', row)).value).toBe(512);      // right-assoc
  expect((await evalOn(page, '-x ^ 2', row)).value).toBe(-16);         // -(x^2): unary binds looser than ^
  expect((await evalOn(page, '10 % y', row)).value).toBe(1);
  expect((await evalOn(page, 'sqrt(x) + ln(exp(1))', row)).value).toBeCloseTo(3, 10);
  expect((await evalOn(page, 'pow(y, 2) + min(x, y, 100)', row)).value).toBe(12);
  expect((await evalOn(page, '`flow rate` * 2', row)).value).toBe(20);
  expect((await evalOn(page, '(x - 32) * 5/9', row)).value).toBeCloseTo((4 - 32) * 5 / 9, 10);
  // Missing/non-numeric column values propagate as NaN
  expect((await evalOn(page, 'x + y', { x: 5, y: null })).value).toBeNaN();
});

test('security: everything outside the grammar is rejected at parse time', async ({ page }) => {
  await page.goto(FILE_URL);

  // Unknown identifiers — including every prototype-walk classic
  expect(await parseErr(page, 'constructor')).toContain('Unknown column');
  expect(await parseErr(page, '__proto__ + 1')).toContain('Unknown column');
  expect(await parseErr(page, 'window')).toContain('Unknown column');
  // No member access, strings, comparisons, assignment, or statements
  // (a stray "." lexes as a malformed number — rejected either way)
  expect(await parseErr(page, 'x.constructor')).toMatch(/Bad number|Unexpected character/);
  expect(await parseErr(page, '"alert(1)"')).toContain('Unexpected character');
  expect(await parseErr(page, "x = 5")).toContain('Unexpected character');
  expect(await parseErr(page, 'x; y')).toContain('Unexpected character');
  expect(await parseErr(page, 'x[0]')).toContain('Unexpected character');
  expect(await parseErr(page, 'x > 1')).toContain('Unexpected character');
  // Unknown functions (only the frozen allowlist exists)
  expect(await parseErr(page, 'evil(x)')).toContain('Unknown function');
  expect(await parseErr(page, 'eval(x)')).toContain('Unknown function');
  // Arity enforcement
  expect(await parseErr(page, 'pow(x)')).toContain('argument');
  expect(await parseErr(page, 'abs(x, y)')).toContain('argument');
  // Caps: length, tokens, depth
  expect(await parseErr(page, '1+'.repeat(280) + '1')).toContain('too long');
  expect(await parseErr(page, '1' + '+1'.repeat(120))).toContain('too complex');
  expect(await parseErr(page, '('.repeat(40) + 'x' + ')'.repeat(40))).toContain('too deeply nested');
  // Trailing garbage and malformed input fail cleanly
  expect(await parseErr(page, 'x 5')).toContain('after the expression');
  expect(await parseErr(page, '(x + 1')).toContain('Missing ")"');
  expect(await parseErr(page, '')).toContain('Empty');
});

test('new column end-to-end: live preview, materialization, stats and pickers', async ({ page }) => {
  await page.goto(FILE_URL);
  const csvPath = path.join(__dirname, 'data', '_expr_e2e.csv');
  fs.writeFileSync(csvPath, 'temp,city\n32,a\n212,b\n98.6,c');
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);

  await page.click('.dataset-tools');
  await page.waitForTimeout(300);

  // Live preview shows values once name+expression are valid
  await page.fill('#dtNcName', 'celsius');
  await page.fill('#dtNcExpr', '(temp - 32) * 5/9');
  await page.waitForTimeout(100);
  let preview = await page.locator('#dtNcPreview').textContent();
  expect(preview).toContain('Preview: 0, 100, 37');
  // Parse error displays live; Add disables
  await page.fill('#dtNcExpr', '(temp - 32) * 5/9 +');
  await page.waitForTimeout(100);
  expect(await page.locator('#dtNcPreview').textContent()).toContain('Unexpected end');
  await expect(page.locator('#dtNcAdd')).toBeDisabled();
  // Duplicate name blocks
  await page.fill('#dtNcExpr', 'temp * 2');
  await page.fill('#dtNcName', 'temp');
  await page.waitForTimeout(100);
  await expect(page.locator('#dtNcAdd')).toBeDisabled();

  // Add for real
  await page.fill('#dtNcName', 'celsius');
  await page.fill('#dtNcExpr', '(temp - 32) * 5/9');
  await page.waitForTimeout(100);
  await page.click('#dtNcAdd');
  await page.waitForTimeout(300);

  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    return {
      headers: ds.headers,
      values: ds.rows.map(r => +r.celsius.toFixed(4)),
      meta: ds.computed,
      msg: document.getElementById('dtMsg').textContent,
      statsCols: [...document.querySelectorAll('.stats-table:not(.dt-preview) tbody td:first-child')].map(td => td.textContent),
    };
  });
  expect(out.headers).toContain('celsius');
  expect(out.values).toEqual([0, 100, 37]);
  expect(out.meta.celsius).toBe('(temp - 32) * 5/9');
  expect(out.msg).toContain('materialized');
  expect(out.statsCols).toContain('celsius'); // summary stats picked it up

  // The computed column is a first-class citizen in series pickers
  await page.click('#dtClose');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  const yOptions = await page.evaluate(() =>
    [...document.querySelectorAll('#mYCol option')].map(o => o.value));
  expect(yOptions).toContain('celsius');
});

test('computed values survive a session round-trip as plain data', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.evaluate(() => {
    const ds = { id: 'd1', name: 'd', color: '#000000', headers: ['v'],
                 rows: [{ v: 2 }, { v: 3 }, { v: null }] };
    appState.datasets.push(ds);
    const { ast } = parseExpr('v ^ 2', ds.headers);
    for (const r of ds.rows) r.sq = evalExpr(ast, r);
    ds.headers.push('sq');
    ds.computed = { sq: 'v ^ 2' };
  });
  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));
  await page.goto(FILE_URL);
  await page.evaluate(p => applySessionState(migrateSessionState(JSON.parse(p).state)), exported);
  const out = await page.evaluate(() => ({
    sq: appState.datasets[0].rows.map(r => r.sq),
    meta: appState.datasets[0].computed,
  }));
  expect(out.sq).toEqual([4, 9, null]); // NaN → null through JSON, reads as missing
  expect(out.meta.sq).toBe('v ^ 2');
});
