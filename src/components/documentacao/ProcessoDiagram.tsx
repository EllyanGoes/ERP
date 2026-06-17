"use client";
// Diagrama de processo em estilo BPMN, somente-leitura, sobre o React Flow
// (@xyflow/react) — o mesmo motor do editor de fluxo do PCP. Recebe um grafo
// declarativo (nós + ligações com posições) e desenha eventos (círculos),
// tarefas (retângulos arredondados), gateways (losangos) e notas.
import { useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position,
  MarkerType, type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";

export type BpmnTipo = "inicio" | "fim" | "tarefa" | "gateway" | "nota";

// Cor da "raia" (módulo) — borda/realce da tarefa.
const COR: Record<string, string> = {
  azul:    "border-blue-300 bg-blue-50/40",
  ambar:   "border-amber-300 bg-amber-50/40",
  verde:   "border-emerald-300 bg-emerald-50/40",
  violeta: "border-violet-300 bg-violet-50/40",
  rosa:    "border-rose-300 bg-rose-50/40",
  cinza:   "border-gray-300 bg-gray-50",
};

export type BpmnNo = {
  id: string; tipo: BpmnTipo; x: number; y: number;
  label: string; sub?: string; cor?: keyof typeof COR;
};
export type BpmnLigacao = { id?: string; from: string; to: string; label?: string };
export type BpmnGrafo = { nodes: BpmnNo[]; edges: BpmnLigacao[] };

type NodeData = { label: string; sub?: string; cor?: keyof typeof COR };

const hAlvo = <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !bg-gray-300 !border-0" />;
const hOrig = <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !bg-gray-300 !border-0" />;

function Evento({ data, tipo }: { data: NodeData; tipo: "inicio" | "fim" }) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: 64 }}>
      {hAlvo}
      <div className={cn(
        "w-9 h-9 rounded-full bg-white flex items-center justify-center",
        tipo === "inicio" ? "border-2 border-emerald-500" : "border-[3px] border-rose-500",
      )}>
        <span className={cn("w-2.5 h-2.5 rounded-full", tipo === "inicio" ? "bg-emerald-500" : "bg-rose-500")} />
      </div>
      <span className="mt-1 text-[10px] text-center text-gray-600 leading-tight">{data.label}</span>
      {hOrig}
    </div>
  );
}

function Tarefa({ data }: { data: NodeData }) {
  return (
    <div className={cn(
      "relative rounded-lg border-2 shadow-sm px-3 py-2 min-w-[150px] max-w-[210px]",
      COR[data.cor ?? "cinza"],
    )}>
      {hAlvo}
      <p className="text-[13px] font-medium text-gray-800 leading-tight">{data.label}</p>
      {data.sub && <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{data.sub}</p>}
      {hOrig}
    </div>
  );
}

function Gateway({ data }: { data: NodeData }) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: 80 }}>
      {hAlvo}
      <div className="w-9 h-9 rotate-45 bg-amber-50 border-2 border-amber-400 flex items-center justify-center">
        <span className="-rotate-45 text-amber-600 text-sm font-bold">×</span>
      </div>
      <span className="mt-1 text-[10px] text-center text-gray-600 leading-tight">{data.label}</span>
      {hOrig}
    </div>
  );
}

function Nota({ data }: { data: NodeData }) {
  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-white/70 px-2.5 py-1.5 max-w-[200px]">
      <p className="text-[11px] text-gray-500 leading-snug">{data.label}</p>
    </div>
  );
}

const nodeTypes = {
  inicio:  (p: NodeProps) => <Evento data={p.data as NodeData} tipo="inicio" />,
  fim:     (p: NodeProps) => <Evento data={p.data as NodeData} tipo="fim" />,
  tarefa:  (p: NodeProps) => <Tarefa data={p.data as NodeData} />,
  gateway: (p: NodeProps) => <Gateway data={p.data as NodeData} />,
  nota:    (p: NodeProps) => <Nota data={p.data as NodeData} />,
};

export default function ProcessoDiagram({ grafo, altura = 360 }: { grafo: BpmnGrafo; altura?: number }) {
  const nodes = useMemo<Node[]>(() => grafo.nodes.map((n) => ({
    id: n.id, type: n.tipo, position: { x: n.x, y: n.y },
    data: { label: n.label, sub: n.sub, cor: n.cor },
    draggable: false, selectable: false, connectable: false,
  })), [grafo]);

  const edges = useMemo<Edge[]>(() => grafo.edges.map((e, i) => ({
    id: e.id ?? `e${i}`, source: e.from, target: e.to, label: e.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" },
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "#475569" },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
  })), [grafo]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white" style={{ height: altura }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="#eef2f7" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
