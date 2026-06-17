"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, Scale, Check, X } from "lucide-react";

type Linha = { id: string; codigo: string; nome: string; tipo: "SINTETICA" | "ANALITICA"; nivel: number; saldo: number };
type Balanco = {
  ativo: Linha[]; passivo: Linha[]; patrimonioLiquido: Linha[];
  totalAtivo: number; totalPassivo: number; totalPL: number;
  resultadoExercicio: number; totalPLcomResultado: number; confere: boolean;
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function LinhaRow({ l, soComSaldo }: { l: Linha; soComSaldo: boolean }) {
  if (soComSaldo && l.saldo === 0) return null;
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-1.5 border-b border-gray-50 text-sm tabular-nums",
      l.tipo === "SINTETICA" ? "bg-gray-50/40 font-semibold text-gray-900" : "text-gray-700",
    )}>
      <span className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${(l.nivel - 1) * 16}px` }}>
        <span className="font-mono text-xs text-gray-400 shrink-0">{l.codigo}</span>
        <span className="truncate">{l.nome}</span>
      </span>
      <span className={cn(l.saldo === 0 && "text-gray-300")}>{formatBRL(l.saldo)}</span>
    </div>
  );
}

export default function BalancoPage() {
  useTabTitle("Balanço Patrimonial");
  const [data, setData] = useState(hoje());
  const [bal, setBal] = useState<Balanco | null>(null);
  const [loading, setLoading] = useState(true);
  const [soComSaldo, setSoComSaldo] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const j = await fetch(`/api/contabilidade/balanco?data=${d}`).then((r) => r.json());
      setBal(j);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (data) load(data); }, [data, load]);

  return (
    <div>
      <PageHeader title="Balanço Patrimonial" breadcrumbs={[{ label: "Contabilidade" }, { label: "Balanço" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Posição em
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-10 w-44 border-gray-300" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            Só contas com saldo
          </label>
          {bal && (
            <span className={cn("ml-auto inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg",
              bal.confere ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
              {bal.confere ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {bal.confere ? "Confere (Ativo = Passivo + PL)" : "Não fecha!"}
            </span>
          )}
        </div>

        {loading || !bal ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* ATIVO */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Scale className="w-4 h-4 text-blue-500" />
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Ativo</h2>
              </div>
              <div>
                {bal.ativo.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} />)}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-200 bg-blue-50 font-bold text-gray-900 tabular-nums">
                <span>Total do Ativo</span>
                <span>{formatBRL(bal.totalAtivo)}</span>
              </div>
            </div>

            {/* PASSIVO + PL */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-500" />
                <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Passivo + Patrimônio Líquido</h2>
              </div>
              <div>
                {bal.passivo.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} />)}
                {bal.patrimonioLiquido.map((l) => <LinhaRow key={l.id} l={l} soComSaldo={soComSaldo} />)}
                {/* Resultado do exercício compõe o PL sem lançamento de encerramento */}
                <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-50 text-sm tabular-nums text-gray-700 italic">
                  <span className="flex items-center gap-2" style={{ paddingLeft: "16px" }}>
                    <span className="font-mono text-xs text-gray-400">2.3.9</span>
                    <span>Resultado do Exercício</span>
                  </span>
                  <span className={cn(bal.resultadoExercicio < 0 && "text-red-600")}>{formatBRL(bal.resultadoExercicio)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t-2 border-gray-200 bg-amber-50 font-bold text-gray-900 tabular-nums">
                <span>Total Passivo + PL</span>
                <span>{formatBRL(bal.totalPassivo + bal.totalPLcomResultado)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
