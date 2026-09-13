/**
 * Execution engine — JavaScript port of the evaluation half of
 * `SemanticEquivalenceEngine` plus `ExecutionTracerService`.
 *
 * Everything runs on Java `int` semantics (32-bit truncation, truncating
 * division) so counterexamples such as `Integer.MAX_VALUE * 2` behave the same
 * way they would on the JVM.
 */

import { methodName } from './ir.js';
import {
  compileLambda,
  heuristicMapper,
  heuristicPredicate,
  javaDiv,
  javaMod,
  parseIntegerArgument,
  toInt,
} from './lambdas.js';

/**
 * Resolve the callable for an operation.
 * @returns {{fn: Function|null, analyzable: boolean, reason?: string}}
 */
function resolveOperationFunction(op) {
  const compiled = compileLambda(op.lambdaExpression);
  // `analyzable` is only true when the expression was genuinely understood.
  // The heuristic fallbacks below still let us *execute* something, but the
  // equivalence engine treats them as unproven and answers UNKNOWN.
  if (compiled.fn) return { fn: compiled.fn, analyzable: true };
  if (op.type === 'FILTER' || op.type === 'ANY_MATCH' || op.type === 'ALL_MATCH' || op.type === 'NONE_MATCH') {
    return { fn: heuristicPredicate(op.lambdaExpression).fn, analyzable: false, reason: compiled.reason };
  }
  if (op.type === 'MAP' || op.type === 'REDUCE') {
    return { fn: heuristicMapper(op.lambdaExpression).fn, analyzable: false, reason: compiled.reason };
  }
  return { fn: null, analyzable: false, reason: compiled.reason };
}

const COMPARATORS = {
  reverseOrder: -1,
  naturalOrder: 1,
};

/** `Comparator.reverseOrder()` / `naturalOrder()` — the only comparators we model. */
function comparatorDirection(op) {
  const arg = op.argumentExpression || op.lambdaExpression || '';
  for (const [key, direction] of Object.entries(COMPARATORS)) {
    if (arg.includes(key)) return direction;
  }
  return null;
}

/** Can every lambda in this pipeline be evaluated? */
export function pipelineIsAnalyzable(pipeline) {
  const problems = [];
  for (const op of pipeline.operations) {
    if (['FILTER', 'MAP', 'FLATMAP', 'PEEK', 'REDUCE', 'ANY_MATCH', 'ALL_MATCH', 'NONE_MATCH'].includes(op.type)) {
      const resolved = resolveOperationFunction(op);
      if (!resolved.analyzable) {
        problems.push(`${methodName(op.type)}(): ${resolved.reason || 'unsupported lambda'}`);
      }
    } else if (op.type === 'SORTED') {
      const arg = op.argumentExpression || op.lambdaExpression;
      if (arg && comparatorDirection(op) === null && !resolveOperationFunction(op).analyzable) {
        problems.push(`sorted(): comparator \`${arg}\` is not modelled`);
      }
    } else if (op.type === 'LIMIT' || op.type === 'SKIP') {
      const arg = op.argumentExpression;
      if (arg && !/-?\d/.test(String(arg))) {
        problems.push(`${methodName(op.type)}(): argument \`${arg}\` is not a literal integer`);
      }
    }
  }
  return { analyzable: problems.length === 0, problems };
}

function applyOperation(op, input) {
  switch (op.type) {
    case 'FILTER': {
      const { fn } = resolveOperationFunction(op);
      const predicate = fn || (() => true);
      return input.filter((x) => Boolean(predicate(x)));
    }
    case 'MAP': {
      const { fn } = resolveOperationFunction(op);
      const mapper = fn || ((x) => x);
      return input.map((x) => toInt(mapper(x)));
    }
    case 'FLATMAP': {
      const { fn } = resolveOperationFunction(op);
      if (!fn) return input.map((x) => [x, toInt(x * 2)]).flat();
      const out = [];
      for (const x of input) {
        const produced = fn(x);
        if (Array.isArray(produced)) out.push(...produced.map((v) => toInt(v)));
        else if (produced && typeof produced[Symbol.iterator] === 'function' && typeof produced !== 'string') {
          out.push(...[...produced].map((v) => toInt(v)));
        } else out.push(toInt(produced));
      }
      return out;
    }
    case 'SORTED': {
      const comparator = compileLambda(op.lambdaExpression).fn;
      const direction = comparatorDirection(op) ?? 1;
      const copy = input.slice();
      if (comparator) copy.sort((a, b) => toInt(comparator(a, b)));
      else copy.sort((a, b) => (a - b) * direction);
      return copy;
    }
    case 'DISTINCT':
      return [...new Set(input)];
    case 'LIMIT':
      return input.slice(0, Math.max(0, parseIntegerArgument(op.argumentExpression, 10)));
    case 'SKIP':
      return input.slice(Math.max(0, parseIntegerArgument(op.argumentExpression, 1)));
    case 'PEEK':
      return input.slice();
    default:
      return input.slice();
  }
}

function applyTerminal(op, input) {
  if (!op) return input.slice();
  switch (op.type) {
    case 'TO_LIST':
    case 'COLLECT':
      return input.slice();
    case 'TO_SET':
      return [...new Set(input)];
    case 'COUNT':
      return [input.length];
    case 'FIND_FIRST':
      return input.length ? [input[0]] : [];
    case 'FIND_ANY':
      return input.length ? [input[Math.floor(input.length / 2)]] : [];
    case 'REDUCE': {
      if (!input.length) return [];
      const { fn } = resolveOperationFunction(op);
      if (fn && fn.length >= 2) {
        return [toInt(input.reduce((acc, v) => toInt(fn(acc, v)), 0))];
      }
      return [toInt(input.reduce((acc, v) => toInt(acc + v), 0))];
    }
    case 'ANY_MATCH':
    case 'ALL_MATCH':
    case 'NONE_MATCH': {
      const { fn } = resolveOperationFunction(op);
      const predicate = fn || (() => true);
      const values = { ANY_MATCH: input.some(predicate), ALL_MATCH: input.every(predicate), NONE_MATCH: !input.some(predicate) };
      return [values[op.type] ? 1 : 0];
    }
    default:
      return input.slice();
  }
}

/** Port of SemanticEquivalenceEngine.executePipeline */
export function executePipeline(pipeline, input) {
  let result = (input ?? []).map((v) => toInt(v));
  for (const op of pipeline.operations) result = applyOperation(op, result);
  result = applyTerminal(pipeline.terminalOperation, result);
  return result.map((v) => toInt(v));
}

/* ------------------------------------------------------------------ *
 * Tracer
 * ------------------------------------------------------------------ */

function formatLambda(lambda) {
  if (!lambda) return '???';
  return lambda.length > 40 ? `${lambda.slice(0, 37)}...` : lambda;
}

function pushStep(steps, operationIndex, operationType, inputValue, outputValue, passed, description) {
  steps.push({ operationIndex, operationType, inputValue, outputValue, passed, description });
}

function rejectedTrace(steps, value) {
  return { inputValue: toInt(value), outputValue: null, accepted: false, steps };
}

/**
 * Element-by-element trace, port of ExecutionTracerService.traceElement.
 *
 * `state` carries the position/duplicate bookkeeping that stateful operations
 * (skip, limit, distinct) need; it is computed by `tracePipeline` below with a
 * faithful simulation of the whole pipeline.
 */
function traceElement(pipeline, value, state) {
  const steps = [];
  let current = toInt(value);

  for (let i = 0; i < pipeline.operations.length; i++) {
    const op = pipeline.operations[i];
    const input = current;

    switch (op.type) {
      case 'FILTER': {
        const { fn } = resolveOperationFunction(op);
        const passed = fn ? Boolean(fn(current)) : true;
        if (!passed) {
          pushStep(steps, i, 'FILTER', input, null, false,
            `REJECTED: ${input} does not satisfy ${formatLambda(op.lambdaExpression)}`);
          return rejectedTrace(steps, value);
        }
        pushStep(steps, i, 'FILTER', input, input, true,
          `ACCEPTED: ${input} passes ${formatLambda(op.lambdaExpression)}`);
        break;
      }
      case 'MAP': {
        const { fn } = resolveOperationFunction(op);
        current = fn ? toInt(fn(input)) : input;
        pushStep(steps, i, 'MAP', input, current, true,
          `TRANSFORMED: ${input} → ${current} via ${formatLambda(op.lambdaExpression)}`);
        break;
      }
      case 'FLATMAP': {
        const { fn } = resolveOperationFunction(op);
        const produced = fn ? fn(input) : [input, toInt(input * 2)];
        const list = Array.isArray(produced) ? produced : [produced];
        current = list.length ? toInt(list[0]) : input;
        pushStep(steps, i, 'FLATMAP', input, current, true,
          `EXPANDED: ${input} → [${list.join(', ')}] (first: ${current})`);
        break;
      }
      case 'SORTED':
        pushStep(steps, i, 'SORTED', input, input, true,
          'DEFERRED: sorting is applied to the whole stream, values are unchanged');
        break;
      case 'DISTINCT': {
        if (state.duplicateOf !== null) {
          pushStep(steps, i, 'DISTINCT', input, null, false,
            `DROPPED: ${input} is a duplicate of element #${state.duplicateOf + 1}`);
          return rejectedTrace(steps, value);
        }
        pushStep(steps, i, 'DISTINCT', input, input, true, 'KEPT: first occurrence of this value');
        break;
      }
      case 'LIMIT': {
        const limit = Math.max(0, parseIntegerArgument(op.argumentExpression, 10));
        if (state.position >= limit) {
          pushStep(steps, i, 'LIMIT', input, null, false,
            `DROPPED: position ${state.position + 1} is beyond limit(${limit})`);
          return rejectedTrace(steps, value);
        }
        pushStep(steps, i, 'LIMIT', input, input, true, `PASSED: within limit(${limit})`);
        break;
      }
      case 'SKIP': {
        const skip = Math.max(0, parseIntegerArgument(op.argumentExpression, 1));
        if (state.position < skip) {
          pushStep(steps, i, 'SKIP', input, null, false,
            `DROPPED: position ${state.position + 1} is inside skip(${skip})`);
          return rejectedTrace(steps, value);
        }
        pushStep(steps, i, 'SKIP', input, input, true, `PASSED: beyond skip(${skip})`);
        break;
      }
      case 'PEEK':
        pushStep(steps, i, 'PEEK', input, input, true, `SIDE EFFECT: observed ${input}`);
        break;
      default:
        pushStep(steps, i, op.type, input, input, true, `PASSED: ${methodName(op.type)}`);
    }
  }

  return { inputValue: toInt(value), outputValue: current, accepted: true, steps };
}

/**
 * Trace every element of `input` through `pipeline`.
 *
 * Stateless operations are evaluated per element; stateful ones depend on the
 * element's position among the survivors of the operations before them, so we
 * replay the pipeline once to compute that bookkeeping.
 */
export function tracePipeline(pipeline, input) {
  const values = (input ?? []).map((v) => toInt(v));
  const bookkeeping = computeStatefulContext(pipeline, values);

  const elementTraces = values.map((value, idx) =>
    traceElement(pipeline, value, bookkeeping[idx]));

  return {
    pipelineDescription: describe(pipeline),
    elementTraces,
  };
}

/** Replay the pipeline, recording position/duplicate info for each input element. */
function computeStatefulContext(pipeline, values) {
  const context = values.map(() => ({ position: 0, duplicateOf: null }));
  // live[i] = array of surviving input indices currently in the stream.
  let live = values.map((_, idx) => idx);

  for (let opIdx = 0; opIdx < pipeline.operations.length; opIdx++) {
    const op = pipeline.operations[opIdx];

    if (op.type === 'FILTER') {
      const { fn } = resolveOperationFunction(op);
      live = live.filter((idx) => {
        const value = valueAt(pipeline, values, idx, opIdx);
        return value !== null && (!fn || Boolean(fn(value)));
      });
      continue;
    }

    if (op.type === 'SKIP') {
      const skip = Math.max(0, parseIntegerArgument(op.argumentExpression, 1));
      live.forEach((idx, pos) => { context[idx].position = pos; });
      live = live.slice(skip);
      continue;
    }

    if (op.type === 'LIMIT') {
      const limit = Math.max(0, parseIntegerArgument(op.argumentExpression, 10));
      live.forEach((idx, pos) => { context[idx].position = pos; });
      live = live.slice(0, limit);
      continue;
    }

    if (op.type === 'DISTINCT') {
      const firstSeen = new Map();
      const next = [];
      for (const idx of live) {
        const key = valueAt(pipeline, values, idx, opIdx);
        if (firstSeen.has(key)) context[idx].duplicateOf = firstSeen.get(key);
        else {
          firstSeen.set(key, idx);
          next.push(idx);
        }
      }
      live = next;
      continue;
    }

    if (op.type === 'SORTED') {
      live = live.slice().sort((a, b) => valueAt(pipeline, values, a, opIdx) - valueAt(pipeline, values, b, opIdx));
      continue;
    }
  }

  return context;
}

/** Value of input element `idx` after operations [0, beforeOp) — null if dropped. */
function valueAt(pipeline, values, idx, beforeOp) {
  let current = values[idx];
  for (let i = 0; i < beforeOp; i++) {
    const op = pipeline.operations[i];
    if (op.type === 'FILTER') {
      const { fn } = resolveOperationFunction(op);
      if (fn && !fn(current)) return null;
    } else if (op.type === 'MAP') {
      const { fn } = resolveOperationFunction(op);
      current = fn ? toInt(fn(current)) : current;
    } else if (op.type === 'FLATMAP') {
      const { fn } = resolveOperationFunction(op);
      const produced = fn ? fn(current) : [current, toInt(current * 2)];
      const list = Array.isArray(produced) ? produced : [produced];
      current = list.length ? toInt(list[0]) : current;
    }
  }
  return current;
}

function describe(pipeline) {
  const ops = pipeline.operations.map((op) => methodName(op.type)).join(' → ');
  const terminal = pipeline.terminalOperation ? ` → ${methodName(pipeline.terminalOperation.type)}` : '';
  return `${pipeline.sourceType}.stream() → ${ops}${terminal}`;
}

export { javaDiv, javaMod, toInt };
