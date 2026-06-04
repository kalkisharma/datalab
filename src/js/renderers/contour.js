// contour.js — contour plot renderer (requires pre-gridded x, y, z columns)
//
// Log scale guidance: contour axes are usually linear; log axes only when
// the grid itself was generated logarithmically (the grid check below is
// spacing-agnostic, so log-spaced grids validate fine).
//
// Data requirement (Data Scientist guidance, Phase 3): the three columns
// must form a complete rectangular grid — every combination of the unique
// X values and unique Y values appears exactly once, as produced by
// parameter sweeps and structured simulations. Scattered (x, y, z) points
// would need interpolation onto a grid first; interpolated contour support
// is explicitly deferred to Phase 5+.

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
      colorscale: document.getElementById('cmapSelect')?.value ?? 'Viridis',
      contours: { coloring: 'heatmap' },
      colorbar: { title: { text: series.zCol } },
      hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<br>${series.zCol}: %{z}<extra></extra>`,
    }],
    error: null,
  };
}
