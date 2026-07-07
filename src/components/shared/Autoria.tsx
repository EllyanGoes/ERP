interface AutoriaProps {
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  /** Data/hora de criação (ISO ou Date) — exibida junto do "Criado por". */
  criadoEm?: string | Date | null;
  /** Data/hora da última atualização (ISO ou Date). */
  atualizadoEm?: string | Date | null;
  className?: string;
}

function dataHora(v?: string | Date | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Autoria({ criadoPor, atualizadoPor, criadoEm, atualizadoEm, className }: AutoriaProps) {
  const criado = [criadoPor && `por ${criadoPor}`, dataHora(criadoEm) && `em ${dataHora(criadoEm)}`].filter(Boolean).join(" ");
  const atualizado = [atualizadoPor && `por ${atualizadoPor}`, dataHora(atualizadoEm) && `em ${dataHora(atualizadoEm)}`].filter(Boolean).join(" ");
  if (!criado && !atualizado) return null;
  const partes: string[] = [];
  if (criado) partes.push(`Criado ${criado}`);
  if (atualizado) partes.push(`Atualizado ${atualizado}`);
  return (
    <p className={`text-xs text-muted-foreground ${className ?? ""}`.trim()}>
      {partes.join(" · ")}
    </p>
  );
}
