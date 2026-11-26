// Número único de processo do CNJ (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.
// Puro (sem servidor) — usado no formulário (máscara/validação) e no motor do DataJud.
//   NNNNNNN = sequencial · DD = dígito verificador (módulo 97, ISO 7064)
//   AAAA = ano · J = segmento do Judiciário · TR = tribunal · OOOO = origem (vara/foro)

/** Ordem das UFs usada no código TR da Justiça Estadual (J=8) e Eleitoral (J=6). */
const UFS = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];

export const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Formata 20 dígitos como NNNNNNN-DD.AAAA.J.TR.OOOO (devolve o original se não tiver 20). */
export function formatarCnj(s: string): string {
  const d = soDigitos(s);
  if (d.length !== 20) return s;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Máscara progressiva para digitação (aceita colar com ou sem pontuação). */
export function mascaraCnj(s: string): string {
  const d = soDigitos(s).slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  const seps = ["", "-", ".", ".", ".", "."];
  return partes.reduce((acc, p, i) => (p ? acc + seps[i] + p : acc), "");
}

/** Dígito verificador: DD = 98 − ((NNNNNNN AAAA J TR OOOO × 100) mod 97). */
export function digitoCnj(d20: string): string {
  const base = d20.slice(0, 7) + d20.slice(9, 20) + "00";
  return String(98 - Number(BigInt(base) % BigInt(97))).padStart(2, "0");
}

/** Pareceria um número CNJ (20 dígitos), independentemente do DV? */
export const pareceCnj = (s: string | null | undefined) => soDigitos(s).length === 20 && /^\d{7}[-.]?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}$/.test(String(s ?? "").trim());

export type CnjInfo = { digitos: string; formatado: string; ano: number; segmento: number; tr: string; tribunal: string | null; tribunalNome: string | null };

/** Sigla do endpoint do DataJud (api_publica_<sigla>) a partir de J e TR. null = sem endpoint. */
export function tribunalDatajud(j: number, tr: string): { sigla: string; nome: string } | null {
  const n = Number(tr);
  switch (j) {
    case 3: return { sigla: "stj", nome: "Superior Tribunal de Justiça" };
    case 4: return n >= 1 && n <= 6 ? { sigla: `trf${n}`, nome: `TRF da ${n}ª Região` } : null;
    case 5: return n === 0 ? { sigla: "tst", nome: "Tribunal Superior do Trabalho" } : n >= 1 && n <= 24 ? { sigla: `trt${n}`, nome: `TRT da ${n}ª Região` } : null;
    case 6: return n === 0 ? { sigla: "tse", nome: "Tribunal Superior Eleitoral" } : UFS[n - 1] ? { sigla: `tre-${UFS[n - 1]}`, nome: `TRE-${UFS[n - 1].toUpperCase()}` } : null;
    case 7: return { sigla: "stm", nome: "Superior Tribunal Militar" };
    case 8: {
      const uf = UFS[n - 1];
      if (!uf) return null;
      return uf === "df" ? { sigla: "tjdft", nome: "TJ do Distrito Federal e Territórios" } : { sigla: `tj${uf}`, nome: `TJ-${uf.toUpperCase()}` };
    }
    case 9: {
      const m: Record<number, string> = { 13: "mg", 21: "rs", 26: "sp" };
      return m[n] ? { sigla: `tjm${m[n]}`, nome: `TJM-${m[n].toUpperCase()}` } : null;
    }
    default: return null; // 1 = STF e 2 = CNJ não estão na API pública
  }
}

/** Valida o número CNJ. Erro em português simples para mostrar no formulário. */
export function validarCnj(s: string | null | undefined): { ok: true; info: CnjInfo } | { ok: false; erro: string } {
  const d = soDigitos(s);
  if (!d) return { ok: false, erro: "Informe o número do processo." };
  if (d.length !== 20) return { ok: false, erro: `O número CNJ tem 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO); este tem ${d.length}.` };
  if (d.slice(7, 9) !== digitoCnj(d)) return { ok: false, erro: "Número CNJ inválido: o dígito verificador não confere. Confira se não há dígito trocado." };
  const ano = Number(d.slice(9, 13)), segmento = Number(d.slice(13, 14)), tr = d.slice(14, 16);
  const t = tribunalDatajud(segmento, tr);
  return { ok: true, info: { digitos: d, formatado: formatarCnj(d), ano, segmento, tr, tribunal: t?.sigla ?? null, tribunalNome: t?.nome ?? null } };
}
