"use client";

import { useState, useRef, useEffect } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { cn } from "@/lib/utils";

const COOKIE_ESCOPO = "erp_escopo";

function lerEscopoGrupo(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${COOKIE_ESCOPO}=grupo`);
}

// Sigla da empresa: iniciais das palavras significativas (ignora conectivos).
// "Ceramica Tramontin" → "CT"; "Cimento e Mix" → "CM"; "Atlas" → "A".
const CONECTIVOS = new Set(["e", "de", "da", "do", "das", "dos", "&"]);
function siglaEmpresa(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter((p) => p && !CONECTIVOS.has(p.toLowerCase()));
  if (palavras.length === 0) return nome.slice(0, 2).toUpperCase();
  if (palavras.length === 1) return palavras[0].slice(0, 1).toUpperCase();
  return palavras.map((p) => p[0]).join("").toUpperCase();
}

/**
 * Seletor de empresa ativa (multiempresa). Fica no topo, ao lado das abas.
 * Só aparece quando o usuário pode ativar mais de uma empresa.
 *
 * Também controla o "modo grupo" das telas de COMPRAS e COMERCIAL: com o
 * modo ligado, as listagens desses módulos mostram os processos de todas as
 * empresas do usuário juntos (com a tag da empresa em cada um) e os
 * documentos novos herdam a empresa da cadeia (cotação ← solicitação,
 * minuta ← pedido, ...). O valor vai num cookie que o servidor valida contra
 * as empresas da sessão. Trocas recarregam a MESMA página.
 */
export default function EmpresaSelector() {
  const { user } = useSession();
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [grupo, setGrupo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setGrupo(lerEscopoGrupo()); }, []);

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
        // recarrega a MESMA página na outra empresa (se o registro aberto não
        // existir lá, a própria tela mostra vazio/não encontrado)
        window.location.reload();
        return;
      }
      setTrocando(false);
      setAberto(false);
    } catch {
      setTrocando(false);
      setAberto(false);
    }
  }

  function alternarGrupo() {
    const novo = !grupo;
    if (novo) document.cookie = `${COOKIE_ESCOPO}=grupo; path=/; max-age=${60 * 60 * 24 * 30}`;
    else document.cookie = `${COOKIE_ESCOPO}=; path=/; max-age=0`;
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative shrink-0 px-2 self-center">
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={trocando}
        className={cn(
          "flex items-center gap-1 px-1.5 h-7 rounded-md text-[13px] font-semibold",
          "border border-border bg-card text-foreground hover:bg-muted",
          "focus:outline-none focus:ring-2 focus:ring-ring/30"
        )}
        title={grupo ? "Todas as empresas" : ativa.nome}
      >
        {trocando
          ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
          : <Building2 size={14} className={grupo ? "text-purple-600 dark:text-purple-400" : "text-info dark:text-blue-400"} />}
        <span className="tracking-wide">{grupo ? "Grupo" : siglaEmpresa(ativa.nome)}</span>
        <ChevronDown size={13} className="text-muted-foreground" />
      </button>

      {aberto && (
        <div className="absolute right-2 top-full mt-1 z-50 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Empresa ativa
          </div>
          {empresas.map((e) => (
            <button
              key={e.id}
              onClick={() => trocar(e.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-left",
                e.id === ativa.id ? "text-primary font-medium" : "text-foreground hover:bg-muted"
              )}
            >
              <span className="flex-1 truncate">{e.nome}</span>
              {e.id === ativa.id && <Check size={14} />}
            </button>
          ))}

          <div className="my-1 border-t border-border" />
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Compras e comercial
          </div>
          <button
            onClick={alternarGrupo}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-left text-foreground hover:bg-muted"
          >
            <span className="flex-1">Ver todas as empresas juntas</span>
            <span
              className={cn(
                "w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center",
                grupo ? "bg-purple-600 justify-end" : "bg-muted-foreground/40 justify-start"
              )}
              style={{ height: 18, width: 32 }}
            >
              <span className="w-3.5 h-3.5 bg-card rounded-full shadow" />
            </span>
          </button>
          <p className="px-3 pb-1.5 text-[11px] text-muted-foreground">
            Os processos novos continuam nascendo na empresa do documento de origem
            ou na escolhida no formulário.
          </p>
        </div>
      )}
    </div>
  );
}
