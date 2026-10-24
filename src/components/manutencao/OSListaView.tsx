"use client";

// Visão Lista das OS — a tabela operacional, com as situações (Em aberto, A
// validar, Concluídas, Canceladas, Todas). Clicar abre o cartão por cima.
import { cn } from "@/lib/utils";
import { Loader2, Timer } from "lucide-react";
import { PrioridadeTxt, StatusOSBadge, brl, fmtData } from "./comum";
import { custoTotalOS, osAtrasada, type OSResumo } from "./os-quadro";

export const SITUACOES_OS = [
  { value: "abertas", label: "Em aberto" },
  { value: "encerradas", label: "A validar" },
  { value: "concluidas", label: "Concluídas" },
  { value: "canceladas", label: "Canceladas" },
  { value: "todas", label: "Todas" },
];

export default function OSListaView({ ordens, loading, situacao, onSituacao, onAbrir }: {
  ordens: OSResumo[]; loading: boolean; situacao: string; onSituacao: (s: string) => void; onAbrir: (id: string) => void;
}) {
  return (
    <div className="px-6 py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {SITUACOES_OS.map((s) => (
          <button key={s.value} onClick={() => onSituacao(s.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", situacao === s.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{s.label}</button>
        ))}
        {!loading && <span className="text-xs text-muted-foreground ml-auto">{ordens.length} OS</span>}
      </div>
      {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr>
              <th className="text-left px-4 py-2 font-semibold">OS</th><th className="text-left px-3 py-2 font-semibold">Ativo</th><th className="text-left px-3 py-2 font-semibold">Descrição</th>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th><th className="text-left px-3 py-2 font-semibold">Prioridade</th><th className="text-left px-3 py-2 font-semibold">Equipe</th>
              <th className="text-left px-3 py-2 font-semibold">Programada</th><th className="text-left px-3 py-2 font-semibold">Status</th><th className="text-right px-4 py-2 font-semibold">Custo</th>
            </tr></thead>
            <tbody>
              {ordens.map((o) => {
                const atrasada = osAtrasada(o);
                return (
                  <tr key={o.id} onClick={() => onAbrir(o.id)} className="border-t border-border/60 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{o.numero}{o.planoId && <span className="ml-1 text-[10px] text-info">plano</span>}</td>
                    <td className="px-3 py-2 text-foreground">
                      {o.ativo ? <><span className="text-xs text-muted-foreground">{o.ativo.tag}</span> {o.ativo.nome}</> : <span className="text-muted-foreground">{o.localTexto ?? "—"}</span>}
                      {o.paradaInicio && !o.paradaFim && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">parado</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[22rem] truncate" title={o.descricao}>{o.descricao}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={o.tipo.nome}>{o.tipo.sigla}</td>
                    <td className="px-3 py-2"><PrioridadeTxt p={o.prioridade} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{o.equipe?.nome ?? "—"}</td>
                    <td className={cn("px-3 py-2 text-xs whitespace-nowrap", atrasada ? "text-danger font-medium" : "text-muted-foreground")}>{fmtData(o.prazo ?? o.programadaPara)}{atrasada && " · atrasada"}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1.5"><StatusOSBadge s={o.status} />{o.apontamentos.length > 0 && <span title={`Em execução: ${o.apontamentos.map((a) => a.nome).join(", ")}`}><Timer className="w-3.5 h-3.5 text-warning" /></span>}</div></td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">{brl(custoTotalOS(o))}</td>
                  </tr>
                );
              })}
              {ordens.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma OS nesta situação.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
