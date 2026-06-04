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
