"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

interface Estado { id: string; codigo: string; nome: string; ativo: boolean; }

// Multi-select (chips) dos estados de WIP que um produto atende.
export default function EstadosWipMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [estados, setEstados] = useState<Estado[]>([]);
  useEffect(() => {
    fetch("/api/pcp/estados-wip")
      .then((r) => r.json())
      .then((j) => setEstados((j.data ?? []).filter((e: Estado) => e.ativo)))
      .catch(() => {});
  }, []);

  function toggle(c: string) {
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  }

  if (estados.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Nenhum estado cadastrado. Configure em PCP → Estados de WIP.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {estados.map((e) => {
        const on = value.includes(e.codigo);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => toggle(e.codigo)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {on && <Check className="w-3 h-3" />}
            {e.nome}
          </button>
        );
      })}
    </div>
  );
}
