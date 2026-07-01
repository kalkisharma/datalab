// modal-chart-fields-parity.js — the parity chart type's modal Columns/setup
// field HTML (§6 split out of modal-chart-fields.js at the Phase 19 exit — the
// file crossed the ~300 trigger again as qq/residual/trendBands fields landed,
// and parity is the largest single branch). Pure HTML builder; colOptions/cols
// are passed in from renderDynamicFields exactly as for the other chart types.

function parityColumnFields(existing, dsId, colOptions, cols) {
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

  // innerHTML: dataset/column names escaped via escHtml()/colOptions()
  return `
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
}
