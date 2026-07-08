"use client";

import { formatBRL } from "@/lib/utils";

/**
 * Faixa dos encargos da EMPRESA — deixa claro que FGTS/INSS patronal não são
 * descontos do funcionário (confusão comum ao ler a folha).
 */
export default function EncargosPatronaisBar({ fgts, inssPatronal }: { fgts: number; inssPatronal: number }) {
  return (
    <div className="rounded-lg bg-muted/70 border border-border px-4 py-2 text-sm flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Encargos da empresa (não descontados do funcionário)
      </span>
      <span className="tabular-nums">FGTS 8%: <span className="font-semibold">{formatBRL(fgts)}</span></span>
      <span className="tabular-nums">INSS Patronal: <span className="font-semibold">{formatBRL(inssPatronal)}</span></span>
    </div>
  );
}
