/**
 * Vercel Serverless Function — GET /api/samples
 *
 * Sample stream snippets from test-data/.
 *
 * Thin entry point: all logic lives in `dev-api/`, the same engine the Vite dev
 * server falls back to, so dev and deployed behaviour stay identical and the
 * static frontend works publicly without the Spring Boot backend.
 */
import { createFunctionHandler } from '../dev-api/handler.js';

export default createFunctionHandler();
