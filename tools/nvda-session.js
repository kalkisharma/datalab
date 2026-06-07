// tools/nvda-session.js — automated NVDA speech-capture session
// SUPPLEMENTS (does NOT replace) the §15 manual screen-reader session:
// it captures what NVDA speaks at each protocol step — catching silence,
// double announcements, and unlabeled controls — but cannot judge
// comprehensibility; that judgment is the manual session's job.
// Setup (one-time): npx @guidepup/setup --ci   (portable NVDA + capture)
// Run: node tools/nvda-session.js   (needs an interactive desktop; the
// script forces the browser to OS foreground — do not steal focus back)
const { chromium } = require('@playwright/test');
const { execSync } = require('child_process');
const { nvda } = require('@guidepup/guidepup');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const step = async (name, fn) => {
  await nvda.clearSpokenPhraseLog();
  await fn();
  await sleep(1500); // let speech land
  const log = (await nvda.spokenPhraseLog()).filter(Boolean);
  out.push({ name, spoken: log });
  console.log(`
=== ${name}`);
  log.forEach(p => console.log('   «' + p + '»'));
  if (!log.length) console.log('   (SILENCE)');
};

// Activate the focused element through NVDA; if the UI did not change,
// fall back to a DOM keyboard event and note it (focus-routing quirk,
// not an app finding)
const pressEnterVerify = async (page, check) => {
  await nvda.press('Enter');
  await sleep(900);
  if (await page.evaluate(check)) return 'via NVDA';
  await page.keyboard.press('Enter');
  await sleep(900);
  return (await page.evaluate(check)) ? 'via DOM fallback (NVDA key did not route)' : 'FAILED BOTH';
};

(async () => {
  const csv = 'v,site\n' + Array.from({ length: 24 }, (_, i) =>
    `${(Math.sin(i) * 3 + 10 + (i % 3)).toFixed(2)},${'ABC'[i % 3]}`).join('\n');
  const f = path.join(__dirname, '..', 'tests', 'data', '_nvda_groups.csv');
  fs.writeFileSync(f, csv);

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, '..', 'datalab.html'));
  await page.bringToFront();
  await sleep(500);

  // Force OS-level foreground — page.bringToFront() does not take focus
  // from the terminal, so NVDA was narrating the wrong window last run
  const activate = async () => {
    try { execSync(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate('DataLab')"`); } catch {}
    await sleep(600);
    return page.evaluate(() => document.hasFocus());
  };
  console.log('window focused:', await activate());

  await nvda.start();
  await sleep(2500);
  console.log('window focused after NVDA start:', await activate());

  await step('page load → first Tab into the app', async () => {
    await nvda.press('Tab');
  });

  await step('CSV load (programmatic) — is the arrival announced at all?', async () => {
    await page.setInputFiles('#fileInput', f);
    await sleep(800);
  });

  await step('focus + Add Series', async () => {
    await page.focus('#addSeriesBtn');
  });

  await step('Enter → series modal opens (focus into dialog?)', async () => {
    console.log('   [' + await pressEnterVerify(page,
      () => !document.getElementById('modalOverlay').classList.contains('hidden')) + ']');
  });

  await step('Escape → modal closes (focus restored to trigger?)', async () => {
    await nvda.press('Escape');
    await sleep(800);
  });

  await step('focus Data Tools Σ button', async () => {
    await page.focus('.dataset-tools');
  });

  await step('Enter → Data Tools dialog (focus + announcement?)', async () => {
    console.log('   [' + await pressEnterVerify(page,
      () => !document.getElementById('dataToolsOverlay').classList.contains('hidden')) + ']');
  });

  await step('focus the Compare "Compare" select (label spoken?)', async () => {
    await page.focus('#cmpKind');
  });

  await step('focus Method select (label spoken?)', async () => {
    await page.focus('#cmpMethod');
  });

  await step('focus numeric/group selects (labels spoken?)', async () => {
    await page.focus('#cmpVal');
    await sleep(700);
    await page.focus('#cmpGroup');
  });

  await step('run Compare (parametric) — aria-live verdict announced?', async () => {
    await page.selectOption('#cmpVal', 'v');
    await page.selectOption('#cmpGroup', 'site');
    await page.focus('#cmpRun');
    await sleep(400);
    console.log('   [' + await pressEnterVerify(page,
      () => document.getElementById('cmpResult').textContent.length > 0) + ']');
    await sleep(2000);
  });

  await step('switch to Rank-based, run again — NEW verdict announced?', async () => {
    await page.selectOption('#cmpMethod', 'rank');
    await page.focus('#cmpRun');
    await sleep(400);
    console.log('   [' + await pressEnterVerify(page,
      () => document.getElementById('cmpResult').textContent.includes('Mann')
         || document.getElementById('cmpResult').textContent.includes('Kruskal')) + ']');
    await sleep(2000);
  });

  await step('Escape → Data Tools closes (focus restored?)', async () => {
    await nvda.press('Escape');
    await sleep(800);
  });

  await step('help dialog open/close', async () => {
    await page.focus('#helpBtn');
    await sleep(400);
    await nvda.press('Enter');
    await sleep(800);
    await nvda.press('Escape');
    await sleep(800);
  });

  await step('export buttons — names sensible?', async () => {
    await page.focus('#sessionSaveBtn');
    await sleep(600);
    await page.focus('#saveBtn');
  });

  await nvda.stop();
  await browser.close();
  fs.unlinkSync(f);

  for (const s of out) {
    console.log(`\n=== ${s.name}`);
    s.spoken.forEach(p => console.log('   «' + p + '»'));
    if (!s.spoken.length) console.log('   (SILENCE)');
  }
})().catch(async e => {
  console.error('FAILED:', e.message);
  try { await nvda.stop(); } catch {}
  process.exit(1);
});
