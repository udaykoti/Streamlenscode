/**
 * Vercel Serverless Function — POST /api/analyze
 *
 * Full end-to-end analysis: parse, trace, candidates, verdicts, counterexamples, benchmark.
 *
 * Thin entry point: all logic lives in `dev-api/`, the same engine the Vite dev
 * server falls back to, so dev and deployed behaviour stay identical and the
 * static frontend works publicly without the Spring Boot backend.
 */
import { createFunctionHandler } from '../dev-api/handler.js';

export default createFunctionHandler();
