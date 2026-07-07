"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, RefreshCw, Pencil, LineChart, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoFunilNo } from "@/lib/validations/marketing-funil";
import { NODE_STYLE, PALETTE } from "./nodes";
import type { ModoCanvas } from "./types";

export type StatusFunil = "RASCUNHO" | "ATIVO" | "ARQUIVADO";

interface Props {
  nome: string;
  status: StatusFunil;
  modo: ModoCanvas;
  dirty: boolean;
  saving: boolean;
  carregandoMetricas: boolean;
  msg: { kind: "ok" | "err"; text: string } | null;
  onRenomear: (nome: string) => void;
  onStatus: (status: StatusFunil) => void;
  onModo: (modo: ModoCanvas) => void;
  onAtualizarMetricas: () => void;
  onAddNode: (tipo: TipoFunilNo) => void;
  onSalvar: () => void;
  /** Slot p/ os DatePickers de período (evita importar DatePicker aqui e no canvas). */
  periodoSlot?: React.ReactNode;
}

export default function Toolbar({
  nome,
  status,
  modo,
  dirty,
  saving,
  carregandoMetricas,
  msg,
  onRenomear,
  onStatus,
  onModo,
  onAtualizarMetricas,
  onAddNode,
  onSalvar,
  periodoSlot,
}: Props) {
  const router = useRouter();
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeLocal, setNomeLocal] = useState(nome);

  function confirmarNome() {
    setEditandoNome(false);
    const novo = nomeLocal.trim();
    if (!novo || novo === nome) {
      setNomeLocal(nome);
      return;
    }
    onRenomear(novo);
  }

  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
      <button onClick={() => router.push("/marketing/funis")} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title="Voltar para a lista">
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Nome + status */}
      <div className="flex items-center gap-2 min-w-0">
        {editandoNome ? (
          <input
            autoFocus
            value={nomeLocal}
            onChange={(e) => setNomeLocal(e.target.value)}
            onBlur={confirmarNome}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNome();
              else if (e.key === "Escape") { setNomeLocal(nome); setEditandoNome(false); }
            }}
            className="text-sm font-semibold text-foreground bg-transparent border-b border-violet-500 outline-none w-48"
          />
        ) : (
          <button
            onClick={() => { setNomeLocal(nome); setEditandoNome(true); }}
            title="Clique para renomear"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-violet-600 dark:hover:text-violet-400 max-w-[14rem]"
          >
            <span className="truncate">{nome}</span>
            <Pencil className="w-3 h-3 text-muted-foreground/50 group-hover:text-violet-500 shrink-0" />
          </button>
        )}
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value as StatusFunil)}
          className={cn(
            "text-[11px] font-medium rounded-full border px-2 py-0.5 bg-card focus:outline-none",
            status === "ATIVO" && "border-emerald-300 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-400",
            status === "RASCUNHO" && "border-border text-muted-foreground",
            status === "ARQUIVADO" && "border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-400",
          )}
          title="Status do funil"
        >
          <option value="RASCUNHO">Rascunho</option>
          <option value="ATIVO">Ativo</option>
          <option value="ARQUIVADO">Arquivado</option>
        </select>
      </div>

      {/* Modos */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        <button
          onClick={() => onModo("desenho")}
          className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md", modo === "desenho" ? "bg-violet-600 text-white font-medium" : "text-muted-foreground hover:bg-muted")}
        >
          <Pencil className="w-3 h-3" /> Desenho
        </button>
        <button
          onClick={() => onModo("analise")}
          className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md", modo === "analise" ? "bg-violet-600 text-white font-medium" : "text-muted-foreground hover:bg-muted")}
        >
          <LineChart className="w-3 h-3" /> Análise
        </button>
        <button
          disabled
          title="Em breve — Fase 2"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md text-muted-foreground/50 cursor-not-allowed"
        >
          <TrendingUp className="w-3 h-3" /> Forecast
        </button>
      </div>

      {/* Paleta (desenho) / período (análise) */}
      {modo === "desenho" ? (
        <div className="flex items-center gap-1">
          {PALETTE.map((p) => {
            const st = NODE_STYLE[p.tipo];
            return (
              <button
                key={p.tipo}
                onClick={() => onAddNode(p.tipo)}
                title={`Adicionar ${st.label.toLowerCase()}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground hover:border-violet-300 hover:bg-muted"
              >
                <span className={cn("flex w-5 h-5 items-center justify-center rounded", st.chipBg, st.chipText)}>
                  <st.icon className="w-3 h-3" />
                </span>
                {p.label}
                <Plus className="w-3 h-3 text-muted-foreground/60" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {periodoSlot}
          <button
            onClick={onAtualizarMetricas}
            disabled={carregandoMetricas}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
            title="Atualizar métricas do período"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", carregandoMetricas && "animate-spin")} /> Atualizar
          </button>
        </div>
      )}

      {/* Salvar */}
      <div className="ml-auto flex items-center gap-2">
        {msg && <span className={cn("text-xs", msg.kind === "ok" ? "text-success" : "text-danger")}>{msg.text}</span>}
        {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">alterações não salvas</span>}
        <button
          onClick={onSalvar}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : dirty ? <Save className="w-4 h-4" /> : <Check className="w-4 h-4 text-success" />}
          {saving ? "Salvando…" : dirty ? "Salvar" : "Salvo"}
        </button>
      </div>
    </div>
  );
}
