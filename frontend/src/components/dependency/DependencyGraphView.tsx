import { useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useAnalysisStore } from '../../store/analysisStore';

export const dependencyTypeColors: Record<string, string> = {
  VALUE: '#3b82f6',
  ORDER: '#f59e0b',
  STATE: '#ef4444',
  SIDE_EFFECT: '#a855f7',
  SHORT_CIRCUIT: '#06b6d4',
};

const dependencyTypeLabels: Record<string, string> = {
  VALUE: 'VALUE',
  ORDER: 'ORDER',
  STATE: 'STATE',
  SIDE_EFFECT: 'SIDE_EFFECT',
  SHORT_CIRCUIT: 'SHORT_CIRCUIT',
};

function DepNode({ data }: { data: any }) {
  const type = data.type?.toLowerCase() || 'op';
  const isSource = type === 'source';
  const isTerminal = type === 'terminal';
  const color = isSource
    ? '#22d3ee'
    : isTerminal
      ? '#22d3ee'
      : '#64748b';

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 bg-slate-800/80 cursor-default select-none ${
        data.hasDependency ? 'ring-1 ring-yellow-500/40' : ''
      }`}
      style={{ borderColor: color }}
    >
      <div className="text-[10px] text-slate-500 font-mono mb-0.5">#{data.index}</div>
      <div className="text-xs font-medium text-slate-200 whitespace-nowrap">{data.displayName}</div>
    </div>
  );
}

const nodeTypes = { dep: DepNode };

export default function DependencyGraphView() {
  const { parsedPipeline, dependencyGraph, dependencyReadable } = useAnalysisStore();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!parsedPipeline) return { initialNodes: [], initialEdges: [] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const hasDeps = dependencyGraph?.hasDependencies ?? false;
    const involved = new Set(dependencyGraph?.involvedIndices ?? []);

    const label = (displayName: string) =>
      displayName.length > 18 ? displayName.substring(0, 16) + '…' : displayName;

    nodes.push({
      id: 'source',
      type: 'dep',
      position: { x: 0, y: 0 },
      data: { index: 0, type: 'source', displayName: parsedPipeline.sourceType + '.stream()' },
    });

    parsedPipeline.operations.forEach((op, i) => {
      nodes.push({
        id: `op-${i}`,
        type: 'dep',
        position: { x: (i + 1) * 170, y: 0 },
        data: {
          index: i + 1,
          type: op.type.toLowerCase(),
          displayName: label(op.displayName),
          hasDependency: hasDeps && involved.has(i),
        },
      });
    });

    if (parsedPipeline.terminalOperation) {
      const termIdx = parsedPipeline.operations.length;
      nodes.push({
        id: 'terminal',
        type: 'dep',
        position: { x: (termIdx + 1) * 170, y: 0 },
        data: { index: termIdx + 1, type: 'terminal', displayName: label(parsedPipeline.terminalOperation.displayName + '()') },
      });
    }

    parsedPipeline.operations.forEach((op, i) => {
      edges.push({
        id: `flow-${i}`,
        source: i === 0 ? 'source' : `op-${i - 1}`,
        target: `op-${i}`,
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#334155' },
      });
    });
    if (parsedPipeline.terminalOperation) {
      edges.push({
        id: 'flow-terminal',
        source: `op-${parsedPipeline.operations.length - 1}`,
        target: 'terminal',
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#334155' },
      });
    }

    (dependencyGraph?.dependencies ?? []).forEach((dep, idx) => {
      const color = dependencyTypeColors[dep.type] || '#f1f5f9';
      edges.push({
        id: `dep-${idx}`,
        source: `op-${dep.fromIndex}`,
        target: `op-${dep.toIndex}`,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: color,
          strokeWidth: 2.5,
          strokeDasharray: '6 4',
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        label: dependencyTypeLabels[dep.type] || dep.type,
        labelStyle: { fill: color, fontSize: 10, fontWeight: 700 },
        labelBgStyle: { fill: '#0f172a', opacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [parsedPipeline, dependencyGraph]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (!parsedPipeline) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        Run analysis to inspect dependencies
      </div>
    );
  }

  const hasDeps = dependencyGraph?.hasDependencies ?? false;

  return (
    <div className="flex flex-col">
      {dependencyReadable && (
        <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/40 text-xs text-slate-300 font-mono whitespace-pre-wrap">
          {dependencyReadable}
        </div>
      )}

      {!hasDeps ? (
        <div className="p-4">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
            <span className="text-green-400 text-sm">✓</span>
            <span className="text-xs text-slate-300">
              No safety-blocking dependencies detected — adjacent operation swaps can proceed to correctness verification.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-2 flex flex-wrap gap-1.5 items-center border-b border-slate-700/40">
            <span className="text-[10px] text-slate-400 mr-1">Dependency types:</span>
            {Object.keys(dependencyTypeLabels).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded font-mono border"
                style={{
                  color: dependencyTypeColors[t],
                  borderColor: dependencyTypeColors[t] + '55',
                  background: dependencyTypeColors[t] + '14',
                }}
              >
                {dependencyTypeLabels[t]}
              </span>
            ))}
          </div>
          <div className="h-72 w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              panOnScroll
            >
              <Background color="#1e293b" gap={20} size={1} />
              <Controls className="!bg-slate-800 !border-slate-700" showInteractive={false} />
            </ReactFlow>
          </div>
        </>
      )}
    </div>
  );
}