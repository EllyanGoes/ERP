"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ModuloDef, type Acao, getModuloPermissoes } from "@/lib/modules";

const ACAO_LABEL: Record<Acao, string> = {
  ver:     "Ver",
  inserir: "Inserir",
  editar:  "Editar",
  excluir: "Excluir",
};

const ACAO_COLOR: Record<Acao, string> = {
  ver:     "bg-sky-50 text-sky-700 border-sky-200",
  inserir: "bg-success/10 text-success border-success/30",
  editar:  "bg-warning/10 text-warning border-warning/30",
  excluir: "bg-danger/10 text-danger border-danger/30",
};

interface Props {
  mod: ModuloDef;
  permissoes: string[];
  onChange: (perms: string[]) => void;
  defaultExpanded?: boolean;
}

export default function ModuloRow({ mod, permissoes, onChange, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const modPerms    = getModuloPermissoes(mod.key);
  const modChecked  = modPerms.filter((p) => permissoes.includes(p));
  const allChecked  = modChecked.length === modPerms.length;
  const someChecked = modChecked.length > 0 && !allChecked;

  function toggleModule() {
    if (allChecked) {
      onChange(permissoes.filter((p) => !p.startsWith(mod.key + ".")));
    } else {
      const without = permissoes.filter((p) => !p.startsWith(mod.key + "."));
      onChange([...without, ...modPerms]);
    }
  }

  function togglePerm(perm: string) {
    if (permissoes.includes(perm)) {
      onChange(permissoes.filter((p) => p !== perm));
    } else {
      onChange([...permissoes, perm]);
    }
  }

  function toggleRecurso(modKey: string, recursoKey: string, acoes: Acao[]) {
    const recursoPerms = acoes.map((a) => `${modKey}.${recursoKey}.${a}`);
    const allHave = recursoPerms.every((p) => permissoes.includes(p));
    if (allHave) {
      onChange(permissoes.filter((p) => !recursoPerms.includes(p)));
    } else {
      const without = permissoes.filter((p) => !recursoPerms.includes(p));
      onChange([...without, ...recursoPerms]);
    }
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Module header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted cursor-pointer select-none hover:bg-muted transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div
          onClick={(e) => { e.stopPropagation(); toggleModule(); }}
          className={cn(
            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors",
            allChecked  ? "bg-blue-600 border-blue-600"
            : someChecked ? "bg-blue-200 border-blue-400"
            : "border-border bg-card"
          )}
        >
          {allChecked  && <Check className="w-2.5 h-2.5 text-white" />}
          {someChecked && !allChecked && <div className="w-2 h-0.5 bg-blue-600 rounded" />}
        </div>

        <span className="flex-1 text-sm font-semibold text-foreground">{mod.label}</span>
        <span className="text-xs text-muted-foreground mr-1">{mod.group}</span>
        {expanded
          ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        }
      </div>

      {expanded && (
        <div className="divide-y divide-border">
          {mod.recursos.map((recurso) => {
            const recursoPerms      = recurso.acoes.map((a) => `${mod.key}.${recurso.key}.${a}`);
            const allRecurso        = recursoPerms.every((p) => permissoes.includes(p));
            const someRecurso       = recursoPerms.some((p) => permissoes.includes(p));

            return (
              <div key={recurso.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors">
                {/* Recurso checkbox */}
                <div
                  onClick={() => toggleRecurso(mod.key, recurso.key, recurso.acoes)}
                  className={cn(
                    "w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer ml-2 transition-colors",
                    allRecurso  ? "bg-blue-500 border-blue-500"
                    : someRecurso ? "bg-info/15 border-blue-300"
                    : "border-border bg-card"
                  )}
                >
                  {allRecurso  && <Check className="w-2 h-2 text-white" />}
                  {someRecurso && !allRecurso && <div className="w-1.5 h-0.5 bg-blue-500 rounded" />}
                </div>

                <span className="flex-1 text-xs font-medium text-foreground">{recurso.label}</span>

                {/* Action chips */}
                <div className="flex items-center gap-1">
                  {recurso.acoes.map((acao) => {
                    const perm    = `${mod.key}.${recurso.key}.${acao}`;
                    const checked = permissoes.includes(perm);
                    return (
                      <button
                        key={acao}
                        type="button"
                        onClick={() => togglePerm(perm)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold border transition-all",
                          checked
                            ? ACAO_COLOR[acao]
                            : "bg-card text-muted-foreground/60 border-border hover:border-border hover:text-muted-foreground"
                        )}
                      >
                        {ACAO_LABEL[acao]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
