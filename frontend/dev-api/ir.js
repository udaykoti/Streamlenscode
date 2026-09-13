/**
 * Stream IR — JavaScript port of `com.streamlens.service.ir`.
 *
 * Mirrors OperationType / OperationCharacteristic / StreamOperation / StreamPipeline
 * from the Java backend so both engines speak the same intermediate representation.
 */

export const OperationType = {
  FILTER: 'FILTER',
  MAP: 'MAP',
  FLATMAP: 'FLATMAP',
  SORTED: 'SORTED',
  DISTINCT: 'DISTINCT',
  LIMIT: 'LIMIT',
  SKIP: 'SKIP',
  PEEK: 'PEEK',
  REDUCE: 'REDUCE',
  COLLECT: 'COLLECT',
  COUNT: 'COUNT',
  TO_LIST: 'TO_LIST',
  TO_SET: 'TO_SET',
  FIND_FIRST: 'FIND_FIRST',
  FIND_ANY: 'FIND_ANY',
  ANY_MATCH: 'ANY_MATCH',
  ALL_MATCH: 'ALL_MATCH',
  NONE_MATCH: 'NONE_MATCH',
};

const METHOD_NAMES = {
  FILTER: 'filter',
  MAP: 'map',
  FLATMAP: 'flatMap',
  SORTED: 'sorted',
  DISTINCT: 'distinct',
  LIMIT: 'limit',
  SKIP: 'skip',
  PEEK: 'peek',
  REDUCE: 'reduce',
  COLLECT: 'collect',
  COUNT: 'count',
  TO_LIST: 'toList',
  TO_SET: 'toSet',
  FIND_FIRST: 'findFirst',
  FIND_ANY: 'findAny',
  ANY_MATCH: 'anyMatch',
  ALL_MATCH: 'allMatch',
  NONE_MATCH: 'noneMatch',
};

const INTERMEDIATE = new Set([
  'FILTER', 'MAP', 'FLATMAP', 'SORTED', 'DISTINCT', 'LIMIT', 'SKIP', 'PEEK',
]);

const STATEFUL = new Set(['SORTED', 'DISTINCT', 'LIMIT', 'SKIP']);

const SHORT_CIRCUITING = new Set([
  'LIMIT', 'FIND_FIRST', 'FIND_ANY', 'ANY_MATCH', 'ALL_MATCH', 'NONE_MATCH',
]);

export function methodName(type) {
  return METHOD_NAMES[type] || String(type).toLowerCase();
}

export function operationTypeFromMethodName(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  for (const [type, method] of Object.entries(METHOD_NAMES)) {
    if (method.toLowerCase() === lower) return type;
  }
  return null;
}

export function isIntermediate(type) {
  return INTERMEDIATE.has(type);
}

export function isTerminal(type) {
  return !isIntermediate(type);
}

export function isStatefulType(type) {
  return STATEFUL.has(type);
}

export function isShortCircuitingType(type) {
  return SHORT_CIRCUITING.has(type);
}

export function hasSideEffectsType(type) {
  return type === 'PEEK';
}

/** Port of OperationCharacteristic.forOperation */
export function characteristicsFor(type) {
  switch (type) {
    case 'SORTED': return ['STATEFUL', 'ORDERING', 'LAZY'];
    case 'DISTINCT': return ['STATEFUL', 'UNORDERED', 'LAZY'];
    case 'LIMIT': return ['STATEFUL', 'SHORT_CIRCUITING', 'LAZY'];
    case 'SKIP': return ['STATEFUL', 'LAZY'];
    case 'REDUCE': return ['SHORT_CIRCUITING'];
    case 'FIND_FIRST':
    case 'FIND_ANY':
    case 'ANY_MATCH':
    case 'ALL_MATCH':
    case 'NONE_MATCH': return ['SHORT_CIRCUITING'];
    default: return [];
  }
}

export function createOperation(type, { lambdaExpression = null, argumentExpression = null, rawSource = null, index = 0 } = {}) {
  const characteristics = characteristicsFor(type);
  return {
    index,
    type,
    lambdaExpression,
    lambdaBody: lambdaExpression ? extractLambdaBody(lambdaExpression) : null,
    argumentExpression: argumentExpression ?? lambdaExpression,
    inputType: null,
    outputType: null,
    characteristics,
    rawSource,
    stateful: characteristics.includes('STATEFUL'),
    shortCircuiting: characteristics.includes('SHORT_CIRCUITING'),
    hasSideEffects: hasSideEffectsType(type),
  };
}

export function extractLambdaBody(lambda) {
  if (!lambda) return lambda;
  const arrow = topLevelArrowIndex(lambda);
  if (arrow >= 0) {
    const after = lambda.slice(arrow + 2).trim();
    if (after.startsWith('{')) {
      return after.slice(1, after.lastIndexOf('}')).trim();
    }
    return after;
  }
  return lambda;
}

/** Index of the first `->` that is not nested inside (), [] or {} — or -1. */
export function topLevelArrowIndex(text) {
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '-' && text[i + 1] === '>' && depth === 0) return i;
  }
  return -1;
}

export function createPipeline({
  sourceType = 'List',
  operations = [],
  terminalOperation = null,
  isParallel = false,
  rawSource = '',
  collectionType = null,
} = {}) {
  return { sourceType, operations, terminalOperation, isParallel, rawSource, collectionType };
}

export function copyPipeline(pipeline) {
  return {
    ...pipeline,
    operations: pipeline.operations.slice(),
  };
}

export function withReorderedOperations(pipeline, reordered) {
  const copy = copyPipeline(pipeline);
  copy.operations = reordered.slice();
  return copy;
}

export function allOperations(pipeline) {
  return pipeline.terminalOperation
    ? [...pipeline.operations, pipeline.terminalOperation]
    : pipeline.operations.slice();
}

export function operationToString(op) {
  if (op.lambdaExpression) return `${methodName(op.type)}(${op.lambdaExpression})`;
  if (op.argumentExpression) return `${methodName(op.type)}(${op.argumentExpression})`;
  return `${methodName(op.type)}()`;
}

export function pipelineToString(pipeline) {
  const parts = [`${pipeline.sourceType}.stream()`];
  for (const op of pipeline.operations) parts.push(`    .${operationToString(op)}`);
  if (pipeline.terminalOperation) parts.push(`    .${operationToString(pipeline.terminalOperation)}`);
  return parts.join('\n') + ';';
}

/** Port of StreamParserService.convertOperation → OperationInfo */
export function operationToInfo(op) {
  return {
    index: op.index,
    type: op.type,
    displayName: methodName(op.type),
    lambdaExpression: op.lambdaExpression ?? undefined,
    lambdaBody: op.lambdaBody ?? undefined,
    inputType: op.inputType ?? undefined,
    outputType: op.outputType ?? undefined,
    characteristics: op.characteristics,
    stateful: op.stateful,
    shortCircuiting: op.shortCircuiting,
    hasSideEffects: op.hasSideEffects,
    argumentExpression: op.argumentExpression ?? undefined,
  };
}

/** Port of StreamParserService.parseToMap */
export function pipelineToMap(pipeline) {
  const result = {
    sourceType: pipeline.sourceType,
    isParallel: pipeline.isParallel,
    operations: pipeline.operations.map(operationToInfo),
  };
  if (pipeline.terminalOperation) {
    result.terminalOperation = operationToInfo(pipeline.terminalOperation);
  }
  result.rawSource = pipeline.rawSource;
  return result;
}
