/**
 * Lambda handling — compiles the small Java lambda expressions StreamLens
 * analyses into JavaScript functions.
 *
 * The Java backend recognises a handful of patterns with regexes
 * (`n -> n > 10`, `n -> n * 2`, ...). Here we first try a *real* compile of the
 * expression body, which covers far more code, and fall back to the same regex
 * heuristics when the expression is not understood. Anything we cannot analyse
 * is reported through `analyzable === false` so the equivalence engine can
 * answer UNKNOWN instead of guessing.
 */

const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

/** Java `int` semantics for arithmetic that can overflow. */
export function toInt(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 0;
  return n | 0;
}

export function javaDiv(a, b) {
  if (b === 0) throw new Error('division by zero');
  return toInt(toInt(a) / toInt(b));
}

export function javaMod(a, b) {
  if (b === 0) throw new Error('division by zero');
  return toInt(a) % toInt(b);
}

const ALLOWED_CALLS = new Set([
  'abs', 'min', 'max', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'signum',
  'toInt', 'javaDiv', 'javaMod', 'parseInt', 'toString', 'valueOf',
  'length', 'size', 'isEmpty', 'contains', 'equals', 'compareTo', 'charAt',
  'startsWith', 'endsWith', 'matches', 'toLowerCase', 'toUpperCase', 'trim',
]);

const BLOCKED_TOKENS = [
  'process', 'require', 'eval', 'Function', 'globalThis', 'window', 'document',
  'import', 'fetch', 'XMLHttpRequest', 'localStorage', '__proto__', 'prototype',
  'constructor', 'setTimeout', 'setInterval',
];

/**
 * @param {string|null} expression raw lambda / argument text, e.g. `n -> n > 10`
 * @returns {{params: string[], body: string, isLambda: boolean}}
 */
export function parseLambda(expression) {
  if (!expression) return { params: [], body: '', isLambda: false };
  const text = String(expression).trim();

  const arrowIndex = topLevelArrow(text);
  if (arrowIndex < 0) {
    // Method reference (`Integer::intValue`) or a plain expression argument.
    return { params: [], body: text, isLambda: false };
  }

  const rawParams = text.slice(0, arrowIndex).trim();
  let body = text.slice(arrowIndex + 2).trim();

  const params = rawParams
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    // drop declared types: `(int n)` → `n`
    .map((p) => p.split(/\s+/).pop());

  if (body.startsWith('{')) {
    const inner = body.slice(1, body.lastIndexOf('}')).trim();
    const singleReturn = /^return\s+([\s\S]*?);?$/.exec(inner);
    body = singleReturn ? singleReturn[1].trim() : inner;
  }

  return { params, body, isLambda: true };
}

function topLevelArrow(text) {
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '-' && text[i + 1] === '>' && depth === 0) return i;
  }
  return -1;
}

/**
 * Compile a lambda expression into a JS function.
 * @returns {{fn: ((...args:any[]) => any)|null, analyzable: boolean, reason?: string, source: 'compiled'|'heuristic'|'none'}}
 */
export function compileLambda(expression) {
  if (expression === null || expression === undefined || String(expression).trim() === '') {
    return { fn: null, analyzable: false, reason: 'no expression supplied', source: 'none' };
  }

  const { params, body, isLambda } = parseLambda(expression);
  if (!isLambda || params.length === 0 || !body) {
    return { fn: null, analyzable: false, reason: `expression \`${expression}\` is not a lambda`, source: 'none' };
  }

  const transpiled = transpile(body);
  if (!transpiled.ok) {
    return { fn: null, analyzable: false, reason: transpiled.reason, source: 'none' };
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'toInt', 'javaDiv', 'javaMod', 'Math',
      ...params,
      `"use strict"; return (${transpiled.code});`,
    ).bind(null, toInt, javaDiv, javaMod, Math);

    // Smoke-test with a couple of values so broken lambdas are caught early.
    fn(...params.map(() => 3));
    return { fn, analyzable: true, source: 'compiled' };
  } catch (err) {
    return {
      fn: null,
      analyzable: false,
      reason: `could not evaluate \`${expression}\` (${err.message})`,
      source: 'none',
    };
  }
}

/** Translate a Java expression body into JavaScript we are willing to execute. */
function transpile(body) {
  let code = body;

  for (const token of BLOCKED_TOKENS) {
    if (new RegExp(`\\b${token}\\b`).test(code)) {
      return { ok: false, reason: `expression uses unsupported token \`${token}\``, code: null };
    }
  }

  // Java-specific helpers → runtime helpers.
  code = code
    .replace(/\bMath\s*\.\s*floorDiv\s*\(/g, 'javaDiv(')
    .replace(/\bMath\s*\.\s*floorMod\s*\(/g, 'javaMod(')
    .replace(/\bInteger\s*\.\s*parseInt\s*\(/g, 'parseInt(')
    .replace(/\bInteger\s*\.\s*valueOf\s*\(/g, 'toInt(')
    .replace(/\bInteger\s*\.\s*(MAX_VALUE|MIN_VALUE)\b/g, (_m, g) => (g === 'MAX_VALUE' ? String(INT32_MAX) : String(INT32_MIN)))
    .replace(/\bMath\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g, (m, name) => (ALLOWED_CALLS.has(name) ? `Math.${name}(` : m))
    .replace(/\bnull\b/g, 'null');

  // `/` and `%` on integers must follow Java truncation, not JS float semantics.
  code = rewriteIntOperators(code);

  // Only allow identifiers that look like lambda parameters or numbers.
  const calls = [...code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  for (const call of calls) {
    if (!ALLOWED_CALLS.has(call) && !/^Math$/.test(call)) {
      return { ok: false, reason: `expression calls unsupported method \`${call}()\``, code: null };
    }
  }

  if (/[;{}]/.test(code)) {
    return { ok: false, reason: 'expression contains statements rather than a single value', code: null };
  }

  return { ok: true, code, reason: null };
}

/** Wrap `/` and `%` operands in the Java-int helpers so integer semantics match the JVM. */
function rewriteIntOperators(code) {
  // Repeated passes turn `a / b / c` into nested javaDiv calls, innermost first.
  const pattern = /([A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\([^()]*\))\s*([/%])\s*([A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|\([^()]*\))/g;
  let current = code;
  for (let pass = 0; pass < 4; pass++) {
    const next = current.replace(pattern, (_m, left, op, right) =>
      op === '/' ? `javaDiv(${left}, ${right})` : `javaMod(${left}, ${right})`);
    if (next === current) break;
    current = next;
  }
  return current;
}

function matchingParen(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/* ------------------------------------------------------------------ *
 * Fallback heuristics — same patterns the Java backend recognises.
 * ------------------------------------------------------------------ */

const COMPARISONS = [
  { re: /(\w+)\s*>=\s*(-?\d+)/g, make: (v) => (x) => x >= v },
  { re: /(\w+)\s*<=\s*(-?\d+)/g, make: (v) => (x) => x <= v },
  { re: /(\w+)\s*==\s*(-?\d+)/g, make: (v) => (x) => x === v },
  { re: /(\w+)\s*!=\s*(-?\d+)/g, make: (v) => (x) => x !== v },
  { re: /(\w+)\s*>\s*(-?\d+)/g, make: (v) => (x) => x > v },
  { re: /(\w+)\s*<\s*(-?\d+)/g, make: (v) => (x) => x < v },
  { re: /(\w+)\s*%\s*2\s*==\s*0/g, make: () => (x) => x % 2 === 0 },
  { re: /(\w+)\s*%\s*2\s*!=\s*0/g, make: () => (x) => x % 2 !== 0 },
];

/** Fallback predicate parser (mirrors SemanticEquivalenceEngine.parseFilterPredicate). */
export function heuristicPredicate(lambda) {
  if (!lambda) return { fn: () => true, analyzable: false };
  for (const { re, make } of COMPARISONS) {
    re.lastIndex = 0;
    const m = re.exec(lambda);
    if (m) {
      const value = m[2] !== undefined ? parseInt(m[2], 10) : null;
      return { fn: value === null ? make() : make(value), analyzable: false };
    }
  }
  return { fn: () => true, analyzable: false };
}

const MAPPERS = [
  { re: /(\w+)\s*\*\s*(-?\d+)/, make: (v) => (x) => toInt(x * v) },
  { re: /(\w+)\s*\+\s*(-?\d+)/, make: (v) => (x) => toInt(x + v) },
  { re: /(\w+)\s*-\s*(-?\d+)/, make: (v) => (x) => toInt(x - v) },
  { re: /(\w+)\s*\/\s*(-?\d+)/, make: (v) => (x) => (v !== 0 ? javaDiv(x, v) : x) },
  { re: /Math\s*\.\s*abs\s*\(\s*(\w+)\s*\)/, make: () => (x) => Math.abs(x) },
  { re: /-\s*(\w+)$/, make: () => (x) => toInt(-x) },
];

/** Fallback mapper parser (mirrors SemanticEquivalenceEngine.parseMapFunction). */
export function heuristicMapper(lambda) {
  if (!lambda) return { fn: (x) => x, analyzable: false };
  const square = /(\w+)\s*\*\s*\1/.exec(lambda);
  if (square) return { fn: (x) => toInt(x * x), analyzable: false };
  for (const { re, make } of MAPPERS) {
    const m = re.exec(lambda);
    if (m) {
      const value = m[2] !== undefined ? parseInt(m[2], 10) : null;
      return { fn: value === null ? make() : make(value), analyzable: false };
    }
  }
  return { fn: (x) => x, analyzable: false };
}

export function parseIntegerArgument(arg, fallback) {
  if (arg === null || arg === undefined) return fallback;
  const m = /-?\d+/.exec(String(arg));
  return m ? parseInt(m[0], 10) : fallback;
}
