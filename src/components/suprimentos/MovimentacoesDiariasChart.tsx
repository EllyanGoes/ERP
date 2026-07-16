"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type Mov = {
  tipo: string;
  quantidade: unknown;
  data?: string | null; // data de negócio (ex.: dia planejado da OP)
  lote?: { dataMovimentacao: string | null } | null;
  createdAt: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Gráfico de movimentações por DIA: barras de entradas × saídas + linha do SALDO.
// O saldo é o ACUMULADO de (entradas − saídas), ancorado no estoque atual do
// produto (`saldoAtual`): anda só com movimentação e termina no estoque de hoje
// — nunca cai sem saída. (Não usa saldoDepois, que é por local e "pula" quando a
// última mov do dia é de outro local.) Recebe a lista já filtrada (respeita
// período/local/tipo escolhidos).
export default function MovimentacoesDiariasChart({ movs, saldoAtual }: { movs: Mov[]; saldoAtual?: number | null }) {
  const dados = useMemo(() => {
    const map = new Map<string, { entrada: number; saida: number }>();
    for (const m of movs) {
      const d = new Date(m.data ?? m.lote?.dataMovimentacao ?? m.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const cur = map.get(key) ?? { entrada: 0, saida: 0 };
      const q = num(m.quantidade);
      if (m.tipo === "ENTRADA") cur.entrada += q;
      else if (m.tipo === "SAIDA") cur.saida += q;
      map.set(key, cur);
    }
    const dias = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ key: k, entrada: round3(v.entrada), saida: round3(v.saida) }));

    // Âncora: o saldo do último dia = estoque atual; recua pelo net de cada dia.
    const netTotal = dias.reduce((s, d) => s + (d.entrada - d.saida), 0);
    const temAncora = saldoAtual != null && Number.isFinite(saldoAtual);
    let acc = temAncora ? (saldoAtual as number) - netTotal : 0;
    return dias.map((d) => {
      acc += d.entrada - d.saida;
      return {
        label: new Date(d.key + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        entrada: d.entrada,
        saida: d.saida,
        saldo: round3(acc),
      };
    });
  }, [movs, saldoAtual]);

  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-xl">Sem dados para o gráfico.</p>;
  }

  const nomes: Record<string, string> = { entrada: "Entradas", saida: "Saídas", saldo: "Saldo" };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Movimentação diária — entradas × saídas + saldo ({dados.length} dia{dados.length !== 1 ? "s" : ""})
      </p>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis yAxisId="qtd" tick={{ fontSize: 11 }} width={52} />
            <YAxis yAxisId="saldo" orientation="right" tick={{ fontSize: 11 }} width={56} />
            <Tooltip
              formatter={(value, name) => [Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 }), nomes[name as string] ?? name]}
              labelFormatter={(l) => `Dia ${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend formatter={(v) => nomes[v as string] ?? v} />
            <Bar yAxisId="qtd" dataKey="entrada" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="qtd" dataKey="saida" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Line yAxisId="saldo" type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
