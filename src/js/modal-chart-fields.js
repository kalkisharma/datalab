// modal-chart-fields.js — per-chart-type Columns/setup field HTML for the
// series modal (split out of modal-fields.js at the Phase 16 §6 sweep — the
// standing 'splits with the next modal change' deferral came due when parity
// gained an Encoding section). Pure HTML builder; modal-fields.js appends the
// shared Style + Filters sections and wires everything.
//
// colOptions is passed in (it closes over the dataset's numeric/all columns).

// Field-builder helpers (sizeByExtraControls, colorbarExtraControls) live in
// modal-field-controls.js — extracted at the v2.21.0 §6 split.

function chartColumnFields(chartType, ds, dsId, existing, colOptions, cols) {
  let html = '';

  if (chartType === 'scatter' || chartType === 'line') {
    // Optional cross-dataset join (scatter only, workspace ergonomics): X from
    // this dataset, Y from the joined one, matched on a shared key. When a join
    // dataset is set, Y options come from IT (the parity Y-from-join lesson);
    // the mJoinDataset change handler in modal-fields.js repopulates Y + key.
    let joinHtml = '', yColHtml = colOptions(existing?.yCol, false);
    if (chartType === 'scatter') {
      const others = appState.datasets.filter(d => d.id !== dsId);
      const jds = appState.datasets.find(d => d.id === existing?.joinDatasetId);
      if (jds) {
        const jnum = jds.headers.filter(c => classifyColumn(jds.rows, c) === 'numeric');
        yColHtml = jnum.map(c => `<option value="${escHtml(c)}" ${existing?.yCol === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
      }
      const sharedKeys = jds ? cols.filter(c => jds.headers.includes(c)) : [];
      joinHtml = `
      <div class="modal-field">
        <label class="modal-label" for="mJoinDataset">Join a second dataset (optional)</label>
        <select id="mJoinDataset"><option value="">— none (plot all rows) —</option>${others.map(d =>
          `<option value="${escHtml(d.id)}" ${existing?.joinDatasetId === d.id ? 'selected' : ''}>${escHtml(d.name)}</option>`).join('')}</select>
        <div class="field-hint">Inner-join on a shared key — X from this dataset, Y from the joined one; only matched rows are plotted.</div>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mJoinKey">Join key</label>
        <select id="mJoinKey"><option value="">Select key…</option>${sharedKeys.map(c =>
          `<option value="${escHtml(c)}" ${existing?.joinKey === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}</select>
      </div>`;
    }
    html = `
      <div class="modal-section-title">Columns</div>
      ${joinHtml}
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, true, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column <span class="required">*</span></label>
        <select id="mYCol">${yColHtml}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mColorCol">Color by (optional)</label>
        <select id="mColorCol"><option value="">None</option>${colOptions(existing?.colorCol, true)}</select>
      </div>
      ${chartType === 'scatter' ? `
      <div id="mColorbarField" style="display:none">${colorbarExtraControls(existing, { title: true })}</div>
      <div class="modal-field">
        <label class="modal-label" for="mSizeCol">Size by (optional, numeric)</label>
        <select id="mSizeCol"><option value="">None</option>${colOptions(existing?.sizeCol, false)}</select>
        <div class="field-hint">Marker size encodes the value; hover shows the raw value. Tune the law, range, and legend below.</div>
      </div>${sizeByExtraControls(existing)}` : ''}
      <div class="check-row">
        <label><input type="checkbox" id="mRightAxis" ${existing?.rightAxis ? 'checked' : ''} />
          Right Y axis <span class="field-hint" style="margin:0">(unavailable in subplot grids)</span></label>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mErrCol">Error bars — ± column (optional)</label>
        <select id="mErrCol"><option value="">None</option>${colOptions(existing?.errCol, false)}</select>
        <div class="field-hint">Symmetric ± from a numeric column; the legend names the column.</div>
      </div>
      ${chartType === 'scatter' ? `
      <div class="check-row" style="align-items:center;gap:8px">
        <label><input type="checkbox" id="mTrend" ${existing?.trendline ? 'checked' : ''} />
          Trendline (least squares; legend shows equation and R²)</label>
        <select id="mTrendDeg" aria-label="Trendline degree" ${existing?.trendline ? '' : 'disabled'}>
          <option value="1" ${(existing?.trendDegree ?? 1) === 1 ? 'selected' : ''}>linear</option>
          <option value="2" ${existing?.trendDegree === 2 ? 'selected' : ''}>quadratic</option>
          <option value="3" ${existing?.trendDegree === 3 ? 'selected' : ''}>cubic</option>
        </select>
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mTrendGroups" ${existing?.trendGroups ? 'checked' : ''} />
          One fit per color group <span class="field-hint" style="margin:0">(needs a categorical Color-by; max 10 groups; always linear)</span></label>
      </div>` : ''}`;
  } else if (chartType === 'bar') {
    const agg = existing?.agg || 'none';
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">Category (X) column <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBarAgg">Aggregation</label>
        <select id="mBarAgg">
          <option value="none"   ${agg === 'none'   ? 'selected' : ''}>None — one row per category</option>
          <option value="count"  ${agg === 'count'  ? 'selected' : ''}>Count rows</option>
          <option value="sum"    ${agg === 'sum'    ? 'selected' : ''}>Sum</option>
          <option value="mean"   ${agg === 'mean'   ? 'selected' : ''}>Mean</option>
          <option value="median" ${agg === 'median' ? 'selected' : ''}>Median</option>
        </select>
        <div class="field-hint">With None, repeated categories error — aggregation is always your explicit choice.</div>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column (numeric) <span class="required">*</span></label>
        <select id="mYCol" ${agg === 'count' ? 'disabled' : ''}>${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBarErr">Error bars</label>
        <select id="mBarErr" ${agg !== 'mean' ? 'disabled' : ''}>
          <option value="">None</option>
          <option value="sd"  ${existing?.errMode === 'sd'  ? 'selected' : ''}>± SD (sample)</option>
          <option value="sem" ${existing?.errMode === 'sem' ? 'selected' : ''}>± SEM</option>
        </select>
        <div class="field-hint">SD/SEM need the Mean aggregation; the legend states the semantics.</div>
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mRightAxis" ${existing?.rightAxis ? 'checked' : ''} />
          Right Y axis <span class="field-hint" style="margin:0">(unavailable in subplot grids)</span></label>
      </div>`;
  } else if (chartType === 'heatmap') {
    const agg = existing?.agg || 'none';
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X (category) column <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y (category) column <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBarAgg">Aggregation</label>
        <select id="mBarAgg">
          <option value="none"   ${agg === 'none'   ? 'selected' : ''}>None — one row per (X, Y)</option>
          <option value="count"  ${agg === 'count'  ? 'selected' : ''}>Count rows</option>
          <option value="sum"    ${agg === 'sum'    ? 'selected' : ''}>Sum</option>
          <option value="mean"   ${agg === 'mean'   ? 'selected' : ''}>Mean</option>
          <option value="median" ${agg === 'median' ? 'selected' : ''}>Median</option>
        </select>
        <div class="field-hint">With None, repeated combinations error — aggregation is always your explicit choice; the colorbar names it.</div>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mZCol">Value column (numeric) <span class="required">*</span></label>
        <select id="mZCol" ${agg === 'count' ? 'disabled' : ''}>${colOptions(existing?.zCol, false)}</select>
      </div>${colorbarExtraControls(existing, {})}`;
  } else if (chartType === 'parity') {
    // Parity has two modes (Stab A): same-dataset (X and Y are two columns of
    // THIS dataset — the common case) or cross-dataset join (Y from a second
    // file). The "Compare against" select drives it; the mJoinDataset change
    // handler (modal-fields.js) repopulates Y + key live. When joined, Y reads
    // from the JOIN dataset (Phase-9 lesson); otherwise from this dataset.
    const joinDs = existing?.joinDatasetId ? appState.datasets.find(d => d.id === existing.joinDatasetId) : null;
    const otherDsOptions = appState.datasets.filter(d => d.id !== dsId).map(d =>
      `<option value="${escHtml(d.id)}" ${existing?.joinDatasetId === d.id ? 'selected' : ''}>${escHtml(d.name)}</option>`
    ).join('');
    const yColHtml = joinDs
      ? joinDs.headers.filter(c => classifyColumn(joinDs.rows, c) === 'numeric')
          .map(c => `<option value="${escHtml(c)}" ${existing?.yCol === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')
      : colOptions(existing?.yCol, false);
    const sharedKeys = joinDs ? cols.filter(c => joinDs.headers.includes(c)) : [];

    html = `
      <div class="modal-section-title">Parity setup</div>
      <div class="modal-field">
        <label class="modal-label" for="mJoinDataset">Compare against</label>
        <select id="mJoinDataset">
          <option value="" ${existing?.joinDatasetId ? '' : 'selected'}>This dataset (two columns)</option>
          ${otherDsOptions}
        </select>
        <div class="field-hint">Same dataset: X and Y are two columns here. Or join a second dataset — observed vs modelled in separate files, matched on a key.</div>
      </div>
      <div class="modal-field" id="mJoinByField" style="display:none">
        <label class="modal-label" for="mJoinByDataset">Join by</label>
        <select id="mJoinByDataset" data-sel="${escHtml(existing?.joinByDatasetId || '')}"></select>
        <div class="field-hint">Defaults to the compare-against dataset. Pick a different one only if observed and modelled match through a separate lookup/bridge table — each key must be unique (1:1).</div>
      </div>
      <div class="modal-field" id="mJoinKeyField" style="display:none">
        <label class="modal-label" for="mJoinKey">Join key <span class="field-hint" style="margin:0">(observed ↔ join-by)</span></label>
        <select id="mJoinKey" data-sel="${escHtml(existing?.joinKey || '')}"></select>
      </div>
      <div class="modal-field" id="mJoinKeyBField" style="display:none">
        <label class="modal-label" for="mJoinKeyB">Join key 2 <span class="field-hint" style="margin:0">(bridge ↔ modelled)</span></label>
        <select id="mJoinKeyB" data-sel="${escHtml(existing?.joinKeyB || '')}"></select>
      </div>
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column — observed <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column — modelled <span class="required">*</span></label>
        <select id="mYCol" data-sel="${escHtml(existing?.yCol || '')}">${yColHtml}</select>
      </div>
      <div class="modal-section-title">Statistics box</div>
      <div class="check-row" role="group" aria-label="Statistics shown in the box">
        <label><input type="checkbox" id="mStatNSE"  ${(existing?.parityStats ? existing.parityStats.includes('nse')  : true) ? 'checked' : ''} /> NSE</label>
        <label><input type="checkbox" id="mStatMAE"  ${(existing?.parityStats ? existing.parityStats.includes('mae')  : true) ? 'checked' : ''} /> MAE</label>
        <label><input type="checkbox" id="mStatRMSE" ${(existing?.parityStats ? existing.parityStats.includes('rmse') : true) ? 'checked' : ''} /> RMSE</label>
        <label><input type="checkbox" id="mStatR2"   ${(existing?.parityStats ? existing.parityStats.includes('r2')   : true) ? 'checked' : ''} ${existing?.parityFit ? '' : 'disabled'} title="Enable the Best-fit line to show R²" /> R²</label>
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mParityShowN" ${existing?.parityShowN !== false ? 'checked' : ''} /> Show N in legend</label>
      </div>
      <div class="field-hint" style="margin:0">Stats appear when this plot's Stats box is on; N shows in the box instead when the legend is off.</div>
      <div class="modal-section-title">Error bands</div>
      <div class="check-row">
        <label><input type="checkbox" id="mBand5"  ${existing?.band5 ?'checked':''} /> ±5%</label>
        <label><input type="checkbox" id="mBand10" ${existing?.band10??true?'checked':''} /> ±10%</label>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBandColor" style="margin:0">Band color
          <input type="color" class="edge-color" id="mBandColor" value="${existing?.bandColor ?? '#5b8dee'}" /></label>
        <label class="modal-label" for="mBandOpacity" style="margin:0">Band opacity
          <input type="number" class="ctrl-input" id="mBandOpacity" min="0" max="1" step="0.05" value="${existing?.bandOpacity ?? 0.25}" style="width:64px" /></label>
        <div class="field-hint">Color and opacity apply to both the ±5% and ±10% bands.</div>
      </div>
      <div class="modal-section-title">Best fit</div>
      <div class="check-row">
        <label><input type="checkbox" id="mParityFit" ${existing?.parityFit ? 'checked' : ''} /> Best-fit line (least squares; R² shown in the stats box)</label>
      </div>
      <div class="check-row" style="align-items:center;gap:12px">
        <label><input type="checkbox" id="mParityFitEquation" ${existing?.parityFitEquation !== false ? 'checked' : ''} /> Show equation in legend</label>
        <label class="modal-label" for="mParityFitSigFigs" style="margin:0">Sig. figures
          <input type="number" class="ctrl-input" id="mParityFitSigFigs" min="1" max="10" step="1" value="${existing?.parityFitSigFigs ?? 4}" style="width:56px" /></label>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mParityFitColor" style="margin:0">Fit line color
          <input type="color" class="edge-color" id="mParityFitColor" value="${existing?.parityFitColor ?? existing?.style?.color ?? '#5b8dee'}" /></label>
        <label class="modal-label" for="mParityFitWidth" style="margin:0">Width
          <input type="number" class="ctrl-input" id="mParityFitWidth" min="0.5" max="10" step="0.5" value="${existing?.parityFitWidth ?? 2}" style="width:64px" /></label>
        <label class="modal-label" for="mParityFitStyle" style="margin:0">Style
          <select id="mParityFitStyle">
            ${['solid','dash','dot','dashdot'].map(d => `<option value="${d}" ${(existing?.parityFitStyle ?? 'solid') === d ? 'selected' : ''}>${d === 'dashdot' ? 'dash-dot' : d}</option>`).join('')}
          </select></label>
      </div>
      <div class="modal-section-title">Encoding</div>
      <div class="modal-field">
        <label class="modal-label" for="mColorCol">Color by (optional)</label>
        <select id="mColorCol"><option value="">None</option>${colOptions(existing?.colorCol, true)}</select>
        <div class="field-hint">From the observed dataset; categories get a legend, numbers a colorbar.</div>
      </div>
      <div id="mColorbarField" style="display:none">${colorbarExtraControls(existing, { title: true })}</div>
      <div class="modal-field">
        <label class="modal-label" for="mSizeCol">Size by (optional, numeric)</label>
        <select id="mSizeCol"><option value="">None</option>${colOptions(existing?.sizeCol, false)}</select>
        <div class="field-hint">Marker size encodes the value; hover shows the raw value. Tune the law, range, and legend below.</div>
      </div>${sizeByExtraControls(existing)}`;
  } else if (chartType === 'histogram') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">Column (numeric) <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBinCount">Bin count <span class="field-hint" style="margin:0">(blank = auto, Freedman-Diaconis)</span></label>
        <input type="number" class="ctrl-input" id="mBinCount" min="1" max="500"
               value="${existing?.binCount ?? ''}" placeholder="auto" />
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mFitDist">Fit distribution</label>
        <select id="mFitDist">
          <option value="">None</option>
          <option value="normal"    ${(existing?.fitDist ?? (existing?.fitNormal ? 'normal' : '')) === 'normal'    ? 'selected' : ''}>Normal (μ, σ)</option>
          <option value="lognormal" ${existing?.fitDist === 'lognormal' ? 'selected' : ''}>Lognormal (μ, σ of ln x)</option>
          <option value="weibull"   ${existing?.fitDist === 'weibull'   ? 'selected' : ''}>Weibull (k, λ — MLE)</option>
        </select>
        <div class="field-hint">Lognormal and Weibull need positive data; non-positive values are excluded with a warning.</div>
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mKde" ${existing?.kde ? 'checked' : ''} /> KDE overlay (Gaussian kernel, Silverman bandwidth)</label>
      </div>`;
  } else if (chartType === 'boxplot' || chartType === 'violin') {
    const thing = chartType === 'violin' ? 'violin' : 'box';
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column (numeric) <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">Group by X (optional, categorical)</label>
        <select id="mXCol"><option value="">None</option>${colOptions(existing?.xCol, true)}</select>
        <div class="field-hint">One ${thing} per unique X value (max 50 before a readability warning).</div>
      </div>`;
  } else if (chartType === 'contour') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column (numeric) <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column (numeric) <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mZCol">Z column (numeric) <span class="required">*</span></label>
        <select id="mZCol">${colOptions(existing?.zCol, false)}</select>
        <div class="field-hint">By default contour needs pre-gridded data: every combination of the unique X and Y values exactly once (e.g. a parameter sweep). To plot scattered points, tick Interpolate below.</div>
      </div>
      ${colorbarExtraControls(existing, { title: true, levels: true })}
      <div class="modal-section-title">Contour lines</div>
      <div class="check-row">
        <label><input type="checkbox" id="mIsoLines" ${existing?.isoLines !== false ? 'checked' : ''} /> Show iso-lines</label>
        <label><input type="checkbox" id="mDisplayGrid" ${existing?.displayGrid !== false ? 'checked' : ''} /> Show grid</label>
      </div>
      <div class="check-row" style="align-items:center;gap:12px">
        <label><input type="checkbox" id="mIsoLabels" ${existing?.isoLabels ? 'checked' : ''} /> Show iso-labels</label>
        <label class="modal-label" for="mIsoLabelSize" style="margin:0">Label size
          <input type="number" class="ctrl-input" id="mIsoLabelSize" min="6" max="24" step="1" value="${existing?.isoLabelSize ?? 10}" style="width:56px" /></label>
      </div>
      <div class="modal-section-title">Shading</div>
      <div class="check-row">
        <label><input type="checkbox" id="mContourSmooth" ${existing?.contourSmooth !== false ? 'checked' : ''} /> Smooth shading <span class="field-hint" style="margin:0">(off → discrete bands)</span></label>
      </div>
      <div class="modal-section-title">Scattered data</div>
      <div class="check-row">
        <label><input type="checkbox" id="mInterpolate" ${existing?.interpolate ? 'checked' : ''} /> Interpolate scattered data <span class="field-hint" style="margin:0">(grids scattered X/Y/Z; nothing invented outside the data's support)</span></label>
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mShowPoints" ${existing?.showPoints ? 'checked' : ''} /> Show data points <span class="field-hint" style="margin:0">(with Interpolate — shows where the surface is backed by data)</span></label>
      </div>`;
  } else if (chartType === 'pair') {
    // Pair plot (SPLOM): numeric-only multi-select checklist (NOT makeDD, which
    // is single-select), default the first 8 (soft cap), + a categorical hue.
    // The checklist + live cell-count + Select all/Clear are wired in
    // modal-fields.js. A pair plot owns the whole panel (no co-resident series).
    const numericCols = cols.filter(c => classifyColumn(ds.rows, c) === 'numeric');
    const nonNum = cols.length - numericCols.length;
    const sel = (Array.isArray(existing?.pairCols) && existing.pairCols.length)
      ? new Set(existing.pairCols)
      : new Set(numericCols.slice(0, 8));
    const checks = numericCols.map(c =>
      // escHtml applied to column name (value + label)
      `<label class="pair-col-row" style="display:block;padding:1px 0"><input type="checkbox" class="mPairCol" value="${escHtml(c)}" ${sel.has(c) ? 'checked' : ''} /> ${escHtml(c)}</label>`
    ).join('');
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="field-hint">Pick the numeric columns to cross-plot — every pair becomes a scatter; the diagonal is left blank.${nonNum ? ` ${nonNum} non-numeric column${nonNum > 1 ? 's' : ''} excluded.` : ''}</div>
      <div style="margin:6px 0">
        <button type="button" class="btn btn-sm" id="mPairAll">Select all</button>
        <button type="button" class="btn btn-sm" id="mPairNone">Clear</button>
        <span class="field-hint" id="mPairCount" style="margin-left:8px"></span>
      </div>
      <div class="pair-col-list" id="mPairColList" style="max-height:180px;overflow:auto;border:1px solid var(--border,#cccccc);border-radius:4px;padding:6px 8px">${checks || '<span class="field-hint">No numeric columns in this dataset.</span>'}</div>
      <div class="modal-field" style="margin-top:12px">
        <label class="modal-label" for="mColorCol">Color by group (optional, categorical)</label>
        <select id="mColorCol"><option value="">None</option>${colOptions(existing?.colorCol, true)}</select>
        <div class="field-hint">Colors points by a category — one color per group, like a hue.</div>
      </div>`;
  }
  return html;
}
