/**
 * Tests for the Node analysis engine (`npm run test:api`).
 *
 * They pin the behaviour the UI depends on: Java `int` semantics, faithful
 * traces, and — most importantly — the "never a false SAFE" rule.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { parse } from './streamParser.js';
import { executePipeline, tracePipeline } from './executor.js';
import { pipelineToMap, methodName } from './ir.js';
import { buildAlternativePipeline, buildDependencyGraph, generateAlternatives } from './counterfactual.js';
import { analyzeStatic, findCounterexample, verifyTransformation } from './equivalence.js';
import { startServer } from './handler.js';

const code = (ops, source = 'List.of(1, 2, 3)') =>
  `List<Integer> numbers = ${source};\nnumbers.stream()\n${ops.map((o) => `    .${o}`).join('\n')}\n    .toList();`;

function verify(originalCode, alternativeCode, testInput) {
  const original = parse(originalCode);
  const alternatives = generateAlternatives(original);
  assert.ok(alternatives.length > 0, 'expected at least one candidate reordering');
  const alternative = alternatives[0];
  return verifyTransformation(original, buildAlternativePipeline(original, alternative), alternative, testInput);
}

/* ------------------------------- parser ------------------------------- */

test('parser extracts operations, terminal and characteristics', () => {
  const pipeline = parse(code(['filter(n -> n > 10)', 'map(n -> n * 2)', 'sorted()', 'limit(5)']));
  const map = pipelineToMap(pipeline);

  assert.deepEqual(map.operations.map((o) => o.displayName), ['filter', 'map', 'sorted', 'limit']);
  assert.equal(map.terminalOperation.displayName, 'toList');
  assert.equal(map.sourceType, 'List');
  assert.equal(map.isParallel, false);
  assert.deepEqual(map.operations[0].index, 0);
  assert.deepEqual(map.operations[2].characteristics.sort(), ['LAZY', 'ORDERING', 'STATEFUL']);
  assert.equal(map.operations[3].shortCircuiting, true);
  assert.equal(map.operations[0].lambdaExpression, 'n -> n > 10');
});

test('parser detects parallel streams and rejects code without a pipeline', () => {
  assert.equal(parse('numbers.parallelStream().filter(n -> n > 1).toList();').isParallel, true);
  assert.throws(() => parse('int x = 5;'), /No stream pipeline found/);
  assert.throws(() => parse(''), /No code supplied/);
});

/* ------------------------------ executor ------------------------------ */

test('executor reproduces Java stream results', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30];
  assert.deepEqual(
    executePipeline(parse(code(['filter(n -> n > 10)', 'map(n -> n * 2)'])), input),
    [30, 40, 50, 60],
  );
  assert.deepEqual(
    executePipeline(parse(code(['filter(n -> n % 2 == 0)', 'map(n -> n * 3)', 'sorted()', 'limit(5)'])), input),
    [6, 12, 18, 24, 30],
  );
  const duplicated = [1, 2, 2, 3, 3, 3];
  assert.deepEqual(
    executePipeline(parse(code(['distinct()'], 'List.of(1, 2, 2, 3, 3, 3)')), duplicated),
    [1, 2, 3],
  );
  assert.deepEqual(
    executePipeline(parse(code(['sorted(Comparator.reverseOrder())'], 'List.of(3, 1, 2)')), [3, 1, 2]),
    [3, 2, 1],
  );
  assert.deepEqual(executePipeline(parse(code(['skip(2)'])), [1, 2, 3, 4]), [3, 4]);
  assert.deepEqual(executePipeline(parse(code(['limit(2)'])), [1, 2, 3, 4]), [1, 2]);
});

test('executor uses Java int semantics (overflow and truncating division)', () => {
  const overflow = parse(code(['map(n -> n * 10)']));
  assert.deepEqual(executePipeline(overflow, [2147483647]), [-10]);
  assert.deepEqual(executePipeline(parse(code(['map(n -> n / 2)'])), [-7, 7]), [-3, 3]);
  assert.deepEqual(executePipeline(parse(code(['map(n -> n % 3)'])), [-7, 7]), [-1, 1]);
});

test('terminals: count, reduce, toSet, findFirst', () => {
  const base = 'List<Integer> numbers = List.of(1, 2, 3);\nnumbers.stream()';
  assert.deepEqual(executePipeline(parse(`${base}.count();`), [1, 2, 3]), [3]);
  assert.deepEqual(executePipeline(parse(`${base}.reduce((a, b) -> a + b);`), [1, 2, 3]), [6]);
  assert.deepEqual(executePipeline(parse(`${base}.distinct().toSet();`), [1, 1, 2]), [1, 2]);
  assert.deepEqual(executePipeline(parse(`${base}.filter(n -> n > 2).findFirst();`), [1, 2, 3]), [3]);
});

/* ------------------------------- tracer ------------------------------- */

test('tracer reports rejection reasons per element', () => {
  const trace = tracePipeline(parse(code(['filter(n -> n > 3)', 'map(n -> n * 2)'])), [1, 4]);
  assert.equal(trace.elementTraces[0].accepted, false);
  assert.match(trace.elementTraces[0].steps[0].description, /REJECTED: 1 does not satisfy/);
  assert.equal(trace.elementTraces[1].outputValue, 8);
  assert.match(trace.elementTraces[1].steps[1].description, /TRANSFORMED: 4 → 8/);
});

test('tracer computes positions after filtering for skip/limit', () => {
  const trace = tracePipeline(parse(code(['filter(n -> n > 3)', 'skip(2)'])), [1, 2, 3, 4, 5, 6, 7, 8]);
  const accepted = trace.elementTraces.filter((t) => t.accepted).map((t) => t.outputValue);
  assert.deepEqual(accepted, [6, 7, 8]);
  assert.match(trace.elementTraces[3].steps[1].description, /DROPPED: position 1 is inside skip\(2\)/);
});

test('tracer marks duplicates as dropped', () => {
  const trace = tracePipeline(parse(code(['distinct()'])), [1, 2, 2, 3]);
  assert.deepEqual(trace.elementTraces.map((t) => t.accepted), [true, true, false, true]);
  assert.match(trace.elementTraces[2].steps[0].description, /duplicate of element #2/);
});

/* --------------------------- counterfactual --------------------------- */

test('counterfactual engine skips order-sensitive stateful pairs', () => {
  // sorted + limit is the classic top-N pattern; swapping them is meaningless
  // (limit is short-circuiting, sorted is stateful) so no candidate is offered.
  assert.equal(generateAlternatives(parse(code(['sorted()', 'limit(5)']))).length, 0);
  assert.equal(generateAlternatives(parse(code(['filter(n -> n > 1)']))).length, 0);
  assert.equal(generateAlternatives(parse(code(['filter(n -> n > 1)', 'map(n -> n * 2)']))).length, 1);
});

test('dependency graph classifies VALUE / ORDER / SHORT_CIRCUIT edges', () => {
  const types = (ops) => buildDependencyGraph(parse(code(ops))).dependencies.map((d) => `${d.fromOperation}->${d.toOperation}:${d.type}`);
  assert.deepEqual(types(['map(n -> n * 2)', 'filter(n -> n > 10)']), ['map->filter:VALUE']);
  assert.deepEqual(types(['sorted()', 'limit(5)']), ['sorted->limit:ORDER']);
  assert.deepEqual(types(['filter(n -> n > 3)', 'skip(2)']), ['filter->skip:SHORT_CIRCUIT']);
  assert.deepEqual(types(['peek(n -> n)', 'map(n -> n * 2)']), ['peek->map:SIDE_EFFECT']);
  // map preserves count and order, so limit does not depend on it.
  assert.equal(buildDependencyGraph(parse(code(['map(n -> n * 2)', 'limit(3)']))).hasDependencies, false);
});

/* ----------------------------- equivalence ---------------------------- */

test('filter → map reordering is UNSAFE with a concrete counterexample', () => {
  // The README example: input [6] is rejected before map, but passes after it.
  const original = parse(code(['filter(n -> n > 10)', 'map(n -> n * 2)']));
  const alternative = parse(code(['map(n -> n * 2)', 'filter(n -> n > 10)']));
  const ce = findCounterexample(original, alternative, [6]);

  assert.equal(ce.found, true);
  assert.deepEqual(ce.input, [6]);
  assert.deepEqual(ce.originalOutput, []);
  assert.deepEqual(ce.alternativeOutput, [12]);
  assert.ok(ce.originalTrace.length > 0);

  const result = verify(code(['filter(n -> n > 10)', 'map(n -> n * 2)']), code(['map(n -> n * 2)', 'filter(n -> n > 10)']));
  assert.equal(result.classification, 'UNSAFE');
  assert.ok(result.counterexample);
  assert.equal(result.verdictExplanation.hadDependency, false);
  assert.match(result.verdictExplanation.explanation, /Verdict: UNSAFE/);
});

test('order-preserving swaps are proven SAFE and unlock the benchmark fields', () => {
  const result = verify(code(['filter(n -> n > 2)', 'sorted()']), code(['sorted()', 'filter(n -> n > 2)']));
  assert.equal(result.classification, 'SAFE');
  assert.equal(result.counterexample, undefined);
  assert.equal(result.edgeCaseResults.allPass, true);
  assert.match(result.verdictExplanation.explanation, /Verdict: SAFE/);
});

test('map ↔ limit is SAFE (limit ignores values) but map ↔ sorted is only conditional', () => {
  assert.equal(verify(code(['map(n -> n * 3)', 'limit(5)']), code(['limit(5)', 'map(n -> n * 3)'])).classification, 'SAFE');
  assert.equal(
    verify(code(['map(n -> n * 3)', 'sorted()']), code(['sorted()', 'map(n -> n * 3)'])).classification,
    'CONDITIONALLY SAFE',
  );
});

test('unanalyzable lambdas yield UNKNOWN, never a false SAFE', () => {
  const result = verify(
    code(['filter(n -> registry.lookup(n).isActive())', 'map(n -> n * 2)']),
    code(['map(n -> n * 2)', 'filter(n -> registry.lookup(n).isActive())']),
  );
  assert.equal(result.classification, 'UNKNOWN');
  assert.match(result.staticReason, /could not be proven/);
  assert.equal(result.counterexample, undefined);
});

test('side-effecting pipelines are rejected statically', () => {
  const original = parse(code(['peek(n -> System.out.println(n))', 'map(n -> n * 2)']));
  const alternative = parse(code(['map(n -> n * 2)', 'peek(n -> System.out.println(n))']));
  const staticResult = analyzeStatic(original, alternative, null);
  assert.equal(staticResult.classification, 'UNSAFE');
  assert.equal(staticResult.requiresDynamicCheck, false);
});

test('lambda compilation handles richer expressions than the regex heuristics', () => {
  assert.deepEqual(executePipeline(parse(code(['filter(n -> n > 5 && n < 20)', 'map(n -> Math.abs(n - 12) * 2)'])), [1, 6, 12, 19, 30]), [12, 0, 14]);
  assert.deepEqual(executePipeline(parse(code(['map(n -> n * n)'])), [1, 2, 3]), [1, 4, 9]);
  assert.deepEqual(executePipeline(parse(code(['map(n -> (n + 1) / 2)'])), [1, 2, 3]), [1, 1, 2]);
});

/* -------------------------------- HTTP -------------------------------- */

test('HTTP API: analyze, errors and health', async () => {
  const server = startServer(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const call = (path, body, method = 'POST') =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });

  try {
    const health = await call('/api/health', undefined, 'GET');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');

    const ok = await call('/api/analyze', {
      javaCode: code(['filter(n -> n > 10)', 'map(n -> n * 2)']),
      testInput: '1,2,3',
      runBenchmarks: true,
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body).sort(), [
      'alternatives', 'analysisResults', 'benchmark', 'counterexample', 'dependencyGraph',
      'dependencyReadable', 'explanations', 'parsedPipeline', 'trace',
    ].sort());
    assert.equal(ok.body.analysisResults[0].classification, 'UNSAFE');
    assert.equal(ok.body.benchmark.eligible, false);
    assert.equal(ok.body.explanations.length, 3);
    assert.equal(ok.body.trace.elementTraces.length, 3);

    const badCode = await call('/api/analyze', { javaCode: 'int x = 1;' });
    assert.equal(badCode.status, 400);
    assert.match(badCode.body.error, /No stream pipeline found/);

    const badInput = await call('/api/analyze', { javaCode: code(['filter(n -> n > 1)']), testInput: 'x,y' });
    assert.equal(badInput.status, 400);
    assert.match(badInput.body.error, /comma-separated integers/);

    const missing = await call('/api/analyze', {});
    assert.equal(missing.status, 400);

    const unknown = await call('/api/nope', undefined, 'GET');
    assert.equal(unknown.status, 404);

    const safe = await call('/api/analyze', { javaCode: code(['filter(n -> n > 2)', 'sorted()']), benchmarkIterations: 12 });
    assert.equal(safe.body.analysisResults[0].classification, 'SAFE');
    assert.equal(safe.body.benchmark.eligible, true);
    assert.ok(safe.body.benchmark.iterations > 0);
  } finally {
    server.close();
  }
});

test('operation names round-trip through the IR', () => {
  assert.equal(methodName('TO_LIST'), 'toList');
  assert.equal(methodName('FLATMAP'), 'flatMap');
});
