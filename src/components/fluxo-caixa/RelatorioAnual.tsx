"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import { Loader2, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, ChevronRight as Caret } from "lucide-react";
import Link from "next/link";

// Grupos/subgrupos recolhidos (persistido — mesmo padrão da tela de naturezas).
const COLLAPSE_KEY = "fluxo-caixa:relatorio-anual:collapsed";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const GRUPO_LABEL: Record<string, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL: "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};

type NatNode = { id: string; nome: string; tipo: "ENTRADA" | "SAIDA"; meses: number[]; total: number; temMovimento: boolean };
type SubNode = { id: string | null; nome: string | null; naturezas: NatNode[] };
type GrupoNode = { grupo: string; meses: number[]; total: number; subgrupos: SubNode[] };
type Resumo = Record<string, number[]>;
type Relatorio = { ano: number; grupos: GrupoNode[]; resumo: Resumo };

type Lancamento = {
  id: string; numero: string; descricao: string; valor: number; valorPago: number;
  dataVencimento: string | null; status: string; favorecido: string | null; ref: string | null; href: string;
};

const soma = (a: number[]) => a.reduce((s, v) => s + v, 0);
const fmt = (v: number) => (v === 0 ? "–" : formatBRL(v));

export default function RelatorioAnual() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(true);

  // drill-down
  const [drill, setDrill] = useState<{ natureza: NatNode; mes: number | null } | null>(null);
  const [lancs, setLancs] = useState<Lancamento[] | null>(null);
  const [loadingLancs, setLoadingLancs] = useState(false);

  // Abrir/fechar grupos e subgrupos pela setinha (estado sobrevive a voltar à tela).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/fluxo-caixa/relatorio?ano=${ano}`)
      .then((r) => r.json())
      .then((j) => setRel(j))
      .finally(() => setLoading(false));
  }, [ano]);

  const abrirDrill = useCallback(async (natureza: NatNode, mes: number | null) => {
    setDrill({ natureza, mes });
    setLancs(null);
    setLoadingLancs(true);
    const qs = new URLSearchParams({ naturezaId: natureza.id, ano: String(ano) });
    if (mes !== null) qs.set("mes", String(mes));
    try {
      const j = await fetch(`/api/fluxo-caixa/relatorio/lancamentos?${qs}`).then((r) => r.json());
      setLancs(j.lancamentos ?? []);
    } finally {
      setLoadingLancs(false);
    }
  }, [ano]);

  if (loading || !rel) {
    return <div className="py-20 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground/60" /></div>;
  }

  const r = rel.resumo;
  const chartData = MESES.map((m, i) => ({
    mes: m,
    Receitas: r.receitaOperacional[i],
    Despesas: Math.abs(r.custoOperacional[i] + r.despesaOperacional[i]),
    Fluxo: r.variacaoCaixa[i],
  }));

  return (
    <div className="space-y-6">
      {/* Seletor de ano */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Painel de acompanhamento anual</p>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="px-2 text-sm font-semibold text-foreground tabular-nums">{ano}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAno((a) => a + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Matriz DRE */}
      <div className="border border-border rounded-xl bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted text-muted-foreground">
              <th className="text-left font-semibold px-4 py-3 sticky left-0 bg-muted z-10 min-w-[220px]">Resultado</th>
              {MESES.map((m) => <th key={m} className="text-right font-semibold px-3 py-3 whitespace-nowrap">{m}</th>)}
              <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            <LinhaResumo label="Saldo inicial" valores={r.saldoInicial} forte semTotal />

            {rel.grupos.map((g) => (
              <GrupoBloco key={g.grupo} grupo={g} onDrill={abrirDrill} collapsed={collapsed} onToggle={toggleCollapse} />
            ))}

            <LinhaResumo label="Margem de contribuição" valores={r.margemContribuicao} destaque />
            <LinhaResumo label="Resultado operacional" valores={r.resultadoOperacional} destaque />
            <LinhaResumo label="Variação de caixa" valores={r.variacaoCaixa} destaque />
            <LinhaResumo label="Saldo final" valores={r.saldoFinal} forte semTotal />
          </tbody>
        </table>
      </div>

      {/* Gráfico */}
      <div className="border border-border rounded-xl bg-card shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Fluxo de Caixa — {ano}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={((v: number) => formatBRL(Number(v))) as never} />
            <Legend />
            <Bar dataKey="Receitas" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={14} />
            <Bar dataKey="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={14} />
            <Line dataKey="Fluxo" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Drill-down */}
      <Sheet open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drill?.natureza.nome}</SheetTitle>
            <SheetDescription>
              Lançamentos {drill?.mes !== null && drill?.mes !== undefined ? `de ${MESES[drill.mes]}/` : "de "}{ano}
            </SheetDescription>
          </SheetHeader>
          <div className="p-6 space-y-4">
            {loadingLancs ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : !lancs || lancs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhum lançamento no período.</p>
            ) : (
              <>
                <div className={cn("rounded-xl p-3 flex items-center justify-between", drill?.natureza.tipo === "ENTRADA" ? "bg-success/10" : "bg-danger/10")}>
                  <span className={cn("text-xs font-medium", drill?.natureza.tipo === "ENTRADA" ? "text-success" : "text-danger")}>
                    Total ({lancs.length} {lancs.length === 1 ? "título" : "títulos"})
                  </span>
                  <span className={cn("text-lg font-bold", drill?.natureza.tipo === "ENTRADA" ? "text-success" : "text-rose-800")}>
                    {formatBRL(soma(lancs.map((l) => l.valor)))}
                  </span>
                </div>
                <div className="border rounded-lg overflow-hidden divide-y">
                  {lancs.map((l) => (
                    <div key={l.id} className="flex items-start justify-between p-3 gap-3 hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{l.numero}</span>
                          <StatusBadge status={l.status} />
                        </div>
                        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{l.favorecido ?? l.descricao}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(l.dataVencimento)}{l.ref ? ` · ${l.ref}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-semibold", drill?.natureza.tipo === "ENTRADA" ? "text-success" : "text-danger")}>
                          {formatBRL(l.valor)}
                        </p>
                      </div>
                      <Link href={l.href} className="text-blue-400 hover:text-info shrink-0 mt-0.5" onClick={() => setDrill(null)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GrupoBloco({ grupo, onDrill, collapsed, onToggle }: {
  grupo: GrupoNode; onDrill: (n: NatNode, mes: number | null) => void;
  collapsed: Set<string>; onToggle: (id: string) => void;
}) {
  const temNaturezas = grupo.subgrupos.some((s) => s.naturezas.length > 0);
  const fechado = collapsed.has(grupo.grupo);
  return (
    <>
      <tr className="bg-muted/60 border-b border-border">
        <td className="px-4 py-2 sticky left-0 bg-muted/60 z-10">
          <button
            type="button"
            onClick={() => onToggle(grupo.grupo)}
            className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground uppercase text-[11px] tracking-wide"
            title={fechado ? "Expandir grupo" : "Recolher grupo"}
          >
            {fechado ? <Caret className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
            {GRUPO_LABEL[grupo.grupo] ?? grupo.grupo}
          </button>
        </td>
        {grupo.meses.map((v, i) => <td key={i} className={cn("px-3 py-2 text-right tabular-nums font-medium", valorCor(v))}>{fmt(v)}</td>)}
        <td className={cn("px-4 py-2 text-right tabular-nums font-semibold", valorCor(grupo.total))}>{fmt(grupo.total)}</td>
      </tr>
      {!fechado && grupo.subgrupos.map((sub) => (
        <SubgrupoBloco key={sub.id ?? "sem"} sub={sub} onDrill={onDrill} mostrarTituloSub={!!sub.nome} grupoKey={grupo.grupo} collapsed={collapsed} onToggle={onToggle} />
      ))}
      {!fechado && !temNaturezas && (
        <tr className="border-b border-gray-50"><td colSpan={14} className="px-8 py-1.5 text-[11px] text-muted-foreground/60 sticky left-0 bg-card">sem lançamentos</td></tr>
      )}
    </>
  );
}

function SubgrupoBloco({ sub, onDrill, mostrarTituloSub, grupoKey, collapsed, onToggle }: {
  sub: SubNode; onDrill: (n: NatNode, mes: number | null) => void; mostrarTituloSub: boolean;
  grupoKey: string; collapsed: Set<string>; onToggle: (id: string) => void;
}) {
  const chave = `sub:${grupoKey}|${sub.id ?? "sem"}`;
  const fechado = mostrarTituloSub && collapsed.has(chave);
  // Recolhido: o subgrupo vira UMA linha com a soma das naturezas por mês.
  const mesesSub = Array.from({ length: 12 }, (_, i) => sub.naturezas.reduce((s, n) => s + (n.meses[i] ?? 0), 0));
  const totalSub = sub.naturezas.reduce((s, n) => s + n.total, 0);
  return (
    <>
      {mostrarTituloSub && sub.naturezas.length > 0 && (
        <tr className="border-b border-gray-50">
          <td className="pl-8 pr-4 py-1.5 sticky left-0 bg-card z-10">
            <button
              type="button"
              onClick={() => onToggle(chave)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              title={fechado ? "Expandir subgrupo" : "Recolher subgrupo"}
            >
              {fechado ? <Caret className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
              {sub.nome}
            </button>
          </td>
          {fechado ? (
            <>
              {mesesSub.map((v, i) => <td key={i} className={cn("px-3 py-1.5 text-right tabular-nums", valorCor(v))}>{fmt(v)}</td>)}
              <td className={cn("px-4 py-1.5 text-right tabular-nums font-medium", valorCor(totalSub))}>{fmt(totalSub)}</td>
            </>
          ) : (
            <td colSpan={13} />
          )}
        </tr>
      )}
      {!fechado && sub.naturezas.map((n) => (
        <tr key={n.id} className="border-b border-gray-50 hover:bg-info/10 group">
          <td className={cn("py-1.5 pr-4 sticky left-0 bg-card group-hover:bg-info/10 z-10", mostrarTituloSub ? "pl-12" : "pl-8")}>
            <button onClick={() => onDrill(n, null)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-info text-left">
              <Caret className="w-3 h-3 text-muted-foreground/60 group-hover:text-blue-400" />
              {n.nome}
            </button>
          </td>
          {n.meses.map((v, i) => (
            <td key={i} className="px-3 py-1.5 text-right tabular-nums">
              {v === 0 ? <span className="text-muted-foreground/60">–</span> : (
                <button onClick={() => onDrill(n, i)} className={cn("hover:underline", valorCor(v))}>{formatBRL(v)}</button>
              )}
            </td>
          ))}
          <td className={cn("px-4 py-1.5 text-right tabular-nums font-medium", valorCor(n.total))}>{fmt(n.total)}</td>
        </tr>
      ))}
    </>
  );
}

function LinhaResumo({ label, valores, destaque, forte, semTotal }: { label: string; valores: number[]; destaque?: boolean; forte?: boolean; semTotal?: boolean }) {
  // Saldo inicial/final são ESTOQUE (foto do mês), não fluxo — somar os meses
  // não significa nada; a coluna Total fica vazia (semTotal).
  const total = soma(valores);
  return (
    <tr className={cn("border-b", forte ? "bg-muted border-border" : destaque ? "bg-slate-50 dark:bg-slate-500/15 border-border" : "border-border")}>
      <td className={cn("px-4 py-2 sticky left-0 z-10", forte ? "bg-muted font-bold text-foreground" : "bg-slate-50 dark:bg-slate-500/15 font-semibold text-foreground")}>
        = {label}
      </td>
      {valores.map((v, i) => <td key={i} className={cn("px-3 py-2 text-right tabular-nums font-medium", valorCor(v))}>{fmt(v)}</td>)}
      {semTotal
        ? <td className="px-4 py-2 text-right text-muted-foreground/50">—</td>
        : <td className={cn("px-4 py-2 text-right tabular-nums font-bold", valorCor(total))}>{fmt(total)}</td>}
    </tr>
  );
}

function valorCor(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-danger";
  return "text-muted-foreground";
}
