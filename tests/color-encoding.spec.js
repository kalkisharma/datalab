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
    const m = r.traces.filter(t => t.mode === 'markers');
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
