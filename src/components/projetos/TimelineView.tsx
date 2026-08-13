"use client";

// Linha do tempo — barras dataInicio→prazo agrupadas por responsável (Gantt leve).
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AvatarUsuario } from "./comum";
import { TarefaResumoDTO } from "./tipos";

const DIA_MS = 86_400_000;

export default function TimelineView({
  tarefas, onAbrirTarefa,
}: {
  tarefas: TarefaResumoDTO[];
  onAbrirTarefa: (id: string) => void;
}) {
  const [zoom, setZoom] = useState<"semana" | "mes">("mes");
  const diaPx = zoom === "semana" ? 36 : 14;

  // Só tarefas com alguma data; sem dataInicio assume o próprio prazo (1 dia).
  const comData = tarefas
    .filter((t) => t.prazo || t.dataInicio)
    .map((t) => {
      const fim = new Date(t.prazo ?? t.dataInicio!);
      const inicio = new Date(t.dataInicio ?? t.prazo!);
      return { ...t, inicio: inicio < fim ? inicio : fim, fim: fim > inicio ? fim : inicio };
    });

  if (comData.length === 0) {
    return <p className="text-sm text-muted-foreground italic text-center py-16">Nenhuma tarefa com datas — defina início/prazo nos cartões.</p>;
  }

  const minData = new Date(Math.min(...comData.map((t) => t.inicio.getTime())));
  const maxData = new Date(Math.max(...comData.map((t) => t.fim.getTime())));
  minData.setDate(minData.getDate() - 3);
  maxData.setDate(maxData.getDate() + 7);
  const totalDias = Math.max(14, Math.ceil((maxData.getTime() - minData.getTime()) / DIA_MS));
  const hoje = new Date();
  const offHoje = Math.floor((hoje.getTime() - minData.getTime()) / DIA_MS);

  // Agrupa por responsável
  const grupos = new Map<string, { nome: string; tarefas: typeof comData }>();
  for (const t of comData) {
    const k = t.responsavel?.id ?? "__sem__";
    const g = grupos.get(k) ?? { nome: t.responsavel?.nome ?? "Sem responsável", tarefas: [] };
    g.tarefas.push(t);
    grupos.set(k, g);
  }

  // Marcas de mês no cabeçalho
  const meses: { label: string; off: number; dias: number }[] = [];
  const cursor = new Date(minData.getFullYear(), minData.getMonth(), 1);
  while (cursor <= maxData) {
    const inicioMes = new Date(Math.max(cursor.getTime(), minData.getTime()));
    const fimMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const fim = new Date(Math.min(fimMes.getTime(), maxData.getTime()));
    meses.push({
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      off: Math.floor((inicioMes.getTime() - minData.getTime()) / DIA_MS),
      dias: Math.floor((fim.getTime() - inicioMes.getTime()) / DIA_MS) + 1,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(["semana", "mes"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn("px-2.5 py-1.5 capitalize", zoom === z ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              {z === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{comData.length} tarefa{comData.length > 1 ? "s" : ""} com datas</span>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-x-auto">
        <div style={{ minWidth: 220 + totalDias * diaPx }}>
          {/* Cabeçalho de meses */}
          <div className="flex border-b border-border bg-muted sticky top-0">
            <div className="w-56 shrink-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground border-r border-border">Responsável / tarefa</div>
            <div className="relative flex-1" style={{ height: 26 }}>
              {meses.map((m, i) => (
                <span
                  key={i}
                  className="absolute top-0 h-full flex items-center px-2 text-xs font-medium text-muted-foreground border-r border-border/60 capitalize"
                  style={{ left: m.off * diaPx, width: m.dias * diaPx }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {Array.from(grupos.entries()).map(([k, g]) => (
            <div key={k}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border/60">
                {k !== "__sem__" && <AvatarUsuario nome={g.nome} size="sm" />}
                <span className="text-xs font-semibold text-foreground">{g.nome}</span>
                <span className="text-[11px] text-muted-foreground">{g.tarefas.length}</span>
              </div>
              {g.tarefas.sort((a, b) => a.inicio.getTime() - b.inicio.getTime()).map((t) => {
                const off = Math.floor((t.inicio.getTime() - minData.getTime()) / DIA_MS);
                const dur = Math.max(1, Math.floor((t.fim.getTime() - t.inicio.getTime()) / DIA_MS) + 1);
                const atrasada = !t.concluidaEm && t.fim < hoje;
                return (
                  <div key={t.id} className="flex border-b border-border/40 hover:bg-muted/40">
                    <div className="w-56 shrink-0 px-3 py-1.5 text-xs text-foreground truncate border-r border-border cursor-pointer" onClick={() => onAbrirTarefa(t.id)} title={t.titulo}>
                      {t.titulo}
                    </div>
                    <div className="relative flex-1" style={{ height: 28 }}>
                      {/* linha de hoje */}
                      {offHoje >= 0 && offHoje <= totalDias && (
                        <span className="absolute top-0 bottom-0 w-px bg-danger/50" style={{ left: offHoje * diaPx }} />
                      )}
                      <button
                        onClick={() => onAbrirTarefa(t.id)}
                        className={cn(
                          "absolute top-1 h-5 rounded-md text-[10px] text-white px-1.5 truncate text-left",
                          t.concluidaEm ? "bg-success/70" : atrasada ? "bg-danger/80" : "bg-blue-500/85 hover:bg-blue-600"
                        )}
                        style={{ left: off * diaPx, width: Math.max(diaPx, dur * diaPx) }}
                        title={`${t.titulo} — ${t.inicio.toLocaleDateString("pt-BR")} → ${t.fim.toLocaleDateString("pt-BR")}`}
                      >
                        {dur * diaPx > 60 ? t.titulo : ""}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
