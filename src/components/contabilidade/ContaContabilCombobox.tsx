"use client";

import { useMemo, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Search, Check, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContaOpt = { id: string; codigo: string; nome: string; paiId?: string | null };

const rootCod = (codigo: string) => codigo.split(".")[0];
// Grupo = nível 2 (ex.: "1.1"); contas de 1º nível ficam no próprio grupo.
const grupoCod = (codigo: string) => {
  const segs = codigo.split(".");
  return segs.length >= 2 ? `${segs[0]}.${segs[1]}` : segs[0];
};

// Seletor de CONTA CONTÁBIL no estilo do BeneficiarioCombobox: busca + chips de
// filtro por nível 1 (Ativo, Passivo, PL, Resultado) + lista agrupada por nível 2
// (Ativo Circulante, Ativo Não Circulante…). Mostra o caminho "Pai › Conta".
export default function ContaContabilCombobox({
  value, onChange, contas, placeholder = "Abrir conta no razão...", className,
}: {
  value: string;
  onChange: (id: string) => void;
  contas: ContaOpt[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroRoot, setFiltroRoot] = useState<string>("TODOS");

  const byId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const byCodigo = useMemo(() => new Map(contas.map((c) => [c.codigo, c])), [contas]);

  // Chips de nível 1 (raízes), na ordem do plano de contas.
  const roots = useMemo(() => {
    const out: { codigo: string; nome: string }[] = [];
    const seen = new Set<string>();
    for (const c of contas) {
      const rc = rootCod(c.codigo);
      if (!seen.has(rc)) { seen.add(rc); out.push({ codigo: rc, nome: byCodigo.get(rc)?.nome ?? rc }); }
    }
    return out;
  }, [contas, byCodigo]);

  const q = busca.trim().toLowerCase();
  // Grupos (nível 2) preservando a ordem do plano de contas.
  const grupos = useMemo(() => {
    const map = new Map<string, { codigo: string; header: string; itens: ContaOpt[] }>();
    for (const c of contas) {
      if (filtroRoot !== "TODOS" && rootCod(c.codigo) !== filtroRoot) continue;
      if (q && !c.nome.toLowerCase().includes(q) && !c.codigo.includes(q)) continue;
      const gc = grupoCod(c.codigo);
      if (!map.has(gc)) map.set(gc, { codigo: gc, header: byCodigo.get(gc)?.nome ?? gc, itens: [] });
      map.get(gc)!.itens.push(c);
    }
    return Array.from(map.values());
  }, [contas, filtroRoot, q, byCodigo]);

  const selecionado = value ? byId.get(value) : null;
  const caminho = (c: ContaOpt) => {
    const pai = c.paiId ? byId.get(c.paiId) : undefined;
    return pai ? `${pai.nome} › ${c.nome}` : c.nome;
  };

  function escolher(id: string) {
    onChange(id); setOpen(false); setBusca(""); setFiltroRoot("TODOS");
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setBusca(""); setFiltroRoot("TODOS"); } }}>
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
          {selecionado ? (
            <><span className="font-mono text-xs text-muted-foreground">{selecionado.codigo}</span> {caminho(selecionado)}</>
          ) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-[480px] max-w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou nome..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
          />
        </div>

        {/* Filtro por grupo de nível 1 (Ativo, Passivo, PL, Resultado) */}
        {roots.length > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border flex-wrap">
            {[{ codigo: "TODOS", nome: "Todos" }, ...roots].map((r) => (
              <button
                key={r.codigo} type="button" onClick={() => setFiltroRoot(r.codigo)}
                className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors",
                  filtroRoot === r.codigo ? "border-info bg-info/10 text-info font-medium" : "border-border text-muted-foreground hover:bg-muted")}
              >
                {r.nome}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto pb-1">
          {grupos.length === 0 ? (
            <p className="px-3 py-6 text-xs text-muted-foreground text-center">{busca ? "Nenhuma conta encontrada" : "Nenhuma conta"}</p>
          ) : grupos.map((g) => (
            <div key={g.codigo}>
              <div className="sticky top-0 z-10 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted border-b border-border flex items-center gap-1.5">
                <FolderTree className="w-3 h-3" /> <span className="font-mono">{g.codigo}</span> {g.header}
              </div>
              {g.itens.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => escolher(c.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                    value === c.id ? "bg-info/10 text-info" : "hover:bg-muted text-foreground")}
                >
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">{c.codigo}</span>
                  <span className="flex-1 truncate leading-snug">{c.nome}</span>
                  {value === c.id && <Check className="w-3.5 h-3.5 text-info ml-auto shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
