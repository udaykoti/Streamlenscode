import { useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useAnalysisStore } from '../../store/analysisStore';

const operationColors: Record<string, string> = {
  filter: '#ef4444',
  map: '#3b82f6',
  flatMap: '#8b5cf6',
  sorted: '#f59e0b',
  distinct: '#10b981',
  limit: '#ec4899',
  skip: '#6366f1',
  peek: '#64748b',
  toList: '#22d3ee',
  toSet: '#22d3ee',
  count: '#a855f7',
  reduce: '#f97316',
  collect: '#14b8a6',
  findFirst: '#06b6d4',
  findAny: '#06b6d4',
  anyMatch: '#84cc16',
  allMatch: '#84cc16',
  noneMatch: '#84cc16',
};

function OperationNode({ data }: { data: any }) {
  const color = operationColors[data.type] || '#64748b';
  return (
    <div
      className="px-4 py-3 rounded-lg border-2 bg-slate-800/80 backdrop-blur min-w-[120px] text-center transition-all hover:scale-105"
      style={{ borderColor: color }}
    >
      <div className="text-xs text-slate-400 mb-1 font-mono">#{data.index}</div>
      <div className="font-bold text-sm" style={{ color }}>{data.displayName}</div>
      {data.lambdaExpression && (
        <div className="text-xs text-slate-300 mt-1 font-mono truncate max-w-[160px]">
          {data.lambdaExpression.length > 25
            ? data.lambdaExpression.substring(0, 22) + '...'
            : data.lambdaExpression}
        </div>
      )}
      <div className="flex gap-1 mt-2 justify-center">
        {data.stateful && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">stateful</span>
        )}
        {data.shortCircuiting && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">short-circuit</span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { operation: OperationNode };

export default function PipelineVisualization() {
  const { parsedPipeline } = useAnalysisStore();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!parsedPipeline) return { initialNodes: [], initialEdges: [] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    nodes.push({
      id: 'source',
      type: 'operation',
      position: { x: 0, y: 50 },
      data: {
        index: 0,
        type: 'source',
        displayName: parsedPipeline.sourceType + '.stream()',
        stateful: false,
        shortCircuiting: false,
      },
    });

    parsedPipeline.operations.forEach((op, i) => {
      const x = (i + 1) * 200;
      nodes.push({
        id: `op-${i}`,
        type: 'operation',
        position: { x, y: 50 },
        data: {
          index: i + 1,
          type: op.type.toLowerCase(),
          displayName: op.displayName,
          lambdaExpression: op.lambdaExpression,
          stateful: op.stateful,
          shortCircuiting: op.shortCircuiting,
        },
      });

      edges.push({
        id: `e-${i === 0 ? 'source' : `op-${i-1}`}-op-${i}`,
        source: i === 0 ? 'source' : `op-${i - 1}`,
        target: `op-${i}`,
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      });
    });

    if (parsedPipeline.terminalOperation) {
      const termIdx = parsedPipeline.operations.length;
      nodes.push({
        id: 'terminal',
        type: 'operation',
        position: { x: (termIdx + 1) * 200, y: 50 },
        data: {
          index: termIdx + 1,
          type: parsedPipeline.terminalOperation.type.toLowerCase(),
          displayName: parsedPipeline.terminalOperation.displayName + '()',
          stateful: false,
          shortCircuiting: false,
        },
      });

      edges.push({
        id: `e-op${termIdx - 1}-terminal`,
        source: termIdx > 0 ? `op-${termIdx - 1}` : 'source',
        target: 'terminal',
        animated: true,
        style: { stroke: '#22d3ee', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#22d3ee' },
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [parsedPipeline]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (!parsedPipeline) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Enter Java Stream code and click Analyze to see the pipeline visualization
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        }}
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="!bg-slate-800 !border-slate-700" />
        <MiniMap
          nodeColor={(node) => {
            const type = node.data?.type;
            return operationColors[type] || '#64748b';
          }}
          className="!bg-slate-900 !border-slate-700"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  );
}
