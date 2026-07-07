"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ForecastResultado } from "./forecast";
import { TIPO_FUNIL_LABEL, type CampanhaOpt, type FunilFlowEdge, type FunilFlowNode } from "./types";

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

// Conversões do mês p/ semana/dia (média de semanas e dias por mês).
const SEMANAS_POR_MES = 4.345;
const DIAS_POR_MES = 30.44;

interface Props {
  resultado: ForecastResultado | null;
  nodes: FunilFlowNode[];
  edges: FunilFlowEdge[];
  campanhas: CampanhaOpt[];
}

const cardCls = "rounded-lg border border-border p-3";
const cardLabelCls = "text-[11px] font-medium text-muted-foreground";

// Quebra mensal → semanal/diária de um valor (volumes digitados são mensais).
function Quebra({ mensal, moeda }: { mensal: number; moeda?: boolean }) {
  const fmt = (v: number) => (moeda ? fmtMoeda.format(v) : fmtNum.format(v));
  return (
    <div className="mt-2 space-y-0.5 border-t border-border pt-1.5">
      {[
        ["por dia", mensal / DIAS_POR_MES],
        ["por semana", mensal / SEMANAS_POR_MES],
        ["por mês", mensal],
      ].map(([rotulo, v]) => (
        <div key={rotulo as string} className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{rotulo}</span>
          <span className="font-medium text-foreground">{fmt(v as number)}</span>
        </div>
      ))}
    </div>
  );
}

// Painel lateral do modo forecast (estilo Funnelytics): cards de Receita,
// Investimento (orçamento das campanhas vinculadas às fontes), Lucro, ROI e
// CAC projetados, além dos avisos de arestas sem taxa / ciclos. Somente
// leitura — o que persiste são volume/taxa/valorMedio no próprio canvas.
export default function ForecastPanel({ resultado, nodes, edges, campanhas }: Props) {
  const [aberto, setAberto] = useState(true);

  const nomePorNo = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.data.rotulo || TIPO_FUNIL_LABEL[n.data.tipo]])),
    [nodes],
  );

  // Etapas offline em ordem topológica (as chaves de porNo já vêm ordenadas).
  const etapasOffline = useMemo(() => {
    if (!resultado) return [];
    const porId = new Map(nodes.map((n) => [n.id, n]));
    const out: { id: string; nome: string; fluxo: number; receita: number; temValor: boolean }[] = [];
    for (const [id, f] of Object.entries(resultado.porNo)) {
      const n = porId.get(id);
      if (n?.data.tipo !== "ETAPA_OFFLINE") continue;
      out.push({ id, nome: nomePorNo.get(id) ?? id, fluxo: f.fluxo, receita: f.receita, temValor: n.data.valorMedio != null });
    }
    return out;
  }, [resultado, nodes, nomePorNo]);

  // Campanhas vinculadas aos nós FONTE (orcamento é Decimal serializado → Number).
  const campanhasVinculadas = useMemo(() => {
    const ids = new Set(nodes.filter((n) => n.data.tipo === "FONTE" && n.data.campanhaId).map((n) => n.data.campanhaId as string));
    return campanhas.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, nome: c.nome, valor: c.orcamento != null ? Number(c.orcamento) : null }));
  }, [nodes, campanhas]);

  const investimento = useMemo(() => {
    const comValor = campanhasVinculadas.filter((c) => c.valor != null);
    if (comValor.length === 0) return null;
    return comValor.reduce((s, c) => s + (c.valor as number), 0);
  }, [campanhasVinculadas]);

  // Conversões projetadas = fluxo da ÚLTIMA etapa offline com fluxo > 0.
  const conversoes = useMemo(() => {
    let ultima: number | null = null;
    for (const et of etapasOffline) if (et.fluxo > 0) ultima = et.fluxo;
    return ultima;
  }, [etapasOffline]);

  const receita = resultado?.receitaTotal ?? 0;
  const lucro = investimento != null ? receita - investimento : null;
  const roi = investimento != null && investimento > 0 ? receita / investimento : null;
  const cac = investimento != null && conversoes != null && conversoes > 0 ? investimento / conversoes : null;

  const nomeAresta = (id: string) => {
    const e = edges.find((x) => x.id === id);
    if (!e) return id;
    return `${nomePorNo.get(e.source) ?? e.source} → ${nomePorNo.get(e.target) ?? e.target}`;
  };

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        title="Abrir painel do forecast"
        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md hover:bg-muted"
      >
        <TrendingUp className="w-3.5 h-3.5 text-violet-500" /> Forecast
      </button>
    );
  }

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex w-6 h-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-500/25 text-violet-600 dark:text-violet-300">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Forecast</p>
            <p className="text-[10px] text-muted-foreground">volumes das fontes = projeção mensal</p>
          </div>
        </div>
        <button onClick={() => setAberto(false)} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" title="Recolher painel">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Entrada */}
        <div className={cardCls}>
          <p className={cardLabelCls}>Entrada total (mês)</p>
          <p className="text-xl font-semibold text-foreground">{fmtNum.format(resultado?.totalEntrada ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground">soma dos volumes projetados dos nós de fonte</p>
        </div>

        {/* Receita */}
        <div className={cardCls}>
          <p className={cardLabelCls}>Receita projetada</p>
          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoeda.format(receita)}</p>
          <Quebra mensal={receita} moeda />
        </div>

        {/* Investimento */}
        <div className={cardCls}>
          <p className={cardLabelCls}>Investimento (campanhas vinculadas)</p>
          <p className="text-xl font-semibold text-orange-600 dark:text-orange-400">
            {investimento == null ? "—" : fmtMoeda.format(investimento)}
          </p>
          {campanhasVinculadas.length > 0 ? (
            <div className="mt-2 space-y-0.5 border-t border-border pt-1.5">
              {campanhasVinculadas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground truncate">{c.nome}</span>
                  <span className="font-medium text-foreground shrink-0">{c.valor == null ? "—" : fmtMoeda.format(c.valor)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-[11px] border-t border-border pt-1 mt-1">
                <span className="font-medium text-foreground">Total</span>
                <span className="font-semibold text-foreground">{investimento == null ? "—" : fmtMoeda.format(investimento)}</span>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-1">vincule campanhas com orçamento aos nós de fonte</p>
          )}
          {investimento != null && <Quebra mensal={investimento} moeda />}
        </div>

        {/* Lucro + ROI */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cardCls}>
            <p className={cardLabelCls}>Lucro</p>
            <p
              className={cn(
                "text-lg font-semibold",
                lucro == null ? "text-foreground" : lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger",
              )}
            >
              {lucro == null ? "—" : fmtMoeda.format(lucro)}
            </p>
            <p className="text-[10px] text-muted-foreground">receita − investimento</p>
          </div>
          <div className={cardCls}>
            <p className={cardLabelCls}>ROI</p>
            <p className="text-lg font-semibold text-foreground">{roi == null ? "—" : `${roi.toFixed(2).replace(".", ",")}x`}</p>
            <p className="text-[10px] text-muted-foreground">receita ÷ investimento</p>
          </div>
        </div>

        {/* CAC */}
        <div className={cardCls}>
          <p className={cardLabelCls}>CAC projetado</p>
          <p className="text-lg font-semibold text-foreground">{cac == null ? "—" : fmtMoeda.format(cac)}</p>
          <p className="text-[10px] text-muted-foreground">
            investimento ÷ conversões projetadas ({conversoes == null ? "sem etapa offline com fluxo" : `${fmtNum.format(conversoes)} na última etapa offline`})
          </p>
        </div>

        {/* Etapas offline */}
        {etapasOffline.length > 0 && (
          <div className={cardCls}>
            <p className={cn(cardLabelCls, "mb-1.5")}>Etapas offline</p>
            <div className="space-y-1">
              {etapasOffline.map((et) => (
                <div key={et.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground truncate">{et.nome}</span>
                  <span className="font-medium text-foreground shrink-0">
                    {fmtNum.format(et.fluxo)}
                    {et.temValor && <span className="text-emerald-600 dark:text-emerald-400"> · {fmtMoeda.format(et.receita)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Avisos */}
        {resultado && (resultado.arestasSemTaxa.length > 0 || resultado.arestasIgnoradas.length > 0) && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" /> Avisos
            </p>
            {resultado.arestasSemTaxa.map((id) => (
              <p key={id} className="text-[11px] text-amber-700 dark:text-amber-400">
                Defina o % em <span className="font-medium">{nomeAresta(id)}</span> (origem com múltiplas saídas — sem taxa, passa 0).
              </p>
            ))}
            {resultado.arestasIgnoradas.map((id) => (
              <p key={id} className="text-[11px] text-amber-700 dark:text-amber-400">
                <span className="font-medium">{nomeAresta(id)}</span> fecha um ciclo e foi ignorada na projeção.
              </p>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Conexão com saída única passa 100% por padrão; com múltiplas saídas, distribua os percentuais nas próprias conexões.
        </p>
      </div>
    </div>
  );
}
