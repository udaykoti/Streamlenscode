import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';
import ClassificationBadge from '../ui/ClassificationBadge';
import type { AnalysisResultItem } from '../../types';

export default function AnalysisResults() {
  const { analysisResults, alternatives } = useAnalysisStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!analysisResults || analysisResults.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Run analysis to see transformation results
      </div>
    );
  }

  const getClassificationColor = (c: string) => {
    if (c.includes('SAFE') && !c.includes('UNSAFE') && !c.includes('CONDITION')) return 'border-green-500/30';
    if (c.includes('CONDITION')) return 'border-yellow-500/30';
    if (c.includes('UNSAFE')) return 'border-red-500/30';
    return 'border-gray-500/30';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
        <span className="text-xs text-slate-400">
          {analysisResults.length} transformation{analysisResults.length !== 1 ? 's' : ''} analyzed
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {analysisResults.map((result, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`p-3 rounded-lg border bg-slate-800/30 cursor-pointer transition-all hover:bg-slate-800/50 ${getClassificationColor(result.classification)}`}
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-blue-400">
                  {result.operationA}
                </span>
                <span className="text-slate-500">↔</span>
                <span className="font-mono text-xs text-blue-400">
                  {result.operationB}
                </span>
              </div>
              <ClassificationBadge classification={result.classification as any} size="sm" />
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Original: {result.originalOrder.join(' → ')}
            </div>
            <div className="text-xs text-slate-400">
              Alternative: {result.alternativeOrder.join(' → ')}
            </div>

            {expandedIdx === idx && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-3 pt-3 border-t border-slate-700/50 space-y-2"
              >
                <div>
                  <div className="text-xs font-medium text-slate-300 mb-1">Static Analysis</div>
                  <div className="text-xs text-slate-400">{result.staticReason}</div>
                </div>

                {result.dynamicReason && (
                  <div>
                    <div className="text-xs font-medium text-slate-300 mb-1">Dynamic Analysis</div>
                    <div className="text-xs text-slate-400">{result.dynamicReason}</div>
                  </div>
                )}

                {result.counterexample && (
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                    <div className="text-xs font-medium text-red-400 mb-1">Counterexample</div>
                    <div className="text-xs text-slate-400 font-mono">
                      Input: [{result.counterexample.input.join(', ')}]
                    </div>
                    <div className="text-xs text-green-400 font-mono">
                      Original: [{result.counterexample.originalOutput.join(', ')}]
                    </div>
                    <div className="text-xs text-red-400 font-mono">
                      Alternative: [{result.counterexample.alternativeOutput.join(', ')}]
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {result.counterexample.explanation}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
