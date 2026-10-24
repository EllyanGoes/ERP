"use client";

// Visão Calendário das OS — grade mensal (mesmo desenho do calendário de
// Projetos) com cada OS no dia da programação (ou do prazo, se não programada).
// Atrasadas em vermelho; clicar abre o cartão.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dataReferenciaOS, osAtrasada, type OSResumo } from "./os-quadro";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function OSCalendarioView({ ordens, onAbrir }: { ordens: OSResumo[]; onAbrir: (id: string) => void }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());

  const primeiro = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiro);
  inicioGrade.setDate(1 - primeiro.getDay());
  const dias: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setDate(inicioGrade.getDate() + i);
    return d;
  });

  const porDia = new Map<string, OSResumo[]>();
  let semData = 0;
  for (const o of ordens) {
    const ref = dataReferenciaOS(o);
    if (!ref) { if (!["CONCLUIDA", "CANCELADA"].includes(o.status)) semData++; continue; }
    const k = chaveDia(new Date(ref));
    porDia.set(k, [...(porDia.get(k) ?? []), o]);
  }

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
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
        {semData > 0 && <span className="text-xs text-muted-foreground ml-auto">{semData} OS em aberto sem programação nem prazo (veja no Quadro ou na Lista)</span>}
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
            <div key={k} className={cn("min-h-24 border-b border-r border-border p-1 align-top", !doMes && "bg-muted/40")}>
              <span className={cn(
                "inline-flex items-center justify-center text-xs w-5 h-5 rounded-full mb-0.5",
                k === chaveHoje ? "bg-blue-600 text-white font-bold" : doMes ? "text-foreground" : "text-muted-foreground/50"
              )}>
                {dia.getDate()}
              </span>
              <div className="space-y-0.5">
                {lista.slice(0, 4).map((o) => {
                  const fechada = ["CONCLUIDA", "CANCELADA", "ENCERRADA"].includes(o.status);
                  const atrasada = osAtrasada(o);
                  return (
                    <div
                      key={o.id}
                      onClick={() => onAbrir(o.id)}
                      className={cn(
                        "text-[11px] leading-tight px-1.5 py-1 rounded-md cursor-pointer truncate border",
                        fechada ? "bg-muted text-muted-foreground border-transparent" + (o.status === "CONCLUIDA" ? " line-through" : "")
                          : atrasada ? "bg-danger/10 text-danger border-danger/30 hover:border-danger"
                          : "bg-card text-foreground border-border hover:border-blue-400"
                      )}
                      title={`${o.numero} — ${o.ativo ? `${o.ativo.tag} ${o.ativo.nome}` : o.localTexto ?? ""}\n${o.descricao}`}
                    >
                      {o.programadaPara && <span className="opacity-70 mr-1 tabular-nums">{new Date(o.programadaPara).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
                      <span className="font-medium">{o.numero}</span> {o.ativo?.tag ?? o.descricao}
                    </div>
                  );
                })}
                {lista.length > 4 && <p className="text-[10px] text-muted-foreground px-1">+{lista.length - 4}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
