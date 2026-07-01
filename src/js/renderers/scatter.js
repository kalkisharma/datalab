// scatter.js — scatter plot renderer
//
// Log scale guidance: linear by default. Log scale appropriate when data
// spans multiple orders of magnitude (>3 decades). Offer via axis range UI.
// Data Scientist: reviewed and approved for Phase 1.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildScatterTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  let rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y columns are required.' };

  let warning = null;
  let isDatetime = classifyColumn(ds.rows, series.xCol) === 'datetime';
  let xV, yV, eV = null;
  if (series.joinDatasetId) {
    // Optional cross-dataset join (workspace ergonomics): X from the primary
    // dataset, Y from the join dataset, matched on a shared key — reuses the
    // parity inner join. Pairs stay index-aligned (mA[i] ↔ mB[i]) and `rows`
    // becomes the matched primary rows, so the rows[i] ↔ xV[i] ↔ yV[i]
    // invariant every downstream encoding relies on holds exactly as the
    // no-join path (the Phase-1 pairing-bug guard — see the alignment test).
    const joinDs = datasets.find(d => d.id === series.joinDatasetId);
    if (!joinDs) return { traces: [], error: 'Join dataset not found.' };
    if (!series.joinKey) return { traces: [], error: 'Join key column is required for the dataset join.' };
    const { mA, mB } = innerJoinRows(rows, joinDs.rows, series.joinKey);
    if (!mA.length) return { traces: [], error: 'No rows matched on the join key. Check the key column values.' };
    if (isDatetime) { warning = 'Datetime X is not supported with a dataset join — treated as numeric.'; isDatetime = false; }
    rows = mA;
    xV = colVals(mA, series.xCol);
    yV = colVals(mB, series.yCol);
    if (series.errCol) eV = colVals(mA, series.errCol);
  } else if (isDatetime) {
    const dt = datetimeXY(ds, rows, series.xCol, series.yCol, series.errCol);
    if (dt.error) return { traces: [], error: dt.error };
    ({ xV, yV, eV } = dt);
  } else {
    // Memoized extraction only valid on the unfiltered dataset rows
    const unfiltered = rows === ds.rows;
    xV = unfiltered ? colValsCached(ds, series.xCol) : colVals(rows, series.xCol);
    yV = unfiltered ? colValsCached(ds, series.yCol) : colVals(rows, series.yCol);
    if (series.errCol) eV = colVals(rows, series.errCol); // row-aligned with x/y
  }

  // Color-by (Phase 16): numeric → continuous colorscale + colorbar;
  // categorical → ONE TRACE PER CATEGORY in the legend (replaces the old
  // colorbar-over-palette-indices, which read as a numeric ramp). The
  // categorical path needs row-aligned points, so it falls back to a single
  // solid trace on a datetime X axis — datetimeXY drops/realigns pairs, the
  // same reason size-by punts on datetime.
  let colorMode = 'solid';
  let colorInfo = null;
  if (series.colorCol) {
    colorInfo = colorMapping(rows, series.colorCol);
    if (colorInfo.isNumeric) colorMode = 'numeric';
    else if (isDatetime) warning = 'Color-by category is not supported with a datetime X axis yet — drew one color.';
    else colorMode = 'categorical';
  }

  const marker = buildMarkerStyle(series.style, colorMode === 'numeric' ? colorInfo.colorVals : undefined, series.colormap);
  if (colorMode !== 'numeric') marker.color = series.style?.color ?? (ds.color ?? '#5b8dee');

  // Bubble size (Phase 14): via the shared areaSizes mapping (one source of
  // truth with parity since Phase 16). Law/min/max are per-series (Phase 19);
  // the same opts thread into the size key so the legend matches the bubbles.
  let sizeNote = '';
  let sizeRaw = null;
  let sizeOpts = null;
  let sizeWarn = null; // honesty warning kept separate so a later warning can't clobber it
  if (series.sizeCol) {
    if (isDatetime) {
      warning = 'Size-by is not supported with a datetime X axis yet.';
    } else {
      sizeOpts = { law: series.sizeLaw, dMin: series.sizeMin, dMax: series.sizeMax };
      sizeRaw = colVals(rows, series.sizeCol);
      marker.size = areaSizes(sizeRaw, sizeOpts);
      // The "(size: …)" suffix names the size encoding in the series label. It's
      // redundant when a separate size legend already titles it (Phase 19), so
      // drop it then — but keep it when the key is hidden (the only size cue).
      sizeNote = (series.sizeKeySeparate && !series.sizeKeyHide) ? '' : ` (size: ${series.sizeCol})`;
      if (series.sizeLaw === 'diameter') sizeWarn = 'Diameter-proportional sizing exaggerates large values — a 2× value reads as ~4× the area; area-proportional is the honest default.';
    }
  }

  // WebGL above 10k points — SVG scatter at 50k×10 series measured 9.3s
  // cold render vs the 5s Phase 3 gate (CSP worker-src blob: permits
  // Plotly's GL workers). Below the threshold SVG keeps crisper markers.
  const trType = rows.length > 10000 ? 'scattergl' : 'scatter';
  // Error bars: name carries "± column" — semantics always visible (§20).
  // legendLabel (Phase 16) overrides the whole auto label incl. suffixes.
  const baseName = series.legendLabel || ((series.name || 'Scatter')
    + (series.errCol ? ` (± ${series.errCol})` : '') + sizeNote);
  const hover = `${series.xCol}: %{x}<br>${series.yCol}: %{y}`
    + (sizeRaw ? `<br>${series.sizeCol}: %{customdata}` : '') + '<extra></extra>';

  const traces = [];
  if (colorMode === 'categorical') {
    const groups = categoryGroups(rows, series.colorCol);
    if (groups.length > PALETTE.length) {
      warning = `"${series.colorCol}" has ${groups.length} categories — only ${PALETTE.length} palette colors, so colors repeat.`;
    }
    // One trace per category; a shared legendgroup keeps them under the
    // series, with the series name as the group title on the first entry
    groups.forEach((g, gi) => {
      const gm = { ...marker, color: g.color };
      if (Array.isArray(marker.size)) gm.size = g.idx.map(i => marker.size[i]);
      const tr = {
        type: trType, mode: 'markers',
        x: g.idx.map(i => xV[i]), y: g.idx.map(i => yV[i]),
        name: g.cat, marker: gm,
        legendgroup: series.id,
        hovertemplate: hover,
      };
      if (gi === 0) tr.legendgrouptitle = { text: baseName };
      if (sizeRaw) tr.customdata = g.idx.map(i => sizeRaw[i]);
      if (eV) tr.error_y = errorBarsFromCol(g.idx.map(i => eV[i]));
      traces.push(tr);
    });
  } else {
    // Numeric color-by: label the colorbar (Phase 16) — default to the
    // column name, matching heatmap/contour; editable via colorbarLabel.
    // Plotly title text, not a DOM innerHTML sink — same no-escHtml
    // convention as the other renderers' colorbar titles (XSS-covered).
    if (colorMode === 'numeric') {
      // Colorbar controls (v2.18.0): manual range (cmin/cmax), reverse, hide title
      if (Number.isFinite(series.colorMin)) marker.cmin = series.colorMin;
      if (Number.isFinite(series.colorMax)) marker.cmax = series.colorMax;
      if (series.colorReverse) marker.reversescale = true;
      marker.colorbar = { title: { text: series.colorbarTitleHide ? '' : (series.colorbarLabel || series.colorCol) } };
    }
    const tr = { type: trType, mode: 'markers', x: xV, y: yV, name: baseName, marker, hovertemplate: hover };
    if (sizeRaw) tr.customdata = sizeRaw; // hover shows the raw size value
    if (eV) tr.error_y = errorBarsFromCol(eV);
    traces.push(tr);
  }
  // Size key (Phase 16): legend swatches matching the bubble mapping. Phase 19:
  // optional hide, custom label/count, and routing to a separate legend.
  if (sizeRaw && !series.sizeKeyHide) {
    traces.push(...sizeKeyTraces(sizeRaw, series.sizeCol, '__size_' + series.id,
      { ...sizeOpts, label: series.sizeKeyLabel, count: series.sizeKeyCount, separate: series.sizeKeySeparate }));
  }

  // Linear trendline (Phase 9): least squares on the finite pairs; the
  // legend entry IS the annotation — equation + R² (linearFit in stats.js).
  // Per-group fits (Phase 11, OPT-IN per §3): one fit per categorical
  // color-by group, palette-colored, capped at 10; anything else falls
  // back to the single overall fit with a warning.
  let fitAnnot = null;
  const f = v => Number(v).toPrecision(4);
  const fitLine = (fx, fy, name, color, precomputed) => {
    const fit = precomputed || linearFit(fx, fy);
    if (!fit) return null;
    const [lo, hi] = extent(fx);
    traces.push({
      type: 'scatter', mode: 'lines',
      x: [lo, hi], y: [fit.a * lo + fit.b, fit.a * hi + fit.b],
      name: `${name}: y = ${f(fit.a)}x ${fit.b < 0 ? '−' : '+'} ${f(Math.abs(fit.b))} (R² = ${f(fit.r2)})`,
      line: { color, width: 2, dash: 'dash' },
      hoverinfo: 'skip',
    });
    return fit;
  };

  // CI/PI bands on the LINEAR fit (Phase 19, DS). Textbook closed form:
  //   ŷ ± t(0.975, n−2)·s·√(k + 1/n + (x−x̄)²/Sxx),  k=0 CI (mean), k=1 PI (new)
  // so CI ⊂ PI everywhere, both minimized at x̄ and flaring at the extremes.
  // Uses linearFit's additive {sxx, meanX, ssRes}. Filled traces UNDER the fit
  // line; legend names the level (unlabeled band = §20 violation). Returns [] if
  // n<3 (needs n−2 df). PI pushed before CI so CI sits on top.
  const bandTraces = (fit, fx, mode) => {
    if (!fit || fit.n < 3) return [];
    const n = fit.n, s = Math.sqrt(fit.ssRes / (n - 2)), t = tQuantile(0.975, n - 2);
    const [lo, hi] = extent(fx), M = 100, xs = [];
    for (let i = 0; i <= M; i++) xs.push(lo + (hi - lo) * i / M);
    const poly = (k, name, rgba) => {
      const up = [], dn = [];
      for (const x of xs) {
        const yh = fit.a * x + fit.b;
        const se = s * Math.sqrt(k + 1 / n + (x - fit.meanX) * (x - fit.meanX) / fit.sxx);
        up.push(yh + t * se); dn.push(yh - t * se);
      }
      return { type: 'scatter', mode: 'lines', x: [...xs, ...xs.slice().reverse()],
        y: [...up, ...dn.slice().reverse()], fill: 'toself', fillcolor: rgba,
        line: { width: 0 }, name, hoverinfo: 'skip' };
    };
    const out = [];
    if (mode === 'pi' || mode === 'both') out.push(poly(1, '95% PI (new obs)', 'rgba(213,94,0,0.10)'));
    if (mode === 'ci' || mode === 'both') out.push(poly(0, '95% CI (mean response)', 'rgba(213,94,0,0.20)'));
    return out;
  };
  // Stored enum, fail closed to 'none' (§8): only these values draw bands.
  const trendBands = ['ci', 'pi', 'both'].includes(series.trendBands) ? series.trendBands : 'none';

  // Degree (Phase 13): linear default; 2–3 fit via polyFit. Per-group fits
  // stay linear regardless (overfitting per tiny group — DS ruling).
  const degree = Math.min(3, Math.max(1, series.trendDegree || 1));

  if (series.trendline) {
    if (isDatetime) {
      warning = 'Trendline needs a numeric X — not drawn for datetime axes.';
    } else {
      let perGroup = false;
      if (series.trendGroups && degree > 1) {
        warning = 'Per-group fits are linear — the degree setting applies to the single overall fit only.';
      }
      if (series.trendGroups) {
        if (!series.colorCol) {
          warning = 'Per-group fits need a Color-by column — drew one overall fit.';
        } else if (colorMapping(rows, series.colorCol).isNumeric) {
          warning = 'Per-group fits need a CATEGORICAL Color-by — drew one overall fit.';
        } else {
          const groups = new Map(); // cat → { fx: [], fy: [] }
          for (let i = 0; i < rows.length; i++) {
            if (!Number.isFinite(xV[i]) || !Number.isFinite(yV[i])) continue;
            const cat = String(rows[i][series.colorCol] ?? '(blank)');
            if (!groups.has(cat)) groups.set(cat, { fx: [], fy: [] });
            const g2 = groups.get(cat);
            g2.fx.push(xV[i]); g2.fy.push(yV[i]);
          }
          if (groups.size > 10) {
            warning = `"${series.colorCol}" has ${groups.size} groups — more than 10 fits is unreadable; drew one overall fit.`;
          } else {
            perGroup = true;
            if (trendBands !== 'none' && !warning) {
              warning = 'Confidence/prediction bands are drawn for a single overall linear fit only — not shown for per-group fits.';
            }
            const srs = [];
            let gi = 0;
            for (const [cat, g2] of groups) {
              const fit = fitLine(g2.fx, g2.fy, cat, PALETTE[gi++ % PALETTE.length]);
              if (fit) srs.push(`${cat}: slope=${f(fit.a)}, R2=${f(fit.r2)}, n=${fit.n}`);
            }
            if (srs.length) {
              fitAnnot = { sr: `${series.name} per-group linear fits — ${srs.join('; ')}` };
            }
          }
        }
      }
      if (!perGroup) {
        const fx = [], fy = [];
        for (let i = 0; i < xV.length; i++) {
          if (Number.isFinite(xV[i]) && Number.isFinite(yV[i])) { fx.push(xV[i]); fy.push(yV[i]); }
        }
        if (degree === 1) {
          const bf = linearFit(fx, fy); // computed once — reused by the bands and the fit line
          let bandsSr = '';
          if (trendBands !== 'none') {
            const bands = bandTraces(bf, fx, trendBands);
            if (bands.length) {
              for (const t of bands) traces.push(t); // pushed BEFORE the fit line → under it
              bandsSr = ` with 95% ${trendBands === 'both' ? 'CI and PI' : trendBands.toUpperCase()} bands`;
            } else if (bf) {
              warning = 'Confidence/prediction bands need at least 3 points — not drawn.';
            }
          }
          const fit = fitLine(fx, fy, 'Fit', '#d55e00', bf);
          if (!fit) {
            warning = 'Trendline needs at least 2 points with varying X.';
          } else {
            fitAnnot = {
              // Series name is user data — rendered inertly via textContent at
              // the .sr-only sink (chart.js), so no escHtml needed here.
              sr: `${series.name} linear fit: slope=${f(fit.a)}, intercept=${f(fit.b)}, R2=${f(fit.r2)}, n=${fit.n}${bandsSr}`,
            };
          }
        } else {
          if (trendBands !== 'none' && !warning) {
            warning = 'Confidence/prediction bands are drawn for the linear (degree-1) fit only — not shown for a higher-degree fit.';
          }
          const fit = polyFit(fx, fy, degree);
          if (!fit) {
            warning = `A degree-${degree} fit needs at least ${degree + 1} points with varying X.`;
          } else {
            const [lo, hi] = extent(fx);
            const cx = [], cy = [];
            for (let i = 0; i <= 200; i++) {
              const x = lo + (hi - lo) * i / 200;
              let yh = 0, p = 1;
              for (let k = 0; k <= degree; k++) { yh += fit.coef[k] * p; p *= x; }
              cx.push(x); cy.push(yh);
            }
            // Equation rendered highest power first
            const terms = [];
            for (let k = degree; k >= 0; k--) {
              const c = fit.coef[k];
              const mag = f(Math.abs(c));
              const xs2 = k === 0 ? '' : k === 1 ? 'x' : `x${k === 2 ? '²' : '³'}`;
              terms.push(`${terms.length === 0 ? (c < 0 ? '−' : '') : (c < 0 ? '− ' : '+ ')}${mag}${xs2}`);
            }
            traces.push({
              type: 'scatter', mode: 'lines', x: cx, y: cy,
              name: `Fit (deg ${degree}): y = ${terms.join(' ')} (R² = ${f(fit.r2)})`,
              line: { color: '#d55e00', width: 2, dash: 'dash' },
              hoverinfo: 'skip',
            });
            fitAnnot = {
              sr: `${series.name} degree-${degree} fit: coefficients high-to-low ${[...fit.coef].reverse().map(f).join(', ')}, R2=${f(fit.r2)}, n=${fit.n}`,
            };
          }
        }
      }
    }
  }

  return { traces, error: null, warning: [warning, sizeWarn].filter(Boolean).join(' ') || null, fitAnnot };
}
