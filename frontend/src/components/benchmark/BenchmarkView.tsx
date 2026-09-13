import { motion } from 'framer-motion';
import { useAnalysisStore } from '../../store/analysisStore';

const recommendationColors: Record<string, string> = {
  'RECOMMEND APPLY': 'bg-green-500/20 text-green-400 border-green-500/40',
  'OPTIONAL': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  'RECOMMEND AGAINST': 'bg-red-500/20 text-red-400 border-red-500/40',
};

export default function BenchmarkView() {
  const { benchmark } = useAnalysisStore();

  if (!benchmark || benchmark.eligible === false) {
    return (
      <div className="p-4">
        <div className="p-3 rounded-lg bg-slate-800/30 border border-dashed border-slate-600/50 flex items-start gap-2">
          <svg className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <div className="text-xs font-medium text-slate-400">Benchmark locked</div>
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">
              Performance measurement only runs after a transformation is proven{' '}
              <span className="text-green-400 font-mono">SAFE</span>. Correctness first — benchmarks never run
              on <span className="text-red-400 font-mono">UNSAFE</span> or{' '}
              <span className="text-gray-400 font-mono">UNKNOWN</span> results.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const speedup = benchmark.speedupRatio;
  const isFaster = speedup < 1;
  const isSlower = speedup > 1;
  const speedupPercent = Math.abs((1 - speedup) * 100).toFixed(1);
  const recommendation = benchmark.recommendation || (isFaster ? 'RECOMMEND APPLY' : isSlower ? 'RECOMMEND AGAINST' : 'OPTIONAL');

  return (
    <div className="p-4 space-y-4">
      <div className="text-xs text-slate-400">
        Based on {benchmark.iterations} iterations{benchmark.datasetDescription ? ` — ${benchmark.datasetDescription}` : ''}
        {benchmark.elementsSavedPercent !== undefined && benchmark.elementsSavedPercent !== null && (
          <> · ~{benchmark.elementsSavedPercent}% of elements short-circuited on average</>
        )}
      </div>

      {(benchmark.recommendation || isFaster || isSlower) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-xs font-bold ${
            recommendationColors[recommendation] || recommendationColors.OPTIONAL
          }`}
        >
          ● {recommendation}
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="text-xs text-blue-400 mb-1">Original Pipeline</div>
          <div className="text-lg font-mono font-bold text-blue-300">{benchmark.originalAvg}</div>
          {benchmark.originalElementCount !== undefined && benchmark.originalElementCount !== null && (
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              {benchmark.originalElementCount} elements processed
            </div>
          )}
        </div>

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="text-xs text-purple-400 mb-1">Alternative Pipeline</div>
          <div className="text-lg font-mono font-bold text-purple-300">{benchmark.alternativeAvg}</div>
          {benchmark.alternativeElementCount !== undefined && benchmark.alternativeElementCount !== null && (
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              {benchmark.alternativeElementCount} elements processed
            </div>
          )}
        </div>
      </div>

      <div className={`p-3 rounded-lg border ${
        isFaster ? 'bg-green-500/10 border-green-500/20' :
        isSlower ? 'bg-red-500/10 border-red-500/20' :
        'bg-gray-500/10 border-gray-500/20'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 mb-1">Performance Comparison</div>
            <div className={`text-lg font-mono font-bold ${
              isFaster ? 'text-green-400' : isSlower ? 'text-red-400' : 'text-gray-400'
            }`}>
              {speedup.toFixed(3)}x
            </div>
          </div>
          <div className="text-right">
            <div className={`text-sm font-medium ${
              isFaster ? 'text-green-400' : isSlower ? 'text-red-400' : 'text-gray-400'
            }`}>
              {isFaster ? `${speedupPercent}% faster` :
               isSlower ? `${speedupPercent}% slower` :
               'Same performance'}
            </div>
            <div className="text-xs text-slate-500 mt-1">alternative vs original</div>
          </div>
        </div>

        <div className="mt-3 h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isFaster ? 'bg-green-500' : isSlower ? 'bg-red-500' : 'bg-gray-500'
            }`}
            style={{ width: `${Math.min(100, (1 / speedup) * 100)}%` }}
          />
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <div>Verification ran before this benchmark — the transformation was proven semantically equivalent.</div>
        <div>Note: Benchmarks run with pure integer operations on sequential streams. Results may vary based on JVM warmup, data patterns, and hardware.</div>
      </div>
    </div>
  );
}