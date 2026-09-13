import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';
import ClassificationBadge from '../ui/ClassificationBadge';

export default function CandidatesPanel() {
  const { alternatives, analysisResults, selectedAlternative, setSelectedAlternative } = useAnalysisStore();

  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        Run analysis to see considered reorderings
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/40 text-xs text-slate-400">
        Candidate reorderings detected by the counterfactual engine — click one to inspect its verdict, counterexample and benchmark.
      </div>
      <div className="p-3 space-y-2">
        {alternatives.map((cand, idx) => {
          const verified = analysisResults[idx];
          const selected = selectedAlternative === idx;
          return (
            <motion.button
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setSelectedAlternative(selected ? null : idx)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selected
                  ? 'bg-blue-500/15 border-blue-500/40'
                  : 'bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-blue-400">{cand.operationA}</span>
                  <span className="text-slate-500">↔</span>
                  <span className="font-mono text-xs text-blue-400">{cand.operationB}</span>
                </div>
                {verified && (
                  <ClassificationBadge classification={verified.classification as any} size="sm" />
                )}
              </div>

              <div className="mt-1.5 text-xs text-slate-400 font-mono break-words">
                {cand.originalOrder.join(' → ')}
              </div>
              <div className="text-xs text-slate-500 font-mono break-words">
                → {cand.alternativeOrder.join(' → ')}
              </div>

              {cand.efficiencyArgument && (
                <div className="mt-2 text-xs text-slate-300">
                  <span className="text-purple-400">why: </span>
                  {cand.efficiencyArgument}
                </div>
              )}
              {cand.dependencyNote && (
                <div
                  className={`mt-1 text-xs ${
                    cand.dependencyNote.toLowerCase().includes('no dependency')
                      ? 'text-green-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {cand.dependencyNote}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}