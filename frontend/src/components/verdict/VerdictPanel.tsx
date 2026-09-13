import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';
import ClassificationBadge from '../ui/ClassificationBadge';
import { dependencyTypeColors } from '../dependency/DependencyGraphView';

export default function VerdictPanel() {
  const { analysisResults, alternatives, selectedAlternative } = useAnalysisStore();

  const activeIndex = useMemo(() => {
    if (!analysisResults || analysisResults.length === 0) return null;
    return selectedAlternative !== null && selectedAlternative < analysisResults.length
      ? selectedAlternative
      : 0;
  }, [analysisResults, selectedAlternative]);

  if (activeIndex === null) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
        Run analysis to see the correctness verdict
      </div>
    );
  }

  const result = analysisResults[activeIndex];
  const cand = alternatives[activeIndex];
  const ve = result.verdictExplanation;

  return (
    <div className="p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3"
      >
        <ClassificationBadge classification={result.classification as any} size="lg" />
        {result.operationA && result.operationB && (
          <span className="text-xs text-slate-400">
            swapping <span className="font-mono text-blue-400">{result.operationA}</span> ↔{' '}
            <span className="font-mono text-blue-400">{result.operationB}</span>
          </span>
        )}
      </motion.div>

      <div className="mt-3 space-y-3">
        {(ve?.explanation || result.staticReason) && (
          <div>
            <div className="text-[10px] font-bold tracking-widest text-slate-500 mb-1">
              WHY
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              {ve?.explanation || result.staticReason}
            </div>
          </div>
        )}

        {ve?.dependencySummary && (
          <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
            <span className="text-slate-300">Dependency verdict: </span>
            {ve.dependencySummary}
          </div>
        )}

        {(ve?.hadDependency || (ve?.dependencies?.length ?? 0) > 0) && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold tracking-widest text-slate-500">
              BLOCKING DEPENDENCIES
            </div>
            {(ve?.dependencies ?? []).map((dep, dIdx) => {
              const color = dependencyTypeColors[dep.type] || '#f1f5f9';
              return (
                <div
                  key={dIdx}
                  className="p-2 rounded border-l-2 bg-slate-800/30 text-xs"
                  style={{ borderLeftColor: color }}
                >
                  <span
                    className="font-mono font-bold mr-2"
                    style={{ color }}
                  >
                    {dep.type}
                  </span>
                  <span className="text-slate-300">
                    {dep.fromOperation} #{dep.fromIndex} → {dep.toOperation} #{dep.toIndex}
                  </span>
                  <div className="text-slate-400 mt-0.5">{dep.reason}</div>
                  {dep.lambda && (
                    <div className="text-slate-500 font-mono mt-0.5">λ {dep.lambda}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-slate-400 font-mono break-words">
          <div>
            original:{' '}
            <span className="text-blue-400">{result.originalOrder.join(' → ')}</span>
          </div>
          <div>
            alternative:{' '}
            <span className="text-purple-400">{result.alternativeOrder.join(' → ')}</span>
          </div>
        </div>

        {result.dynamicReason && ve?.explanation === undefined && (
          <div>
            <div className="text-[10px] font-bold tracking-widest text-slate-500 mb-1">
              DYNAMIC CHECK
            </div>
            <div className="text-xs text-slate-400">{result.dynamicReason}</div>
          </div>
        )}

        {ve?.originalChain && (
          <div className="p-2 rounded bg-slate-800/40 border border-slate-700/40">
            <div className="text-[10px] font-bold tracking-widest text-slate-500 mb-1">
              CORRECTNESS CHAIN
            </div>
            <div className="text-xs font-mono text-slate-300">
              {ve.originalChain}
            </div>
            <div className="text-slate-500 font-mono text-xs my-0.5">↓</div>
            <div className="text-xs font-mono text-slate-300">{ve.alternativeChain}</div>
          </div>
        )}

        {cand?.efficiencyArgument && (
          <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-xs text-slate-300">
            <span className="text-purple-400 font-medium">Efficiency premise: </span>
            {cand.efficiencyArgument}
          </div>
        )}
      </div>
    </div>
  );
}