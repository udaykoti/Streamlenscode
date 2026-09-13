import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';

export default function CounterexamplePanel() {
  const { analysisResults, selectedAlternative, counterexample: globalCounterexample } = useAnalysisStore();
  const [expandedInput, setExpandedInput] = useState<Set<number>>(new Set());

  const counterexample = useMemo(() => {
    if (analysisResults && analysisResults.length > 0) {
      const idx = selectedAlternative !== null ? selectedAlternative : 0;
      const active = analysisResults[idx];
      if (active?.counterexample) return active.counterexample;
    }
    return globalCounterexample;
  }, [analysisResults, selectedAlternative, globalCounterexample]);

  if (!counterexample) {
    return (
      <div className="p-4">
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
          No breaking input found — the alternative behaves identically across the evaluated cases.
        </div>
      </div>
    );
  }

  const traceSteps = (trace: any) =>
    !trace || trace.length === 0
      ? []
      : trace[0]?.steps ?? [];

  return (
    <div className="p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-red-500/10 border border-red-500/30"
      >
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-sm font-bold">✗</span>
          <span className="text-xs font-medium text-red-300">
            Behavior differs on a breaking input
          </span>
        </div>

        <div className="mt-3 grid gap-1.5 text-xs font-mono">
          <div className="text-slate-300">
            input:{' '}
            <span className="text-slate-100">[{counterexample.input.join(', ')}]</span>
          </div>
          <div className="text-slate-300">
            original:{' '}
            <span className="text-green-400">
              [{counterexample.originalOutput.join(', ')}]
            </span>
          </div>
          <div className="text-slate-300">
            alternative:{' '}
            <span className="text-red-400">
              [{counterexample.alternativeOutput.join(', ')}]
            </span>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-300">{counterexample.explanation}</div>
      </motion.div>

      {counterexample.originalTrace && traceSteps(counterexample.originalTrace).length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-bold tracking-widest text-slate-500">
            ELEMENT TRACES
          </div>
          {counterexample.originalTrace.map((el: any, tIdx: number) => {
            const open = expandedInput.has(tIdx);
            return (
              <div key={tIdx}>
                <button
                  onClick={() => {
                    const next = new Set(expandedInput);
                    if (open) next.delete(tIdx);
                    else next.add(tIdx);
                    setExpandedInput(next);
                  }}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    open
                      ? 'bg-slate-800/60 border-slate-600/50'
                      : 'bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-slate-300">[{el.inputValue}]</span>
                    <span className="text-slate-500">→</span>
                    {el.accepted ? (
                      <span className="text-green-400">
                        {el.outputValue !== null && el.outputValue !== undefined
                          ? `${el.outputValue}`
                          : 'accepted'}
                      </span>
                    ) : (
                      <span className="text-red-400">rejected</span>
                    )}
                    <span className="text-slate-600">{open ? '▾' : '▸'}</span>
                  </div>
                </button>
                {open && (
                  <div className="ml-3 pl-3 border-l-2 border-slate-700 space-y-1 mt-1">
                    {(el.steps ?? []).map((step: any, sIdx: number) => (
                      <div key={sIdx} className="text-xs font-mono text-slate-400">
                        #{step.operationIndex + 1} <span className="text-blue-400">{step.operationType}</span>:{' '}
                        <span className={step.passed ? 'text-green-400' : 'text-red-400'}>
                          {step.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}