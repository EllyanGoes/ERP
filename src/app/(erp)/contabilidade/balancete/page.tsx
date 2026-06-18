"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { useFormatoContabil, FormatoToggle, fmtSaldo, fmtColuna, saldoAnormal, type NaturezaConta } from "@/lib/formato-contabil";
import { Loader2, Scale, Check, X, ChevronRight, ChevronDown } from "lucide-react";

type Linha = {
  id: string; codigo: string; nome: string; tipo: "SINTETICA" | "ANALITICA"; natureza: NaturezaConta; nivel: number;
  saldoAnterior: number; debito: number; credito: number; saldoFinal: number;
};

const COLLAPSE_KEY = "contabilidade:balancete:collapsed";

function defaultRange(): DateRange {
  const h = new Date();
  return { from: new Date(h.getFullYear(), 0, 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

export default function BalancetePage() {
  useTabTitle("Balancete");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<{ totalDebito: number; totalCredito: number; confere: boolean }>({ totalDebito: 0, totalCredito: 0, confere: true });
  const [loading, setLoading] = useState(true);
  const [soComMov, setSoComMov] = useState(true);
  const [modo, setModo] = useFormatoContabil();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  useEffect(() => {
    try { const raw = localStorage.getItem(COLLAPSE_KEY); if (raw) setCollapsed(new Set(JSON.parse(raw) as string[])); } catch { /* ignore */ }
  }, []);
  const persist = useCallback((next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback((codigo: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/balancete?from=${from}&to=${to}`).then((r) => r.json());
      setLinhas(j.linhas ?? []);
      setResumo({ totalDebito: j.totalDebito ?? 0, totalCredito: j.totalCredito ?? 0, confere: j.confere ?? true });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (range.from && range.to) load(); }, [range.from, range.to, load]);

  const comMov = useMemo(
    () => soComMov ? linhas.filter((l) => l.debito !== 0 || l.credito !== 0 || l.saldoAnterior !== 0 || l.saldoFinal !== 0) : linhas,
    [linhas, soComMov],
  );
  const temFilhos = useCallback((l: Linha) => comMov.some((x) => x.codigo.startsWith(l.codigo + ".")), [comMov]);
  const visiveis = useMemo(
    () => comMov.filter((l) => !Array.from(collapsed).some((c) => l.codigo.startsWith(c + "."))),
    [comMov, collapsed],
  );

  const recolherTudo = useCallback(() => persist(new Set(comMov.filter((l) => temFilhos(l)).map((l) => l.codigo))), [comMov, temFilhos, persist]);
  const expandirTudo = useCallback(() => persist(new Set()), [persist]);

  return (
    <div>
      <PageHeader title="Balancete de Verificação" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "Balancete" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={soComMov} onChange={(e) => setSoComMov(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            Só contas com movimento/saldo
          </label>
          <button type="button" onClick={recolherTudo} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50">Recolher tudo</button>
          <button type="button" onClick={expandirTudo} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50">Expandir tudo</button>
          <FormatoToggle modo={modo} onChange={setModo} />
          <span className={cn("ml-auto inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg",
            resumo.confere ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
            {resumo.confere ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {resumo.confere ? "Confere (Σ débito = Σ crédito)" : "Não fecha!"}
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl">
            <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 z-10">
              <span>Conta</span>
              <span className="text-right">Saldo Ant.</span>
              <span className="text-right">Débito</span>
              <span className="text-right">Crédito</span>
              <span className="text-right">Saldo Atual</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
            ) : visiveis.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm"><Scale className="w-8 h-8 text-gray-300 mx-auto mb-2" />Sem movimento no período</div>
            ) : (
              <>
                {visiveis.map((l) => {
                  const filhos = temFilhos(l);
                  const recolhido = collapsed.has(l.codigo);
                  return (
                    <div key={l.id} className={cn(
                      "grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-1.5 border-b border-gray-50 text-sm tabular-nums",
                      l.tipo === "SINTETICA" ? "bg-gray-50/40 font-semibold text-gray-900" : "text-gray-700",
                    )}>
                      <span className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
                        {filhos ? (
                          <button type="button" onClick={() => toggle(l.codigo)} className="text-gray-400 hover:text-gray-700 shrink-0" title={recolhido ? "Expandir" : "Recolher"}>
                            {recolhido ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        ) : <span className="w-4 shrink-0" />}
                        <Link href={`/contabilidade/razao?contaId=${l.id}&from=${range.from}&to=${range.to}`} className="flex items-center gap-2 min-w-0 hover:text-blue-600" title="Abrir razão">
                          <span className="font-mono text-xs text-gray-400 shrink-0">{l.codigo}</span>
                          <span className="truncate">{l.nome}</span>
                        </Link>
                      </span>
                      <span className={cn("text-right", saldoAnormal(l.saldoAnterior) && "text-red-600 font-medium")}>{fmtSaldo(l.saldoAnterior, modo, l.natureza)}</span>
                      <span className="text-right text-blue-700">{fmtColuna(l.debito, modo) || <span className="text-gray-300">—</span>}</span>
                      <span className="text-right text-amber-700">{fmtColuna(l.credito, modo) || <span className="text-gray-300">—</span>}</span>
                      <span className={cn("text-right font-medium", saldoAnormal(l.saldoFinal) ? "text-red-600" : "text-gray-900")}>{fmtSaldo(l.saldoFinal, modo, l.natureza)}</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-t-2 border-gray-200 bg-gray-50 text-sm font-bold tabular-nums sticky bottom-0">
                  <span>Totais do período</span>
                  <span />
                  <span className="text-right text-blue-700">{fmtColuna(resumo.totalDebito, modo)}</span>
                  <span className="text-right text-amber-700">{fmtColuna(resumo.totalCredito, modo)}</span>
                  <span />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
