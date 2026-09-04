import type { AnalysisResponse } from '../types';

const API_BASE = '/api';

export async function analyzeCode(javaCode: string, testInput?: string): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      javaCode,
      testInput: testInput || undefined,
      generateAlternatives: true,
      runBenchmarks: true,
      benchmarkIterations: 100,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Analysis failed');
  }

  return response.json();
}

export async function parseCode(javaCode: string) {
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ javaCode }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Parse failed');
  }

  return response.json();
}

export async function traceExecution(javaCode: string, input: number[]) {
  const response = await fetch(`${API_BASE}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ javaCode, input }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Trace failed');
  }

  return response.json();
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}
