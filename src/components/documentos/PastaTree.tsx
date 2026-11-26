"use client";

// Árvore de pastas do GED (expansível). Usada no painel do Acervo, no diálogo
// "Mover para" e no seletor de pasta do envio rápido.
import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, Lock, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PastaDTO } from "./comum";

export function filhasDe(pastas: PastaDTO[], paiId: string | null): PastaDTO[] {
  return pastas
    .filter((p) => p.paiId === paiId)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Ids da pasta e de todas as descendentes. */
export function descendentes(pastas: PastaDTO[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of pastas) if (p.paiId && out.has(p.paiId) && !out.has(p.id)) { out.add(p.id); mudou = true; }
  }
  return out;
}

/** Cadeia raiz → pasta (para breadcrumb e auto-expandir). */
export function ancestrais(pastas: PastaDTO[], id: string | null): PastaDTO[] {
  const porId = new Map(pastas.map((p) => [p.id, p]));
  const out: PastaDTO[] = [];
  let cur = id ? porId.get(id) : undefined;
  for (let g = 0; cur && g < 50; g++) {
    out.unshift(cur);
    cur = cur.paiId ? porId.get(cur.paiId) : undefined;
  }
  return out;
}

export default function PastaTree({
  pastas, selecionada, onSelecionar, desabilitadas, mostrarRaiz, rotuloRaiz = "Acervo", onSoltar, className,
}: {
  pastas: PastaDTO[];
  selecionada: string | null;
  onSelecionar: (id: string | null) => void;
  /** Ids que não podem ser escolhidos (ex.: a própria pasta ao mover). */
  desabilitadas?: Set<string>;
  /** Mostra a raiz ("Acervo") como opção. */
  mostrarRaiz?: boolean;
  rotuloRaiz?: string;
  /** Soltar item arrastado (documento/pasta) numa pasta da árvore. */
  onSoltar?: (pastaId: string, dt: DataTransfer) => void;
  className?: string;
}) {
  // Expande o caminho da selecionada de início.
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(ancestrais(pastas, selecionada).map((p) => p.id)));
  const [alvoDrop, setAlvoDrop] = useState<string | null>(null);
  const temFilhas = useMemo(() => new Set(pastas.map((p) => p.paiId).filter(Boolean) as string[]), [pastas]);

  function alternar(id: string) {
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function ramo(paiId: string | null, nivel: number): React.ReactNode {
    return (
      <>
        {filhasDe(pastas, paiId).map((p) => {
          const aberta = abertas.has(p.id);
          const desab = desabilitadas?.has(p.id);
          const sel = selecionada === p.id;
          return (
            <div key={p.id}>
              <div
                role="treeitem"
                aria-selected={sel}
                aria-expanded={temFilhas.has(p.id) ? aberta : undefined}
                onClick={() => { if (!desab) onSelecionar(p.id); }}
                onDoubleClick={() => temFilhas.has(p.id) && alternar(p.id)}
                onDragOver={onSoltar && !desab ? (e) => { e.preventDefault(); setAlvoDrop(p.id); } : undefined}
                onDragLeave={onSoltar ? () => setAlvoDrop((a) => (a === p.id ? null : a)) : undefined}
                onDrop={onSoltar && !desab ? (e) => { e.preventDefault(); e.stopPropagation(); setAlvoDrop(null); onSoltar(p.id, e.dataTransfer); } : undefined}
                className={cn(
                  "group flex items-center gap-1 h-8 pr-2 rounded-md text-sm select-none",
                  desab ? "text-muted-foreground/50 cursor-not-allowed" : "cursor-pointer text-foreground hover:bg-muted",
                  sel && "bg-primary/10 text-primary font-medium hover:bg-primary/15",
                  alvoDrop === p.id && "ring-2 ring-primary/50 bg-primary/10",
                  !p.ativo && "opacity-60",
                )}
                style={{ paddingLeft: 4 + nivel * 14 }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); alternar(p.id); }}
                  className={cn("w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground", !temFilhas.has(p.id) && "invisible")}
                  aria-label={aberta ? "Recolher" : "Expandir"}
                >
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", aberta && "rotate-90")} />
                </button>
                {sel || aberta ? <FolderOpen className="w-4 h-4 shrink-0 text-warning" /> : <Folder className="w-4 h-4 shrink-0 text-warning" />}
                <span className="truncate">{p.nome}</span>
                {p.sistema && <Lock className="w-3 h-3 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100" aria-label="Pasta do sistema" />}
              </div>
              {aberta && ramo(p.id, nivel + 1)}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div role="tree" className={cn("space-y-px", className)}>
      {mostrarRaiz && (
        <div
          role="treeitem"
          aria-selected={selecionada === null}
          onClick={() => !desabilitadas?.has("__raiz__") && onSelecionar(null)}
          className={cn(
            "flex items-center gap-1.5 h-8 px-2 rounded-md text-sm select-none",
            desabilitadas?.has("__raiz__") ? "text-muted-foreground/50 cursor-not-allowed" : "cursor-pointer text-foreground hover:bg-muted",
            selecionada === null && "bg-primary/10 text-primary font-medium",
          )}
        >
          <Home className="w-4 h-4 shrink-0" /> {rotuloRaiz}
        </div>
      )}
      {ramo(null, mostrarRaiz ? 1 : 0)}
    </div>
  );
}
