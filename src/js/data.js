// data.js — CSV parsing and ingestion, column classification, and filter evaluation

// ── parseCSV — escaping contract ─────────────────────────────────────────
//
// Column names are trimmed of whitespace on load. They are stored RAW
// (unescaped) in dataset.headers and used RAW as dropdown display text.
// escHtml() is applied at the point of DOM insertion — NOT at parse time.
//
// Callers that interpolate column names into innerHTML MUST call escHtml().
// Callers that use column names as dropdown option text must NOT escape
// (double-escaping would display literal &lt; etc. to the user).
//
// This is the authoritative escaping contract for column names.
// eval() and new Function() are permanently forbidden in this file.
//

// ── Filter operator encoding spec ────────────────────────────────────────
//
// applyFilters(rows, filters, logic) evaluates a list of filter predicates.
// eval() and new Function() are permanently forbidden.
//
// Filter object shape: { col, op, value, enabled }
//
//   col     — column name (raw, unescaped)
//   op      — operator string (see table below)
//   value   — operand; type depends on op
//   enabled — boolean; false = skip this predicate
//
// Operator table:
//   Phase 0-2:  'eq' 'neq' 'lt' 'gt' 'lte' 'gte'  value: scalar
//   Phase 3+:   'in_range'  value: { min, max }
//               'in_set'    value: string[]
//
// Adding a new op string does not require a schema migration.
// Changing the behavior of an existing op string is a MAJOR version bump.
//
// AND/OR logic: 'and' (default, Phase 0-2) | 'or' (Phase 3+)
//

/**
 * @param {object[]} rows
 * @param {object[]} filters
 * @param {string}   logic   'and' | 'or'
 * @returns {object[]}
 */
function applyFilters(rows, filters, logic = 'and') {
  const active = filters.filter(f => f.enabled);
  if (!active.length) return rows;
  return rows.filter(row => {
    const results = active.map(f => evalPredicate(row, f));
    return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  });
}

// Evaluates a single predicate. All operators are explicit switch cases —
// eval() and new Function() are permanently forbidden.
function evalPredicate(row, { col, op, value }) {
  const raw = row[col];
  switch (op) {
    case 'eq':       return String(raw) === String(value);
    case 'neq':      return String(raw) !== String(value);
    case 'lt':       return Number(raw) <   Number(value);
    case 'gt':       return Number(raw) >   Number(value);
    case 'lte':      return Number(raw) <=  Number(value);
    case 'gte':      return Number(raw) >=  Number(value);
    case 'in_range': return Number(raw) >= Number(value.min) && Number(raw) <= Number(value.max);
    case 'in_set':   return Array.isArray(value) && value.map(String).includes(String(raw));
    default:         return true;
  }
}

// ── parseCSV ──────────────────────────────────────────────────────────────

/**
 * @param {File}     file
 * @param {Function} cb   called with Papa.parse result
 */
function parseCSV(file, cb) {
  // skipEmptyLines silently discards blank rows; reported row count may differ from file line count
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    // Strip BOM and normalize non-breaking spaces in header names
    transformHeader: h => h.replace(/^﻿/, '').replace(/ /g, ' ').trim(),
    complete: cb,
    error: e => console.error('CSV parse error:', e),
  });
}

// ── Datetime handling (Phase 3) ───────────────────────────────────────────
//
// Supported formats: ISO 8601 (unambiguous), MM/DD/YYYY, DD/MM/YYYY.
// Slash format is detected from the data: any first component > 12 proves
// DD/MM, any second component > 12 proves MM/DD. If neither occurs the
// format is ambiguous and the user is prompted once per dataset+column;
// the choice is stored in ds.dateFormats[col] ('MDY' | 'DMY' | 'ISO').

const DT_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

/**
 * @param {Array} vals - raw column values
 * @returns {'ISO'|'MDY'|'DMY'|'ambiguous'|null}
 */
function detectDateFormat(vals) {
  let sawISO = false, sawSlash = false, firstOver12 = false, secondOver12 = false;
  for (const v of vals) {
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { sawISO = true; continue; }
    const m = DT_SLASH.exec(s);
    if (!m) continue;
    sawSlash = true;
    if (+m[1] > 12) firstOver12 = true;
    if (+m[2] > 12) secondOver12 = true;
  }
  if (!sawSlash) return sawISO ? 'ISO' : null;
  if (firstOver12 && !secondOver12) return 'DMY';
  if (secondOver12 && !firstOver12) return 'MDY';
  return 'ambiguous'; // includes contradictory data — let the user decide
}

/**
 * @param {*} v
 * @param {'ISO'|'MDY'|'DMY'} fmt
 * @returns {string|null} ISO date string, or null if unparseable
 */
function parseDateValue(v, fmt) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s; // ISO passthrough
  const m = DT_SLASH.exec(s);
  if (!m) return null;
  let a = +m[1], b = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  const [mo, d] = fmt === 'DMY' ? [b, a] : [a, b];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── validateSeriesColumns ─────────────────────────────────────────────────

// Checks every column reference a series holds against the current dataset
// headers. Returns human-readable descriptions of missing references (empty
// array = valid). Used after dataset reload and before each render so a
// reloaded CSV with different columns produces a clear error instead of a
// silent all-NaN plot.
/**
 * @param {object}   s         series
 * @param {object[]} datasets
 * @returns {string[]} missing reference descriptions
 */
function validateSeriesColumns(s, datasets) {
  const missing = [];
  const ds = datasets.find(d => d.id === s.datasetId);
  if (!ds) return ['its dataset (removed)'];
  const check = (col, label, headers, where) => {
    if (col && !headers.includes(col)) missing.push(`${label} "${col}"${where ? ` in ${where}` : ''}`);
  };
  check(s.xCol, 'X column', ds.headers);
  if (s.chartType === 'parity') {
    if (s.joinDatasetId) {
      const jds = datasets.find(d => d.id === s.joinDatasetId);
      if (!jds) {
        missing.push('its join dataset (removed)');
      } else {
        check(s.yCol, 'Y column', jds.headers, jds.name);
        check(s.joinKey, 'join key', ds.headers, ds.name);
        check(s.joinKey, 'join key', jds.headers, jds.name);
      }
    } else {
      // Same-dataset parity: Y is a column of this dataset
      check(s.yCol, 'Y column', ds.headers);
    }
  } else {
    check(s.yCol, 'Y column', ds.headers);
    check(s.colorCol, 'color column', ds.headers);
    check(s.zCol, 'Z column', ds.headers);
    check(s.errCol, 'error column', ds.headers);
    check(s.sizeCol, 'size column', ds.headers);
  }
  (s.filters || []).forEach(f => {
    if (f.enabled !== false) check(f.col, 'filter column', ds.headers);
  });
  return missing;
}

// ── classifyColumn ────────────────────────────────────────────────────────

// Classifies a column as 'numeric', 'datetime', or 'categorical'.
// >50% finite numeric values = numeric (tolerates sparse NaN/null).
// Datetime detection is basic ISO 8601 / common format heuristic.
// Phase 1 uses numeric and categorical only; datetime columns are
// detected but shown as disabled in the column picker.
/**
 * @param {object[]} rows
 * @param {string}   col
 * @returns {'numeric'|'datetime'|'categorical'}
 */
function classifyColumn(rows, col) {
  const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
  if (!vals.length) return 'categorical';

  const numericCount = vals.filter(v => Number.isFinite(Number(v))).length;
  if (numericCount > vals.length * 0.5) return 'numeric';

  // Datetime heuristic: ISO 8601 or common date strings
  const dtPattern = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
  const dtCount = vals.filter(v => typeof v === 'string' && dtPattern.test(v.trim())).length;
  if (dtCount > vals.length * 0.5) return 'datetime';

  return 'categorical';
}

// ── Ingestion ─────────────────────────────────────────────────────────────
// (moved from wiring.js at the Phase 15 §6 review — ingestion lives next to
// the parser it feeds; wiring.js keeps only event plumbing)

function wireDropzone() {
  const dz = g('dropzone');
  const fi = g('fileInput');
  fi.addEventListener('change', e => {
    [...e.target.files].forEach(f => handleFile(f));
    fi.value = ''; // allow re-selecting the same file
  });
  // Keyboard: the file input is natively focusable and opens on Enter —
  // no keydown shim on the wrapper (axe nested-interactive, Phase 4 audit)
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    [...e.dataTransfer.files].filter(f => f.name.endsWith('.csv')).forEach(f => handleFile(f));
  });
}

/**
 * @param {File} file
 */
function handleFile(file) {
  parseCSV(file, result => {
    if (!result.data.length) return;
    const headers = result.meta.fields || Object.keys(result.data[0] || {});
    if (!headers.length) return;

    const name = file.name.replace(/\.csv$/i, '');
    // Announce arrival to screen readers — dataset load was silent (Phase 16,
    // Phase 15 NVDA finding). textContent: no escaping needed.
    const announce = verb => {
      const el = document.getElementById('loadStatus');
      if (el) el.textContent = `${verb} ${name}: ${result.data.length} rows, ${headers.length} columns`;
    };

    // Reload: same file name as an existing dataset replaces its data in
    // place (id, display name, and color survive), bumps the dataset
    // revision to invalidate caches, and re-validates every series that
    // references it
    const existing = appState.datasets.find(d => d.name === name);
    if (existing) {
      existing.rows    = result.data;
      existing.headers = headers;
      bumpDatasetRev(existing.id);
      const problems = appState.series
        .filter(s => s.datasetId === existing.id || s.joinDatasetId === existing.id)
        .map(s => ({ series: s, missing: validateSeriesColumns(s, appState.datasets) }))
        .filter(p => p.missing.length);
      showDataAlerts(existing, problems);
      renderDatasetList();
      renderSeriesList();
      announce('Reloaded');
      if (appState.plotRendered) debounceRender();
      return;
    }

    // New dataset: pull color from palette by position
    const color = PALETTE[appState.datasets.length % PALETTE.length];
    appState.datasets.push({ id: uid(), name, rows: result.data, headers, color });
    showDataAlerts(null, []);
    renderDatasetList();
    renderSeriesList();
    announce('Loaded');
    scheduleRender();
  });
}
