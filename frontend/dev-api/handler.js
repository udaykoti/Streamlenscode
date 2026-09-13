/**
 * HTTP handler for the StreamLens analysis API.
 *
 * This is a dependency-free Node implementation of the same `/api/*` contract
 * the Spring Boot backend in `backend/` exposes. It is used as a *fallback* by
 * the Vite dev server (see `vite.config.ts`): when the real Java backend is
 * reachable it answers the requests, otherwise this engine does, so the UI is
 * never left with a dead endpoint.
 *
 * Run it standalone with `npm run dev:api` (listens on 8080).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, request } from 'node:http';

import { pipelineToMap } from './ir.js';
import { ParseError, parse } from './streamParser.js';
import { executePipeline, tracePipeline } from './executor.js';
import {
  buildAlternativePipeline,
  buildDependencyGraph,
  dependencyReadable,
  generateAlternatives,
} from './counterfactual.js';
import {
  DEFAULT_TEST_INPUT,
  analyzeDynamic,
  analyzeStatic,
  findCounterexample,
  verifyTransformation,
} from './equivalence.js';
import { benchmark } from './benchmark.js';
import { generatePipelineExplanations, generateTransformationExplanations } from './explanation.js';

const here = dirname(fileURLToPath(import.meta.url));

export const ENGINE_NAME = 'streamlens-dev-api';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseTestInput(testInput) {
  if (testInput === undefined || testInput === null) return DEFAULT_TEST_INPUT.slice();
  if (Array.isArray(testInput)) {
    const values = testInput.map((v) => Number.parseInt(v, 10)).filter((v) => Number.isFinite(v));
    return values.length ? values : DEFAULT_TEST_INPUT.slice();
  }
  const text = String(testInput).trim();
  if (!text) return DEFAULT_TEST_INPUT.slice();
  const values = text
    .replace(/[[\]]/g, '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((v) => Number.parseInt(v, 10));
  if (values.some((v) => !Number.isFinite(v))) {
    throw new HttpError(400, 'Test input must be comma-separated integers, e.g. `1,2,3,4,5`');
  }
  return values.length ? values.slice(0, 10000) : DEFAULT_TEST_INPUT.slice();
}

function requireCode(body, field = 'javaCode') {
  const code = body?.[field];
  if (typeof code !== 'string' || !code.trim()) {
    throw new HttpError(400, `Request body must include a non-empty "${field}" string`);
  }
  return code;
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

function handleAnalyze(body) {
  const code = requireCode(body);
  const pipeline = parse(code);
  const testInput = parseTestInput(body.testInput);

  const alternatives = body.generateAlternatives === false ? [] : generateAlternatives(pipeline);
  const dependencyGraph = buildDependencyGraph(pipeline);

  const analysisResults = alternatives.map((alternative) => {
    const alternativePipeline = buildAlternativePipeline(pipeline, alternative);
    return verifyTransformation(pipeline, alternativePipeline, alternative, testInput);
  });

  const response = {
    parsedPipeline: pipelineToMap(pipeline),
    dependencyGraph,
    dependencyReadable: dependencyReadable(pipeline, dependencyGraph),
    trace: tracePipeline(pipeline, testInput),
    alternatives,
    analysisResults,
    benchmark: null,
    counterexample: analysisResults.find((r) => r.counterexample)?.counterexample ?? null,
    explanations: generatePipelineExplanations(pipeline),
  };

  // Correctness first: benchmark only runs once a transformation is proven SAFE.
  if (body.runBenchmarks !== false) {
    const safeIndex = analysisResults.findIndex((r) => r.classification === 'SAFE');
    if (safeIndex >= 0) {
      const alternativePipeline = buildAlternativePipeline(pipeline, alternatives[safeIndex]);
      response.benchmark = benchmark(pipeline, alternativePipeline, body.benchmarkIterations ?? 100);
      response.benchmarkAlternativeIndex = safeIndex;
    } else if (analysisResults.length > 0) {
      const first = analysisResults[0].classification;
      response.benchmark = {
        eligible: false,
        reason: `Benchmark locked — the selected transformation is ${first}, not SAFE. Correctness must be proven before performance is measured.`,
        originalAvg: '—',
        alternativeAvg: '—',
        speedupRatio: 1,
        iterations: 0,
      };
    }
  }

  return response;
}

function handleParse(body) {
  return pipelineToMap(parse(requireCode(body)));
}

function handleTrace(body) {
  const pipeline = parse(requireCode(body));
  const input = Array.isArray(body.input) ? parseTestInput(body.input) : parseTestInput(body.testInput);
  return tracePipeline(pipeline, input);
}

function handleCounterfactual(body) {
  const code = requireCode(body);
  const pipeline = parse(code);
  return {
    original: pipelineToMap(pipeline),
    alternatives: generateAlternatives(pipeline),
    dependencyGraph: buildDependencyGraph(pipeline),
  };
}

function handleEquivalence(body) {
  const original = parse(requireCode(body, 'originalCode'));
  const alternative = parse(requireCode(body, 'alternativeCode'));
  const staticResult = analyzeStatic(original, alternative, null);

  const response = {
    classification: staticResult.classification,
    reason: staticResult.reason,
    requiresDynamicCheck: staticResult.requiresDynamicCheck,
  };

  if (staticResult.requiresDynamicCheck) {
    const dynamic = analyzeDynamic(original, alternative, parseTestInput(body.testInput));
    response.dynamicResult = dynamic;
    response.classification = dynamic.classification;
    response.reason = dynamic.reason;
  }
  return response;
}

function handleCounterexample(body) {
  const original = parse(requireCode(body, 'originalCode'));
  const alternative = parse(requireCode(body, 'alternativeCode'));
  return findCounterexample(original, alternative, parseTestInput(body.testInput));
}

function handleBenchmark(body) {
  const original = parse(requireCode(body, 'originalCode'));
  const alternative = parse(requireCode(body, 'alternativeCode'));
  return benchmark(original, alternative, body.iterations ?? 100);
}

function handleExplain(body) {
  const pipeline = parse(requireCode(body));
  return { explanations: generatePipelineExplanations(pipeline) };
}

function handleTransformationExplain(body) {
  const original = parse(requireCode(body, 'originalCode'));
  const alternative = parse(requireCode(body, 'alternativeCode'));
  const classification = body.classification || 'UNKNOWN';
  return { explanations: generateTransformationExplanations(original, alternative, classification) };
}

function handleExecute(body) {
  const pipeline = parse(requireCode(body));
  const input = parseTestInput(body.testInput ?? body.input);
  return { input, output: executePipeline(pipeline, input) };
}

function handleSamples() {
  try {
    const raw = readFileSync(resolve(here, '../../test-data/samples.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { samples: [] };
  }
}

const GET_ROUTES = {
  '/api/health': () => ({ status: 'ok', service: 'streamlens-backend', engine: ENGINE_NAME, fallback: true }),
  '/api/samples': handleSamples,
  '/api/mode': () => ({ engine: ENGINE_NAME, fallback: true, note: 'Node fallback engine — start backend/ (Spring Boot) to use the JVM analyzer instead.' }),
};

const POST_ROUTES = {
  '/api/analyze': handleAnalyze,
  '/api/parse': handleParse,
  '/api/trace': handleTrace,
  '/api/counterfactual': handleCounterfactual,
  '/api/equivalence': handleEquivalence,
  '/api/counterexample': handleCounterexample,
  '/api/benchmark': handleBenchmark,
  '/api/explain': handleExplain,
  '/api/explain-transformation': handleTransformationExplain,
  '/api/execute': handleExecute,
};

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * Express-style middleware: handles `/api/*` when the Java backend is absent.
 * @returns {boolean} true when the response was handled.
 */
export async function handleApiRequest(req, res, next) {
  const url = (req.url || '').split('?')[0];
  if (!url.startsWith('/api')) {
    if (next) next();
    return false;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  try {
    if (req.method === 'GET') {
      const route = GET_ROUTES[url];
      if (!route) throw new HttpError(404, `Unknown endpoint ${url}`);
      sendJson(res, 200, route());
      return true;
    }

    if (req.method === 'POST') {
      const route = POST_ROUTES[url];
      if (!route) throw new HttpError(404, `Unknown endpoint ${url}`);
      const text = await readBody(req);
      let body = {};
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new HttpError(400, 'Request body must be valid JSON');
        }
      }
      sendJson(res, 200, route(body || {}));
      return true;
    }

    throw new HttpError(405, `Method ${req.method} not allowed for ${url}`);
  } catch (err) {
    if (err instanceof HttpError || err instanceof ParseError) {
      sendJson(res, err instanceof HttpError ? err.status : 400, { error: err.message });
    } else {
      // Never leave the client with a non-JSON body: the UI parses error JSON.
      sendJson(res, 500, { error: `Failed to analyze code: ${err.message}` });
    }
    return true;
  }
}

/**
 * Vite plugin: answer `/api/*` from the Node engine whenever the real Spring
 * Boot backend is not reachable. When the JVM backend *is* up we call `next()`
 * and Vite's own proxy forwards the request to it, so production behaviour is
 * unchanged.
 *
 * Registered before Vite's internal middlewares on purpose: Vite's proxy
 * terminates failed requests with a plain-text 500, which would never reach a
 * later middleware.
 */
export function streamlensFallbackApiPlugin(options = {}) {
  const target = options.target || 'http://localhost:8080';
  const probePath = options.probePath || '/api/health';
  const cacheMs = options.cacheMs ?? 4000;

  let backendUp = false;
  let checkedAt = 0;
  let inFlight = null;

  function probe() {
    const now = Date.now();
    if (now - checkedAt < cacheMs) return Promise.resolve(backendUp);
    if (inFlight) return inFlight;

    inFlight = new Promise((resolveProbe) => {
      const url = new URL(probePath, target);
      const req = request(
        { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'GET', timeout: 600 },
        (res) => {
          res.resume();
          resolveProbe(res.statusCode < 500);
        },
      );
      req.on('timeout', () => req.destroy(new Error('probe timeout')));
      req.on('error', () => resolveProbe(false));
      req.end();
    }).then((up) => {
      backendUp = up;
      checkedAt = Date.now();
      inFlight = null;
      return up;
    });

    return inFlight;
  }

  return {
    name: 'streamlens-fallback-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!(req.url || '').startsWith('/api')) {
          next();
          return;
        }
        probe()
          .then((up) => {
            if (up) {
              next(); // real backend is running → let Vite's proxy handle it
              return undefined;
            }
            return handleApiRequest(req, res, next);
          })
          .catch((err) => {
            server.config.logger.error(`[streamlens-fallback-api] ${err.stack || err.message}`);
            if (!res.headersSent) sendJson(res, 500, { error: err.message });
            else res.end();
          });
      });
    },
  };
}

/** Standalone server (`npm run dev:api`). */
export function startServer(port = Number(process.env.PORT) || 8080) {
  const server = createServer((req, res) => {
    handleApiRequest(req, res, () => sendJson(res, 404, { error: `Unknown endpoint ${req.url}` }));
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[streamlens-dev-api] listening on http://0.0.0.0:${port} (Node fallback for the Spring Boot backend)`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}
