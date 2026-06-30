// modal-field-controls.js — shared field-builder helpers for the series modal,
// extracted from modal-chart-fields.js at the v2.21.0 §6 split (the obligation
// recorded at v2.20.0: the next change to modal-chart-fields.js extracts these
// shared control builders). Pure HTML builders; `chartColumnFields()` in
// modal-chart-fields.js composes them. They use `escHtml` and
// `colormapOptionsHTML` (globals after concatenation); ids are read back in
// modal.js / modal-fields.js.

// Size-by detail controls (Phase 19): sizing law, min/max px, and the size-key
// overrides (label, swatch count, hide, separate legend). Shared by scatter and
// parity (the only size-by renderers); hidden until a Size-by column is picked
// (modal-fields.js toggles #mSizeOptsField on #mSizeCol change). Defaults match
// the historical area-proportional 4–28 px mapping.
function sizeByExtraControls(existing) {
  return `
      <div class="modal-field" id="mSizeOptsField" style="display:${existing?.sizeCol ? '' : 'none'}">
        <label class="modal-label" for="mSizeLaw">Sizing law</label>
        <select id="mSizeLaw">
          <option value="area" ${existing?.sizeLaw !== 'diameter' ? 'selected' : ''}>Area-proportional (recommended)</option>
          <option value="diameter" ${existing?.sizeLaw === 'diameter' ? 'selected' : ''}>Diameter-proportional (exaggerates large values)</option>
        </select>
        <div class="edge-row" style="margin-top:6px">
          <label class="modal-label" for="mSizeMin" style="margin:0">Min px <input type="number" class="ctrl-input" id="mSizeMin" value="${existing?.sizeMin ?? 4}" min="1" max="80" step="1" style="width:64px" /></label>
          <label class="modal-label" for="mSizeMax" style="margin:0">Max px <input type="number" class="ctrl-input" id="mSizeMax" value="${existing?.sizeMax ?? 28}" min="1" max="120" step="1" style="width:64px" /></label>
        </div>
        <label class="modal-label" for="mSizeKeyLabel" style="margin-top:8px">Size legend label</label>
        <input type="text" class="ctrl-input" id="mSizeKeyLabel" value="${escHtml(existing?.sizeKeyLabel || '')}" placeholder="defaults to the column name" />
        <label class="modal-label" for="mSizeKeyCount" style="margin-top:6px">Swatches in size key</label>
        <input type="number" class="ctrl-input" id="mSizeKeyCount" value="${existing?.sizeKeyCount ?? 3}" min="2" max="8" step="1" style="width:64px" />
        <div class="check-row" style="margin-top:8px">
          <label><input type="checkbox" id="mSizeKeyHide" ${existing?.sizeKeyHide ? 'checked' : ''} /> Hide size key from the legend</label>
        </div>
        <div class="check-row">
          <label><input type="checkbox" id="mSizeKeySeparate" ${existing?.sizeKeySeparate ? 'checked' : ''} /> Size key in its own legend</label>
        </div>
      </div>`;
}

// Colorbar styling controls (v2.18.0): manual color range (blank = auto) and a
// reverse-colormap toggle, plus — when opts.title — an editable, hideable
// colorbar title. Heatmap omits the title controls (its colorbar names the
// aggregation, §20). opts.levels adds the contour level count. A per-series
// colormap select (v2.20.0) sits at the top. Reads/writes colorbarLabel/
// colorbarTitleHide/colorMin/colorMax/colorReverse/colormap (+ contourLevels).
function colorbarExtraControls(existing, opts = {}) {
  const title = opts.title ? `
      <div class="modal-field">
        <label class="modal-label" for="mColorbarLabel">Colorbar title <span class="field-hint" style="margin:0">(blank = column name)</span></label>
        <input type="text" class="ctrl-input" id="mColorbarLabel" value="${escHtml(existing?.colorbarLabel || '')}" placeholder="defaults to the column name" />
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mColorbarHide" ${existing?.colorbarTitleHide ? 'checked' : ''} /> Hide colorbar title</label>
      </div>` : '';
  const levels = opts.levels ? `
        <label class="modal-label" for="mContourLevels" style="margin:0">Levels <input type="number" class="ctrl-input" id="mContourLevels" min="2" max="50" step="1" value="${existing?.contourLevels ?? ''}" placeholder="auto" style="width:64px" /></label>` : '';
  // Per-series colormap (v2.20.0): blank inherits the plot's colormap, then the
  // global Style-panel default. Overrides both when set.
  const colormap = `
      <div class="modal-field">
        <label class="modal-label" for="mColormap">Colormap <span class="field-hint" style="margin:0">(blank = inherit plot / global)</span></label>
        <select id="mColormap"><option value=""${existing?.colormap ? '' : ' selected'}>Inherit (plot / global)</option>${colormapOptionsHTML(existing?.colormap)}</select>
      </div>`;
  return `
      <div class="modal-section-title">Colorbar</div>${colormap}${title}
      <div class="edge-row" style="margin-top:6px">
        <label class="modal-label" for="mColorMin" style="margin:0">Color min <input type="number" class="ctrl-input" id="mColorMin" value="${existing?.colorMin ?? ''}" placeholder="auto" style="width:80px" /></label>
        <label class="modal-label" for="mColorMax" style="margin:0">Color max <input type="number" class="ctrl-input" id="mColorMax" value="${existing?.colorMax ?? ''}" placeholder="auto" style="width:80px" /></label>${levels}
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mColorReverse" ${existing?.colorReverse ? 'checked' : ''} /> Reverse colormap</label>
      </div>`;
}
