"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";

/**
 * Seletor de empresa ativa (multiempresa, Fase 3). Fica no topo, ao lado das
 * abas. Só aparece quando o usuário pode ativar mais de uma empresa. A troca
 * reassina o cookie de sessão e recarrega no dashboard — a página atual pode
 * não existir na outra empresa.
 */
export default function EmpresaSelector() {
  const { user } = useSession();
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  const empresas = user?.empresas ?? [];
  if (empresas.length <= 1) return null;
  const ativa = empresas.find((e) => e.id === user?.activeEmpresaId) ?? empresas[0];

  async function trocar(empresaId: string) {
    if (empresaId === ativa.id || trocando) {
      setAberto(false);
      return;
    }
    setTrocando(true);
    try {
      const res = await fetch("/api/auth/switch-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId }),
      });
      if (res.ok) {
        // recarrega no dashboard: o registro aberto pode não existir na outra empresa
        window.location.href = "/dashboard";
        return;
      }
      setTrocando(false);
      setAberto(false);
    } catch {
      setTrocando(false);
      setAberto(false);
    }
  }

  return (
    <div ref={ref} className="relative shrink-0 px-2 self-center">
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={trocando}
        className={cn(
          "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[13px] font-medium",
          "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          "focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        )}
        title="Empresa ativa"
      >
        {trocando
          ? <Loader2 size={14} className="animate-spin text-gray-400" />
          : <Building2 size={14} className="text-blue-600" />}
        <span className="max-w-[140px] truncate">{ativa.nome}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {aberto && (
        <div className="absolute right-2 top-full mt-1 z-50 w-56 rounded-md border border-gray-200 bg-white shadow-lg py-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Empresa ativa
          </div>
          {empresas.map((e) => (
            <button
              key={e.id}
              onClick={() => trocar(e.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-left",
                e.id === ativa.id ? "text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <span className="flex-1 truncate">{e.nome}</span>
              {e.id === ativa.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
