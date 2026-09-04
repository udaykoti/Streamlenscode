import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';

export default function TraceViewer() {
  const { trace } = useAnalysisStore();
  const [selectedElement, setSelectedElement] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  if (!trace || !trace.elementTraces || trace.elementTraces.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Run analysis to see element traces
      </div>
    );
  }

  const traces = trace.elementTraces;

  const playAll = () => {
    setIsPlaying(true);
    let i = 0;
    const interval = setInterval(() => {
      if (i >= traces.length) {
        clearInterval(interval);
        setIsPlaying(false);
        setSelectedElement(null);
        return;
      }
      setSelectedElement(i);
      i++;
    }, 400);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
        <button
          onClick={playAll}
          disabled={isPlaying}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white text-xs rounded-md transition-colors flex items-center gap-1.5"
        >
          {isPlaying ? (
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          {isPlaying ? 'Playing...' : 'Play All'}
        </button>
        <span className="text-xs text-slate-400">
          {traces.length} element{traces.length !== 1 ? 's' : ''} traced
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1">
        {traces.map((t, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`p-2 rounded-md cursor-pointer transition-all ${
              selectedElement === idx
                ? 'bg-blue-500/20 border border-blue-500/30'
                : 'bg-slate-800/30 hover:bg-slate-800/50 border border-transparent'
            }`}
            onClick={() => setSelectedElement(selectedElement === idx ? null : idx)}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-200">
                {String(t.inputValue).padStart(2, ' ')}
              </span>
              <span className="text-slate-500">→</span>
              {t.accepted ? (
                <span className="text-green-400 text-xs font-mono">
                  {t.outputValue !== null ? t.outputValue : 'passed'}
                </span>
              ) : (
                <span className="text-red-400 text-xs font-mono">rejected</span>
              )}
              <div className="flex-1" />
              {t.accepted ? (
                <span className="text-green-400 text-lg">✓</span>
              ) : (
                <span className="text-red-400 text-lg">✗</span>
              )}
            </div>

            <AnimatePresence>
              {selectedElement === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 overflow-hidden"
                >
                  <div className="space-y-1 pl-4 border-l-2 border-slate-700">
                    {t.steps.map((step, sIdx) => (
                      <div key={sIdx} className="text-xs font-mono">
                        <span className="text-slate-500">#{step.operationIndex + 1} </span>
                        <span className="text-blue-400">{step.operationType}</span>
                        <span className="text-slate-400">: </span>
                        <span className={step.passed ? 'text-green-400' : 'text-red-400'}>
                          {step.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
