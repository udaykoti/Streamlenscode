/**
 * Explanation engine — JavaScript port of
 * `com.streamlens.service.explanation.ExplanationEngine`.
 */

import { methodName } from './ir.js';

const BEGINNER_DESCRIPTIONS = {
  FILTER: 'Keeps only elements that match a condition',
  MAP: 'Transforms each element using a function',
  FLATMAP: 'Transforms each element into zero or more elements',
  SORTED: 'Sorts elements in natural order',
  DISTINCT: 'Removes duplicate elements',
  LIMIT: 'Takes only the first N elements',
  SKIP: 'Skips the first N elements',
  PEEK: 'Performs a side effect on each element without changing the stream',
};

const TECHNICAL_DESCRIPTIONS = {
  FILTER: 'Applies a Predicate<T> to each element; retains elements where the predicate evaluates to true',
  MAP: 'Applies a Function<T,R> to each element, producing one output element per input element',
  FLATMAP: 'Applies a Function<T, Stream<R>> to each element, flattening the resulting streams',
  SORTED: 'Returns a stream consisting of the elements sorted by natural order (stateful, requires full traversal)',
  DISTINCT: 'Returns a stream with distinct elements (stateful, uses equals/hashCode)',
  LIMIT: 'Returns a stream with at most N elements (stateful, short-circuiting)',
  SKIP: 'Discards the first N elements (stateful)',
  PEEK: 'Performs an action on each element as it passes through (side-effecting)',
};

const plural = (n) => (n === 1 ? '' : 's');

function beginnerPipelineSummary(pipeline) {
  const lines = [];
  lines.push(`This Java Stream code starts with a collection of data and applies ${pipeline.operations.length} operation${plural(pipeline.operations.length)} to transform it.`);
  lines.push('');
  for (const op of pipeline.operations) {
    const desc = BEGINNER_DESCRIPTIONS[op.type] || `Performs the ${methodName(op.type)} operation`;
    lines.push(`  - ${methodName(op.type)}(): ${desc}`);
  }
  if (pipeline.terminalOperation) {
    lines.push('');
    lines.push(`Finally, ${methodName(pipeline.terminalOperation.type)}() collects the result.`);
  }
  return lines.join('\n');
}

function developerPipelineSummary(pipeline) {
  const chain = [`${pipeline.sourceType}.stream()`];
  for (const op of pipeline.operations) {
    chain.push(op.lambdaExpression ? `${methodName(op.type)}(${op.lambdaExpression})` : methodName(op.type));
  }
  if (pipeline.terminalOperation) chain.push(`${methodName(pipeline.terminalOperation.type)}()`);

  const lines = [`Pipeline: ${chain.join(' → ')}`, '', 'Characteristics:'];
  if (pipeline.operations.some((op) => op.stateful)) lines.push('  - Contains stateful operations (sorted, distinct, limit, skip)');
  if (pipeline.operations.some((op) => op.shortCircuiting)) lines.push('  - Contains short-circuiting operations');
  if (pipeline.operations.some((op) => op.hasSideEffects)) lines.push('  - Contains side-effecting operations (peek)');
  if (pipeline.isParallel) lines.push('  - Parallel stream');
  if (lines.length === 3) lines.push('  - Purely stateless, order-insensitive operations');
  return lines.join('\n');
}

function advancedPipelineSummary(pipeline) {
  const ops = pipeline.operations;
  const has = (type) => ops.some((op) => op.type === type);
  const lines = ['Semantic Profile:', ''];

  if (has('FILTER') && has('MAP')) {
    lines.push('filter + map composition: The relative order of filter and map affects both the number of elements processed and the values that filter evaluates. This is a key transformation candidate.');
    lines.push('');
  }
  if (has('SORTED') && has('LIMIT')) {
    lines.push('sorted + limit composition: This is a well-known optimization pattern. Taking the first N from a sorted stream is equivalent to using a priority queue of size N.');
    lines.push('');
  }
  if (has('DISTINCT') && has('SORTED')) {
    lines.push('distinct + sorted interaction: distinct is order-independent; sorting after distinct is safe. However, distinct after sorting may yield different "first" elements in edge cases.');
    lines.push('');
  }

  lines.push('Operation dependency graph:');
  ops.forEach((op, i) => {
    const flags = [
      op.stateful ? ' (stateful)' : '',
      op.shortCircuiting ? ' (short-circuit)' : '',
      op.hasSideEffects ? ' (side-effect)' : '',
    ].join('');
    lines.push(`  [${i}] ${methodName(op.type)}${flags}`);
  });

  return lines.join('\n');
}

export function generatePipelineExplanations(pipeline) {
  return [
    { level: 'beginner', title: 'What this code does', content: beginnerPipelineSummary(pipeline) },
    { level: 'developer', title: 'Pipeline structure', content: developerPipelineSummary(pipeline) },
    { level: 'advanced', title: 'Semantic analysis', content: advancedPipelineSummary(pipeline) },
  ];
}

function classificationMessage(classification) {
  switch (classification) {
    case 'SAFE':
      return 'This change is SAFE. The operations can be reordered without affecting the result.';
    case 'CONDITIONALLY SAFE':
      return "This change is CONDITIONALLY SAFE. It's safe only under certain conditions (e.g., specific lambda expressions).";
    case 'UNSAFE':
      return 'This change is UNSAFE. Reordering these operations produces different results.';
    default:
      return "We couldn't determine if this change is safe. More analysis is needed.";
  }
}

export function generateTransformationExplanations(original, alternative, classification) {
  const origOps = original.operations.map((op) => methodName(op.type));
  const altOps = alternative.operations.map((op) => methodName(op.type));

  const beginner = [
    `Original order: ${origOps.join(' → ')}`,
    `New order: ${altOps.join(' → ')}`,
    '',
    classificationMessage(classification),
  ].join('\n');

  const developerLines = [
    'Transformation Analysis',
    '========================',
    '',
    `Original:    ${origOps.join(' → ')} → terminal`,
    `Alternative: ${altOps.join(' → ')} → terminal`,
    '',
    `Classification: ${classification}`,
    '',
    'Semantic considerations:',
  ];
  for (const op of original.operations) {
    if (op.stateful) developerLines.push(`  - ${methodName(op.type)} is stateful: its position in the pipeline affects downstream operations`);
    if (op.hasSideEffects) developerLines.push(`  - ${methodName(op.type)} has side effects: reordering changes when side effects execute`);
  }
  if (developerLines[developerLines.length - 1] === 'Semantic considerations:') {
    developerLines.push('  - No stateful or side-effecting operations: only the values each stage reads can change');
  }

  const advancedLines = ['Semantic Equivalence Analysis', '==============================', ''];
  const statefulTypes = (pipeline) => [...new Set(pipeline.operations.filter((op) => op.stateful).map((op) => methodName(op.type)))];
  const origStateful = statefulTypes(original);
  const altStateful = statefulTypes(alternative);
  if (origStateful.join(',') !== altStateful.join(',')) {
    advancedLines.push('WARNING: Stateful operation ordering changed.');
    advancedLines.push(`Original stateful ops: [${origStateful.join(', ')}]`);
    advancedLines.push(`Alternative stateful ops: [${altStateful.join(', ')}]`);
    advancedLines.push('');
  }

  const filterIdx = original.operations.findIndex((op) => op.type === 'FILTER');
  const mapIdx = alternative.operations.findIndex((op) => op.type === 'MAP');
  if (filterIdx >= 0 && mapIdx >= 0) {
    advancedLines.push('Filter-Map interaction detected.');
    advancedLines.push('This transformation is semantically safe IF AND ONLY IF:');
    advancedLines.push('  1. The map function does not produce values that would pass the filter');
    advancedLines.push('  2. The filter predicate does not depend on the original (pre-map) value');
    advancedLines.push('  3. No side effects are involved');
    advancedLines.push('');
  }

  advancedLines.push('Assumptions for equivalence:');
  advancedLines.push('  - Lambda expressions are pure functions (no side effects)');
  advancedLines.push('  - Input data is deterministic');
  advancedLines.push('  - Sequential execution semantics');
  advancedLines.push('  - No concurrent modification');

  return [
    { level: 'beginner', title: 'What changed', content: beginner },
    { level: 'developer', title: 'Transformation details', content: developerLines.join('\n') },
    { level: 'advanced', title: 'Semantic analysis of transformation', content: advancedLines.join('\n') },
  ];
}

export { TECHNICAL_DESCRIPTIONS };
