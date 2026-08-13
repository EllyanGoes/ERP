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

export function PrioridadeBadge({ prioridade, small }: { prioridade: string; small?: boolean }) {
  const p = PRIORIDADES[prioridade] ?? PRIORIDADES.MEDIA;
  if (prioridade === "MEDIA") return null; // média é o default — não polui o cartão
  return (
    <span className={cn("inline-flex items-center rounded-full font-medium whitespace-nowrap", small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs", p.cls)}>
      {p.label}
    </span>
  );
}
