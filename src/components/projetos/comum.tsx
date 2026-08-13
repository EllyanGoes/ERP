"use client";

// Peças visuais compartilhadas do módulo de Projetos.
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
export const SITUACOES_PROJETO: Record<string, { label: string; cls: string }> = {
  NAO_INICIADO: { label: "Não iniciado", cls: "bg-muted text-muted-foreground" },
  EM_ANDAMENTO: { label: "Em andamento", cls: "bg-info/15 text-info" },
  PAUSADO:      { label: "Pausado",      cls: "bg-warning/15 text-warning" },
  CONCLUIDO:    { label: "Concluído",    cls: "bg-success/15 text-success" },
};

export function SituacaoBadge({ situacao, small }: { situacao?: string | null; small?: boolean }) {
  const s = SITUACOES_PROJETO[situacao ?? "EM_ANDAMENTO"] ?? SITUACOES_PROJETO.EM_ANDAMENTO;
  return (
    <span className={cn("inline-flex items-center rounded-full font-medium whitespace-nowrap", small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs", s.cls)}>
      {s.label}
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
