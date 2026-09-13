import { useState, useMemo } from 'react';
import React, { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysisStore } from './store/analysisStore';
import CodeEditor from './components/editor/CodeEditor';
import PipelineVisualization from './components/pipeline/PipelineVisualization';
import DependencyGraphView from './components/dependency/DependencyGraphView';
import CandidatesPanel from './components/candidates/CandidatesPanel';
import VerdictPanel from './components/verdict/VerdictPanel';
import CounterexamplePanel from './components/counterexample/CounterexamplePanel';
import BenchmarkView from './components/benchmark/BenchmarkView';
import TraceViewer from './components/trace/TraceViewer';
import ExplanationPanel from './components/explanation/ExplanationPanel';

interface SectionProps {
  id: string;
  title: string;
  badge?: string;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Section({ id, title, badge, badgeColor, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-slate-400">{title}</span>
          {badge && badgeColor && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-slate-800"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const verdictBadge = (classification: string | undefined): { label: string; color: string } => {
  if (!classification) return { label: '', color: '' };
  if (classification.toUpperCase().includes('UNSAFE'))
    return { label: 'UNSAFE', color: 'bg-red-500/20 text-red-400' };
  if (classification.toUpperCase().includes('CONDITION'))
    return { label: 'CONDITIONALLY SAFE', color: 'bg-yellow-500/20 text-yellow-400' };
  if (classification.toUpperCase().includes('SAFE'))
    return { label: 'SAFE', color: 'bg-green-500/20 text-green-400' };
  return { label: 'UNKNOWN', color: 'bg-gray-500/20 text-gray-400' };
};

export default function App() {
  const {
    parsedPipeline,
    analysisResults,
    alternatives,
    selectedAlternative,
    dependencyGraph,
    error,
    isAnalyzing,
    counterexample,
  } = useAnalysisStore();

  const activeVerdict = useMemo(() => {
    if (!analysisResults || analysisResults.length === 0) return undefined;
    const idx = selectedAlternative !== null ? selectedAlternative : 0;
    return analysisResults[idx]?.classification;
  }, [analysisResults, selectedAlternative]);

  const verdict = verdictBadge(activeVerdict);

  const benchmarkEligible = useMemo(() => {
    if (!counterexample && (!analysisResults || analysisResults.length === 0)) return null;
    return activeVerdict ? activeVerdict.toUpperCase().includes('SAFE') : false;
  }, [activeVerdict, counterexample, analysisResults]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h1 className="text-xl font-bold">
              <span className="text-blue-400">Stream</span>
              <span className="text-purple-400">Lens</span>
            </h1>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Semantics-aware Counterfactual Java Stream Analyzer
          </span>
        </div>

        <div className="flex items-center gap-3">
          {verdict.label && !isAnalyzing && (
            <span className={`text-[10px] px-2 py-1 rounded-full font-mono font-bold border border-current ${verdict.color}`}>
              {verdict.label}
            </span>
          )}
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-blue-400"
            >
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing pipeline...
            </motion.div>
          )}
          {parsedPipeline && (
            <div className="text-xs text-slate-400 font-mono">
              {parsedPipeline.operations.length} operation{parsedPipeline.operations.length !== 1 ? 's' : ''} detected
            </div>
          )}
        </div>
      </header>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500/20 border-b border-red-500/30 px-6 py-2"
          >
            <span className="text-sm text-red-400">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Code Input */}
        <div className="w-2/5 border-r border-slate-800 min-w-[320px]">
          <CodeEditor />
        </div>

        {/* Right: Pipeline Panels */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-[10px] font-bold tracking-widest text-slate-500 px-4 py-2 border-b border-slate-800">
            PIPELINE PANELS
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <Section id="chain" title="OPERATION CHAIN">
              <div className="h-72">
                <PipelineVisualization />
              </div>
            </Section>

            <Section
              id="deps"
              title="DEPENDENCY GRAPH"
              badge={dependencyGraph ? `${dependencyGraph.totalDependencies}` : undefined}
              badgeColor="bg-yellow-500/20 text-yellow-400"
              defaultOpen={!!dependencyGraph?.hasDependencies}
            >
              <DependencyGraphView />
            </Section>

            <Section
              id="candidates"
              title="CANDIDATES"
              badge={alternatives.length > 0 ? `${alternatives.length}` : undefined}
              badgeColor="bg-purple-500/20 text-purple-400"
            >
              <CandidatesPanel />
            </Section>

            <Section id="verdict" title="VERDICT | WHY">
              <VerdictPanel />
            </Section>

            <Section id="counterexample" title="COUNTEREXAMPLE">
              <CounterexamplePanel />
            </Section>

            <Section id="trace" title="TRACE" defaultOpen={false}>
              <div className="h-72">
                <TraceViewer />
              </div>
            </Section>

            <Section id="explanation" title="EXPLANATIONS" defaultOpen={false}>
              <ExplanationPanel />
            </Section>

            <Section id="benchmark" title="BENCHMARK">
              <BenchmarkView />
            </Section>

            <div className="text-[10px] text-slate-600 text-center pb-1">
              correctness-first: benchmark only runs once a transformation is proven SAFE{benchmarkEligible === false ? ' (locked)' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}