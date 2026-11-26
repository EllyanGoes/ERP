// Prazos em dias úteis ou corridos (docs/processos-prd.md, Fase 1.5). Puro — roda no servidor e na tela.
// Datas são DIAS: trabalhamos em UTC à meia-noite (como o resto do módulo de Processos).
//
// Regras (CPC arts. 219, 220 e 224; Lei 9.784/99 art. 66 segue a mesma lógica):
//  • exclui o dia do início e inclui o do vencimento;
//  • a contagem começa no primeiro dia útil depois do início;
//  • se o vencimento cair em dia não útil, prorroga para o próximo dia útil;
//  • dias úteis: pula sábados, domingos e feriados (nacionais + Amapá + Macapá);
//  • suspensão forense de 20/12 a 20/01 (CPC art. 220) — só processos judiciais (opção).

const DIA = 86_400_000;
export const diaUtc = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
};
const somaDias = (d: Date, n: number) => new Date(+d + n * DIA);
const chave = (d: Date) => d.toISOString().slice(0, 10);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Fixos. Conferir anualmente (leis estaduais/municipais podem mudar).
const NACIONAIS: [number, number, string][] = [
  [1, 1, "Confraternização Universal"], [4, 21, "Tiradentes"], [5, 1, "Dia do Trabalho"], [9, 7, "Independência"],
  [10, 12, "Nossa Senhora Aparecida"], [11, 2, "Finados"], [11, 15, "Proclamação da República"],
  [11, 20, "Dia Nacional de Zumbi e da Consciência Negra"], // Lei 14.759/2023
  [12, 25, "Natal"],
];
const AMAPA: [number, number, string][] = [
  [3, 19, "São José, padroeiro do Amapá"],
  [9, 13, "Criação do Território Federal do Amapá"],
  [10, 5, "Criação do Estado do Amapá"],
];
const MACAPA: [number, number, string][] = [
  [2, 4, "Aniversário de Macapá"],
];
// Só para processos judiciais: Dia da Justiça (Lei 1.408/51) — fóruns fechados.
const JUDICIAIS: [number, number, string][] = [[12, 8, "Dia da Justiça"]];

export type OpcoesCalendario = { judicial?: boolean };

/** Feriados do ano (AAAA-MM-DD → nome). */
export function feriadosAno(ano: number, opts: OpcoesCalendario = {}): Map<string, string> {
  const m = new Map<string, string>();
  const fixo = (lista: [number, number, string][]) => lista.forEach(([mes, dia, nome]) => m.set(chave(new Date(Date.UTC(ano, mes - 1, dia))), nome));
  fixo(NACIONAIS); fixo(AMAPA); fixo(MACAPA);
  if (opts.judicial) fixo(JUDICIAIS);
  const p = pascoa(ano);
  m.set(chave(somaDias(p, -48)), "Carnaval (segunda)");
  m.set(chave(somaDias(p, -47)), "Carnaval (terça)");
  m.set(chave(somaDias(p, -2)), "Sexta-feira Santa");
  m.set(chave(somaDias(p, 60)), "Corpus Christi");
  return m;
}

const cacheFeriados = new Map<string, Map<string, string>>();
function feriadoDe(d: Date, opts: OpcoesCalendario): string | undefined {
  const k = `${d.getUTCFullYear()}|${opts.judicial ? 1 : 0}`;
  if (!cacheFeriados.has(k)) cacheFeriados.set(k, feriadosAno(d.getUTCFullYear(), opts));
  return cacheFeriados.get(k)!.get(chave(d));
}

export function ehDiaUtil(d: Date | string, opts: OpcoesCalendario = {}): boolean {
  const x = diaUtc(d);
  const sem = x.getUTCDay();
  return sem !== 0 && sem !== 6 && !feriadoDe(x, opts);
}

/** 20/12 a 20/01, inclusive (CPC art. 220). */
export function emSuspensaoForense(d: Date | string): boolean {
  const x = diaUtc(d), mes = x.getUTCMonth() + 1, dia = x.getUTCDate();
  return (mes === 12 && dia >= 20) || (mes === 1 && dia <= 20);
}

export type OpcoesPrazo = { uteis: boolean; suspensaoForense?: boolean; judicial?: boolean };

/**
 * Vencimento de um prazo de `dias` contados a partir de `inicio` (dia da ciência/publicação).
 * Devolve o dia (Date à meia-noite UTC).
 */
export function calcularVencimento(inicio: Date | string, dias: number, opts: OpcoesPrazo): Date {
  const cal = { judicial: opts.judicial || opts.suspensaoForense };
  const util = (d: Date) => ehDiaUtil(d, cal) && !(opts.suspensaoForense && emSuspensaoForense(d));
  let d = diaUtc(inicio);
  const n = Math.max(0, Math.floor(dias));
  if (n === 0) { while (!util(d)) d = somaDias(d, 1); return d; }
  // Primeiro dia da contagem: o primeiro útil depois do início (CPC 224 §§ 1º e 3º).
  d = somaDias(d, 1);
  while (!util(d)) d = somaDias(d, 1);
  let contados = 1;
  while (contados < n) {
    d = somaDias(d, 1);
    const suspenso = opts.suspensaoForense && emSuspensaoForense(d);
    if (suspenso) continue; // suspensão não conta nem em dias corridos
    if (opts.uteis && !ehDiaUtil(d, cal)) continue;
    contados++;
  }
  // Vencimento em dia não útil (ou suspenso) prorroga para o próximo útil.
  while (!util(d)) d = somaDias(d, 1);
  return d;
}

/** Texto para mostrar: "15 dias úteis a partir de 03/03/2026". */
export function descreverContagem(dias: number, uteis: boolean, inicio: Date | string): string {
  const i = diaUtc(inicio).toISOString().slice(0, 10).split("-").reverse().join("/");
  return `${dias} dia${dias === 1 ? "" : "s"} ${uteis ? (dias === 1 ? "útil" : "úteis") : dias === 1 ? "corrido" : "corridos"} a partir de ${i}`;
}
