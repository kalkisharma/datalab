// expr.js — safe arithmetic expression engine for computed columns (Phase 12)
//
// ── Security contract (STANDARDS §8 expression-evaluation rule) ───────────
//
// NO string-to-code path exists or may ever be added to this file: no
// eval, no Function, no setTimeout(string), no dynamic import, no member
// access in the grammar. The pipeline is:
//
//   tokenize (fixed alphabet) → recursive-descent parse → AST
//   → per-row switch-interpreter
//
// Column references are resolved against the dataset's actual headers AT
// PARSE TIME (allowlist by construction); unknown identifiers are parse
// errors, so reaching for `constructor`, `__proto__`, or any other
// property name is rejected before evaluation exists. Functions come from
// a frozen table. Hard caps bound abuse and accident alike:
//   expression ≤ 500 chars, ≤ 200 tokens, AST depth ≤ 32.
//
// Grammar (precedence low → high):
//   expr   := add
//   add    := mul (('+'|'-') mul)*
//   mul    := unary (('*'|'/'|'%') unary)*
//   unary  := '-' unary | pow
//   pow    := primary ('^' unary)?          // right-associative
//   primary:= NUMBER | FUNC '(' expr (',' expr)* ')' | COLUMN | '(' expr ')'
//   COLUMN := bare identifier in headers | `backtick-quoted` header
//
// Evaluation coerces column reads through finiteOrNaN (stats.js) — missing
// values propagate as NaN, matching every other statistic in the app.
// Security Engineer reviewed this parser before merge (§8).

const EXPR_MAX_LEN    = 500;
const EXPR_MAX_TOKENS = 200;
const EXPR_MAX_DEPTH  = 32;

// Frozen function table — name → [fn, minArity, maxArity]
const EXPR_FUNCTIONS = Object.freeze({
  abs:   [Math.abs,   1, 1],
  sqrt:  [Math.sqrt,  1, 1],
  ln:    [Math.log,   1, 1],
  log10: [Math.log10, 1, 1],
  exp:   [Math.exp,   1, 1],
  pow:   [Math.pow,   2, 2],
  round: [Math.round, 1, 1],
  floor: [Math.floor, 1, 1],
  ceil:  [Math.ceil,  1, 1],
  min:   [Math.min,   2, 8],
  max:   [Math.max,   2, 8],
});

/**
 * Parse an expression against a dataset's headers.
 * @param {string}   src
 * @param {string[]} headers - the only identifiers that may resolve
 * @returns {{ ast: object, error: null } | { ast: null, error: string }}
 */
function parseExpr(src, headers) {
  if (typeof src !== 'string' || !src.trim()) return { ast: null, error: 'Empty expression.' };
  if (src.length > EXPR_MAX_LEN) return { ast: null, error: `Expression too long (max ${EXPR_MAX_LEN} characters).` };

  // ── Tokenize ──
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) return { ast: null, error: `Bad number at position ${i + 1}.` };
      tokens.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ t: 'ident', v: m[0] });
      i += m[0].length;
    } else if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end < 0) return { ast: null, error: 'Unclosed backtick column name.' };
      tokens.push({ t: 'bcol', v: src.slice(i + 1, end) });
      i = end + 1;
    } else if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ t: ch });
      i++;
    } else {
      return { ast: null, error: `Unexpected character "${ch}" — only numbers, column names, + - * / % ^ ( ) , and the listed functions are allowed.` };
    }
    if (tokens.length > EXPR_MAX_TOKENS) return { ast: null, error: `Expression too complex (max ${EXPR_MAX_TOKENS} tokens).` };
  }
  if (!tokens.length) return { ast: null, error: 'Empty expression.' };

  // ── Parse (recursive descent) ──
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  let parseError = null;
  const fail = msg => { if (!parseError) parseError = msg; return null; };

  function parseAdd(depth) {
    if (depth > EXPR_MAX_DEPTH) return fail(`Expression too deeply nested (max ${EXPR_MAX_DEPTH}).`);
    let left = parseMul(depth + 1);
    while (left && peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      const right = parseMul(depth + 1);
      if (!right) return null;
      left = { type: 'bin', op, l: left, r: right };
    }
    return left;
  }
  function parseMul(depth) {
    if (depth > EXPR_MAX_DEPTH) return fail(`Expression too deeply nested (max ${EXPR_MAX_DEPTH}).`);
    let left = parseUnary(depth + 1);
    while (left && peek() && (peek().t === '*' || peek().t === '/' || peek().t === '%')) {
      const op = next().t;
      const right = parseUnary(depth + 1);
      if (!right) return null;
      left = { type: 'bin', op, l: left, r: right };
    }
    return left;
  }
  function parseUnary(depth) {
    if (depth > EXPR_MAX_DEPTH) return fail(`Expression too deeply nested (max ${EXPR_MAX_DEPTH}).`);
    if (peek() && peek().t === '-') { next(); const e = parseUnary(depth + 1); return e && { type: 'neg', e }; }
    return parsePow(depth + 1);
  }
  function parsePow(depth) {
    if (depth > EXPR_MAX_DEPTH) return fail(`Expression too deeply nested (max ${EXPR_MAX_DEPTH}).`);
    const base = parsePrimary(depth + 1);
    if (base && peek() && peek().t === '^') {
      next();
      const exp = parseUnary(depth + 1); // right-associative
      return exp && { type: 'bin', op: '^', l: base, r: exp };
    }
    return base;
  }
  function parsePrimary(depth) {
    if (depth > EXPR_MAX_DEPTH) return fail(`Expression too deeply nested (max ${EXPR_MAX_DEPTH}).`);
    const tk = next();
    if (!tk) return fail('Unexpected end of expression.');
    if (tk.t === 'num') return { type: 'num', v: tk.v };
    if (tk.t === 'bcol') {
      if (!headers.includes(tk.v)) return fail(`Unknown column "${tk.v}".`);
      return { type: 'col', name: tk.v };
    }
    if (tk.t === 'ident') {
      if (peek() && peek().t === '(') {
        // Function call — allowlist only
        const spec = EXPR_FUNCTIONS[tk.v];
        if (!spec) return fail(`Unknown function "${tk.v}" — allowed: ${Object.keys(EXPR_FUNCTIONS).join(', ')}.`);
        next(); // consume '('
        const args = [];
        if (peek() && peek().t !== ')') {
          for (;;) {
            const a = parseAdd(depth + 1);
            if (!a) return null;
            args.push(a);
            if (peek() && peek().t === ',') { next(); continue; }
            break;
          }
        }
        if (!peek() || next().t !== ')') return fail(`Missing ")" after ${tk.v}(…).`);
        if (args.length < spec[1] || args.length > spec[2]) {
          return fail(`${tk.v}() takes ${spec[1] === spec[2] ? spec[1] : `${spec[1]}–${spec[2]}`} argument(s).`);
        }
        return { type: 'fn', name: tk.v, args };
      }
      // Bare column reference — must be a real header
      if (!headers.includes(tk.v)) {
        return fail(`Unknown column "${tk.v}" — backtick-quote names with spaces, e.g. \`flow rate\`.`);
      }
      return { type: 'col', name: tk.v };
    }
    if (tk.t === '(') {
      const e = parseAdd(depth + 1);
      if (!e) return null;
      if (!peek() || next().t !== ')') return fail('Missing ")".');
      return e;
    }
    return fail(`Unexpected "${tk.t}".`);
  }

  const ast = parseAdd(0);
  if (!ast) return { ast: null, error: parseError ?? 'Invalid expression.' };
  if (pos < tokens.length) return { ast: null, error: `Unexpected "${tokens[pos].t === 'ident' ? tokens[pos].v : tokens[pos].t}" after the expression.` };
  return { ast, error: null };
}

/**
 * Evaluate a parsed AST against one row. Missing/non-numeric column values
 * become NaN and propagate (finiteOrNaN, stats.js).
 * @param {object} node - AST from parseExpr
 * @param {object} row
 * @returns {number}
 */
function evalExpr(node, row) {
  switch (node.type) {
    case 'num': return node.v;
    case 'col': return finiteOrNaN(row[node.name]);
    case 'neg': return -evalExpr(node.e, row);
    case 'bin': {
      const l = evalExpr(node.l, row), r = evalExpr(node.r, row);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '^': return Math.pow(l, r);
      }
      return NaN;
    }
    case 'fn': {
      const args = node.args.map(a => evalExpr(a, row));
      return EXPR_FUNCTIONS[node.name][0](...args);
    }
  }
  return NaN;
}
