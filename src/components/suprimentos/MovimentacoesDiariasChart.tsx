"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type Mov = {
  tipo: string;
  quantidade: unknown;
  saldoDepois?: unknown;
  lote?: { dataMovimentacao: string | null } | null;
  createdAt: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Gráfico de movimentações agregadas por DIA: barras de entradas × saídas +
// linha do SALDO ao fim do dia (saldoDepois da última movimentação do dia).
// Usa a mesma data exibida na tabela (lote.dataMovimentacao ?? createdAt) e
// recebe a lista já filtrada — respeita período/local/tipo escolhidos.
export default function MovimentacoesDiariasChart({ movs }: { movs: Mov[] }) {
  const dados = useMemo(() => {
    const map = new Map<string, { entrada: number; saida: number; saldo: number | null; ts: number }>();
    for (const m of movs) {
      const ef = m.lote?.dataMovimentacao ?? m.createdAt;
      const d = new Date(ef);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const cur = map.get(key) ?? { entrada: 0, saida: 0, saldo: null as number | null, ts: -Infinity };
      const q = num(m.quantidade);
      if (m.tipo === "ENTRADA") cur.entrada += q;
      else if (m.tipo === "SAIDA") cur.saida += q;
      // Saldo do dia = saldoDepois da movimentação mais recente (por createdAt) do dia.
      const ts = new Date(m.createdAt).getTime();
      if (m.saldoDepois != null && ts >= cur.ts) { cur.saldo = num(m.saldoDepois); cur.ts = ts; }
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        label: new Date(k + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        entrada: Math.round(v.entrada * 1000) / 1000,
        saida: Math.round(v.saida * 1000) / 1000,
        saldo: v.saldo == null ? null : Math.round(v.saldo * 1000) / 1000,
      }));
  }, [movs]);

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
