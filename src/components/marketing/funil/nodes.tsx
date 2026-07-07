"use client";

import { useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
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
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoFunilNo } from "@/lib/validations/marketing-funil";
import type { FunilNodeData } from "./types";
import { metricaBase, TIPO_FUNIL_LABEL } from "./types";

interface NodeStyle {
  icon: LucideIcon;
  ring: string;
  chipBg: string;
  chipText: string;
  label: string;
}

// Cores por plataforma da fonte (Meta azul, Google verde/amarelo, TikTok
// preto/rosa, Orgânico verde, Indicação âmbar, WhatsApp verde, Outro cinza).
// Usado nos chips da toolbar e no cabeçalho do NoConfigSheet.
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

// Círculo colorido da fonte, estilo Funnelytics: cor cheia por plataforma
// (Google fica branco com ícone colorido, como o ícone real do Google Ads).
const CIRCULO_FONTE: Record<string, { icon: LucideIcon; cls: string }> = {
  META: { icon: Megaphone, cls: "bg-blue-500 text-white" },
  GOOGLE: { icon: Search, cls: "bg-white text-blue-500 border-2 border-slate-200 dark:border-slate-300" },
  TIKTOK: { icon: Music2, cls: "bg-zinc-900 text-pink-400 border border-zinc-700" },
  ORGANICO: { icon: Sprout, cls: "bg-emerald-500 text-white" },
  INDICACAO: { icon: Users, cls: "bg-amber-500 text-white" },
  WHATSAPP: { icon: MessageCircle, cls: "bg-green-500 text-white" },
  OUTRO: { icon: Globe, cls: "bg-slate-400 text-white" },
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

// ── Overlay de dados (estilo Funnelytics): cartõezinhos sob o nó ──

function DataCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[72px] rounded-md border border-border bg-card px-2 py-1 text-center shadow-sm">
      <p className="text-[10px] leading-none text-muted-foreground mb-0.5">{label}</p>
      {children}
    </div>
  );
}

// Input compacto do volume projetado, dentro do cartão "Pessoas" do nó FONTE
// em modo forecast. Grava em node.data.volume (persiste pelo auto-save).
function VolumeInput({ id, volume }: { id: string; volume: number | null | undefined }) {
  const { updateNodeData } = useReactFlow();
  const [txt, setTxt] = useState(volume == null ? "" : String(volume));

  // Ressincroniza quando o volume muda por fora (ex.: NoConfigSheet).
  useEffect(() => {
    setTxt((atual) => {
      const t = atual.replace(",", ".").trim();
      const n = t === "" ? null : Number(t);
      const norm = n != null && Number.isFinite(n) && n >= 0 ? n : null;
      if (norm === (volume ?? null)) return atual;
      return volume == null ? "" : String(volume);
    });
  }, [volume]);

  return (
    <input
      inputMode="decimal"
      value={txt}
      onChange={(e) => {
        const raw = e.target.value;
        setTxt(raw);
        const t = raw.replace(",", ".").trim();
        if (t === "") {
          updateNodeData(id, { volume: null });
          return;
        }
        const n = Number(t);
        if (Number.isFinite(n) && n >= 0) updateNodeData(id, { volume: n });
      }}
      placeholder="0"
      title="Volume projetado de entrada no período (mensal)"
      className="nodrag nopan w-16 rounded border border-violet-300 dark:border-violet-500/50 bg-card px-1 py-0 text-[11px] font-semibold text-foreground text-center focus:outline-none focus:ring-1 focus:ring-violet-500"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// Cartões de dados sob o nó: "Pessoas" (fluxo), "Investimento" (fonte com
// campanha vinculada, em laranja) e "Receita" (nós com valorMedio, em verde).
// Forecast usa a projeção; análise usa as métricas reais no mesmo layout.
function CartoesDados({ id, tipo, data }: { id: string; tipo: TipoFunilNo; data: FunilNodeData }) {
  const forecast = data._modoForecast === true;
  const analise = data._analise === true;
  if (!forecast && !analise) return null;

  const investimento = tipo === "FONTE" && data.campanhaId ? data._investimento ?? null : null;
  const valorForte = "text-[11px] font-semibold leading-tight";

  if (forecast) {
    const f = data._forecast;
    return (
      <div className="mt-1.5 flex flex-col items-center gap-1">
        <DataCard label="Pessoas">
          {tipo === "FONTE" ? (
            <VolumeInput id={id} volume={data.volume} />
          ) : (
            <p className={cn(valorForte, "text-foreground")}>{fmtNum.format(f?.fluxo ?? 0)}</p>
          )}
        </DataCard>
        {investimento != null && (
          <DataCard label="Investimento">
            <p className={cn(valorForte, "text-orange-600 dark:text-orange-400")}>{fmtMoeda.format(investimento)}</p>
          </DataCard>
        )}
        {data.valorMedio != null && (
          <DataCard label="Receita">
            <p className={cn(valorForte, "text-emerald-600 dark:text-emerald-400")}>{fmtMoeda.format(f?.receita ?? 0)}</p>
          </DataCard>
        )}
      </div>
    );
  }

  const m = data._metricas;
  const pessoas = metricaBase(m);
  const receita = m?.receita ?? 0;
  if (pessoas <= 0 && receita <= 0 && investimento == null) return null;
  return (
    <div className="mt-1.5 flex flex-col items-center gap-1">
      <DataCard label="Pessoas">
        <p className={cn(valorForte, "text-foreground")}>{fmtNum.format(pessoas)}</p>
      </DataCard>
      {investimento != null && (
        <DataCard label="Investimento">
          <p className={cn(valorForte, "text-orange-600 dark:text-orange-400")}>{fmtMoeda.format(investimento)}</p>
        </DataCard>
      )}
      {receita > 0 && (
        <DataCard label="Receita">
          <p className={cn(valorForte, "text-emerald-600 dark:text-emerald-400")}>{fmtMoeda.format(receita)}</p>
        </DataCard>
      )}
    </div>
  );
}

// ── Elementos visuais (estilo Funnelytics) ──

// Handles discretos: aparecem no hover do nó (conexão via arrasto).
const handleCls =
  "!w-2.5 !h-2.5 !bg-slate-400 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity hover:!bg-violet-500";

const ringSel = "ring-2 ring-violet-500 ring-offset-2 ring-offset-background";

function VisualFonte({ data, selected }: { data: FunilNodeData; selected?: boolean }) {
  const st = (data.plataforma && CIRCULO_FONTE[data.plataforma]) || CIRCULO_FONTE.OUTRO;
  const Icon = st.icon;
  return (
    <div
      className={cn(
        "relative flex w-14 h-14 items-center justify-center rounded-full shadow-md transition-transform duration-150 group-hover:scale-105",
        st.cls,
        selected && ringSel,
      )}
    >
      <Icon className="w-6 h-6" />
      {data.campanhaId && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex w-5 h-5 items-center justify-center rounded-full bg-emerald-500 text-white border-2 border-background"
          title={data._campanhaNome ? `Campanha: ${data._campanhaNome}` : "Campanha vinculada"}
        >
          <DollarSign className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  );
}

// Miniatura de janela de navegador (o elemento icônico do Funnelytics):
// barra com os 3 controles e wireframe estático do conteúdo.
function VisualPagina({ selected }: { selected?: boolean }) {
  return (
    <div
      className={cn(
        "w-24 rounded-lg border border-border bg-card shadow-md overflow-hidden transition-transform duration-150 group-hover:scale-[1.03]",
        selected && ringSel,
      )}
    >
      <div className="flex items-center gap-1 px-1.5 h-4 bg-muted border-b border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      </div>
      <div className="p-1.5 space-y-1">
        <div className="h-7 rounded-sm bg-muted" />
        <div className="h-1.5 w-3/4 rounded-sm bg-muted" />
        <div className="h-1.5 rounded-sm bg-muted" />
        <div className="h-1.5 w-1/2 rounded-sm bg-muted" />
        <div className="flex gap-1 pt-0.5">
          <div className="h-8 flex-1 rounded-sm bg-muted" />
          <div className="h-8 flex-1 rounded-sm bg-muted" />
        </div>
      </div>
    </div>
  );
}

function VisualCirculo({ icon: Icon, cls, tamanho, selected }: { icon: LucideIcon; cls: string; tamanho: "sm" | "md"; selected?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full shadow-md transition-transform duration-150 group-hover:scale-105",
        tamanho === "sm" ? "w-11 h-11" : "w-14 h-14",
        cls,
        selected && ringSel,
      )}
    >
      <Icon className={tamanho === "sm" ? "w-5 h-5" : "w-6 h-6"} />
    </div>
  );
}

// Etapa offline: losango verde com $ quando tem valorMedio (o "Purchase" do
// Funnelytics); círculo emerald com aperto de mão nos demais casos.
function VisualEtapa({ data, selected }: { data: FunilNodeData; selected?: boolean }) {
  if (data.valorMedio != null) {
    return (
      <div className="p-2">
        <div
          className={cn(
            "flex w-11 h-11 rotate-45 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-md transition-transform duration-150 group-hover:scale-105",
            selected && ringSel,
          )}
        >
          <DollarSign className="w-5 h-5 -rotate-45" />
        </div>
      </div>
    );
  }
  return <VisualCirculo icon={Handshake} cls="bg-emerald-500 text-white" tamanho="md" selected={selected} />;
}

// Nó estilo Funnelytics: rótulo pequeno acima, elemento visual (círculo ou
// miniatura de página) no centro com handles nas laterais e cartões de dados
// abaixo (forecast/análise).
function NoCard({ id, tipo, data, selected }: { id: string; tipo: TipoFunilNo; data: FunilNodeData; selected?: boolean }) {
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

  return (
    <div className="group flex flex-col items-center cursor-pointer">
      <div className="mb-1.5 max-w-[150px] text-center">
        <p className="text-[11px] font-medium text-muted-foreground leading-tight truncate">{data.rotulo || TIPO_FUNIL_LABEL[tipo]}</p>
        {sub && <p className="text-[9px] text-muted-foreground/60 leading-tight truncate">{sub}</p>}
      </div>

      <div className="relative">
        <Handle type="target" id="left" position={Position.Left} className={handleCls} />
        {tipo === "FONTE" && <VisualFonte data={data} selected={selected} />}
        {tipo === "PAGINA" && <VisualPagina selected={selected} />}
        {tipo === "ACAO" && <VisualCirculo icon={MousePointerClick} cls="bg-orange-500 text-white" tamanho="sm" selected={selected} />}
        {tipo === "ETAPA_OFFLINE" && <VisualEtapa data={data} selected={selected} />}
        <Handle type="source" id="right" position={Position.Right} className={handleCls} />
      </div>

      <CartoesDados id={id} tipo={tipo} data={data} />
    </div>
  );
}

// A chave = node.type = tipo do nó.
export const nodeTypes = {
  FONTE: (p: NodeProps) => <NoCard id={p.id} tipo="FONTE" data={p.data as FunilNodeData} selected={p.selected} />,
  PAGINA: (p: NodeProps) => <NoCard id={p.id} tipo="PAGINA" data={p.data as FunilNodeData} selected={p.selected} />,
  ACAO: (p: NodeProps) => <NoCard id={p.id} tipo="ACAO" data={p.data as FunilNodeData} selected={p.selected} />,
  ETAPA_OFFLINE: (p: NodeProps) => <NoCard id={p.id} tipo="ETAPA_OFFLINE" data={p.data as FunilNodeData} selected={p.selected} />,
};

// Paleta da toolbar (ordem de exibição = ordem natural do funil).
export const PALETTE: { tipo: TipoFunilNo; label: string }[] = [
  { tipo: "FONTE", label: "Fonte" },
  { tipo: "PAGINA", label: "Página" },
  { tipo: "ACAO", label: "Ação" },
  { tipo: "ETAPA_OFFLINE", label: "Etapa offline" },
];
