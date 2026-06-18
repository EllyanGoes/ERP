"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DateRangePicker, { DateRange } from "@/components/shared/DateRangePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, FileBarChart } from "lucide-react";

type Item = { codigo: string; nome: string; valor: number };
type Dre = {
  receitas: Item[]; custos: Item[]; despesas: Item[];
  totalReceitas: number; totalCustos: number; totalDespesas: number; resultado: number;
};

function defaultRange(): DateRange {
  const h = new Date();
  return { from: new Date(h.getFullYear(), h.getMonth(), 1).toISOString().slice(0, 10), to: h.toISOString().slice(0, 10) };
}

export default function DrePage() {
  useTabTitle("DRE");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [dre, setDre] = useState<Dre | null>(null);
  const [loading, setLoading] = useState(true);
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const load = useCallback(async () => {
    const { from, to } = rangeRef.current;
    if (!from || !to) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/dre?from=${from}&to=${to}`).then((r) => r.json());
      setDre(j);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (range.from && range.to) load(); }, [range.from, range.to, load]);

  return (
    <div>
      <PageHeader title="DRE — Demonstração do Resultado" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "DRE" }]} />
      <div className="px-8 pb-8 space-y-4">
        <DateRangePicker value={range} onChange={setRange} />

        {loading || !dre ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden max-w-3xl">
            <Secao titulo="Receitas" itens={dre.receitas} total={dre.totalReceitas} cor="emerald" />
            <Secao titulo="(−) Custos" itens={dre.custos} total={dre.totalCustos} cor="rose" sinal="-" />
            <Secao titulo="(−) Despesas" itens={dre.despesas} total={dre.totalDespesas} cor="rose" sinal="-" />
            <div className={cn("flex items-center justify-between px-5 py-4 border-t-2 border-gray-300",
              dre.resultado >= 0 ? "bg-emerald-50" : "bg-red-50")}>
              <span className="font-bold text-gray-900 flex items-center gap-2">
                <FileBarChart className="w-4 h-4" /> Resultado do período
              </span>
              <span className={cn("text-lg font-bold tabular-nums", dre.resultado >= 0 ? "text-emerald-700" : "text-red-700")}>
                {formatBRL(dre.resultado)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, itens, total, cor, sinal }: {
  titulo: string; itens: Item[]; total: number; cor: "emerald" | "rose"; sinal?: "-";
}) {
  return (
    <div className="border-b border-gray-100">
      <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">{titulo}</span>
        <span className={cn("text-sm font-bold tabular-nums", cor === "emerald" ? "text-emerald-700" : "text-rose-700")}>
          {sinal === "-" && total !== 0 ? "− " : ""}{formatBRL(total)}
        </span>
      </div>
      {itens.length === 0 ? (
        <div className="px-5 py-2 text-xs text-gray-400 italic">sem lançamentos no período</div>
      ) : itens.map((i) => (
        <div key={i.codigo} className="flex items-center justify-between px-5 py-1.5 text-sm">
          <span className="flex items-center gap-2 min-w-0 text-gray-600">
            <span className="font-mono text-xs text-gray-400 shrink-0">{i.codigo}</span>
            <span className="truncate">{i.nome}</span>
          </span>
          <span className="tabular-nums text-gray-700">{formatBRL(i.valor)}</span>
        </div>
      ))}
    </div>
  );
}
