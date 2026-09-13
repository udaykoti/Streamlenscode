import { create } from 'zustand';
import type {
  AnalysisResponse,
  ParsedPipeline,
  TraceResult,
  CandidateAlternative,
  AnalysisResultItem,
  BenchmarkResult,
  ExplanationItem,
  DependencyGraphData,
  Counterexample,
} from '../types';
import { SAMPLE_CODE } from '../types';
import { analyzeCode } from '../services/api';

interface AnalysisState {
  javaCode: string;
  testInput: string;
  isAnalyzing: boolean;
  error: string | null;

  parsedPipeline: ParsedPipeline | null;
  dependencyGraph: DependencyGraphData | null;
  dependencyReadable: string;
  trace: TraceResult | null;
  alternatives: CandidateAlternative[];
  analysisResults: AnalysisResultItem[];
  benchmark: BenchmarkResult | null;
  counterexample: Counterexample | null;
  explanations: ExplanationItem[];
  selectedAlternative: number | null;

  setJavaCode: (code: string) => void;
  setTestInput: (input: string) => void;
  setSelectedAlternative: (index: number | null) => void;
  analyze: () => Promise<void>;
  reset: () => void;
}

const getStoredCode = (): string => {
  try {
    return localStorage.getItem('streamlens-code') || SAMPLE_CODE;
  } catch {
    return SAMPLE_CODE;
  }
};

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  javaCode: getStoredCode(),
  testInput: '',
  isAnalyzing: false,
  error: null,

  parsedPipeline: null,
  dependencyGraph: null,
  dependencyReadable: '',
  trace: null,
  alternatives: [],
  analysisResults: [],
  benchmark: null,
  counterexample: null,
  explanations: [],
  selectedAlternative: null,

  setJavaCode: (code: string) => {
    set({ javaCode: code });
    try {
      localStorage.setItem('streamlens-code', code);
    } catch {}
  },

  setTestInput: (input: string) => set({ testInput: input }),
  setSelectedAlternative: (index: number | null) => set({ selectedAlternative: index }),

  analyze: async () => {
    const { javaCode, testInput } = get();
    if (!javaCode.trim()) return;

    set({ isAnalyzing: true, error: null });

    try {
      // Uses the shared API client so an unreachable backend or a non-JSON
      // error body produces an actionable message instead of a parse crash.
      const data: AnalysisResponse = await analyzeCode(javaCode, testInput);
      set({
        parsedPipeline: data.parsedPipeline,
        dependencyGraph: data.dependencyGraph ?? null,
        dependencyReadable: data.dependencyReadable ?? '',
        trace: data.trace,
        alternatives: data.alternatives,
        analysisResults: data.analysisResults,
        benchmark: data.benchmark ?? null,
        counterexample: data.counterexample ?? null,
        explanations: data.explanations,
        isAnalyzing: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'An unexpected error occurred',
        isAnalyzing: false,
      });
    }
  },

  reset: () => set({
    parsedPipeline: null,
    dependencyGraph: null,
    dependencyReadable: '',
    trace: null,
    alternatives: [],
    analysisResults: [],
    benchmark: null,
    counterexample: null,
    explanations: [],
    selectedAlternative: null,
    error: null,
  }),
}));