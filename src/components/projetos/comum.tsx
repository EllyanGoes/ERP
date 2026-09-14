"use client";

// Peças visuais compartilhadas do módulo de Projetos.
import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EtiquetaDTO, PRIORIDADES } from "./tipos";

/** Avatar circular com iniciais (padrão dos apps de projeto). */
export function AvatarUsuario({ nome, size = "md", title }: { nome: string; size?: "sm" | "md"; title?: string }) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  // Cor estável a partir do nome
  let hash = 0;
  for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      title={title ?? nome}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none",
        size === "sm" ? "w-5 h-5 text-[9px]" : "w-7 h-7 text-[11px]"
      )}
      style={{ backgroundColor: `hsl(${hash}, 55%, 45%)` }}
    >
      {iniciais}
    </span>
  );
}

export function EtiquetaChip({ etiqueta, small }: { etiqueta: EtiquetaDTO; small?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full font-medium text-white whitespace-nowrap", small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs")}
      style={{ backgroundColor: etiqueta.cor }}
      title={etiqueta.nome}
    >
      {etiqueta.nome}
    </span>
  );
}

/** Círculo de progresso do projeto (estilo Things): pizza preenchida na
 *  proporção de tarefas concluídas, na cor do projeto. */
export function ProgressoCirculo({ concluidas, total, cor, size = 18 }: { concluidas: number; total: number; cor?: string | null; size?: number }) {
  const pct = total > 0 ? concluidas / total : 0;
  const c = cor ?? "#64748b";
  const r = 4.5, C = 2 * Math.PI * r;
  return (
    <svg
      width={size} height={size} viewBox="0 0 20 20" className="shrink-0 -rotate-90"
      role="img" aria-label={`${concluidas} de ${total} concluídas`}
    >
      <title>{`${concluidas} de ${total} concluída${total === 1 ? "" : "s"}`}</title>
      <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="1.8" />
      {/* pizza: stroke largo sobre raio pequeno preenche o miolo */}
      <circle cx="10" cy="10" r={r} fill="none" stroke={c} strokeWidth="9" strokeDasharray={`${C * pct} ${C}`} />
    </svg>
  );
}

/** Situação (status de andamento) do projeto. */
export const SITUACOES_PROJETO: Record<string, { label: string; cls: string; dot: string }> = {
  NAO_INICIADO: { label: "Não iniciado", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  EM_ANDAMENTO: { label: "Em andamento", cls: "bg-info/15 text-info",           dot: "bg-info" },
  PAUSADO:      { label: "Pausado",      cls: "bg-warning/15 text-warning",     dot: "bg-warning" },
  CONCLUIDO:    { label: "Concluído",    cls: "bg-success/15 text-success",     dot: "bg-success" },
};

export function SituacaoBadge({ situacao, small }: { situacao?: string | null; small?: boolean }) {
  const s = SITUACOES_PROJETO[situacao ?? "EM_ANDAMENTO"] ?? SITUACOES_PROJETO.EM_ANDAMENTO;
  return (
    <span className={cn("inline-flex items-center rounded-full font-medium whitespace-nowrap", small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs", s.cls)}>
      {s.label}
    </span>
  );
}

/** Badge de situação com troca rápida: clica → menu com as situações; salva
 *  via PATCH /api/projetos/[id] e devolve a nova situação em onChange.
 *  Feito com <span> (não <button>) p/ poder viver dentro do card, que é um
 *  <button>. Sem permissão de gerenciar, cai na badge estática. */
export function SituacaoMenu({
  projetoId, situacao, small, podeEditar = true, onChange, onError,
}: {
  projetoId: string;
  situacao?: string | null;
  small?: boolean;
  podeEditar?: boolean;
  onChange?: (situacao: string) => void;
  onError?: (msg: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const atual = situacao ?? "EM_ANDAMENTO";
  const s = SITUACOES_PROJETO[atual] ?? SITUACOES_PROJETO.EM_ANDAMENTO;

  if (!podeEditar) return <SituacaoBadge situacao={situacao} small={small} />;

  async function escolher(nova: string) {
    setAberto(false);
    if (nova === atual || salvando) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/projetos/${projetoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: nova }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        onError?.(j.error || "Não foi possível alterar a situação.");
        return;
      }
      onChange?.(nova);
    } catch {
      onError?.("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <span className="relative inline-flex" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
      <span
        role="button"
        tabIndex={0}
        title="Alterar situação do projeto"
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberto((v) => !v); } }}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full font-medium whitespace-nowrap cursor-pointer hover:ring-1 hover:ring-border transition-shadow",
          small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs",
          s.cls, salvando && "opacity-60"
        )}
      >
        {s.label}
        <ChevronDown className={small ? "w-2.5 h-2.5" : "w-3 h-3"} />
      </span>
      {aberto && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <span className="absolute left-0 top-full mt-1 z-50 w-44 bg-card border border-border rounded-xl shadow-xl py-1 text-sm flex flex-col">
            {Object.entries(SITUACOES_PROJETO).map(([k, v]) => (
              <span
                key={k}
                role="button"
                onClick={() => escolher(k)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-foreground"
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", v.dot)} />
                <span className="flex-1">{v.label}</span>
                {k === atual && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

export function PrioridadeBadge({ prioridade, small }: { prioridade: string; small?: boolean }) {
  const p = PRIORIDADES[prioridade] ?? PRIORIDADES.MEDIA;
  if (prioridade === "MEDIA") return null; // média é o default — não polui o cartão
  return (
    <span className={cn("inline-flex items-center rounded-full font-medium whitespace-nowrap", small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs", p.cls)}>
      {p.label}
    </span>
  );
}
