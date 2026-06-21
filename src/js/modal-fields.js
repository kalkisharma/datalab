// modal-fields.js — per-chart-type field builder for the series modal
// (split from modal.js at the Phase 3 exit refactor review — verbatim move)

function renderDynamicFields(existing) {
  const dsId     = document.getElementById('mDataset').value;
  const chartType = document.getElementById('mChartType').value;
  const ds       = appState.datasets.find(d => d.id === dsId);
  const container = document.getElementById('mDynamicFields');

  // innerHTML: empty string — no user data
  if (!ds || !chartType) { container.innerHTML = ''; return; }

  const cols = ds.headers;
  const numericCols = cols.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  const allCols     = cols;

  function colOptions(selected, includeAll, allowDatetime = false) {
    const list = includeAll ? allCols : numericCols;
    return list.map(c => {
      const type = classifyColumn(ds.rows, c);
      const disabled = (type === 'datetime' && !allowDatetime)
        ? 'disabled title="Datetime not supported for this field"' : '';
      // escHtml applied to column name in option text
      return `<option value="${escHtml(c)}" ${selected === c ? 'selected':''} ${disabled}>${escHtml(c)}${type==='datetime'?' (datetime)':''}</option>`;
    }).join('');
  }

  let html = chartColumnFields(chartType, ds, dsId, existing, colOptions, cols);
  // Style overrides (all chart types) — blank number fields inherit the
  // global Style panel values; color defaults to the series/dataset color
  const curColor = existing?.style?.color ?? ds.color ?? '#5b8dee';
  const showLineWidth = chartType === 'line'; // parity's main trace is markers — no line width
  // Marker shape applies only to the marker-drawing chart types (Phase 19+)
  const showSymbol = chartType === 'scatter' || chartType === 'parity' || chartType === 'line';
  const SYMBOLS = ['circle', 'square', 'diamond', 'triangle-up', 'triangle-down', 'cross', 'x', 'star', 'hexagon', 'pentagon'];
  const curSymbol = existing?.style?.symbol || '';
  // Line-only controls (Phase 19+): markers toggle, separate marker colour, dash
  const DASHES = [['', 'Solid'], ['dash', 'Dash'], ['dot', 'Dot'], ['dashdot', 'Dash-dot']];
  const curDash = existing?.style?.lineDash || '';
  const markersOn = existing?.style?.showMarkers !== false; // default ON
  const curMarkerColor = existing?.style?.markerColor || curColor; // pre-fill to the line colour
  html += `
    <div class="modal-section-title">Style</div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleColor">${chartType === 'line' ? 'Line color' : 'Color'}</label>
      <input type="color" class="edge-color" id="mStyleColor" value="${escHtml(curColor)}" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleMarkerSize">Marker size <span class="field-hint" style="margin:0">(blank = global)</span></label>
      <input type="number" class="ctrl-input" id="mStyleMarkerSize" min="1" max="30"
             value="${existing?.style?.markerSize ?? ''}" placeholder="global" />
    </div>
    ${showSymbol ? `
    <div class="modal-field">
      <label class="modal-label" for="mStyleMarkerSymbol">Marker shape</label>
      <select id="mStyleMarkerSymbol">
        <option value="">Global default (circle)</option>
        ${SYMBOLS.map(sym => `<option value="${sym}" ${curSymbol === sym ? 'selected' : ''}>${sym}</option>`).join('')}
      </select>
    </div>` : ''}
    ${showLineWidth ? `
    <div class="modal-field">
      <label class="modal-label" for="mStyleLineWidth">Line width <span class="field-hint" style="margin:0">(blank = global)</span></label>
      <input type="number" class="ctrl-input" id="mStyleLineWidth" min="0.5" max="10" step="0.5"
             value="${existing?.style?.lineWidth ?? ''}" placeholder="global" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleLineDash">Line style</label>
      <select id="mStyleLineDash">
        ${DASHES.map(([v, lbl]) => `<option value="${v}" ${curDash === v ? 'selected' : ''}>${lbl}</option>`).join('')}
      </select>
    </div>
    <div class="check-row">
      <label><input type="checkbox" id="mStyleShowMarkers" ${markersOn ? 'checked' : ''} /> Show markers</label>
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleMarkerColor">Marker color <span class="field-hint" style="margin:0">(defaults to line color)</span></label>
      <input type="color" class="edge-color" id="mStyleMarkerColor" value="${escHtml(curMarkerColor)}" />
    </div>` : ''}`;

  // Filters (all chart types)
  html += `
    <div class="modal-section-title">Filters <span class="filter-count" id="mFilterCount"></span></div>
    <div class="modal-field">
      <label class="modal-label" for="mFilterLogic">Combine filters with</label>
      <select id="mFilterLogic">
        <option value="and" ${(existing?.filterLogic ?? 'and') === 'and' ? 'selected' : ''}>AND — every filter must match</option>
        <option value="or"  ${existing?.filterLogic === 'or' ? 'selected' : ''}>OR — any filter may match</option>
      </select>
    </div>
    <div class="filter-list" id="mFilterList"></div>
    <button class="btn btn-sm" id="mAddFilter">+ Add filter</button>`;

  // innerHTML: all column names escaped via colOptions()/escHtml(); dataset/series names escaped via escHtml()
  container.innerHTML = html;

  // Scatter: the colorbar-label field only applies to a NUMERIC color-by
  // (categorical renders as a discrete legend, no colorbar) — show it only
  // when the selected color column is numeric
  const mColorCol = document.getElementById('mColorCol');
  const mColorbarField = document.getElementById('mColorbarField');
  if (mColorCol && mColorbarField) {
    const syncColorbar = () => {
      const c = mColorCol.value;
      mColorbarField.style.display = (c && classifyColumn(ds.rows, c) === 'numeric') ? '' : 'none';
    };
    mColorCol.addEventListener('change', syncColorbar);
    syncColorbar();
  }

  // Scatter/parity: the size-by detail controls (law, min/max, size-key
  // overrides) only apply once a Size-by column is chosen (Phase 19)
  const mSizeCol = document.getElementById('mSizeCol');
  const mSizeOptsField = document.getElementById('mSizeOptsField');
  if (mSizeCol && mSizeOptsField) {
    const syncSizeOpts = () => { mSizeOptsField.style.display = mSizeCol.value ? '' : 'none'; };
    mSizeCol.addEventListener('change', syncSizeOpts);
    syncSizeOpts();
  }

  // Scatter: the degree select only means something with the trendline on
  const mTrend = document.getElementById('mTrend');
  if (mTrend) {
    mTrend.addEventListener('change', () => {
      document.getElementById('mTrendDeg').disabled = !mTrend.checked;
    });
  }

  // Bar/heatmap: aggregation drives which dependent fields make sense —
  // the value column is meaningless for count (bar: Y; heatmap: Z), and
  // SD/SEM only exist for bar's mean
  const mBarAgg = document.getElementById('mBarAgg');
  if (mBarAgg) {
    mBarAgg.addEventListener('change', () => {
      const v = mBarAgg.value;
      const valSel = document.getElementById(chartType === 'heatmap' ? 'mZCol' : 'mYCol');
      if (valSel) valSel.disabled = v === 'count';
      const errSel = document.getElementById('mBarErr');
      if (errSel) {
        errSel.disabled = v !== 'mean';
        if (v !== 'mean') errSel.value = '';
      }
    });
  }

  // Parity: switching the join dataset re-derives the Y (modelled) and
  // join key options from the newly chosen dataset
  const mjd = document.getElementById('mJoinDataset');
  if (mjd) {
    mjd.addEventListener('change', () => {
      const jds = appState.datasets.find(d => d.id === mjd.value);
      if (!jds) {
        // scatter "none": Y reverts to this dataset's numeric columns; key clears
        // innerHTML: column names escaped via colOptions()/escHtml()
        document.getElementById('mYCol').innerHTML = colOptions(null, false);
        const jk = document.getElementById('mJoinKey');
        // innerHTML: static option markup — no user data
        if (jk) jk.innerHTML = '<option value="">Select key…</option>';
        return;
      }
      const numeric = jds.headers.filter(c => classifyColumn(jds.rows, c) === 'numeric');
      // innerHTML: column names escaped via escHtml()
      document.getElementById('mYCol').innerHTML = numeric.map(c =>
        `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
      const shared = ds.headers.filter(c => jds.headers.includes(c));
      // innerHTML: column names escaped via escHtml()
      document.getElementById('mJoinKey').innerHTML =
        '<option value="">Select key…</option>' + shared.map(c =>
        `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    });
  }

  // Wire filter list
  renderFilterList(existing?.filters || [], ds);
  document.getElementById('mAddFilter').addEventListener('click', () => {
    addFilterRow(ds);
    updateFilterCount();
  });

  updateFilterCount();
}
