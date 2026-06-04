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
// Any new code site that uses column names must follow this contract.
// eval() and new Function() are permanently forbidden in this file.
//

// ── Filter operator encoding spec ────────────────────────────────────────
//
// applyFilters(rows, filters) applies a list of filter predicates to an
// array of row objects. eval() and new Function() are permanently
// forbidden — all operators are implemented as explicit switch cases.
//
// Filter object shape: { col, op, value, enabled }
//
//   col     — column name (raw, unescaped)
//   op      — operator string (see table below)
//   value   — operand; type depends on op (see table below)
//   enabled — boolean; false = skip this predicate
//
// Operator table:
//
//   Phase 0–2 (comparison):
//     'eq'      value: scalar   — row[col] == value (type-coerced)
//     'neq'     value: scalar   — row[col] != value
//     'lt'      value: scalar   — row[col] <  value (numeric)
//     'gt'      value: scalar   — row[col] >  value (numeric)
//     'lte'     value: scalar   — row[col] <= value (numeric)
//     'gte'     value: scalar   — row[col] >= value (numeric)
//
//   Phase 3+ (extended):
//     'in_range' value: { min, max } — min <= row[col] <= max (numeric)
//     'in_set'   value: string[]    — row[col] is in the set (categorical)
//
// Adding a new op string does not require a schema migration.
// CHANGING THE BEHAVIOR of an existing op string is a MAJOR version bump.
//
// AND/OR logic per series:
//   Phase 0–2: AND-only (all enabled predicates must pass)
//   Phase 3+:  toggle per series — 'and' | 'or'
//

// ── applyFilters ──────────────────────────────────────────────────────────

/**
 * @param {object[]} rows    - dataset rows
 * @param {object[]} filters - filter predicates ({ col, op, value, enabled })
 * @param {string}   logic   - 'and' (default) | 'or'
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

// Evaluates a single predicate against a row. All operators are explicit
// switch cases — eval() and new Function() are permanently forbidden.
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
    default:         return true; // unknown op: pass through without filtering
  }
}
