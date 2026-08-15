"use client";

// Visão Calendário — grade mensal com as tarefas no dia do PRAZO.
// Arrastar um cartão para outro dia muda o prazo.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TarefaResumoDTO, diaPrazo } from "./tipos";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarioView({
  tarefas, podeEditar, onAbrirTarefa, onRecarregar,
}: {
  tarefas: TarefaResumoDTO[];
  podeEditar: boolean;
  onAbrirTarefa: (id: string) => void;
  onRecarregar: () => void;
}) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDia, setDropDia] = useState<string | null>(null);

  const primeiro = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiro);
  inicioGrade.setDate(1 - primeiro.getDay());
  const dias: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setDate(inicioGrade.getDate() + i);
    return d;
  });

  const porDia = new Map<string, TarefaResumoDTO[]>();
  for (const t of tarefas) {
    if (!t.prazo) continue;
    const k = chaveDia(diaPrazo(t.prazo));
    porDia.set(k, [...(porDia.get(k) ?? []), t]);
  }

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  async function soltar(dia: Date) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null); setDropDia(null);
    await fetch(`/api/projetos/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prazo: chaveDia(dia) }),
    }).catch(() => {});
    onRecarregar();
  }

  const chaveHoje = chaveDia(hoje);

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => navegar(-1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
        <span className="font-semibold text-foreground capitalize min-w-40 text-center">
          {new Date(ano, mes).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => navegar(1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }} className="text-xs text-info hover:underline">Hoje</button>
        {podeEditar && <span className="text-xs text-muted-foreground ml-auto">Arraste um cartão para mudar o prazo</span>}
      </div>

      <div className="grid grid-cols-7 border border-border rounded-xl overflow-hidden bg-card">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted border-b border-border text-center">{d}</div>
        ))}
        {dias.map((dia) => {
          const k = chaveDia(dia);
          const doMes = dia.getMonth() === mes;
          const lista = porDia.get(k) ?? [];
          return (
            <div
              key={k}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropDia(k); } }}
              onDragLeave={() => { if (dropDia === k) setDropDia(null); }}
              onDrop={(e) => { e.preventDefault(); soltar(dia); }}
              className={cn(
                "min-h-24 border-b border-r border-border p-1 align-top",
                !doMes && "bg-muted/40",
                dropDia === k && "bg-info/10 ring-1 ring-inset ring-info/40"
              )}
            >
              <span className={cn(
                "inline-flex items-center justify-center text-xs w-5 h-5 rounded-full mb-0.5",
                k === chaveHoje ? "bg-blue-600 text-white font-bold" : doMes ? "text-foreground" : "text-muted-foreground/50"
              )}>
                {dia.getDate()}
              </span>
              <div className="space-y-0.5">
                {lista.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    draggable={podeEditar}
                    // setData é obrigatório p/ o drag iniciar em alguns navegadores
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setDropDia(null); }}
                    onClick={() => onAbrirTarefa(t.id)}
                    className={cn(
                      "text-[11px] leading-tight px-1.5 py-1 rounded-md cursor-pointer truncate border",
                      t.concluidaEm
                        ? "bg-muted text-muted-foreground line-through border-transparent"
                        : "bg-card text-foreground border-border hover:border-blue-400",
                      dragId === t.id && "opacity-40"
                    )}
                    title={t.titulo}
                  >
                    {t.etiquetas[0] && <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: t.etiquetas[0].cor }} />}
                    {t.titulo}
                  </div>
                ))}
                {lista.length > 4 && <p className="text-[10px] text-muted-foreground px-1">+{lista.length - 4}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
