import { cn } from "@/lib/utils";

// Criticidade: A = mais crítico (vermelho), B = média (âmbar), C = baixa (verde).
const MAP: Record<string, { cls: string; titulo: string }> = {
  A: { cls: "bg-danger/15 text-danger", titulo: "Criticidade A — alta" },
  B: { cls: "bg-warning/15 text-warning", titulo: "Criticidade B — média" },
  C: { cls: "bg-success/15 text-success", titulo: "Criticidade C — baixa" },
};

export default function CriticidadeBadge({
  value,
  className,
}: {
  value: "A" | "B" | "C";
  className?: string;
}) {
  const cfg = MAP[value];
  if (!cfg) return null;
  return (
    <span
      title={cfg.titulo}
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold",
        cfg.cls,
        className,
      )}
    >
      {value}
    </span>
  );
}
