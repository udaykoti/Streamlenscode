/**
 * Semantic equivalence engine — JavaScript port of
 * `com.streamlens.service.engine.SemanticEquivalenceEngine` and
 * `CounterexampleGenerator`, plus the edge-case suite and verdict explanation
 * the UI renders.
 *
 * Design principle (same as the Java backend): never claim SAFE without
 * evidence. If the lambdas cannot be analysed the answer is UNKNOWN.
 */

import { methodName } from './ir.js';
import { executePipeline, pipelineIsAnalyzable, tracePipeline } from './executor.js';
import { analyzeDependency, chainString, findRule } from './counterfactual.js';

const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

export const DEFAULT_TEST_INPUT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30];

/** Inputs used when searching for a counterexample (port of CounterexampleGenerator). */
export const COUNTEREXAMPLE_INPUTS = [
  [6],
  [1, 2, 3, 4, 5],
  [10, 20, 30, 40, 50],
  [1, 1, 2, 2, 3, 3],
  [-5, -1, 0, 1, 5],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [100, 50, 25, 10, 5, 1],
  [3, 7, 11, 15, 19],
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  [1, 3, 5, 7, 9, 11, 13, 15],
  [1, 2, 3, 4, 5, 6],
  [INT32_MAX, 0, -1, 1, INT32_MIN],
];

/** Named edge cases reported as their own suite in the UI. */
export const EDGE_CASES = [
  { name: 'empty stream', input: [] },
  { name: 'single element', input: [7] },
  { name: 'all duplicates', input: [4, 4, 4, 4] },
  { name: 'negative values', input: [-8, -3, -1, 0] },
  { name: 'zeros', input: [0, 0, 1, 0] },
  { name: 'int overflow', input: [INT32_MAX, INT32_MIN, 0, 1, -1] },
  { name: 'descending order', input: [9, 7, 5, 3, 1] },
  { name: 'alternating signs', input: [-1, 2, -3, 4, -5] },
];

function outputsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

/* ------------------------------------------------------------------ *
 * Static analysis (port of analyzeStatic)
 * ------------------------------------------------------------------ */

export function analyzeStatic(original, alternative, swappedPair) {
  const origOps = original.operations;
  const altOps = alternative.operations;

  const identical = origOps.length === altOps.length &&
    origOps.every((op, i) => op.type === altOps[i].type && op.lambdaExpression === altOps[i].lambdaExpression);
  if (identical) {
    return { classification: 'SAFE', reason: 'Pipelines are identical', requiresDynamicCheck: false };
  }

  const sideEffects = [...origOps, ...altOps].filter((op) => op.hasSideEffects);
  if (sideEffects.length > 0) {
    return {
      classification: 'UNSAFE',
      reason: 'Both pipelines contain side-effecting operations (peek). Reordering side effects changes program behavior.',
      requiresDynamicCheck: false,
    };
  }

  const terminal = original.terminalOperation;
  if (terminal && terminal.shortCircuiting) {
    return {
      classification: 'UNSAFE',
      reason: `Terminal operation ${methodName(terminal.type)}() is order-dependent. Reordering intermediate operations affects the result.`,
      requiresDynamicCheck: false,
    };
  }

  const origTypes = new Set(origOps.map((op) => op.type));
  const altTypes = new Set(altOps.map((op) => op.type));
  if (origTypes.size !== altTypes.size || [...origTypes].some((t) => !altTypes.has(t))) {
    return {
      classification: 'UNSAFE',
      reason: `Operation sets differ: [${[...origTypes].map(methodName).join(', ')}] vs [${[...altTypes].map(methodName).join(', ')}]`,
      requiresDynamicCheck: false,
    };
  }

  if (swappedPair) {
    const dependency = analyzeDependency(swappedPair.first, swappedPair.second);
    if (dependency) {
      // A dependency does not by itself prove the swap wrong — it proves static
      // reasoning insufficient, so the verdict comes from execution.
      return {
        classification: 'UNKNOWN',
        reason: `${dependency.type} dependency between ${methodName(swappedPair.first.type)}() and ${methodName(swappedPair.second.type)}(): ${dependency.reason}`,
        requiresDynamicCheck: true,
        dependency,
      };
    }
  }

  const onlyFilterMap = (ops) => ops.every((op) => op.type === 'FILTER' || op.type === 'MAP');
  const firstIndexOf = (ops, type) => ops.findIndex((op) => op.type === type);
  if (onlyFilterMap(origOps) && onlyFilterMap(altOps)) {
    const origFilter = firstIndexOf(origOps, 'FILTER');
    const origMap = firstIndexOf(origOps, 'MAP');
    const altFilter = firstIndexOf(altOps, 'FILTER');
    const altMap = firstIndexOf(altOps, 'MAP');
    if (origFilter >= 0 && origMap >= 0 && altFilter >= 0 && altMap >= 0 &&
        origFilter < origMap && altMap < altFilter) {
      return {
        classification: 'CONDITIONALLY SAFE',
        reason: 'Reordering filter and map is only safe when the map operation does not produce values that would change the filter predicate outcome.',
        requiresDynamicCheck: true,
      };
    }
  }

  const rule = swappedPair ? findRule(swappedPair.first.type, swappedPair.second.type) : null;
  if (rule && rule.classification === 'SAFE') {
    return { classification: 'SAFE', reason: rule.reason, requiresDynamicCheck: true, rule };
  }

  const hasStateful = [...origOps, ...altOps].some((op) => op.stateful);
  if (hasStateful) {
    return {
      classification: 'UNKNOWN',
      reason: 'Stateful operations (sorted, distinct, limit, skip) detected. Static analysis cannot determine equivalence. Runtime verification required.',
      requiresDynamicCheck: true,
      rule,
    };
  }

  return {
    classification: 'UNKNOWN',
    reason: 'Static analysis is insufficient to determine equivalence. Dynamic verification with test inputs is required.',
    requiresDynamicCheck: true,
    rule,
  };
}

/* ------------------------------------------------------------------ *
 * Dynamic analysis
 * ------------------------------------------------------------------ */

export function analyzeDynamic(original, alternative, testInput) {
  const input = (testInput && testInput.length ? testInput : DEFAULT_TEST_INPUT).slice(0, 10000);
  const originalOutput = executePipeline(original, input);
  const alternativeOutput = executePipeline(alternative, input);
  const valuesMatch = outputsEqual(originalOutput, alternativeOutput);

  return {
    testInput: input,
    originalOutput,
    alternativeOutput,
    valuesMatch,
    countMatch: originalOutput.length === alternativeOutput.length,
    classification: valuesMatch ? 'SAFE' : 'UNSAFE',
    reason: valuesMatch
      ? `Outputs match for test input [${input.join(', ')}]`
      : `Output values differ for input [${input.join(', ')}]. Original: [${originalOutput.join(', ')}], Alternative: [${alternativeOutput.join(', ')}]`,
  };
}

function findCounterexample(original, alternative, primaryInput) {
  const inputs = [];
  if (primaryInput && primaryInput.length) inputs.push(primaryInput);
  for (const candidate of COUNTEREXAMPLE_INPUTS) {
    if (!inputs.some((existing) => existing.length === candidate.length && existing.every((v, i) => v === candidate[i]))) {
      inputs.push(candidate);
    }
  }

  for (const input of inputs) {
    const originalOutput = executePipeline(original, input);
    const alternativeOutput = executePipeline(alternative, input);
    if (!outputsEqual(originalOutput, alternativeOutput)) {
      return {
        input,
        originalOutput,
        alternativeOutput,
        explanation: explainDifference(input, originalOutput, alternativeOutput),
        found: true,
        originalTrace: tracePipeline(original, input).elementTraces,
        alternativeTrace: tracePipeline(alternative, input).elementTraces,
      };
    }
  }

  return {
    input: [],
    originalOutput: [],
    alternativeOutput: [],
    explanation: 'No counterexample found with tested inputs. Transformation may be safe or require more extensive testing.',
    found: false,
    originalTrace: null,
    alternativeTrace: null,
  };
}

function explainDifference(input, originalOutput, alternativeOutput) {
  const lines = [
    `Input: [${input.join(', ')}]`,
    '',
    `Original pipeline output: [${originalOutput.join(', ')}]`,
    `Alternative pipeline output: [${alternativeOutput.join(', ')}]`,
    '',
  ];

  if (originalOutput.length !== alternativeOutput.length) {
    lines.push('Reason: The transformations produce different numbers of elements.');
    lines.push(`Original has ${originalOutput.length} element(s), alternative has ${alternativeOutput.length} element(s).`);
    return lines.join('\n');
  }

  for (let i = 0; i < originalOutput.length; i++) {
    if (originalOutput[i] !== alternativeOutput[i]) {
      lines.push(`Reason: At position ${i}, original produced ${originalOutput[i]}, alternative produced ${alternativeOutput[i]}.`);
      lines.push('The operation reordering changed how the value was transformed/filtered.');
      return lines.join('\n');
    }
  }

  lines.push('Reason: Outputs differ.');
  return lines.join('\n');
}

function runEdgeCases(original, alternative) {
  const cases = EDGE_CASES.map(({ name, input }) => {
    const originalOutput = executePipeline(original, input);
    const alternativeOutput = executePipeline(alternative, input);
    return {
      name,
      input,
      originalOutput,
      alternativeOutput,
      pass: outputsEqual(originalOutput, alternativeOutput),
    };
  });
  return { allPass: cases.every((c) => c.pass), cases, totalCases: cases.length };
}

/* ------------------------------------------------------------------ *
 * Full verification of one candidate reordering
 * ------------------------------------------------------------------ */

export function verifyTransformation(original, alternativePipeline, alternative, testInput) {
  const { from, to } = alternative.swappedPositions ?? {};
  const swappedPair = from !== undefined && to !== undefined
    ? { first: original.operations[from], second: original.operations[to], fromIndex: from, toIndex: to }
    : null;

  const analyzable = pipelineIsAnalyzable(original);
  const staticResult = analyzeStatic(original, alternativePipeline, swappedPair);
  const dependency = swappedPair ? analyzeDependency(swappedPair.first, swappedPair.second) : null;

  const result = {
    originalOrder: alternative.originalOrder,
    alternativeOrder: alternative.alternativeOrder,
    operationA: alternative.operationA,
    operationB: alternative.operationB,
    swappedPositions: alternative.swappedPositions,
    classification: staticResult.classification,
    staticReason: staticResult.reason,
    efficiencyArgument: alternative.efficiencyArgument,
    dependencyNote: alternative.dependencyNote,
  };

  if (!analyzable.analyzable) {
    result.classification = 'UNKNOWN';
    result.staticReason = `Semantic equivalence could not be proven — ${analyzable.problems.join('; ')}`;
    result.verdictExplanation = buildVerdictExplanation(result.classification, result.staticReason, dependency, original, alternativePipeline, null, swappedPair);
    return result;
  }

  // Hard static verdicts (side effects, order-dependent terminals, value dependency).
  if (!staticResult.requiresDynamicCheck) {
    if (staticResult.classification === 'UNSAFE') {
      const counterexample = findCounterexample(original, alternativePipeline, testInput);
      if (counterexample.found) result.counterexample = counterexample;
    }
    result.verdictExplanation = buildVerdictExplanation(result.classification, result.staticReason, dependency, original, alternativePipeline, null, swappedPair);
    return result;
  }

  // Dynamic verification across the user's input, the counterexample battery and edge cases.
  const primary = analyzeDynamic(original, alternativePipeline, testInput);
  result.dynamicResult = primary;

  const counterexample = findCounterexample(original, alternativePipeline, primary.testInput);
  const edgeCaseResults = runEdgeCases(original, alternativePipeline);
  result.edgeCaseResults = edgeCaseResults;

  if (counterexample.found) {
    result.classification = 'UNSAFE';
    result.dynamicReason = `Outputs differ for input [${counterexample.input.join(', ')}]: original [${counterexample.originalOutput.join(', ')}] vs alternative [${counterexample.alternativeOutput.join(', ')}].`;
    result.counterexample = counterexample;
  } else if (staticResult.classification === 'UNKNOWN') {
    if (dependency) {
      result.classification = 'CONDITIONALLY SAFE';
      result.dynamicReason = `No difference observed on ${edgeCaseResults.totalCases} edge cases and ${COUNTEREXAMPLE_INPUTS.length} search inputs, but a ${dependency.type} dependency exists, so equivalence holds only for this input domain.`;
    } else {
      result.classification = 'SAFE';
      result.dynamicReason = `Outputs matched on every tested input, including ${edgeCaseResults.totalCases} edge cases.`;
    }
  } else if (staticResult.classification === 'CONDITIONALLY SAFE') {
    result.classification = 'CONDITIONALLY SAFE';
    result.dynamicReason = `${staticResult.reason} Tested inputs showed no difference, but the guarantee is data dependent.`;
  } else {
    result.classification = 'SAFE';
    result.dynamicReason = primary.reason;
  }

  result.verdictExplanation = buildVerdictExplanation(
    result.classification,
    result.staticReason,
    dependency,
    original,
    alternativePipeline,
    result.dynamicReason,
    swappedPair,
  );

  return result;
}

function buildVerdictExplanation(classification, staticReason, dependency, original, alternativePipeline, dynamicReason, swappedPair) {
  const dependencies = dependency && swappedPair
    ? [{
        fromIndex: swappedPair.fromIndex,
        toIndex: swappedPair.toIndex,
        fromOperation: methodName(swappedPair.first.type),
        toOperation: methodName(swappedPair.second.type),
        type: dependency.type,
        reason: dependency.reason,
        lambda: dependency.lambda,
      }]
    : [];

  const summary = dependency && swappedPair
    ? `${dependency.type} dependency between ${methodName(swappedPair.first.type)}() #${swappedPair.fromIndex} and ${methodName(swappedPair.second.type)}() #${swappedPair.toIndex} — ${dependency.reason}`
    : 'No blocking dependency between the swapped operations.';

  const headline = {
    SAFE: 'Verdict: SAFE. No semantic dependency blocks the swap and every tested input produced identical output.',
    'CONDITIONALLY SAFE': 'Verdict: CONDITIONALLY SAFE. No tested input broke the reordering, but the guarantee depends on the data.',
    UNSAFE: 'Verdict: UNSAFE. A concrete input produces different output after the reordering.',
    UNKNOWN: 'Verdict: UNKNOWN — semantic equivalence could not be proven.',
  }[classification] || `Verdict: ${classification}.`;

  return {
    classification,
    staticReason,
    hadDependency: dependencies.length > 0,
    dependencies,
    dependencySummary: summary,
    explanation: [
      headline,
      dynamicReason ? `Dynamic check: ${dynamicReason}` : null,
      staticReason ? `Static check: ${staticReason}` : null,
    ].filter(Boolean).join('\n'),
    originalChain: chainString(original),
    alternativeChain: chainString(alternativePipeline),
  };
}

export { findCounterexample, outputsEqual };
