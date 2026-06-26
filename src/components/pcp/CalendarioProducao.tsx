"use client";

import { useEffect, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, isToday, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Calendário mensal de produção: marca com check verde os dias que tiveram produção
// no fluxo (≥1 OP apontada). Clicar num dia filtra o board (onSelect).
export default function CalendarioProducao({ fluxoId, value, onSelect }: { fluxoId: string; value: string; onSelect: (d: string) => void }) {
  const [mesRef, setMesRef] = useState(() => startOfMonth(value ? new Date(`${value}T00:00:00`) : new Date()));
  const [dias, setDias] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!fluxoId) { setDias(new Set()); return; }
    const ano = mesRef.getFullYear(), mes = mesRef.getMonth() + 1;
    fetch(`/api/pcp/ordens/dias-producao?fluxoId=${fluxoId}&ano=${ano}&mes=${mes}`)
      .then((r) => r.json()).then((j) => setDias(new Set(j.dias ?? []))).catch(() => setDias(new Set()));
  }, [fluxoId, mesRef]);

  const ini = startOfMonth(mesRef);
  const days = eachDayOfInterval({ start: ini, end: endOfMonth(mesRef) });
  const leading = getDay(ini); // 0 = Domingo
  const selDate = value ? new Date(`${value}T00:00:00`) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-3 w-72 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMesRef(addMonths(mesRef, -1))} className="p-1 rounded hover:bg-muted text-muted-foreground"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium capitalize">{format(mesRef, "MMMM yyyy", { locale: ptBR })}</span>
        <button onClick={() => setMesRef(addMonths(mesRef, 1))} className="p-1 rounded hover:bg-muted text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: leading }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((dd) => {
          const key = format(dd, "yyyy-MM-dd");
          const temProd = dias.has(key);
          const sel = selDate != null && isSameDay(dd, selDate);
          const hoje = isToday(dd);
          return (
            <button key={key} type="button" onClick={() => onSelect(key)}
              className={cn("relative aspect-square rounded-full text-xs flex items-center justify-center transition-colors",
                sel ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900" : temProd ? "bg-muted text-foreground" : "text-foreground hover:bg-muted",
                hoje && !sel && "ring-1 ring-cyan-500")}>
              {dd.getDate()}
              {temProd && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
