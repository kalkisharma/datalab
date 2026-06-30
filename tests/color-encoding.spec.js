// color-encoding.spec.js — Phase 16 "honest color/size encoding":
// categorical color-by → discrete named legend; numeric → colorbar;
// colorbar label; size key; legend-label override. Built across scatter
// and parity (the discrete-legend path is shared via categoryGroups).

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);
}

// ── Numeric color-by colorbar controls (v2.18.0) ───────────────────────────
test('numeric color-by colorbar: cmin/cmax, reverse, and hide-title', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,c\n1,2,10\n2,3,20\n3,4,30\n4,5,40', '_ce_cbar.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 'sN', name: 'N', datasetId: ds.id, chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: 'c' };
    const find = s => buildScatterTrace(s, appState.datasets).traces.find(t => t.marker && t.marker.colorbar);
    const dflt = find({ ...base });
    const cust = find({ ...base, colorMin: 5, colorMax: 35, colorReverse: true, colorbarTitleHide: true });
    return {
      dfltTitle: dflt.marker.colorbar.title.text, dfltCmin: dflt.marker.cmin, dfltReverse: dflt.marker.reversescale,
      cmin: cust.marker.cmin, cmax: cust.marker.cmax, reverse: cust.marker.reversescale, title: cust.marker.colorbar.title.text,
    };
  });
  expect(out.dfltTitle).toBe('c');        // defaults to the color column name
  expect(out.dfltCmin).toBeUndefined();   // no manual range by default
  expect(out.dfltReverse).toBeUndefined();
  expect(out.cmin).toBe(5); expect(out.cmax).toBe(35);
  expect(out.reverse).toBe(true);
  expect(out.title).toBe('');             // hidden
});

// Separate colorbar fonts (v2.20.0): toggle off follows axis/tick, on uses
// the dedicated colorbar sizes.
test('separate-colorbar-fonts toggle overrides the axis/tick sizes', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    document.getElementById('fsAxis').value = '20';
    document.getElementById('fsTick').value = '18';
    document.getElementById('fsCbarTitle').value = '30';
    document.getElementById('fsCbarTick').value = '28';
    const offT = [{ colorbar: {} }];
    document.getElementById('fsCbarSeparate').checked = false;
    applyColorbarFonts(offT);
    const onT = [{ colorbar: {} }];
    document.getElementById('fsCbarSeparate').checked = true;
    applyColorbarFonts(onT);
    return {
      off: { title: offT[0].colorbar.title.font.size, tick: offT[0].colorbar.tickfont.size },
      on:  { title: onT[0].colorbar.title.font.size,  tick: onT[0].colorbar.tickfont.size },
    };
  });
  expect(out.off).toEqual({ title: 20, tick: 18 }); // follows Axis / Tick label sizes
  expect(out.on).toEqual({ title: 30, tick: 28 });  // dedicated colorbar sizes
});

test('categorical color-by renders one named legend trace per category (not a colorbar)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page,
    'x,y,site\n1,2,A\n2,3,B\n3,4,A\n4,5,C\n5,6,B\n6,7,A',
    '_ce_cat.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const s = { id: 'sX', name: 'Obs', datasetId: ds.id, chartType: 'scatter',
                xCol: 'x', yCol: 'y', colorCol: 'site' };
    const r = buildScatterTrace(s, appState.datasets);
    return {
      n: r.traces.length,
      names: r.traces.map(t => t.name),
      anyColorbar: r.traces.some(t => t.marker && t.marker.showscale),
      groupTitle: r.traces[0].legendgrouptitle?.text,
      sameGroup: r.traces.every(t => t.legendgroup === 'sX'),
      colors: r.traces.map(t => t.marker.color),
      // A is rows 0,2,5 → x = [1,3,6]
      aX: r.traces.find(t => t.name === 'A').x,
    };
  });
  expect(out.n).toBe(3);                          // A, B, C — one trace each
  expect(out.names.sort()).toEqual(['A', 'B', 'C']);
  expect(out.anyColorbar).toBe(false);            // no colorbar for categories
  expect(out.groupTitle).toBe('Obs');             // series name is the group title
  expect(out.sameGroup).toBe(true);               // shared legendgroup
  expect(new Set(out.colors).size).toBe(3);       // distinct palette colors
  expect(out.aX).toEqual([1, 3, 6]);              // points partitioned correctly
});

test('numeric color-by stays a single colorscale trace with a colorbar', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,10\n2,3,20\n3,4,30\n4,5,40', '_ce_num.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 's1', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: 'z' }, appState.datasets);
    return { n: r.traces.length, showscale: r.traces[0].marker.showscale,
             colorIsArray: Array.isArray(r.traces[0].marker.color) };
  });
  expect(out.n).toBe(1);
  expect(out.showscale).toBe(true);
  expect(out.colorIsArray).toBe(true);
});

test('categorical color-by carries size and error arrays into each category trace', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page,
    'x,y,g,sz,e\n1,2,A,10,0.1\n2,3,B,50,0.2\n3,4,A,90,0.3',
    '_ce_sizeerr.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 's2', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: 'g',
      sizeCol: 'sz', errCol: 'e' }, appState.datasets);
    const a = r.traces.find(t => t.name === 'A');
    return {
      aSizeLen: a.marker.size.length, aErrLen: a.error_y.array.length,
      aCustom: a.customdata,                       // raw size values for A (rows 0,2)
      aAreaMonotone: a.marker.size[1] > a.marker.size[0], // sz 90 > 10
    };
  });
  expect(out.aSizeLen).toBe(2);                    // A has 2 points
  expect(out.aErrLen).toBe(2);
  expect(out.aCustom).toEqual([10, 90]);
  expect(out.aAreaMonotone).toBe(true);
});

test('numeric colorbar label defaults to the column and accepts an override', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,depth\n1,2,10\n2,3,20\n3,4,30', '_ce_cbar.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 's4', name: 'S', datasetId: ds.id, chartType: 'scatter',
                   xCol: 'x', yCol: 'y', colorCol: 'depth' };
    const def = buildScatterTrace(base, appState.datasets);
    const ovr = buildScatterTrace({ ...base, colorbarLabel: 'Depth (m)' }, appState.datasets);
    return {
      def: def.traces[0].marker.colorbar.title.text,
      ovr: ovr.traces[0].marker.colorbar.title.text,
    };
  });
  expect(out.def).toBe('depth');        // defaults to the column name
  expect(out.ovr).toBe('Depth (m)');    // override wins
});

test('parity color/size thread through the join pairing and stay aligned (mandatory)', async ({ page }) => {
  await page.goto(FILE_URL);
  // Pair id=2 has a blank modelled value → dropped. Its observed color (Y)
  // and size (200) must NOT survive — proving color/size skip the same index
  // x/y dropped (the Phase 1 pairing-bug guard, generalized to encodings).
  await loadCSV(page, 'id,obs,site,mag\n1,10,X,100\n2,20,Y,200\n3,30,X,300\n4,40,Z,400', 'obs.csv');
  await loadCSV(page, 'id,mod\n1,11\n2,\n3,32\n4,38', 'model.csv');
  const out = await page.evaluate(() => {
    const dsA = appState.datasets.find(d => d.name === 'obs');
    const dsB = appState.datasets.find(d => d.name === 'model');
    const r = buildParityTrace({ id: 'p1', name: 'P', datasetId: dsA.id,
      joinDatasetId: dsB.id, joinKey: 'id', chartType: 'parity',
      xCol: 'obs', yCol: 'mod', colorCol: 'site', sizeCol: 'mag', band10: false },
      appState.datasets);
    const m = r.traces.filter(t => t.mode === 'markers' && !String(t.legendgroup || '').startsWith('__size'));
    return { n: r.n, names: m.map(t => t.name).sort(),
             X: m.find(t => t.name === 'X'), Z: m.find(t => t.name === 'Z'),
             hasY: m.some(t => t.name === 'Y') };
  });
  expect(out.n).toBe(3);                        // pair 2 dropped
  expect(out.names).toEqual(['X', 'Z']);        // Y's only point was the dropped pair
  expect(out.hasY).toBe(false);
  expect(out.X.x).toEqual([10, 30]);            // observed values, dropped pair skipped
  expect(out.X.customdata).toEqual([100, 300]); // size aligned to the SAME survivors
  expect(out.Z.x).toEqual([40]);
  expect(out.Z.customdata).toEqual([400]);
});

test('size-by adds a min/median/max size key with area-honest swatches', async ({ page }) => {
  await page.goto(FILE_URL);
  // sizes 10,20,30,40,50 → min 10, median 30, max 50
  await loadCSV(page, 'x,y,m\n1,1,10\n2,2,20\n3,3,30\n4,4,40\n5,5,50', '_ce_sizekey.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 'sk', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', sizeCol: 'm' }, appState.datasets);
    const key = r.traces.filter(t => t.legendgroup === '__size_sk');
    return {
      labels: key.map(t => t.name),
      title: key[0].legendgrouptitle.text,
      grey: key.every(t => t.marker.color === '#9e9e9e'),
      noPoints: key.every(t => t.x[0] === null),
      // areas honest: min swatch 4 px diameter, max 28 px, median in between
      px: key.map(t => Math.round(t.marker.size)),
    };
  });
  expect(out.labels).toEqual(['10.0', '30.0', '50.0']); // min, median, max
  expect(out.title).toBe('Size: m');
  expect(out.grey).toBe(true);
  expect(out.noPoints).toBe(true);
  expect(out.px[0]).toBe(4);                  // min → 4 px
  expect(out.px[2]).toBe(28);                 // max → 28 px
  expect(out.px[1]).toBeGreaterThan(4);
  expect(out.px[1]).toBeLessThan(28);
});

test('size key is absent without size-by and when all sizes are equal', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,m\n1,1,7\n2,2,7\n3,3,7', '_ce_nokey.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const none = buildScatterTrace({ id: 'a', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y' }, appState.datasets);
    const equal = buildScatterTrace({ id: 'b', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', sizeCol: 'm' }, appState.datasets);
    return {
      noneHasKey: none.traces.some(t => /^__size_/.test(t.legendgroup || '')),
      equalHasKey: equal.traces.some(t => /^__size_/.test(t.legendgroup || '')),
    };
  });
  expect(out.noneHasKey).toBe(false);
  expect(out.equalHasKey).toBe(false); // all-equal → no meaningful range
});

test('parity numeric color-by gets a labeled colorbar; observed dataset is the source', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'id,obs,depth\n1,10,5\n2,20,15\n3,30,25', 'obsN.csv');
  await loadCSV(page, 'id,mod\n1,11\n2,19\n3,31', 'modN.csv');
  const out = await page.evaluate(() => {
    const dsA = appState.datasets.find(d => d.name === 'obsN');
    const dsB = appState.datasets.find(d => d.name === 'modN');
    const r = buildParityTrace({ id: 'p2', name: 'P', datasetId: dsA.id,
      joinDatasetId: dsB.id, joinKey: 'id', chartType: 'parity',
      xCol: 'obs', yCol: 'mod', colorCol: 'depth', colorbarLabel: 'Depth', band10: false },
      appState.datasets);
    const m = r.traces.find(t => t.mode === 'markers');
    return { single: r.traces.filter(t => t.mode === 'markers').length,
             showscale: m.marker.showscale, label: m.marker.colorbar.title.text,
             colors: m.marker.color };
  });
  expect(out.single).toBe(1);                   // numeric → one colorscale trace
  expect(out.showscale).toBe(true);
  expect(out.label).toBe('Depth');
  expect(out.colors).toEqual([5, 15, 25]);      // observed-dataset depth, aligned
});

test('colorbar title and number fonts follow the typography sliders', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,10\n2,3,20\n3,4,30\n4,5,40', '_ce_cbfont.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.selectOption('#mColorCol', 'z'); // numeric → colorbar
  await page.click('#modalSave');
  // Axis label size → 28, Tick label size → 22
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('fsAxis', 28); set('fsTick', 22);
  });
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(500);
  const cb = await page.evaluate(() => {
    const t = activePlotDiv().data.find(d => d.marker && d.marker.colorbar);
    return { title: t.marker.colorbar.title.font.size, tick: t.marker.colorbar.tickfont.size };
  });
  expect(cb.title).toBe(28); // colorbar title ← Axis label size
  expect(cb.tick).toBe(22);  // colorbar numbers ← Tick label size
});

test('legend-label override replaces the auto label and its suffixes', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,e,g\n1,2,0.1,A\n2,3,0.2,B\n3,4,0.3,A', '_ce_legend.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    // Single trace: override suppresses the "(± e)" suffix
    const single = buildScatterTrace({ id: 'L1', name: 'Raw', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', errCol: 'e',
      legendLabel: 'My series' }, appState.datasets);
    // Categorical: override becomes the legend GROUP title; categories keep names
    const cat = buildScatterTrace({ id: 'L2', name: 'Raw', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: 'g',
      legendLabel: 'Grouped' }, appState.datasets);
    const catData = cat.traces.filter(t => t.legendgroup === 'L2');
    return {
      singleName: single.traces[0].name,
      groupTitle: catData[0].legendgrouptitle.text,
      catNames: catData.map(t => t.name).sort(),
    };
  });
  expect(out.singleName).toBe('My series');   // no "(± e)" suffix
  expect(out.groupTitle).toBe('Grouped');      // override is the group title
  expect(out.catNames).toEqual(['A', 'B']);    // categories unaffected
});

test('too many categories warns that colors repeat', async ({ page }) => {
  await page.goto(FILE_URL);
  let csv = 'x,y,g\n';
  for (let i = 0; i < 10; i++) csv += `${i},${i},cat${i}\n`; // 10 > 8 palette
  await loadCSV(page, csv, '_ce_many.csv');
  const warning = await page.evaluate(() => {
    const ds = appState.datasets[0];
    return buildScatterTrace({ id: 's3', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: 'g' }, appState.datasets).warning;
  });
  expect(warning).toContain('colors repeat');
});
