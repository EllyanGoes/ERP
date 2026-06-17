"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, Cog, Truck, Layers, SearchCheck, PackageCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeKind, FlowNodeData } from "@/lib/pcp/types";

interface KindStyle {
  icon: LucideIcon;
  ring: string;
  chipBg: string;
  chipText: string;
  label: string;
}

export const NODE_STYLE: Record<NodeKind, KindStyle> = {
  ESTOQUE_INSUMO: { icon: Boxes, ring: "border-amber-300", chipBg: "bg-amber-100", chipText: "text-amber-700", label: "Estoque / Insumo" },
  OPERACAO: { icon: Cog, ring: "border-cyan-300", chipBg: "bg-cyan-100", chipText: "text-cyan-700", label: "Operação" },
  TRANSPORTE: { icon: Truck, ring: "border-slate-300", chipBg: "bg-slate-100", chipText: "text-slate-700", label: "Transporte" },
  BUFFER_WIP: { icon: Layers, ring: "border-blue-300", chipBg: "bg-blue-100", chipText: "text-blue-700", label: "Buffer de WIP" },
  INSPECAO: { icon: SearchCheck, ring: "border-violet-300", chipBg: "bg-violet-100", chipText: "text-violet-700", label: "Inspeção" },
  ESTOCAGEM_PA: { icon: PackageCheck, ring: "border-emerald-300", chipBg: "bg-emerald-100", chipText: "text-emerald-700", label: "Produto Acabado" },
};

const WIP_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };

function NodeCard({ kind, data, selected }: { kind: NodeKind; data: FlowNodeData; selected?: boolean }) {
  const s = NODE_STYLE[kind];
  const Icon = s.icon;
  const hasTarget = kind !== "ESTOQUE_INSUMO";
  const hasSource = kind !== "ESTOCAGEM_PA";

  // segunda linha de contexto por tipo
  let sub: string | null = null;
  if (kind === "OPERACAO") {
    sub = [data.centroTrabalhoNome, data.capacidade != null ? `${data.capacidade} ${data.unidadeCapacidade ?? ""}`.trim() : null]
      .filter(Boolean).join(" · ") || null;
  } else if (kind === "BUFFER_WIP" && data.estadoWip) {
    sub = `WIP ${WIP_LABEL[data.estadoWip] ?? data.estadoWip}`;
  } else if ((kind === "ESTOQUE_INSUMO" || kind === "ESTOCAGEM_PA") && data.itemDescricao) {
    sub = data.itemDescricao;
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-white shadow-sm px-3 py-2 min-w-[160px] max-w-[220px] transition-shadow",
        s.ring,
        selected && "ring-2 ring-cyan-400",
        data.isBottleneck && "!border-red-500 ring-2 ring-red-300",
      )}
    >
      {hasTarget && <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-gray-400 !border-white" />}
      <div className="flex items-center gap-2">
        <span className={cn("flex w-6 h-6 shrink-0 items-center justify-center rounded-md", s.chipBg, s.chipText)}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-gray-400 leading-none mb-0.5">{s.label}</p>
          <p className="text-sm font-medium text-gray-800 truncate leading-tight">{data.label || "Sem nome"}</p>
        </div>
      </div>
      {(sub || data.perdaPct != null || data.isBottleneck || data.saldoBadge != null) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {sub && <span className="text-[10px] text-gray-500 truncate max-w-[180px]">{sub}</span>}
          {data.perdaPct != null && data.perdaPct > 0 && (
            <span className="text-[10px] rounded bg-rose-50 text-rose-600 px-1">perda {data.perdaPct}%</span>
          )}
          {/* Saldo da fase (tela de chão de fábrica). */}
          {data.saldoBadge != null && (
            <span className="text-[10px] font-semibold rounded bg-gray-900/85 text-white px-1.5 py-0.5">{String(data.saldoBadge)}</span>
          )}
          {data.isBottleneck && <span className="text-[10px] font-semibold text-red-600">⚠ gargalo</span>}
        </div>
      )}
      {hasSource && <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-gray-400 !border-white" />}
    </div>
  );
}

// Mapa registrado no ReactFlow (a chave = node.type = kind)
export const nodeTypes = {
  ESTOQUE_INSUMO: (p: NodeProps) => <NodeCard kind="ESTOQUE_INSUMO" data={p.data as FlowNodeData} selected={p.selected} />,
  OPERACAO: (p: NodeProps) => <NodeCard kind="OPERACAO" data={p.data as FlowNodeData} selected={p.selected} />,
  TRANSPORTE: (p: NodeProps) => <NodeCard kind="TRANSPORTE" data={p.data as FlowNodeData} selected={p.selected} />,
  BUFFER_WIP: (p: NodeProps) => <NodeCard kind="BUFFER_WIP" data={p.data as FlowNodeData} selected={p.selected} />,
  INSPECAO: (p: NodeProps) => <NodeCard kind="INSPECAO" data={p.data as FlowNodeData} selected={p.selected} />,
  ESTOCAGEM_PA: (p: NodeProps) => <NodeCard kind="ESTOCAGEM_PA" data={p.data as FlowNodeData} selected={p.selected} />,
};

// Itens da paleta (ordem de exibição)
export const PALETTE: { kind: NodeKind; label: string }[] = [
  { kind: "ESTOQUE_INSUMO", label: "Estoque / Insumo" },
  { kind: "OPERACAO", label: "Operação" },
  { kind: "TRANSPORTE", label: "Transporte" },
  { kind: "BUFFER_WIP", label: "Buffer de WIP" },
  { kind: "INSPECAO", label: "Inspeção" },
  { kind: "ESTOCAGEM_PA", label: "Produto Acabado" },
];
