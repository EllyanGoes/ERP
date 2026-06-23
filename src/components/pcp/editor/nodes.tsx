"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, Cog, Truck, Layers, SearchCheck, PackageCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { nodeItens, type NodeKind, type FlowNodeData } from "@/lib/pcp/types";
import { CATEGORIA_ESTOQUE_ICONS } from "@/lib/categoria-estoque-ui";

interface KindStyle {
  icon: LucideIcon;
  ring: string;
  chipBg: string;
  chipText: string;
  label: string;
}

export const NODE_STYLE: Record<NodeKind, KindStyle> = {
  ESTOQUE_INSUMO: { icon: Boxes, ring: "border-amber-300", chipBg: "bg-warning/15", chipText: "text-warning", label: "Local de estoque" },
  OPERACAO: { icon: Cog, ring: "border-cyan-300", chipBg: "bg-cyan-100 dark:bg-cyan-500/25", chipText: "text-cyan-700 dark:text-cyan-300", label: "Operação" },
  TRANSPORTE: { icon: Truck, ring: "border-slate-300", chipBg: "bg-slate-100 dark:bg-slate-500/25", chipText: "text-slate-700 dark:text-slate-300", label: "Transporte" },
  BUFFER_WIP: { icon: Layers, ring: "border-blue-300", chipBg: "bg-info/15", chipText: "text-info", label: "Buffer de WIP" },
  INSPECAO: { icon: SearchCheck, ring: "border-violet-300", chipBg: "bg-violet-100 dark:bg-violet-500/25", chipText: "text-violet-700 dark:text-violet-300", label: "Inspeção" },
  ESTOCAGEM_PA: { icon: PackageCheck, ring: "border-emerald-300", chipBg: "bg-success/15", chipText: "text-success", label: "Produto Acabado" },
};

const WIP_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };

function NodeCard({ kind, data, selected }: { kind: NodeKind; data: FlowNodeData; selected?: boolean }) {
  const s = NODE_STYLE[kind];
  // Nós de estoque adotam o ícone da categoria selecionada (cai no padrão do tipo se vazio).
  const catKey = data.categoriaEstoque as keyof typeof CATEGORIA_ESTOQUE_ICONS | undefined;
  const Icon =
    (kind === "ESTOQUE_INSUMO" || kind === "ESTOCAGEM_PA") && catKey && CATEGORIA_ESTOQUE_ICONS[catKey]
      ? CATEGORIA_ESTOQUE_ICONS[catKey]
      : s.icon;
  const hasTarget = kind !== "ESTOQUE_INSUMO";
  const hasSource = kind !== "ESTOCAGEM_PA";

  // segunda linha de contexto por tipo
  let sub: string | null = null;
  if (kind === "OPERACAO") {
    sub = [data.centroTrabalhoNome, data.capacidade != null ? `${data.capacidade} ${data.unidadeCapacidade ?? ""}`.trim() : null]
      .filter(Boolean).join(" · ") || null;
  } else if (kind === "BUFFER_WIP" && data.estadoWip) {
    sub = `WIP ${WIP_LABEL[data.estadoWip] ?? data.estadoWip}`;
  } else if (kind === "ESTOQUE_INSUMO" || kind === "ESTOCAGEM_PA") {
    sub = nodeItens(data).map((i) => i.descricao).join(", ") || null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card shadow-sm px-3 py-2 min-w-[160px] max-w-[220px] cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:border-cyan-300",
        s.ring,
        selected && "ring-2 ring-cyan-400 shadow-md",
        data.isBottleneck && "!border-red-500 ring-2 ring-red-300",
      )}
    >
      {hasTarget && <Handle type="target" id="left" position={Position.Left} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-cyan-500 transition-colors" />}
      {/* Entradas extras (topo/base) — a saída fica só na lateral direita (fluxo natural). */}
      {hasTarget && <Handle type="target" id="top" position={Position.Top} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-cyan-500 transition-colors" />}
      {hasTarget && <Handle type="target" id="bottom" position={Position.Bottom} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-cyan-500 transition-colors" />}
      <div className="flex items-center gap-2">
        <span className={cn("flex w-6 h-6 shrink-0 items-center justify-center rounded-md", s.chipBg, s.chipText)}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">{s.label}</p>
          <p className="text-sm font-medium text-foreground truncate leading-tight">{data.label || "Sem nome"}</p>
        </div>
      </div>
      {(sub || data.perdaPct != null || data.isBottleneck || data.saldoBadge != null) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {sub && <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{sub}</span>}
          {data.perdaPct != null && data.perdaPct > 0 && (
            <span className="text-[10px] rounded bg-danger/10 text-danger px-1">perda {data.perdaPct}%</span>
          )}
          {/* Saldo da fase (tela de chão de fábrica). */}
          {data.saldoBadge != null && (
            <span className="text-[10px] font-semibold rounded bg-gray-900/85 text-white px-1.5 py-0.5">{String(data.saldoBadge)}</span>
          )}
          {data.isBottleneck && <span className="text-[10px] font-semibold text-danger">⚠ gargalo</span>}
        </div>
      )}
      {hasSource && <Handle type="source" id="right" position={Position.Right} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-cyan-500 transition-colors" />}
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
  { kind: "ESTOQUE_INSUMO", label: "Local de estoque" },
  { kind: "OPERACAO", label: "Operação" },
  { kind: "TRANSPORTE", label: "Transporte" },
  { kind: "BUFFER_WIP", label: "Buffer de WIP" },
  { kind: "INSPECAO", label: "Inspeção" },
  { kind: "ESTOCAGEM_PA", label: "Produto Acabado" },
];
