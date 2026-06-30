// contour.js — contour plot renderer
//
// Two paths. The DEFAULT requires pre-gridded x, y, z: a complete rectangular
// grid — every combination of the unique X and unique Y values exactly once,
// as produced by parameter sweeps and structured simulations (Data Scientist
// guidance, Phase 3). The OPT-IN "Interpolate scattered data" path (Phase 17,
// series.interpolate) grids scattered points through gridScattered
// (grid-interp.js): binned mean + convex-hull mask + data-support mask +
// harmonic fill — no values are invented outside the data's support, and the
// method is named on hover (§20, same family as silent-aggregation).
//
// Log scale guidance: contour axes are usually linear; log axes only when
// the grid itself was generated logarithmically (the grid check below is
// spacing-agnostic, so log-spaced grids validate fine).

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildContourTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  for (const [col, label] of [[series.xCol, 'X'], [series.yCol, 'Y'], [series.zCol, 'Z']]) {
    if (!col) return { traces: [], error: `${label} column is required — contour needs three numeric columns.` };
    if (classifyColumn(ds.rows, col) !== 'numeric') {
      return { traces: [], error: `Column "${col}" is not numeric — contour needs numeric X, Y, and Z.` };
    }
  }

  // Collect complete (x, y, z) triples only
  const pts = [];
  for (const r of rows) {
    const x = Number(r[series.xCol]), y = Number(r[series.yCol]), z = Number(r[series.zCol]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) pts.push([x, y, z]);
  }
  if (!pts.length) return { traces: [], error: 'No complete numeric (X, Y, Z) rows found.' };

  // Shading control (user-facing): Plotly smooths contours by default — heatmap
  // coloring interpolates between grid nodes and contour lines spline-smooth.
  // contourSmooth:false renders discrete bands ('fill') with straight segments
  // (smoothing 0), faithful to the grid. Default on for back-compat.
  const smooth        = series.contourSmooth !== false;
  const coloring      = smooth ? 'heatmap' : 'fill';
  const lineSmoothing = smooth ? 1 : 0;
  // Colorbar controls (v2.18.0): editable/hideable title, manual color range
  // (zmin/zmax, blank = auto), reverse colormap, and contour level count.
  const cbTitle = series.colorbarTitleHide ? '' : (series.colorbarLabel || series.zCol);
  const cbExtra = {};
  if (Number.isFinite(series.colorMin)) cbExtra.zmin = series.colorMin;
  if (Number.isFinite(series.colorMax)) cbExtra.zmax = series.colorMax;
  if (series.colorReverse) cbExtra.reversescale = true;
  if (Number.isFinite(series.contourLevels) && series.contourLevels >= 2) cbExtra.ncontours = series.contourLevels;

  // Interpolated path (Phase 17, opt-in): grid scattered (x, y, z) through
  // gridScattered. Cells with no data support render as gaps (connectgaps
  // false), never invented; the method is named on hover. The pre-gridded
  // path below stays the default when the box is unchecked.
  if (series.interpolate) {
    const g = gridScattered(pts);
    if (!g) return { traces: [], error: 'Interpolation needs at least 3 (X, Y) points that are not all collinear.' };
    const traces = [{
      type: 'contour',
      x: g.x, y: g.y, z: g.z,
      name: (series.name || 'Contour') + ' (interpolated)',
      colorscale: resolveColorscale(document.getElementById('cmapSelect')?.value),
      ...cbExtra,
      contours: { coloring }, line: { smoothing: lineSmoothing },
      connectgaps: false, // unsupported cells (outside hull / beyond R) stay empty
      colorbar: { title: { text: cbTitle } },
      // An interpolated surface must announce itself (§20) — method on hover
      hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<br>${series.zCol}: %{z}<extra>interpolated · binned mean + Laplace fill</extra>`,
    }];
    // Data-support overlay (Phase 17, opt-in): the original sample locations,
    // so the reader sees where the surface is backed by data vs interpolated
    // (Data Scientist honesty affordance from the spike). WebGL above 10k pts.
    if (series.showPoints) {
      traces.push({
        type: pts.length > 10000 ? 'scattergl' : 'scatter',
        mode: 'markers',
        x: pts.map(p => p[0]), y: pts.map(p => p[1]),
        name: `data points (${pts.length})`,
        marker: { size: 4, color: 'rgba(40,40,40,0.55)', line: { width: 0.5, color: '#ffffff' } },
        hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<extra>data</extra>`,
      });
    }
    return { traces, error: null };
  }

  // Grid validation: unique X × unique Y must cover the points exactly once
  const ux = [...new Set(pts.map(p => p[0]))].sort((a, b) => a - b);
  const uy = [...new Set(pts.map(p => p[1]))].sort((a, b) => a - b);
  if (ux.length * uy.length !== pts.length) {
    return { traces: [], error:
      `Contour requires pre-gridded data: every (X, Y) combination exactly once. ` +
      `Found ${ux.length} unique X × ${uy.length} unique Y but ${pts.length} rows. ` +
      `Scattered points need gridding first (interpolated contours planned for a later phase).` };
  }

  // Build the z matrix: z[yi][xi]
  const xi = new Map(ux.map((v, i) => [v, i]));
  const yi = new Map(uy.map((v, i) => [v, i]));
  const z  = uy.map(() => new Array(ux.length).fill(null));
  for (const [x, y, zv] of pts) {
    const r = yi.get(y), c = xi.get(x);
    if (z[r][c] !== null) {
      return { traces: [], error: `Duplicate grid point at (${x}, ${y}) — contour data must have each (X, Y) pair once.` };
    }
    z[r][c] = zv;
  }
  if (z.some(row => row.includes(null))) {
    return { traces: [], error: 'Grid has holes — every (X, Y) combination needs a Z value.' };
  }

  return {
    traces: [{
      type: 'contour',
      x: ux, y: uy, z,
      name: series.name || 'Contour',
      colorscale: resolveColorscale(document.getElementById('cmapSelect')?.value),
      ...cbExtra,
      contours: { coloring }, line: { smoothing: lineSmoothing },
      colorbar: { title: { text: cbTitle } },
      hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<br>${series.zCol}: %{z}<extra></extra>`,
    }],
    error: null,
  };
}
