export interface OperationInfo {
  index: number;
  type: string;
  displayName: string;
  lambdaExpression?: string;
  lambdaBody?: string;
  inputType?: string;
  outputType?: string;
  characteristics: string[];
  stateful: boolean;
  shortCircuiting: boolean;
  hasSideEffects: boolean;
  argumentExpression?: string;
}

export interface ParsedPipeline {
  sourceType: string;
  operations: OperationInfo[];
  terminalOperation?: OperationInfo;
  isParallel: boolean;
  rawSource: string;
}

export interface TraceStep {
  operationIndex: number;
  operationType: string;
  inputValue: number | null;
  outputValue: number | null;
  passed: boolean;
  description: string;
}

export interface ElementTrace {
  inputValue: number;
  steps: TraceStep[];
  outputValue: number | null;
  accepted: boolean;
}

export interface TraceResult {
  pipelineDescription: string;
  elementTraces: ElementTrace[];
}

export interface DependencyEdge {
  fromIndex: number;
  toIndex: number;
  fromOperation: string;
  toOperation: string;
  type: string;
  reason: string;
  lambda?: string;
}

export interface DependencyGraphData {
  hasDependencies: boolean;
  totalDependencies: number;
  dependencies: DependencyEdge[];
  involvedIndices: number[];
}

export interface CandidateAlternative {
  originalOrder: string[];
  alternativeOrder: string[];
  operationA: string;
  operationB: string;
  classification: string;
  reason: string;
  efficiencyArgument: string;
  dependencyNote: string;
  swappedPositions: { from: number; to: number };
  reorderedOperations: OperationInfo[];
}

export interface TraceStepMap {
  operationIndex: number;
  operationType: string;
  inputValue: number | null;
  outputValue: number | null;
  passed: boolean;
  description: string;
}

export interface ElementTraceMap {
  inputValue: number;
  outputValue: number | null;
  accepted: boolean;
  steps: TraceStepMap[];
}

export interface Counterexample {
  input: number[];
  originalOutput: number[];
  alternativeOutput: number[];
  explanation: string;
  found: boolean;
  originalTrace?: ElementTraceMap[] | null;
  alternativeTrace?: ElementTraceMap[] | null;
}

export interface EdgeCaseResult {
  input: number[];
  originalOutput: number[];
  alternativeOutput: number[];
  pass: boolean;
}

export interface EdgeCaseSuiteResult {
  allPass: boolean;
  cases: EdgeCaseResult[];
  totalCases: number;
}

export interface VerdictExplanation {
  classification: string;
  staticReason: string;
  hadDependency: boolean;
  dependencies: DependencyEdge[];
  dependencySummary: string;
  explanation: string;
  originalChain: string;
  alternativeChain: string;
}

export interface AnalysisResultItem {
  originalOrder: string[];
  alternativeOrder: string[];
  operationA: string;
  operationB: string;
  classification: string;
  staticReason: string;
  dynamicReason?: string;
  efficiencyArgument: string;
  dependencyNote: string;
  swappedPositions: { from: number; to: number };
  counterexample?: Counterexample;
  edgeCaseResults?: EdgeCaseSuiteResult;
  verdictExplanation?: VerdictExplanation;
  benchmark?: BenchmarkResult;
}

export interface BenchmarkResult {
  originalAvg: string;
  alternativeAvg: string;
  speedupRatio: number;
  iterations: number;
  originalElementCount?: number;
  alternativeElementCount?: number;
  recommendation?: string;
  elementsSavedPercent?: number;
  datasetDescription?: string;
  eligible?: boolean;
  reason?: string;
}

export interface ExplanationItem {
  level: 'beginner' | 'developer' | 'advanced';
  title: string;
  content: string;
}

export interface AnalysisResponse {
  parsedPipeline: ParsedPipeline;
  dependencyGraph?: DependencyGraphData;
  dependencyReadable?: string;
  trace: TraceResult;
  alternatives: CandidateAlternative[];
  analysisResults: AnalysisResultItem[];
  benchmark?: BenchmarkResult | null;
  counterexample?: Counterexample;
  explanations: ExplanationItem[];
  error?: string;
}

export type Classification = 'SAFE' | 'CONDITIONALLY SAFE' | 'UNSAFE' | 'UNKNOWN';

export const SAMPLE_CODE = `List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30);

numbers.stream()
    .filter(n -> n > 10)
    .map(n -> n * 2)
    .toList();`;