"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Search, Plus, ArrowUp, ArrowDown, Check } from "lucide-react";
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

function Seta({ tipo, className }: { tipo: "ENTRADA" | "SAIDA"; className?: string }) {
  return tipo === "ENTRADA"
    ? <ArrowUp className={cn("w-3.5 h-3.5 text-emerald-500 shrink-0", className)} />
    : <ArrowDown className={cn("w-3.5 h-3.5 text-rose-500 shrink-0", className)} />;
}

export default function NaturezaCombobox({
  value, onChange, naturezas, placeholder = "Selecione uma natureza...", className,
}: {
  value: string;
  onChange: (id: string) => void;
  naturezas: NaturezaOpt[];
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const selected = naturezas.find((n) => n.id === value);
  const filtradas = naturezas.filter((n) =>
    `${n.nome} ${n.subgrupo?.nome ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()),
  );
  const gruposPresentes = GRUPO_ORDER.filter((g) => filtradas.some((n) => n.grupo === g));

  function selecionar(id: string) {
    onChange(id);
    setOpen(false);
    setBusca("");
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setBusca(""); }}>
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

      <PopoverContent align="start" sideOffset={4} className="w-[320px] max-w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden">
        {/* Busca */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar natureza..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Criar nova */}
        <button
          type="button"
          onClick={() => router.push("/financeiro/naturezas")}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-b border-gray-100"
        >
          <Plus className="w-3.5 h-3.5" /> Criar nova
        </button>

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
                    key={n.id}
                    type="button"
                    onClick={() => selecionar(n.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                      value === n.id ? "bg-blue-50/70 text-blue-700" : "hover:bg-gray-50 text-gray-700",
                    )}
                  >
                    <Seta tipo={n.tipo} />
                    <span className="truncate">
                      {n.subgrupo ? <span className="text-gray-400">{n.subgrupo.nome} · </span> : null}
                      {n.nome}
                    </span>
                    {value === n.id && <Check className="w-3.5 h-3.5 text-blue-600 ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
