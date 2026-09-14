import type { AnalysisResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function checkJsonResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Backend unavailable: ${response.status} ${response.statusText}. Received: ${text.substring(0, 200)}`);
  }
  return response.json();
}

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

  const json = await checkJsonResponse(response);
  
  if (!response.ok) {
    throw new Error(json.error || 'Analysis failed');
  }

  return json;
}

export async function parseCode(javaCode: string) {
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ javaCode }),
  });

  const json = await checkJsonResponse(response);

  if (!response.ok) {
    throw new Error(json.error || 'Parse failed');
  }

  return json;
}

export async function traceExecution(javaCode: string, input: number[]) {
  const response = await fetch(`${API_BASE}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ javaCode, input }),
  });

  const json = await checkJsonResponse(response);

  if (!response.ok) {
    throw new Error(json.error || 'Trace failed');
  }

  return json;
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`);
  const json = await checkJsonResponse(response);
  return json;
}
