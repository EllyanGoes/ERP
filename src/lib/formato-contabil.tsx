"use client";

import { useEffect, useState, useCallback } from "react";
import { formatBRL, cn } from "@/lib/utils";

// Formato de exibição de valores na Contabilidade:
//  - "contabil" (padrão): notação D/C, sem "R$" (saldo "1.234,56 D").
//  - "real": R$ com sinal (formatBRL), como no resto do ERP.

const KEY = "contabilidade:formato";
export type FormatoModo = "contabil" | "real";
export type NaturezaConta = "DEVEDORA" | "CREDORA";

export function useFormatoContabil(): [FormatoModo, (m: FormatoModo) => void] {
  const [modo, setModo] = useState<FormatoModo>("contabil");
  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === "real" || v === "contabil") setModo(v); } catch { /* ignore */ }
  }, []);
  const set = useCallback((m: FormatoModo) => {
    setModo(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  }, []);
  return [modo, set];
}

function num(v: number) {
  return Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formata um SALDO. O saldo já vem ajustado pela natureza (>=0 = lado normal da
 * natureza). Em contábil mostra "1.234,56 D|C" conforme o lado; em real, formatBRL.
 */
export function fmtSaldo(valor: number, modo: FormatoModo, natureza?: NaturezaConta): string {
  if (modo === "real") return formatBRL(valor);
  if (Math.abs(valor) < 0.005) return "—";
  const normal = natureza === "CREDORA" ? "C" : "D";
  const lado = valor >= 0 ? normal : (normal === "D" ? "C" : "D");
  return `${num(valor)} ${lado}`;
}

/** Formata um valor de coluna já rotulada Débito/Crédito: contábil = número puro. */
export function fmtColuna(valor: number, modo: FormatoModo): string {
  if (!valor) return "";
  return modo === "real" ? formatBRL(valor) : num(valor);
}

/**
 * Saldo anormal = conta com saldo no lado oposto à sua natureza (devedora com
 * saldo credor, ou credora com saldo devedor). Como o saldo já vem ajustado pela
 * natureza (>=0 = lado normal), anormal é simplesmente saldo < 0. Sinaliza
 * movimentação fora do padrão para o gestor (exibir em vermelho).
 */
export function saldoAnormal(valor: number): boolean {
  return valor < -0.005;
}

export function FormatoToggle({ modo, onChange, className }: { modo: FormatoModo; onChange: (m: FormatoModo) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs", className)}>
      {(["contabil", "real"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn("px-2.5 py-1.5 font-medium transition-colors", modo === m ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}
        >
          {m === "contabil" ? "Contábil (D/C)" : "Real (R$)"}
        </button>
      ))}
    </div>
  );
}
