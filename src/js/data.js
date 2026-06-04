// data.js — CSV parsing, column classification, and filter evaluation

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
