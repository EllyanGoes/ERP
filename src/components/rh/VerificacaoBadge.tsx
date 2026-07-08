"use client";

import { cn, formatBRL } from "@/lib/utils";

/**
 * Badge de conferência ✓/⚠: verde quando |esperado − valor| ≤ tolerância,
 * âmbar com a diferença quando diverge. `esperado == null` não renderiza
 * (sem dado p/ conferir — nunca sinaliza erro à toa).
 */
export default function VerificacaoBadge({
  label,
  esperado,
  valor,
  tolerancia = 0.05,
}: {
  label: string;
  esperado: number | null | undefined;
  valor: number;
  tolerancia?: number;
}) {
  if (esperado == null) return null;
  const dif = Math.abs(esperado - valor);
  const ok = dif <= tolerancia;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
        ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
      )}
      title={ok ? undefined : `Esperado ${formatBRL(esperado)} · encontrado ${formatBRL(valor)}`}
    >
      {ok ? <>{label} ✓</> : <>⚠ {label} · divergência {formatBRL(dif)}</>}
    </span>
  );
}
