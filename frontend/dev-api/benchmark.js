/**
 * Benchmark engine — JavaScript port of `com.streamlens.service.benchmark.BenchmarkEngine`.
 *
 * Correctness first: the caller only runs this once a transformation has been
 * proven SAFE, so the result also carries the recommendation the UI shows.
 */

import { executePipeline } from './executor.js';

function formatNanos(nanos) {
  if (nanos < 1_000) return `${Math.round(nanos)} ns`;
  if (nanos < 1_000_000) return `${(nanos / 1_000).toFixed(2)} us`;
  if (nanos < 1_000_000_000) return `${(nanos / 1_000_000).toFixed(2)} ms`;
  return `${(nanos / 1_000_000_000).toFixed(2)} s`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandom(size, min = -1000, max = 1000) {
  return Array.from({ length: size }, () => randomInt(min, max));
}

function generateSequential(size) {
  return Array.from({ length: size }, (_, i) => i + 1);
}

/** Smaller than the JVM datasets, but the same shapes: random, sequential, duplicates, negatives, mixed. */
export function generateTestDatasets() {
  return [
    { description: 'random 500 (-1000..1000)', data: generateRandom(500) },
    { description: 'sequential 1000', data: generateSequential(1000) },
    { description: 'random 1000', data: generateRandom(1000) },
    { description: 'duplicates 500 (1..50)', data: generateRandom(500, 1, 50) },
    { description: 'all negative 200', data: generateRandom(200, -100, -1) },
    { description: 'mixed 500 (-500..500)', data: generateRandom(500, -500, 500) },
  ];
}

export function benchmark(original, alternative, iterations = 100) {
  const requested = Math.max(6, Math.min(2000, Number(iterations) || 100));
  const datasets = generateTestDatasets();
  const runsPerDataset = Math.max(1, Math.round(requested / datasets.length));

  let originalTotal = 0;
  let alternativeTotal = 0;
  let originalElements = 0;
  let alternativeElements = 0;
  let runs = 0;

  for (const dataset of datasets) {
    // warm up the JIT-ish path so the first dataset is not penalised
    executePipeline(original, dataset.data.slice(0, 50));
    executePipeline(alternative, dataset.data.slice(0, 50));

    for (let i = 0; i < runsPerDataset; i++) {
      let start = process.hrtime.bigint();
      const originalOutput = executePipeline(original, dataset.data);
      originalTotal += Number(process.hrtime.bigint() - start);
      originalElements += originalOutput.length;

      start = process.hrtime.bigint();
      const alternativeOutput = executePipeline(alternative, dataset.data);
      alternativeTotal += Number(process.hrtime.bigint() - start);
      alternativeElements += alternativeOutput.length;

      runs++;
    }
  }

  const effectiveRuns = Math.max(1, runs);
  const originalAvg = originalTotal / effectiveRuns;
  const alternativeAvg = alternativeTotal / effectiveRuns;
  const speedupRatio = originalAvg > 0 ? alternativeAvg / originalAvg : 1;

  const originalCount = Math.round(originalElements / effectiveRuns);
  const alternativeCount = Math.round(alternativeElements / effectiveRuns);
  const elementsSavedPercent = originalCount > 0
    ? Math.max(0, Math.round(((originalCount - alternativeCount) / originalCount) * 100))
    : 0;

  const recommendation = speedupRatio < 0.97
    ? 'RECOMMEND APPLY'
    : speedupRatio > 1.03
      ? 'RECOMMEND AGAINST'
      : 'OPTIONAL';

  return {
    originalAvg: formatNanos(originalAvg),
    alternativeAvg: formatNanos(alternativeAvg),
    speedupRatio: Number(speedupRatio.toFixed(4)),
    iterations: effectiveRuns,
    originalElementCount: originalCount,
    alternativeElementCount: alternativeCount,
    elementsSavedPercent,
    datasetDescription: `${datasets.length} datasets (${datasets.map((d) => d.description).join(', ')})`,
    recommendation,
    eligible: true,
  };
}
