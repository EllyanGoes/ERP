"use client";

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Search, Check, Building2, User, Users, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

export type BenTipo = "FORNECEDOR" | "COLABORADOR" | "CLIENTE";
export type BenOpt = { id: string; nome: string; doc?: string | null };

const soDigitos = (s: string) => s.replace(/\D/g, "");

// Seletor de BENEFICIÁRIO no mesmo estilo do NaturezaCombobox: busca + lista
// agrupada por tipo + opção "Sem vínculo". No modo "receber" mostra Clientes;
// no modo "pagar" mostra Fornecedores e Colaboradores. "Sem vínculo" zera o
// beneficiário (encargos/receitas sem cadastro). A contabilização é definida
// pela natureza, não pelo beneficiário.
export default function BeneficiarioCombobox({
  modo, tipo, value, onChange, fornecedores = [], colaboradores = [], clientes = [], placeholder = "Selecione o beneficiário...", className,
}: {
  modo: "receber" | "pagar";
  tipo: BenTipo | null;
  value: string; // id do beneficiário ("" = sem vínculo)
  onChange: (tipo: BenTipo | null, id: string | null) => void;
  fornecedores?: BenOpt[];
  colaboradores?: BenOpt[];
  clientes?: BenOpt[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<BenTipo | "TODOS">("TODOS");

  const grupos: { tipo: BenTipo; label: string; icon: typeof Building2; itens: BenOpt[] }[] =
    modo === "receber"
      ? [{ tipo: "CLIENTE", label: "Clientes", icon: Users, itens: clientes }]
      : [
          { tipo: "FORNECEDOR", label: "Fornecedores", icon: Building2, itens: fornecedores },
          { tipo: "COLABORADOR", label: "Colaboradores", icon: User, itens: colaboradores },
        ];

  const q = busca.trim().toLowerCase();
  const selecionado = value
    ? grupos.flatMap((g) => g.itens.map((i) => ({ ...i, tipo: g.tipo }))).find((i) => i.id === value && i.tipo === tipo)
    : null;

  function escolher(t: BenTipo | null, id: string | null) {
    onChange(t, id); setOpen(false); setBusca(""); setFiltro("TODOS");
  }
  const gruposVisiveis = filtro === "TODOS" ? grupos : grupos.filter((g) => g.tipo === filtro);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setBusca(""); setFiltro("TODOS"); } }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between gap-2 h-10 px-3 rounded-lg border border-border bg-card text-sm text-left transition-colors hover:border-border focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0",
              className,
            )}
          />
        }
      >
        <span className={cn("flex items-center gap-1.5 truncate", !selecionado && "text-muted-foreground")}>
          {selecionado ? selecionado.nome : (value === "" && tipo === null ? "Sem vínculo" : placeholder)}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-[460px] max-w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou CPF..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
          />
        </div>

        {/* Filtro por tipo (quando há mais de um grupo, ex.: saída) */}
        {grupos.length > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
            {([["TODOS", "Todos"], ...grupos.map((g) => [g.tipo, g.label] as [BenTipo, string])] as [BenTipo | "TODOS", string][]).map(([v, label]) => (
              <button
                key={v} type="button" onClick={() => setFiltro(v)}
                className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                  filtro === v ? "border-info bg-info/10 text-info font-medium" : "border-border text-muted-foreground hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Sem vínculo */}
        <button
          type="button" onClick={() => escolher(null, null)}
          className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm border-b border-border", tipo === null && value === "" ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
        >
          <Ban className="w-3.5 h-3.5 shrink-0" /> Sem vínculo
          {tipo === null && value === "" && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
        </button>

        <div className="max-h-64 overflow-y-auto pb-1">
          {(() => {
            const qDig = soDigitos(q);
            const casa = (i: BenOpt) => i.nome.toLowerCase().includes(q) || (qDig.length > 0 && soDigitos(i.doc ?? "").includes(qDig));
            if (gruposVisiveis.every((g) => g.itens.filter(casa).length === 0)) {
              return <p className="px-3 py-6 text-xs text-muted-foreground text-center">{busca ? "Nenhum beneficiário encontrado" : "Nenhum cadastro"}</p>;
            }
            return gruposVisiveis.map((g) => {
              const itens = g.itens.filter(casa);
              if (itens.length === 0) return null;
              const Icon = g.icon;
              return (
                <div key={g.tipo}>
                  <div className="sticky top-0 z-10 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted border-b border-border flex items-center gap-1.5">
                    <Icon className="w-3 h-3" /> {g.label}
                  </div>
                  {itens.map((i) => (
                    <button
                      key={i.id} type="button" onClick={() => escolher(g.tipo, i.id)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                        value === i.id && tipo === g.tipo ? "bg-info/10 text-info" : "hover:bg-muted text-foreground")}
                    >
                      <span className="flex-1 truncate leading-snug">
                        {i.nome}
                        {i.doc ? <span className="ml-1.5 text-xs text-muted-foreground font-mono">{i.doc}</span> : null}
                      </span>
                      {value === i.id && tipo === g.tipo && <Check className="w-3.5 h-3.5 text-info ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              );
            });
          })()}
        </div>
      </PopoverContent>
    </Popover>
  );
}
