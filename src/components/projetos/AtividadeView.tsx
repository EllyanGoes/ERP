"use client";

// Feed de atividade do projeto (paginado por cursor).
import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarUsuario } from "./comum";

type AtividadeDTO = {
  id: string;
  tipo: string;
  detalhe: unknown;
  createdAt: string;
  autor: { id: string; nome: string };
  tarefa: { id: string; titulo: string } | null;
};

const LABEL: Record<string, string> = {
  CRIOU_PROJETO: "criou o projeto", CRIOU: "criou", MOVEU: "moveu", CONCLUIU: "concluiu",
  REABRIU: "reabriu", ATRIBUIU: "alterou o responsável de", COMENTOU: "comentou em",
  PRAZO: "alterou o prazo de", ARQUIVOU: "arquivou", DESARQUIVOU: "desarquivou", EXCLUIU: "excluiu",
};

export default function AtividadeView({ projetoId, onAbrirTarefa }: { projetoId: string; onAbrirTarefa: (id: string) => void }) {
  const [itens, setItens] = useState<AtividadeDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (apos?: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projetos/${projetoId}/atividade${apos ? `?cursor=${apos}` : ""}`);
      const json = await res.json();
      if (res.ok) {
        setItens((prev) => (apos ? [...prev, ...json.data] : json.data));
        setCursor(json.nextCursor);
        setTemMais(!!json.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }, [projetoId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="px-6 py-4 max-w-3xl">
      <div className="space-y-3">
        {itens.map((a) => {
          const d = a.detalhe as { de?: string; para?: string; titulo?: string } | null;
          return (
            <div key={a.id} className="flex gap-2.5 items-start">
              <AvatarUsuario nome={a.autor.nome} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{a.autor.nome}</span>{" "}
                  <span className="text-muted-foreground">{LABEL[a.tipo] ?? a.tipo.toLowerCase()}</span>{" "}
                  {a.tarefa ? (
                    <button onClick={() => onAbrirTarefa(a.tarefa!.id)} className="text-info hover:underline font-medium">
                      {a.tarefa.titulo}
                    </button>
                  ) : d?.titulo ? (
                    <span className="font-medium">{d.titulo}</span>
                  ) : null}
                  {d?.de && d?.para && <span className="text-muted-foreground"> — {d.de} → {d.para}</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
      {!loading && itens.length === 0 && <p className="text-sm text-muted-foreground italic text-center py-12">Nenhuma atividade ainda.</p>}
      {temMais && !loading && (
        <div className="flex justify-center mt-4">
          <Button variant="outline" size="sm" onClick={() => load(cursor)}>Carregar mais</Button>
        </div>
      )}
    </div>
  );
}
