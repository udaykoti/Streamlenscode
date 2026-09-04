import { useAnalysisStore } from '../../store/analysisStore';

export default function BenchmarkView() {
  const { benchmark } = useAnalysisStore();

  if (!benchmark) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Run analysis to see benchmark results
      </div>
    );
  }

  const speedup = benchmark.speedupRatio;
  const isFaster = speedup < 1;
  const isSlower = speedup > 1;
  const speedupPercent = Math.abs((1 - speedup) * 100).toFixed(1);

  return (
    <div className="p-4 space-y-4">
      <div className="text-xs text-slate-400">
        Based on {benchmark.iterations} iterations across multiple datasets
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="text-xs text-blue-400 mb-1">Original Pipeline</div>
          <div className="text-lg font-mono font-bold text-blue-300">{benchmark.originalAvg}</div>
        </div>

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="text-xs text-purple-400 mb-1">Alternative Pipeline</div>
          <div className="text-lg font-mono font-bold text-purple-300">{benchmark.alternativeAvg}</div>
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
        <div>Note: Benchmarks run with pure integer operations on sequential streams.</div>
        <div>Results may vary based on JVM warmup, data patterns, and hardware.</div>
      </div>
    </div>
  );
}
