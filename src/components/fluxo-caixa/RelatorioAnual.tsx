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
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, ChevronRight as Caret } from "lucide-react";
import Link from "next/link";

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
    return <div className="py-20 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>;
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
        <p className="text-sm text-gray-500">Painel de acompanhamento anual</p>
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="px-2 text-sm font-semibold text-gray-700 tabular-nums">{ano}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAno((a) => a + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Matriz DRE */}
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500">
              <th className="text-left font-semibold px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[220px]">Resultado</th>
              {MESES.map((m) => <th key={m} className="text-right font-semibold px-3 py-3 whitespace-nowrap">{m}</th>)}
              <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            <LinhaResumo label="Saldo inicial" valores={r.saldoInicial} forte />

            {rel.grupos.map((g) => (
              <GrupoBloco key={g.grupo} grupo={g} onDrill={abrirDrill} />
            ))}

            <LinhaResumo label="Margem de contribuição" valores={r.margemContribuicao} destaque />
            <LinhaResumo label="Resultado operacional" valores={r.resultadoOperacional} destaque />
            <LinhaResumo label="Variação de caixa" valores={r.variacaoCaixa} destaque />
            <LinhaResumo label="Saldo final" valores={r.saldoFinal} forte />
          </tbody>
        </table>
      </div>

      {/* Gráfico */}
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Fluxo de Caixa — {ano}</h3>
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
              <p className="text-center text-sm text-gray-400 py-12">Nenhum lançamento no período.</p>
            ) : (
              <>
                <div className={cn("rounded-xl p-3 flex items-center justify-between", drill?.natureza.tipo === "ENTRADA" ? "bg-emerald-50" : "bg-rose-50")}>
                  <span className={cn("text-xs font-medium", drill?.natureza.tipo === "ENTRADA" ? "text-emerald-700" : "text-rose-700")}>
                    Total ({lancs.length} {lancs.length === 1 ? "título" : "títulos"})
                  </span>
                  <span className={cn("text-lg font-bold", drill?.natureza.tipo === "ENTRADA" ? "text-emerald-800" : "text-rose-800")}>
                    {formatBRL(soma(lancs.map((l) => l.valor)))}
                  </span>
                </div>
                <div className="border rounded-lg overflow-hidden divide-y">
                  {lancs.map((l) => (
                    <div key={l.id} className="flex items-start justify-between p-3 gap-3 hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400">{l.numero}</span>
                          <StatusBadge status={l.status} />
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{l.favorecido ?? l.descricao}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {formatDate(l.dataVencimento)}{l.ref ? ` · ${l.ref}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-semibold", drill?.natureza.tipo === "ENTRADA" ? "text-emerald-700" : "text-rose-700")}>
                          {formatBRL(l.valor)}
                        </p>
                      </div>
                      <Link href={l.href} className="text-blue-400 hover:text-blue-600 shrink-0 mt-0.5" onClick={() => setDrill(null)}>
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

function GrupoBloco({ grupo, onDrill }: { grupo: GrupoNode; onDrill: (n: NatNode, mes: number | null) => void }) {
  const temNaturezas = grupo.subgrupos.some((s) => s.naturezas.length > 0);
  return (
    <>
      <tr className="bg-gray-50/60 border-b border-gray-100">
        <td className="px-4 py-2 font-semibold text-gray-600 uppercase text-[11px] tracking-wide sticky left-0 bg-gray-50/60 z-10">
          {GRUPO_LABEL[grupo.grupo] ?? grupo.grupo}
        </td>
        {grupo.meses.map((v, i) => <td key={i} className={cn("px-3 py-2 text-right tabular-nums font-medium", valorCor(v))}>{fmt(v)}</td>)}
        <td className={cn("px-4 py-2 text-right tabular-nums font-semibold", valorCor(grupo.total))}>{fmt(grupo.total)}</td>
      </tr>
      {grupo.subgrupos.map((sub) => (
        <SubgrupoBloco key={sub.id ?? "sem"} sub={sub} onDrill={onDrill} mostrarTituloSub={!!sub.nome} />
      ))}
      {!temNaturezas && (
        <tr className="border-b border-gray-50"><td colSpan={14} className="px-8 py-1.5 text-[11px] text-gray-300 sticky left-0 bg-white">sem lançamentos</td></tr>
      )}
    </>
  );
}

function SubgrupoBloco({ sub, onDrill, mostrarTituloSub }: { sub: SubNode; onDrill: (n: NatNode, mes: number | null) => void; mostrarTituloSub: boolean }) {
  return (
    <>
      {mostrarTituloSub && sub.naturezas.length > 0 && (
        <tr className="border-b border-gray-50">
          <td className="pl-8 pr-4 py-1.5 text-[11px] font-medium text-gray-400 sticky left-0 bg-white z-10">{sub.nome}</td>
          <td colSpan={13} />
        </tr>
      )}
      {sub.naturezas.map((n) => (
        <tr key={n.id} className="border-b border-gray-50 hover:bg-blue-50/40 group">
          <td className={cn("py-1.5 pr-4 sticky left-0 bg-white group-hover:bg-blue-50/40 z-10", mostrarTituloSub ? "pl-12" : "pl-8")}>
            <button onClick={() => onDrill(n, null)} className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-700 text-left">
              <Caret className="w-3 h-3 text-gray-300 group-hover:text-blue-400" />
              {n.nome}
            </button>
          </td>
          {n.meses.map((v, i) => (
            <td key={i} className="px-3 py-1.5 text-right tabular-nums">
              {v === 0 ? <span className="text-gray-300">–</span> : (
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

function LinhaResumo({ label, valores, destaque, forte }: { label: string; valores: number[]; destaque?: boolean; forte?: boolean }) {
  const total = soma(valores);
  return (
    <tr className={cn("border-b", forte ? "bg-gray-100 border-gray-200" : destaque ? "bg-slate-50 border-gray-100" : "border-gray-100")}>
      <td className={cn("px-4 py-2 sticky left-0 z-10", forte ? "bg-gray-100 font-bold text-gray-800" : "bg-slate-50 font-semibold text-gray-700")}>
        = {label}
      </td>
      {valores.map((v, i) => <td key={i} className={cn("px-3 py-2 text-right tabular-nums font-medium", valorCor(v))}>{fmt(v)}</td>)}
      <td className={cn("px-4 py-2 text-right tabular-nums font-bold", valorCor(total))}>{fmt(total)}</td>
    </tr>
  );
}

function valorCor(v: number) {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-rose-600";
  return "text-gray-400";
}
