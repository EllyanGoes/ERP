"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Megaphone,
  Search,
  Music2,
  Sprout,
  Users,
  MessageCircle,
  Globe,
  PanelTop,
  MousePointerClick,
  Handshake,
  Eye,
  UserPlus,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoFunilNo } from "@/lib/validations/marketing-funil";
import type { FunilNodeData, NoMetricas } from "./types";
import { TIPO_FUNIL_LABEL } from "./types";

interface NodeStyle {
  icon: LucideIcon;
  ring: string;
  chipBg: string;
  chipText: string;
  label: string;
}

// Cores por plataforma da fonte (Meta azul, Google verde/amarelo, TikTok
// preto/rosa, Orgânico verde, Indicação âmbar, WhatsApp verde, Outro cinza).
export const PLATAFORMA_STYLE: Record<string, Pick<NodeStyle, "icon" | "ring" | "chipBg" | "chipText">> = {
  META: { icon: Megaphone, ring: "border-blue-300 dark:border-blue-500/60", chipBg: "bg-blue-100 dark:bg-blue-500/25", chipText: "text-blue-700 dark:text-blue-300" },
  GOOGLE: { icon: Search, ring: "border-yellow-300 dark:border-yellow-500/60", chipBg: "bg-yellow-100 dark:bg-yellow-500/20", chipText: "text-green-700 dark:text-green-400" },
  TIKTOK: { icon: Music2, ring: "border-pink-300 dark:border-pink-500/60", chipBg: "bg-zinc-900 dark:bg-zinc-100/15", chipText: "text-pink-400 dark:text-pink-300" },
  ORGANICO: { icon: Sprout, ring: "border-emerald-300 dark:border-emerald-500/60", chipBg: "bg-emerald-100 dark:bg-emerald-500/25", chipText: "text-emerald-700 dark:text-emerald-300" },
  INDICACAO: { icon: Users, ring: "border-amber-300 dark:border-amber-500/60", chipBg: "bg-amber-100 dark:bg-amber-500/25", chipText: "text-amber-700 dark:text-amber-300" },
  WHATSAPP: { icon: MessageCircle, ring: "border-green-300 dark:border-green-500/60", chipBg: "bg-green-100 dark:bg-green-500/25", chipText: "text-green-700 dark:text-green-300" },
  OUTRO: { icon: Globe, ring: "border-slate-300 dark:border-slate-500/60", chipBg: "bg-slate-100 dark:bg-slate-500/25", chipText: "text-slate-700 dark:text-slate-300" },
};

export const NODE_STYLE: Record<TipoFunilNo, NodeStyle> = {
  FONTE: { icon: Megaphone, ring: "border-slate-300 dark:border-slate-500/60", chipBg: "bg-slate-100 dark:bg-slate-500/25", chipText: "text-slate-700 dark:text-slate-300", label: TIPO_FUNIL_LABEL.FONTE },
  PAGINA: { icon: PanelTop, ring: "border-sky-300 dark:border-sky-500/60", chipBg: "bg-sky-100 dark:bg-sky-500/25", chipText: "text-sky-700 dark:text-sky-300", label: TIPO_FUNIL_LABEL.PAGINA },
  ACAO: { icon: MousePointerClick, ring: "border-orange-300 dark:border-orange-500/60", chipBg: "bg-orange-100 dark:bg-orange-500/25", chipText: "text-orange-700 dark:text-orange-300", label: TIPO_FUNIL_LABEL.ACAO },
  ETAPA_OFFLINE: { icon: Handshake, ring: "border-emerald-300 dark:border-emerald-500/60", chipBg: "bg-emerald-100 dark:bg-emerald-500/25", chipText: "text-emerald-700 dark:text-emerald-300", label: TIPO_FUNIL_LABEL.ETAPA_OFFLINE },
};

const fmtNum = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const PLATAFORMA_LABEL: Record<string, string> = {
  META: "Meta",
  GOOGLE: "Google",
  TIKTOK: "TikTok",
  ORGANICO: "Orgânico",
  INDICACAO: "Indicação",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

function temMetrica(m: NoMetricas | null | undefined): boolean {
  return !!m && (m.visitantes > 0 || m.leads > 0 || m.conversoes > 0 || m.receita > 0);
}

function MetricasBadge({ m }: { m: NoMetricas }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md bg-muted/80 px-1.5 py-1">
      {m.visitantes > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground" title="Visitantes">
          <Eye className="w-3 h-3" /> {fmtNum.format(m.visitantes)}
        </span>
      )}
      {m.leads > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-info" title="Leads">
          <UserPlus className="w-3 h-3" /> {fmtNum.format(m.leads)}
        </span>
      )}
      {m.conversoes > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success" title="Conversões">
          <Target className="w-3 h-3" /> {fmtNum.format(m.conversoes)}
        </span>
      )}
      {m.receita > 0 && (
        <span className="text-[10px] font-semibold text-success" title="Receita">
          {fmtMoeda.format(m.receita)}
        </span>
      )}
    </div>
  );
}

// Cartão vertical estilo Funnelytics: ícone grande em cima, rótulo e
// subtítulo contextual embaixo; entrada à esquerda, saída à direita.
function NoCard({ tipo, data, selected }: { tipo: TipoFunilNo; data: FunilNodeData; selected?: boolean }) {
  const base = NODE_STYLE[tipo];
  const plat = tipo === "FONTE" && data.plataforma ? PLATAFORMA_STYLE[data.plataforma] ?? PLATAFORMA_STYLE.OUTRO : null;
  const Icon = plat?.icon ?? base.icon;
  const ring = plat?.ring ?? base.ring;
  const chipBg = plat?.chipBg ?? base.chipBg;
  const chipText = plat?.chipText ?? base.chipText;

  let sub: string | null = null;
  if (tipo === "FONTE") {
    sub = data._campanhaNome || (data.plataforma ? PLATAFORMA_LABEL[data.plataforma] ?? data.plataforma : null);
  } else if (tipo === "PAGINA") {
    sub = (data.urlPatterns ?? []).find((p) => p.trim()) ?? null;
  } else if (tipo === "ACAO") {
    sub = data.eventoNome ?? null;
  } else if (tipo === "ETAPA_OFFLINE") {
    sub = data._etapaNome ?? null;
  }

  const handleCls = "!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-violet-500 transition-colors";

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card shadow-sm px-3 py-2.5 w-[180px] cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 hover:border-violet-300",
        ring,
        selected && "ring-2 ring-violet-400 shadow-md",
      )}
    >
      <Handle type="target" id="left" position={Position.Left} className={handleCls} />
      <div className="flex flex-col items-center text-center">
        <span className={cn("flex w-10 h-10 items-center justify-center rounded-full mb-1.5", chipBg, chipText)}>
          <Icon className="w-5 h-5" />
        </span>
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">{base.label}</p>
        <p className="text-sm font-medium text-foreground leading-tight truncate w-full">{data.rotulo || "Sem nome"}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate w-full mt-0.5">{sub}</p>}
        {data._analise && temMetrica(data._metricas) && <MetricasBadge m={data._metricas as NoMetricas} />}
      </div>
      <Handle type="source" id="right" position={Position.Right} className={handleCls} />
    </div>
  );
}

// A chave = node.type = tipo do nó.
export const nodeTypes = {
  FONTE: (p: NodeProps) => <NoCard tipo="FONTE" data={p.data as FunilNodeData} selected={p.selected} />,
  PAGINA: (p: NodeProps) => <NoCard tipo="PAGINA" data={p.data as FunilNodeData} selected={p.selected} />,
  ACAO: (p: NodeProps) => <NoCard tipo="ACAO" data={p.data as FunilNodeData} selected={p.selected} />,
  ETAPA_OFFLINE: (p: NodeProps) => <NoCard tipo="ETAPA_OFFLINE" data={p.data as FunilNodeData} selected={p.selected} />,
};

// Paleta da toolbar (ordem de exibição = ordem natural do funil).
export const PALETTE: { tipo: TipoFunilNo; label: string }[] = [
  { tipo: "FONTE", label: "Fonte" },
  { tipo: "PAGINA", label: "Página" },
  { tipo: "ACAO", label: "Ação" },
  { tipo: "ETAPA_OFFLINE", label: "Etapa offline" },
];
