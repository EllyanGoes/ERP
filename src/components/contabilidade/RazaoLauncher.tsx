"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FolderTree, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/shared/DateRangePicker";

export type ContaOpt = { id: string; codigo: string; nome: string; paiId?: string | null };

const rootCod = (codigo: string) => codigo.split(".")[0];
const grupoCod = (codigo: string) => {
  const segs = codigo.split(".");
  return segs.length >= 2 ? `${segs[0]}.${segs[1]}` : segs[0];
};

// Tela de abertura do Razão: lança contas em ABAS. Busca + filtro por nível 1
// (Ativo, Passivo, PL, Resultado) + lista agrupada por nível 2 (Ativo Circulante,
// Ativo Não Circulante…). Cada conta é um link → abre a conta em uma aba própria.
export default function RazaoLauncher({ contas, range }: { contas: ContaOpt[]; range: DateRange }) {
  const [busca, setBusca] = useState("");
  const [filtroRoot, setFiltroRoot] = useState<string>("TODOS");
  const byCodigo = useMemo(() => new Map(contas.map((c) => [c.codigo, c])), [contas]);
  const qs = `?from=${range.from}&to=${range.to}`;

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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Abrir uma conta no razão</span>
        <span className="text-xs text-muted-foreground ml-1">— cada conta abre em uma aba</span>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código ou nome..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
        />
      </div>

      {roots.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border flex-wrap">
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

      <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
        {grupos.length === 0 ? (
          <p className="px-4 py-10 text-sm text-muted-foreground text-center">{busca ? "Nenhuma conta encontrada" : "Nenhuma conta"}</p>
        ) : grupos.map((g) => (
          <div key={g.codigo}>
            <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted border-b border-border flex items-center gap-1.5">
              <FolderTree className="w-3 h-3" /> <span className="font-mono">{g.codigo}</span> {g.header}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {g.itens.map((c) => (
                <Link
                  key={c.id}
                  href={`/contabilidade/razao/${c.id}${qs}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted border-b border-gray-50 transition-colors"
                  title="Abrir em uma aba"
                >
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">{c.codigo}</span>
                  <span className="truncate text-foreground">{c.nome}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
