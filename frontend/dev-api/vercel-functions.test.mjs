/**
 * Tests for the Vercel serverless entry points in `frontend/api/`.
 *
 * Vercel's Node runtime parses `application/json` before the handler runs and
 * hands over `req.body` with the socket already drained, which is not how the
 * Vite dev server or `npm run dev:api` call the same engine. These tests pin
 * both invocation styles so the deployed site behaves like local dev.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '../api');

function fakeRequest({ method = 'POST', url, body, preParsed = false }) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
  const payload = body === undefined ? '' : JSON.stringify(body);
  if (preParsed && body !== undefined) {
    // Vercel: body already parsed, stream already consumed.
    req.body = body;
    req.end();
  } else {
    req.end(payload);
  }
  return req;
}

function fakeResponse() {
  const res = {
    statusCode: null,
    headers: null,
    body: null,
    headersSent: false,
    writableEnded: false,
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers;
      res.headersSent = true;
      return res;
    },
    end(body) {
      res.body = body ?? '';
      res.writableEnded = true;
      return res;
    },
  };
  return res;
}

async function invoke(handler, options) {
  const req = fakeRequest(options);
  const res = fakeResponse();
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

const code = (ops) =>
  `List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30);\nnumbers.stream()\n${ops.map((o) => `    .${o}`).join('\n')}\n    .toList();`;

test('every api/*.js exports a Vercel-compatible default handler', async () => {
  const files = (await readdir(apiDir)).filter((f) => f.endsWith('.js')).sort();
  assert.ok(files.length >= 13, `expected the documented endpoints, found ${files.length}`);

  for (const file of files) {
    const mod = await import(pathToFileURL(resolve(apiDir, file)).href);
    assert.equal(typeof mod.default, 'function', `${file} must export a default handler`);
    assert.equal(mod.default.length, 2, `${file} handler must accept (req, res)`);
  }

  // The README documents these endpoints; each needs a matching function file.
  for (const endpoint of ['analyze', 'parse', 'trace', 'counterfactual', 'equivalence', 'counterexample', 'benchmark', 'explain', 'health']) {
    assert.ok(files.includes(`${endpoint}.js`), `missing api/${endpoint}.js`);
  }
});

test('analyze works with a Vercel pre-parsed body and with a raw stream', async () => {
  const { default: handler } = await import(pathToFileURL(resolve(apiDir, 'analyze.js')).href);
  const body = { javaCode: code(['filter(n -> n > 10)', 'map(n -> n * 2)']), testInput: '6', runBenchmarks: true };

  for (const preParsed of [true, false]) {
    const res = await invoke(handler, { url: '/api/analyze', body, preParsed });
    assert.equal(res.status, 200, `preParsed=${preParsed}`);
    assert.equal(res.json.analysisResults[0].classification, 'UNSAFE');
    assert.deepEqual(res.json.analysisResults[0].counterexample.input, [6]);
    assert.deepEqual(res.json.analysisResults[0].counterexample.alternativeOutput, [12]);
    assert.equal(res.json.benchmark.eligible, false);
    assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  }
});

test('each function file answers its own route and rejects foreign ones', async () => {
  const cases = [
    ['health.js', 'GET', '/api/health', 200],
    ['mode.js', 'GET', '/api/mode', 200],
    ['parse.js', 'POST', '/api/parse', 200],
    ['trace.js', 'POST', '/api/trace', 200],
    ['counterfactual.js', 'POST', '/api/counterfactual', 200],
    ['execute.js', 'POST', '/api/execute', 200],
    ['explain.js', 'POST', '/api/explain', 200],
    ['equivalence.js', 'POST', '/api/equivalence', 200],
    ['counterexample.js', 'POST', '/api/counterexample', 200],
    ['benchmark.js', 'POST', '/api/benchmark', 200],
    ['explain-transformation.js', 'POST', '/api/explain-transformation', 200],
  ];

  for (const [file, method, url, expected] of cases) {
    const { default: handler } = await import(pathToFileURL(resolve(apiDir, file)).href);
    const body = url === '/api/health' || url === '/api/mode'
      ? undefined
      : url === '/api/equivalence' || url === '/api/counterexample' || url === '/api/benchmark' || url === '/api/explain-transformation'
        ? { originalCode: code(['filter(n -> n > 2)', 'sorted()']), alternativeCode: code(['sorted()', 'filter(n -> n > 2)']), iterations: 6 }
        : { javaCode: code(['filter(n -> n > 2)', 'sorted()']), input: [1, 2, 3], testInput: '1,2,3' };

    const res = await invoke(handler, { method, url, body });
    assert.equal(res.status, expected, `${file} → ${url} returned ${res.status}: ${JSON.stringify(res.json)?.slice(0, 120)}`);
    assert.equal(typeof res.json, 'object');
  }

  // A function invoked for a route it does not own must 404 with JSON, never HTML.
  const { default: healthHandler } = await import(pathToFileURL(resolve(apiDir, 'health.js')).href);
  const wrong = await invoke(healthHandler, { method: 'GET', url: '/api/nope' });
  assert.equal(wrong.status, 404);
  assert.match(wrong.json.error, /Unknown endpoint/);
});

test('errors stay JSON on the serverless path', async () => {
  const { default: handler } = await import(pathToFileURL(resolve(apiDir, 'analyze.js')).href);

  const badCode = await invoke(handler, { url: '/api/analyze', body: { javaCode: 'int x = 1;' }, preParsed: true });
  assert.equal(badCode.status, 400);
  assert.match(badCode.json.error, /No stream pipeline found/);

  const malformed = await invoke(handler, { url: '/api/analyze', body: undefined, preParsed: false });
  assert.equal(malformed.status, 400);
  assert.match(malformed.json.error, /non-empty "javaCode"/);

  const wrongMethod = await invoke(handler, { method: 'PUT', url: '/api/analyze', body: {}, preParsed: true });
  assert.equal(wrongMethod.status, 405);

  const options = await invoke(handler, { method: 'OPTIONS', url: '/api/analyze', body: undefined });
  assert.equal(options.status, 204);
});

test('a SAFE transformation still unlocks the benchmark on the serverless path', async () => {
  const { default: handler } = await import(pathToFileURL(resolve(apiDir, 'analyze.js')).href);
  const res = await invoke(handler, {
    url: '/api/analyze',
    body: { javaCode: code(['filter(n -> n > 2)', 'sorted()']), benchmarkIterations: 6 },
    preParsed: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.analysisResults[0].classification, 'SAFE');
  assert.equal(res.json.benchmark.eligible, true);
  assert.ok(res.json.benchmark.iterations > 0);
  assert.ok(['RECOMMEND APPLY', 'OPTIONAL', 'RECOMMEND AGAINST'].includes(res.json.benchmark.recommendation));
});
