"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type Mov = {
  tipo: string;
  quantidade: unknown;
  lote?: { dataMovimentacao: string | null } | null;
  createdAt: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Gráfico de movimentações agregadas por DIA (entradas x saídas). Usa a mesma
// data exibida na tabela (lote.dataMovimentacao ?? createdAt). Recebe a lista já
// filtrada — então respeita período/local/tipo escolhidos.
export default function MovimentacoesDiariasChart({ movs }: { movs: Mov[] }) {
  const dados = useMemo(() => {
    const map = new Map<string, { entrada: number; saida: number }>();
    for (const m of movs) {
      const d = new Date(m.lote?.dataMovimentacao ?? m.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const cur = map.get(key) ?? { entrada: 0, saida: 0 };
      const q = num(m.quantidade);
      if (m.tipo === "ENTRADA") cur.entrada += q;
      else if (m.tipo === "SAIDA") cur.saida += q;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        label: new Date(k + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        entrada: Math.round(v.entrada * 1000) / 1000,
        saida: Math.round(v.saida * 1000) / 1000,
      }));
  }, [movs]);

  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-xl">Sem dados para o gráfico.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
        Movimentação diária — entradas × saídas ({dados.length} dia{dados.length !== 1 ? "s" : ""})
      </p>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={{ fontSize: 11 }} width={52} />
            <Tooltip
              formatter={(value, name) => [Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 }), name === "entrada" ? "Entradas" : "Saídas"]}
              labelFormatter={(l) => `Dia ${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend formatter={(v) => (v === "entrada" ? "Entradas" : "Saídas")} />
            <Bar dataKey="entrada" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="saida" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
