import type { AnalysisResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Extract a useful message from a failed response. The backend answers with
 * `{ "error": "..." }`, but a proxy or server crash can return a non-JSON body
 * (or nothing at all) — never let that surface as "Unexpected token <".
 */
export async function readError(response: Response, fallback: string): Promise<string> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      detail = typeof parsed?.error === 'string' ? parsed.error : '';
    } catch {
      detail = text.trim().slice(0, 200);
    }
  } catch {
    detail = '';
  }
  return detail || `${fallback} (HTTP ${response.status})`;
}

/** Wrap fetch so a dead/unreachable API reports something actionable. */
async function post(path: string, body: unknown, fallback: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach the StreamLens API at ${API_BASE}${path}. ` +
      `Start the backend (\`cd backend && mvn spring-boot:run\` or \`npm run dev:api\` in frontend/) and retry. ` +
      `(${err instanceof Error ? err.message : 'network error'})`,
    );
  }

  if (!response.ok) {
    throw new Error(await readError(response, fallback));
  }
  return response.json();
}

export async function analyzeCode(javaCode: string, testInput?: string): Promise<AnalysisResponse> {
  return post(
    '/analyze',
    {
      javaCode,
      testInput: testInput || undefined,
      generateAlternatives: true,
      runBenchmarks: true,
      benchmarkIterations: 100,
    },
    'Analysis failed',
  );
}

export async function parseCode(javaCode: string) {
  return post('/parse', { javaCode }, 'Parse failed');
}

export async function traceExecution(javaCode: string, input: number[]) {
  return post('/trace', { javaCode, input }, 'Trace failed');
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return { status: 'error', code: response.status };
    return await response.json();
  } catch {
    return { status: 'unreachable' };
  }
}
