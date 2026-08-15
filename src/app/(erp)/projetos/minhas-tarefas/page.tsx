"use client";

// Minhas Tarefas — caixa pessoal cruzando todos os projetos do usuário.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle, CalendarDays, ListTodo, Inbox } from "lucide-react";
import { EtiquetaChip, PrioridadeBadge } from "@/components/projetos/comum";
import { EtiquetaDTO, prazoInfo, diaPrazo } from "@/components/projetos/tipos";

type MinhaTarefaDTO = {
  id: string;
  titulo: string;
  prioridade: string;
  prazo: string | null;
  dataInicio: string | null;
  projeto: { id: string; nome: string; cor: string | null };
  coluna: { nome: string };
  etiquetas: EtiquetaDTO[];
};

export default function MinhasTarefasPage() {
  const router = useRouter();
  useTabTitle("Minhas Tarefas");

  const [tarefas, setTarefas] = useState<MinhaTarefaDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projetos/minhas-tarefas")
      .then((r) => r.json())
      .then((j) => setTarefas(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() + 7);

  const grupos: { titulo: string; icone: React.ReactNode; cls?: string; lista: MinhaTarefaDTO[] }[] = [
    {
      titulo: "Atrasadas",
      icone: <AlertTriangle className="w-4 h-4" />,
      cls: "text-danger",
      lista: tarefas.filter((t) => t.prazo && diaPrazo(t.prazo) < hoje),
    },
    {
      titulo: "Hoje",
      icone: <CalendarDays className="w-4 h-4" />,
      cls: "text-warning",
      lista: tarefas.filter((t) => t.prazo && diaPrazo(t.prazo).getTime() === hoje.getTime()),
    },
    {
      titulo: "Esta semana",
      icone: <ListTodo className="w-4 h-4" />,
      lista: tarefas.filter((t) => {
        if (!t.prazo) return false;
        const d = diaPrazo(t.prazo);
        return d > hoje && d <= fimSemana;
      }),
    },
    {
      titulo: "Mais adiante / sem prazo",
      icone: <Inbox className="w-4 h-4" />,
      lista: tarefas.filter((t) => !t.prazo || diaPrazo(t.prazo) > fimSemana),
    },
  ];

  return (
    <div>
      <PageHeader title="Minhas Tarefas" breadcrumbs={[{ label: "Projetos", href: "/projetos" }, { label: "Minhas Tarefas" }]} />
      <div className="px-8 pb-8 space-y-6 max-w-4xl">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : tarefas.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma tarefa atribuída a você. Bom trabalho! 🎉</p>
          </div>
        ) : (
          grupos.map((g) =>
            g.lista.length === 0 ? null : (
              <div key={g.titulo}>
                <div className={cn("flex items-center gap-2 mb-2 text-sm font-semibold uppercase tracking-wide", g.cls ?? "text-muted-foreground")}>
                  {g.icone} {g.titulo} <span className="font-normal">({g.lista.length})</span>
                </div>
                <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {g.lista.map((t) => {
                    const prazo = prazoInfo(t.prazo, false);
                    return (
                      <button
                        key={t.id}
                        onClick={() => router.push(`/projetos/${t.projeto.id}?tarefa=${t.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.projeto.cor ?? "#64748b" }} title={t.projeto.nome} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{t.titulo}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {t.projeto.nome} · {t.coluna.nome}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.etiquetas.slice(0, 2).map((e) => <EtiquetaChip key={e.id} etiqueta={e} small />)}
                          <PrioridadeBadge prioridade={t.prioridade} small />
                          {prazo && <span className={cn("text-xs whitespace-nowrap", prazo.cls)}>{prazo.label}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
