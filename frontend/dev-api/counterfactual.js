/**
 * Counterfactual engine — JavaScript port of
 * `com.streamlens.service.engine.CounterfactualEngine`, extended with the
 * dependency analysis the UI renders (DEPENDENCY GRAPH, "why" premises).
 */

import { methodName, operationToString, withReorderedOperations } from './ir.js';

/** Rule table copied from the Java engine (order matters: first match wins). */
const RULES = [
  { a: 'FILTER', b: 'MAP', classification: 'CONDITIONALLY SAFE', reason: 'Safe when map() does not affect the filter predicate\'s evaluated value' },
  { a: 'FILTER', b: 'SORTED', classification: 'SAFE', reason: 'filter does not depend on element ordering' },
  { a: 'FILTER', b: 'DISTINCT', classification: 'SAFE', reason: 'filter operates on individual elements regardless of duplicates' },
  { a: 'FILTER', b: 'LIMIT', classification: 'CONDITIONALLY SAFE', reason: 'Only safe when filter is selective enough that limit is still reached' },
  { a: 'FILTER', b: 'SKIP', classification: 'CONDITIONALLY SAFE', reason: 'Only safe when the filtered result count is unaffected by skip' },
  { a: 'FILTER', b: 'FLATMAP', classification: 'CONDITIONALLY SAFE', reason: 'Safe when flatMap does not produce values that affect filter evaluation' },
  { a: 'MAP', b: 'SORTED', classification: 'CONDITIONALLY SAFE', reason: 'Safe when map preserves the sort order (monotonic functions)' },
  { a: 'MAP', b: 'DISTINCT', classification: 'CONDITIONALLY SAFE', reason: 'Safe when map is injective (one-to-one mapping)' },
  { a: 'MAP', b: 'LIMIT', classification: 'UNSAFE', reason: 'map() changes element values, affecting which elements pass limit()' },
  { a: 'MAP', b: 'SKIP', classification: 'CONDITIONALLY SAFE', reason: 'map does not affect element count, but skip depends on ordering after map' },
  { a: 'SORTED', b: 'LIMIT', classification: 'SAFE', reason: 'Reordering sorted and limit is safe: take the smallest N elements regardless of order' },
  { a: 'SORTED', b: 'DISTINCT', classification: 'CONDITIONALLY SAFE', reason: 'distinct after sorted is safe, but distinct before sorted may change which elements survive' },
  { a: 'DISTINCT', b: 'LIMIT', classification: 'CONDITIONALLY SAFE', reason: 'distinct before limit may yield different elements than limit before distinct' },
  { a: 'SORTED', b: 'FILTER', classification: 'SAFE', reason: 'filtering before or after sorting produces the same elements (just sorted differently)' },
  { a: 'MAP', b: 'FILTER', classification: 'CONDITIONALLY SAFE', reason: 'Safe when the filter predicate does not depend on the mapped value' },
  { a: 'LIMIT', b: 'SKIP', classification: 'SAFE', reason: 'limit then skip is equivalent to skip then limit with adjusted count' },
];

export function findRule(typeA, typeB) {
  return RULES.find((r) => (r.a === typeA && r.b === typeB) || (r.a === typeB && r.b === typeA)) || null;
}

/** Port of CounterfactualEngine.isSwappable */
export function isSwappable(a, b) {
  if (!a || !b) return false;
  if (a.type === b.type) return false;
  if (a.hasSideEffects || b.hasSideEffects) return false;
  if (a.shortCircuiting && b.stateful) return false;
  if (b.shortCircuiting && a.stateful) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Dependency analysis
 * ------------------------------------------------------------------ */

const VALUE_PRODUCERS = new Set(['MAP', 'FLATMAP']);
const VALUE_DECIDERS = new Set(['FILTER', 'ANY_MATCH', 'ALL_MATCH', 'NONE_MATCH']);
const POSITION_SENSITIVE = new Set(['LIMIT', 'SKIP', 'FIND_FIRST', 'FIND_ANY']);

/**
 * Semantic dependency between two operations that a candidate would swap.
 * A dependency means the swap *can* change observable behaviour, so the
 * equivalence engine must verify it dynamically instead of assuming.
 *
 * Returns null when the two operations provably do not interfere (e.g. map and
 * limit: neither changes the count or order the other relies on).
 */
export function analyzeDependency(first, second) {
  if (!first || !second) return null;
  const a = methodName(first.type);
  const b = methodName(second.type);

  // 1. Side effects are always order sensitive.
  if (first.hasSideEffects || second.hasSideEffects) {
    return {
      type: 'SIDE_EFFECT',
      reason: `${a}() / ${b}() perform side effects; reordering changes when they are observed.`,
      lambda: first.lambdaExpression || second.lambdaExpression || undefined,
    };
  }

  // 2. A value producer feeding a decision: the decision is made on other data.
  if (VALUE_PRODUCERS.has(first.type) && VALUE_DECIDERS.has(second.type)) {
    return {
      type: 'VALUE',
      reason: `${a}() rewrites the element value that ${b}() then tests, so after the swap ${b}() decides on the original value instead.`,
      lambda: first.lambdaExpression || undefined,
    };
  }

  // 3./4. sorted() establishes (or destroys) the order position-based ops rely on.
  if (first.type === 'SORTED' && POSITION_SENSITIVE.has(second.type)) {
    return {
      type: 'ORDER',
      reason: `${b}() selects by position, and sorted() defines that position — swapping selects a different set of elements.`,
      lambda: second.lambdaExpression || undefined,
    };
  }
  if (second.type === 'SORTED' && POSITION_SENSITIVE.has(first.type)) {
    return {
      type: 'ORDER',
      reason: `${a}() selects by position before the stream is sorted, so it keeps different elements than sorting first would.`,
    };
  }

  // 5. distinct() carries state about which values were already seen.
  if (first.type === 'DISTINCT' && (POSITION_SENSITIVE.has(second.type) || second.type === 'SORTED')) {
    return {
      type: 'STATE',
      reason: `distinct() removes duplicates up front, changing which elements ${b}() sees and in what order.`,
    };
  }
  if (second.type === 'DISTINCT' && (POSITION_SENSITIVE.has(first.type) || first.type === 'SORTED')) {
    return {
      type: 'STATE',
      reason: `${a}() acts on a stream that still contains duplicates, so distinct() afterwards drops different elements.`,
    };
  }

  // 5b. distinct() before a value producer: the producer may collapse values.
  if (first.type === 'DISTINCT' && VALUE_PRODUCERS.has(second.type)) {
    return {
      type: 'VALUE',
      reason: `${b}() can map two different values onto the same result, so after the swap ${a}() drops elements that previously survived.`,
      lambda: second.lambdaExpression || undefined,
    };
  }

  // 6. limit()/skip() vs filter(): the count reaching them changes.
  if ((POSITION_SENSITIVE.has(second.type) && VALUE_DECIDERS.has(first.type)) ||
      (POSITION_SENSITIVE.has(first.type) && VALUE_DECIDERS.has(second.type))) {
    return {
      type: 'SHORT_CIRCUIT',
      reason: `filter decides how many elements reach ${POSITION_SENSITIVE.has(first.type) ? a : b}(), so the swap changes the surviving prefix.`,
      lambda: (VALUE_DECIDERS.has(first.type) ? first : second).lambdaExpression || undefined,
    };
  }

  // 7. A value producer feeding an order/dedup operation: data dependent.
  if (VALUE_PRODUCERS.has(first.type) && (second.type === 'SORTED' || second.type === 'DISTINCT')) {
    return {
      type: 'VALUE',
      reason: `${b}() compares the values ${a}() produces — equivalent only if ${a}() preserves order${second.type === 'DISTINCT' ? ' and is injective (no two inputs collapse to one output)' : ' (is monotonic)'}.`,
      lambda: first.lambdaExpression || undefined,
    };
  }

  return null;
}

/** Full dependency graph for a pipeline (all operation pairs, not just adjacent). */
export function buildDependencyGraph(pipeline) {
  const dependencies = [];
  const involved = new Set();
  const ops = pipeline.operations;

  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const dep = analyzeDependency(ops[i], ops[j]);
      if (!dep) continue;
      dependencies.push({
        fromIndex: i,
        toIndex: j,
        fromOperation: methodName(ops[i].type),
        toOperation: methodName(ops[j].type),
        type: dep.type,
        reason: dep.reason,
        lambda: dep.lambda,
      });
      involved.add(i);
      involved.add(j);
    }
  }

  return {
    hasDependencies: dependencies.length > 0,
    totalDependencies: dependencies.length,
    dependencies,
    involvedIndices: [...involved].sort((a, b) => a - b),
  };
}

export function dependencyReadable(pipeline, graph) {
  if (!graph.hasDependencies) {
    return 'No safety-blocking dependencies: every operation only reads what its predecessor produced in an order-independent way.';
  }
  const lines = graph.dependencies.map((dep) =>
    `${dep.fromOperation} #${dep.fromIndex} → ${dep.toOperation} #${dep.toIndex}  [${dep.type}]  ${dep.reason}`);
  return `${graph.totalDependencies} semantic dependenc${graph.totalDependencies === 1 ? 'y' : 'ies'} in ${pipeline.operations.length}-operation pipeline:\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ *
 * Efficiency premises
 * ------------------------------------------------------------------ */

export function efficiencyArgument(first, second) {
  const a = methodName(first.type);
  const b = methodName(second.type);

  if (first.type === 'FILTER' && second.type === 'MAP') {
    return `Filtering before mapping means ${b}() runs on fewer elements — the classic "filter early" optimization.`;
  }
  if (first.type === 'MAP' && second.type === 'FILTER') {
    return `Moving ${b}() ahead of ${a}() lets the filter reject elements before ${a}() has to transform them.`;
  }
  if (first.type === 'FILTER' && (second.type === 'LIMIT' || second.type === 'SKIP')) {
    return `Reordering changes how many elements ${b}() has to buffer before the stream can stop.`;
  }
  if (first.type === 'SORTED' && second.type === 'LIMIT') {
    return `sorted() + limit(n) can be served by a size-n priority queue instead of a full sort.`;
  }
  if (first.type === 'DISTINCT' && second.type === 'MAP') {
    return `De-duplicating first means ${b}() is applied to fewer elements.`;
  }
  if (first.type === 'MAP' && second.type === 'DISTINCT') {
    return `Mapping first can collapse values into duplicates, letting distinct() drop more elements.`;
  }
  if (first.type === 'MAP' && second.type === 'SORTED') {
    return `Sorting after ${a}() orders the values the caller actually receives.`;
  }
  return `Swapping ${a}() and ${b}() changes how much work each stage sees.`;
}

export function dependencyNote(first, second) {
  const dep = analyzeDependency(first, second);
  if (!dep) return `No dependency between ${methodName(first.type)}() and ${methodName(second.type)}() — the swap is a candidate for verification.`;
  return `${dep.type} dependency: ${dep.reason}`;
}

/* ------------------------------------------------------------------ *
 * Alternative generation
 * ------------------------------------------------------------------ */

/** Port of CounterfactualEngine.generateAlternatives */
export function generateAlternatives(pipeline) {
  const alternatives = [];
  const ops = pipeline.operations;
  if (ops.length < 2) return alternatives;

  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const a = ops[i];
      const b = ops[j];
      if (!isSwappable(a, b)) continue;

      const reordered = ops.slice();
      reordered[i] = b;
      reordered[j] = a;

      const rule = findRule(a.type, b.type);
      alternatives.push({
        originalOrder: ops.map((op) => methodName(op.type)),
        alternativeOrder: reordered.map((op) => methodName(op.type)),
        swappedPositions: { from: i, to: j },
        operationA: methodName(a.type),
        operationB: methodName(b.type),
        classification: rule ? rule.classification : 'UNKNOWN',
        reason: rule ? rule.reason : 'No semantic rule defined for this transformation pair',
        efficiencyArgument: efficiencyArgument(a, b),
        dependencyNote: dependencyNote(a, b),
        reorderedOperations: reordered.map((op, idx) => ({ ...op, index: idx })),
      });
    }
  }

  return alternatives;
}

/** Port of StreamAnalysisController.buildAlternativePipeline */
export function buildAlternativePipeline(original, alternative) {
  const ops = original.operations;
  const reordered = [];
  for (const opName of alternative.alternativeOrder) {
    const match = ops.find((op) => methodName(op.type) === opName && !reordered.includes(op));
    if (match) reordered.push(match);
  }
  // Positions, not names, are what actually got swapped — rebuild from indices so
  // pipelines with repeated operation types stay faithful.
  const bySwap = ops.slice();
  const { from, to } = alternative.swappedPositions;
  if (from !== undefined && to !== undefined && ops[to] && ops[from]) {
    bySwap[from] = ops[to];
    bySwap[to] = ops[from];
    return withReorderedOperations(original, bySwap.map((op, idx) => ({ ...op, index: idx })));
  }
  return withReorderedOperations(original, reordered.map((op, idx) => ({ ...op, index: idx })));
}

export function chainString(pipeline) {
  const parts = pipeline.operations.map(operationToString);
  if (pipeline.terminalOperation) parts.push(operationToString(pipeline.terminalOperation));
  return `${pipeline.sourceType}.stream() → ${parts.join(' → ')}`;
}
