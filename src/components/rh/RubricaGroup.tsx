"use client";

import { formatBRL } from "@/lib/utils";

export type RubricaLinha = {
  codigo?: string;
  descricao: string;
  referencia?: string;
  valor: number;
  /** Tag discreta ao lado da descrição (ex.: "não tributável", "compensação"). */
  tag?: string;
  /** Tooltip explicativo da rubrica (ex.: adiantamento). */
  tooltip?: string;
  /** Conteúdo extra ao lado do valor (ex.: badge de conferência do INSS). */
  badge?: React.ReactNode;
};

/** Grupo de rubricas com subtotal discreto (Salário, Tributos, Ausências…). */
export default function RubricaGroup({ titulo, rubricas }: { titulo: string; rubricas: RubricaLinha[] }) {
  if (rubricas.length === 0) return null;
  const subtotal = rubricas.reduce((a, r) => a + r.valor, 0);
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-0.5">{titulo}</p>
      <div className="space-y-0.5">
        {rubricas.map((r, i) => (
          <div key={i} className="flex items-baseline gap-2 text-sm" title={r.tooltip}>
            <span className="min-w-0 truncate">
              {r.descricao}
              {r.referencia ? <span className="text-muted-foreground text-xs"> ({r.referencia})</span> : null}
              {r.tag && (
                <span className="ml-1.5 px-1.5 py-px rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wide align-middle">{r.tag}</span>
              )}
            </span>
            <span className="flex-1 border-b border-dotted border-border/70 translate-y-[-3px]" />
            <span className="tabular-nums shrink-0">{formatBRL(r.valor)}</span>
            {r.badge}
          </div>
        ))}
      </div>
      {rubricas.length > 1 && (
        <p className="text-right text-xs text-muted-foreground tabular-nums mt-0.5">subtotal {formatBRL(subtotal)}</p>
      )}
    </div>
  );
}
