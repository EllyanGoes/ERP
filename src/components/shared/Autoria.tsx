interface AutoriaProps {
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  className?: string;
}

export function Autoria({ criadoPor, atualizadoPor, className }: AutoriaProps) {
  if (!criadoPor && !atualizadoPor) return null;
  const partes: string[] = [];
  if (criadoPor) partes.push(`Criado por ${criadoPor}`);
  if (atualizadoPor) partes.push(`Atualizado por ${atualizadoPor}`);
  return (
    <p className={`text-xs text-muted-foreground ${className ?? ""}`.trim()}>
      {partes.join(" · ")}
    </p>
  );
}
