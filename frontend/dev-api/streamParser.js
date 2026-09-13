/**
 * Stream parser — JavaScript port of `com.streamlens.service.parser.StreamParserService`.
 *
 * The Java service uses JavaParser; here we walk the method chain with a
 * bracket-aware scanner, which is enough for the integer pipelines StreamLens
 * analyses. When a chain cannot be recognised we throw, and the caller replies
 * with a 400 exactly like the Spring controller does.
 */

import {
  OperationType,
  createOperation,
  createPipeline,
  isTerminal,
  methodName,
  operationTypeFromMethodName,
} from './ir.js';

/** Methods the Java service recognises as stream operations. */
const STREAM_METHODS = new Set([
  'filter', 'map', 'flatMap', 'sorted', 'distinct', 'limit', 'skip', 'peek',
  'reduce', 'collect', 'toList', 'toSet', 'count',
  'findFirst', 'findAny', 'anyMatch', 'allMatch', 'noneMatch',
  'mapToInt', 'mapToLong', 'mapToDouble',
  'mapMulti', 'mapMultiToInt', 'mapMultiToLong', 'mapMultiToDouble',
  'toArray', 'toUnmodifiableList', 'toUnmodifiableSet', 'toUnmodifiableMap',
  'groupingBy', 'partitioningBy', 'joining', 'summarizingInt', 'summarizingLong', 'summarizingDouble',
  'min', 'max',
]);

const SOURCE_METHODS = new Set(['stream', 'parallelStream', 'of', 'empty', 'generate', 'iterate', 'range', 'rangeClosed', 'lines']);

export class ParseError extends Error {}

/**
 * @param {string} javaCode
 * @returns {import('./ir.js').StreamPipeline}
 */
export function parse(javaCode) {
  if (!javaCode || !javaCode.trim()) {
    throw new ParseError('No code supplied');
  }

  const stripped = stripCommentsAndStrings(javaCode);
  const chain = findStreamChain(stripped);
  if (!chain) {
    throw new ParseError('No stream pipeline found — expected something like `numbers.stream()...`');
  }

  const pipeline = createPipeline({
    sourceType: inferSourceType(javaCode, chain),
    isParallel: chain.sourceMethod === 'parallelStream',
    rawSource: javaCode,
    collectionType: chain.sourceScope,
  });

  const calls = parseChainCalls(stripped, chain.chainStart);
  if (calls.length === 0) {
    throw new ParseError('The stream pipeline has no operations');
  }

  const operations = [];
  let terminal = null;
  for (const call of calls) {
    if (!STREAM_METHODS.has(call.name)) continue;
    const type = operationTypeFromMethodName(call.name);
    if (!type) continue;

    const firstArg = call.args[0] ?? null;
    const op = createOperation(type, {
      lambdaExpression: firstArg,
      argumentExpression: firstArg,
      rawSource: call.raw,
      index: operations.length,
    });

    if (isTerminal(type)) {
      if (!terminal) terminal = op;
    } else {
      operations.push(op);
    }
  }

  if (operations.length === 0 && !terminal) {
    throw new ParseError(`No supported stream operations found in the pipeline (${calls.map((c) => c.name).join(', ') || 'none'})`);
  }

  pipeline.operations = operations;
  pipeline.terminalOperation = terminal;
  return pipeline;
}

/** Replace comments and string/char literals with spaces so scanning stays simple. */
function stripCommentsAndStrings(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') {
      while (i < code.length && code[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      for (let k = i; k < stop; k++) out += code[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ' ';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') { out += '  '; i += 2; continue; }
        out += ' ';
        i++;
      }
      out += ' ';
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Find the `<scope>.stream()` (or `.parallelStream()`) that starts a pipeline.
 * Returns the index where the chained calls begin (right after the source call).
 */
function findStreamChain(code) {
  const re = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*(stream|parallelStream)\s*\(\s*\)/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    const chainStart = match.index + match[0].length;
    // Require at least one chained call so we do not latch onto a bare `x.stream()`.
    const calls = parseChainCalls(code, chainStart);
    if (calls.length > 0) {
      return { sourceScope: match[1].trim(), sourceMethod: match[2], chainStart };
    }
  }

  // Fall back to a static factory source such as `Stream.of(1, 2, 3)`.
  const factoryRe = /(Stream|IntStream)\s*\.\s*(of|empty|generate|iterate|range|rangeClosed)\s*\(/g;
  const factory = factoryRe.exec(code);
  if (factory) {
    const openIndex = code.indexOf('(', factory.index + factory[0].length - 1);
    const closeIndex = matchingBracket(code, openIndex);
    if (closeIndex > openIndex) {
      const calls = parseChainCalls(code, closeIndex + 1);
      if (calls.length > 0) {
        return { sourceScope: `${factory[1]}.${factory[2]}`, sourceMethod: 'stream', chainStart: closeIndex + 1 };
      }
    }
  }
  return null;
}

/** Walk `.name(args)` calls starting at `from`, stopping at `;` or a non-chain token. */
function parseChainCalls(code, from) {
  const calls = [];
  let i = from;
  while (i < code.length) {
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code[i] !== '.') break;
    i++;
    while (i < code.length && /\s/.test(code[i])) i++;

    const nameMatch = /^[A-Za-z_$][\w$]*/.exec(code.slice(i));
    if (!nameMatch) break;
    const name = nameMatch[0];
    i += name.length;
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code[i] !== '(') break;

    const openIndex = i;
    const closeIndex = matchingBracket(code, openIndex);
    if (closeIndex === -1) break;

    const argsText = code.slice(openIndex + 1, closeIndex);
    calls.push({
      name,
      args: splitArguments(argsText),
      raw: code.slice(from === openIndex ? openIndex : openIndex, closeIndex + 1),
    });
    i = closeIndex + 1;
  }
  return calls;
}

function matchingBracket(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitArguments(text) {
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/**
 * The Java backend reports the *variable* name as `sourceType` (its regex matches
 * `numbers.stream()` and strips generics). We stay compatible, but prefer a real
 * declared type when one is obvious.
 */
function inferSourceType(code, chain) {
  const scope = chain.sourceScope || '';
  const variable = scope.split('.').pop() || scope;

  const declRe = new RegExp(
    `(?:var|final\\s+var|([A-Z][\\w.]*)\\s*(?:<[^;=]*?>)?)\\s+${escapeRegExp(variable)}\\s*=`,
  );
  const decl = declRe.exec(code);
  if (decl && decl[1]) return decl[1].split('.').pop();

  const m = /(\w+(?:<[^>]+>)?)\.(?:stream|parallelStream)\s*\(\s*\)/.exec(code);
  if (m) return m[1].replace(/<.*>/, '').trim();

  return scope || 'List';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function describePipeline(pipeline) {
  const ops = pipeline.operations.map((op) => methodName(op.type)).join(' → ');
  const terminal = pipeline.terminalOperation ? ` → ${methodName(pipeline.terminalOperation.type)}` : '';
  return `${pipeline.sourceType}.stream() → ${ops}${terminal}`;
}

export { OperationType };
