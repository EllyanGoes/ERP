// Validação das faixas de hora dos Horários de Trabalho (escala).

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type FaixaIn = { horaInicial: string; horaFinal: string };

export function validarFaixas(brutas: unknown): FaixaIn[] | null {
  if (!Array.isArray(brutas) || brutas.length === 0) return null;
  const faixas: FaixaIn[] = [];
  for (const f of brutas) {
    const hi = String((f as FaixaIn)?.horaInicial ?? "").trim();
    const hf = String((f as FaixaIn)?.horaFinal ?? "").trim();
    if (!HORA_RE.test(hi) || !HORA_RE.test(hf)) return null;
    faixas.push({ horaInicial: hi, horaFinal: hf });
  }
  return faixas;
}
