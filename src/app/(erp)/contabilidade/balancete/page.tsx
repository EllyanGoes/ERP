"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, Scale, Check, X } from "lucide-react";

type Linha = {
  id: string; codigo: string; nome: string; tipo: "SINTETICA" | "ANALITICA"; nivel: number;
  saldoAnterior: number; debito: number; credito: number; saldoFinal: number;
};

function defaultRange(): DateRange {
  const h = new Date();
  return { from: new Date(h.getFullYear(), h.getMonth(), 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

function val(n: number) {
  return n === 0 ? <span className="text-gray-300">—</span> : formatBRL(n);
}

export default function BalancetePage() {
  useTabTitle("Balancete");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<{ totalDebito: number; totalCredito: number; confere: boolean }>({ totalDebito: 0, totalCredito: 0, confere: true });
  const [loading, setLoading] = useState(true);
  const [soComMov, setSoComMov] = useState(true);
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

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

  const visiveis = soComMov
    ? linhas.filter((l) => l.debito !== 0 || l.credito !== 0 || l.saldoAnterior !== 0 || l.saldoFinal !== 0)
    : linhas;

  return (
    <div>
      <PageHeader title="Balancete de Verificação" breadcrumbs={[{ label: "Contabilidade" }, { label: "Balancete" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={soComMov} onChange={(e) => setSoComMov(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            Só contas com movimento/saldo
          </label>
          <span className={cn("ml-auto inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg",
            resumo.confere ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
            {resumo.confere ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {resumo.confere ? "Confere (Σ débito = Σ crédito)" : "Não fecha!"}
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
            <div>
              {visiveis.map((l) => (
                <div key={l.id} className={cn(
                  "grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-1.5 border-b border-gray-50 text-sm tabular-nums",
                  l.tipo === "SINTETICA" ? "bg-gray-50/40 font-semibold text-gray-900" : "text-gray-700",
                )}>
                  <span className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
                    <span className="font-mono text-xs text-gray-400 shrink-0">{l.codigo}</span>
                    <span className="truncate">{l.nome}</span>
                  </span>
                  <span className="text-right">{val(l.saldoAnterior)}</span>
                  <span className="text-right text-blue-700">{val(l.debito)}</span>
                  <span className="text-right text-amber-700">{val(l.credito)}</span>
                  <span className="text-right font-medium text-gray-900">{val(l.saldoFinal)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_repeat(4,8rem)] gap-2 px-5 py-2.5 border-t-2 border-gray-200 bg-gray-50 text-sm font-bold tabular-nums">
                <span>Totais do período</span>
                <span />
                <span className="text-right text-blue-700">{formatBRL(resumo.totalDebito)}</span>
                <span className="text-right text-amber-700">{formatBRL(resumo.totalCredito)}</span>
                <span />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
