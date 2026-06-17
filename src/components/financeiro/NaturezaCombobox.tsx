"use client";

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Search, Plus, ArrowUp, ArrowDown, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NaturezaOpt = {
  id: string;
  nome: string;
  tipo: "ENTRADA" | "SAIDA";
  grupo: string;
  subgrupo: { nome: string } | null;
};

const GRUPO_ORDER = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"];
const GRUPO_LABEL: Record<string, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL: "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};
// Grupo sugerido ao criar inline, conforme o tipo do movimento.
const GRUPO_PADRAO: Record<"ENTRADA" | "SAIDA", string> = {
  ENTRADA: "RECEITA_OPERACIONAL",
  SAIDA: "DESPESA_OPERACIONAL",
};

function Seta({ tipo, className }: { tipo: "ENTRADA" | "SAIDA"; className?: string }) {
  return tipo === "ENTRADA"
    ? <ArrowUp className={cn("w-3.5 h-3.5 text-emerald-500 shrink-0", className)} />
    : <ArrowDown className={cn("w-3.5 h-3.5 text-rose-500 shrink-0", className)} />;
}

export default function NaturezaCombobox({
  value, onChange, naturezas, defaultTipo = "SAIDA", allowCreate = false, onCreated, placeholder = "Selecione uma natureza...", className,
}: {
  value: string;
  onChange: (id: string) => void;
  naturezas: NaturezaOpt[];
  /** Tipo usado ao criar uma natureza inline (segue o movimento do lançamento). */
  defaultTipo?: "ENTRADA" | "SAIDA";
  /**
   * Habilita a criação inline ("Criar nova"). Só os processos do financeiro
   * (lançamento) permitem criar natureza aqui; pedido e documento de entrada não.
   */
  allowCreate?: boolean;
  /** Chamado quando uma natureza é criada inline, para o pai atualizar a lista. */
  onCreated?: (n: NaturezaOpt) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  // criação inline
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoGrupo, setNovoGrupo] = useState(GRUPO_PADRAO[defaultTipo]);
  const [salvandoNova, setSalvandoNova] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const selected = naturezas.find((n) => n.id === value);
  const filtradas = naturezas.filter((n) =>
    `${n.nome} ${n.subgrupo?.nome ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()),
  );
  const gruposPresentes = GRUPO_ORDER.filter((g) => filtradas.some((n) => n.grupo === g));

  function reset() {
    setBusca(""); setCriando(false); setNovoNome(""); setErroNova(null);
    setNovoGrupo(GRUPO_PADRAO[defaultTipo]);
  }
  function selecionar(id: string) {
    onChange(id); setOpen(false); reset();
  }
  function abrirCriar() {
    setNovoNome(busca.trim()); setNovoGrupo(GRUPO_PADRAO[defaultTipo]); setErroNova(null); setCriando(true);
  }

  async function salvarNova() {
    if (!novoNome.trim()) { setErroNova("Informe o nome."); return; }
    setSalvandoNova(true); setErroNova(null);
    try {
      const res = await fetch("/api/financeiro/naturezas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim(), tipo: defaultTipo, grupo: novoGrupo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErroNova(j.error ?? "Erro ao criar."); return; }
      const nova: NaturezaOpt = { id: j.data.id, nome: j.data.nome, tipo: j.data.tipo, grupo: j.data.grupo, subgrupo: null };
      onCreated?.(nova);
      selecionar(nova.id);
    } catch { setErroNova("Erro de conexão."); }
    finally { setSalvandoNova(false); }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between gap-2 h-9 px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-left transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0",
              className,
            )}
          />
        }
      >
        <span className={cn("flex items-center gap-1.5 truncate", !selected && "text-gray-400")}>
          {selected ? (
            <>
              <Seta tipo={selected.tipo} />
              <span className="truncate">{selected.nome}</span>
            </>
          ) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-[460px] max-w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden">
        {allowCreate && criando ? (
          /* Painel de criação inline */
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Nova natureza</span>
              <button type="button" onClick={() => setCriando(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Seta tipo={defaultTipo} />
              {defaultTipo === "ENTRADA" ? "Entrada" : "Saída"} <span className="text-gray-300">(segue o movimento)</span>
            </div>
            <input
              autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salvarNova(); }}
              placeholder="Nome da natureza"
              className="w-full h-9 rounded-lg border border-gray-300 px-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 px-2 text-sm bg-white">
              {GRUPO_ORDER.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
            {erroNova && <p className="text-xs text-rose-500">{erroNova}</p>}
            <div className="flex justify-end gap-2 pt-0.5">
              <button type="button" onClick={() => setCriando(false)} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancelar</button>
              <button type="button" onClick={salvarNova} disabled={salvandoNova || !novoNome.trim()} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                {salvandoNova && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Busca */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar natureza..."
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
              />
            </div>

            {/* Criar nova (apenas no financeiro) */}
            {allowCreate && (
              <button
                type="button" onClick={abrirCriar}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-b border-gray-100"
              >
                <Plus className="w-3.5 h-3.5" /> Criar nova
              </button>
            )}

            {/* Lista agrupada */}
            <div className="max-h-64 overflow-y-auto py-1">
              {filtradas.length === 0 ? (
                <p className="px-3 py-6 text-xs text-gray-400 text-center">
                  {busca ? "Nenhuma natureza encontrada" : "Nenhuma natureza cadastrada"}
                </p>
              ) : (
                gruposPresentes.map((g) => (
                  <div key={g}>
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50/70">
                      {GRUPO_LABEL[g] ?? g}
                    </div>
                    {filtradas.filter((n) => n.grupo === g).map((n) => (
                      <button
                        key={n.id} type="button" onClick={() => selecionar(n.id)}
                        className={cn(
                          "w-full flex items-start gap-2 px-3 py-2 text-sm text-left transition-colors",
                          value === n.id ? "bg-blue-50/70 text-blue-700" : "hover:bg-gray-50 text-gray-700",
                        )}
                      >
                        <span className="mt-0.5 shrink-0"><Seta tipo={n.tipo} /></span>
                        <span className="flex-1 leading-snug">
                          {n.subgrupo ? <span className="text-gray-400">{n.subgrupo.nome} · </span> : null}
                          {n.nome}
                        </span>
                        {value === n.id && <Check className="w-3.5 h-3.5 text-blue-600 ml-auto shrink-0 mt-0.5" />}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
