import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysisStore } from './store/analysisStore';
import CodeEditor from './components/editor/CodeEditor';
import PipelineVisualization from './components/pipeline/PipelineVisualization';
import TraceViewer from './components/trace/TraceViewer';
import AnalysisResults from './components/analysis/AnalysisResults';
import BenchmarkView from './components/benchmark/BenchmarkView';
import ExplanationPanel from './components/explanation/ExplanationPanel';

type Panel = 'pipeline' | 'trace' | 'analysis' | 'benchmark' | 'explanation';

const panelLabels: Record<Panel, string> = {
  pipeline: 'Pipeline',
  trace: 'Trace',
  analysis: 'Analysis',
  benchmark: 'Benchmark',
  explanation: 'Explanations',
};

export default function App() {
  const { parsedPipeline, error, isAnalyzing } = useAnalysisStore();
  const [activePanel, setActivePanel] = useState<Panel>('pipeline');

  const panels: Panel[] = ['pipeline', 'trace', 'analysis', 'benchmark', 'explanation'];

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
        {/* Left: Code Editor */}
        <div className="w-1/2 border-r border-slate-800">
          <CodeEditor />
        </div>

        {/* Right: Panels */}
        <div className="w-1/2 flex flex-col min-h-0">
          {/* Panel tabs */}
          <div className="flex gap-0 bg-slate-900 border-b border-slate-800 overflow-x-auto">
            {panels.map((panel) => (
              <button
                key={panel}
                onClick={() => setActivePanel(panel)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${
                  activePanel === panel
                    ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {panelLabels[panel]}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePanel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {activePanel === 'pipeline' && <PipelineVisualization />}
                {activePanel === 'trace' && <TraceViewer />}
                {activePanel === 'analysis' && <AnalysisResults />}
                {activePanel === 'benchmark' && <BenchmarkView />}
                {activePanel === 'explanation' && <ExplanationPanel />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
