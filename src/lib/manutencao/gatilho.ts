// ─────────────────────────────────────────────────────────────────────────────
// Regras PURAS do gatilho de um plano aplicado a um ativo (ManutPlanoAtivo).
// Sem Prisma: o mesmo código roda no servidor (gerador de preventivas, API) e
// no cliente (resumo vivo do dialog, coluna "Gatilho"/"Próxima" da tabela).
//
// Convenções:
//  • `gatilho` = CALENDARIO | MEDIDOR | AMBOS (o que vencer primeiro).
//  • Calendário no modelo Tractian: `repeticao` = DIARIA | SEMANAL (diasSemana
//    0=dom..6=sáb) | MENSAL (diaMes) | ANUAL (dia/mês do `inicio`) |
//    PERSONALIZADA (a cada `intervaloDias` × `unidadeIntervalo` DIAS|SEMANAS|MESES,
//    com diasSemana opcionais nas semanas). `repeticao` null = legado: só
//    intervaloDias + unidadeIntervalo somados à última execução.
//  • `inicio` = quando o plano começa (1ª ocorrência = 1ª data da regra ≥ início);
//    `horario` "HH:MM" (Brasília) vai para a hora programada da OS.
//  • Fim: `fimTipo` NUNCA | DATA (fimData) | OCORRENCIAS (fimOcorrencias; o
//    contador `ocorrencias` soma a cada OS gerada). Atingido = aplicação encerrada.
//  • `agendarProxima` SEMPRE (próximo marco pelo calendário, após o marco teórico)
//    | APOS_CONCLUSAO (conta a partir da conclusão da OS anterior).
//  • Medidor: `margemMedida` = quanto antes do marco a OS nasce; null = 10%.
//  • Datas de plano são "dia" gravadas como meia-noite UTC — formatamos e
//    somamos sempre em UTC. Meses somam calendário (31/01 + 1 mês = 28/02).
// ─────────────────────────────────────────────────────────────────────────────

export const DIA_MS = 86_400_000;

/** Número vindo de qualquer lado: number, string do JSON ou Decimal do Prisma. */
export type Num = number | string | { toString(): string };
export const n = (v: Num | null | undefined): number => (v == null || v === "" ? NaN : Number(typeof v === "object" ? v.toString() : v));

export type UnidadeIntervalo = "DIAS" | "SEMANAS" | "MESES";
export type Gatilho = "CALENDARIO" | "MEDIDOR" | "AMBOS";
export type Repeticao = "DIARIA" | "SEMANAL" | "MENSAL" | "ANUAL" | "PERSONALIZADA";
export type FimTipo = "NUNCA" | "DATA" | "OCORRENCIAS";
export type AgendarProxima = "SEMPRE" | "APOS_CONCLUSAO";

export const UNIDADES_INTERVALO: { value: UnidadeIntervalo; label: string; singular: string; plural: string; dias: number }[] = [
  { value: "DIAS", label: "dias", singular: "dia", plural: "dias", dias: 1 },
  { value: "SEMANAS", label: "semanas", singular: "semana", plural: "semanas", dias: 7 },
  { value: "MESES", label: "meses", singular: "mês", plural: "meses", dias: 30 },
];

export const GATILHOS: { value: Gatilho; label: string; descricao: string }[] = [
  { value: "CALENDARIO", label: "Calendário", descricao: "Repete por data — diária, semanal, mensal, anual ou personalizada." },
  { value: "MEDIDOR", label: "Medidor", descricao: "A cada N horas, km ou ciclos do horímetro/odômetro do ativo." },
  { value: "AMBOS", label: "O que vencer primeiro", descricao: "Calendário e medidor juntos: a OS nasce no primeiro marco que chegar." },
];
export const GATILHO_LABEL: Record<string, string> = Object.fromEntries(GATILHOS.map((g) => [g.value, g.label]));

export const REPETICOES: { value: Repeticao; label: string }[] = [
  { value: "DIARIA", label: "Diária" }, { value: "SEMANAL", label: "Semanal" }, { value: "MENSAL", label: "Mensal" },
  { value: "ANUAL", label: "Anual" }, { value: "PERSONALIZADA", label: "Personalizada" },
];
export const FINS: { value: FimTipo; label: string }[] = [
  { value: "NUNCA", label: "Nunca" }, { value: "DATA", label: "Em uma data" }, { value: "OCORRENCIAS", label: "Após N execuções" },
];
export const AGENDAMENTOS: { value: AgendarProxima; label: string; descricao: string }[] = [
  { value: "SEMPRE", label: "Sempre", descricao: "A próxima segue o calendário, mesmo que a anterior atrase." },
  { value: "APOS_CONCLUSAO", label: "Só após concluir a anterior", descricao: "A próxima conta a partir da conclusão da OS anterior." },
];
/** Dias da semana (0 = domingo): chip de uma letra, nome e abreviação. */
export const DIAS_SEMANA = [
  { value: 0, chip: "D", nome: "domingo", abrev: "dom", fem: false }, { value: 1, chip: "S", nome: "segunda", abrev: "seg", fem: true },
  { value: 2, chip: "T", nome: "terça", abrev: "ter", fem: true }, { value: 3, chip: "Q", nome: "quarta", abrev: "qua", fem: true },
  { value: 4, chip: "Q", nome: "quinta", abrev: "qui", fem: true }, { value: 5, chip: "S", nome: "sexta", abrev: "sex", fem: true },
  { value: 6, chip: "S", nome: "sábado", abrev: "sáb", fem: false },
];

export function normalizarUnidade(u: unknown): UnidadeIntervalo {
  return UNIDADES_INTERVALO.some((x) => x.value === u) ? (u as UnidadeIntervalo) : "DIAS";
}
export function normalizarGatilho(g: unknown): Gatilho {
  return GATILHOS.some((x) => x.value === g) ? (g as Gatilho) : "CALENDARIO";
}
export function normalizarRepeticao(r: unknown): Repeticao | null {
  return REPETICOES.some((x) => x.value === r) ? (r as Repeticao) : null;
}
export const usaCalendario = (g: string) => g === "CALENDARIO" || g === "AMBOS";
export const usaMedidor = (g: string) => g === "MEDIDOR" || g === "AMBOS";

/** Equivalente aproximado em dias (p/ tolerância e ordenação; meses = 30). */
export function intervaloEmDias(qtd: number, unidade: string): number {
  return qtd * (UNIDADES_INTERVALO.find((u) => u.value === unidade)?.dias ?? 1);
}

const ultimoDiaDoMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Soma `qtd` unidades a uma data (UTC). Meses somam calendário, com o dia travado no fim do mês. */
export function somarIntervalo(base: Date, qtd: number, unidade: string): Date {
  const u = normalizarUnidade(unidade);
  if (u === "MESES") {
    const y = base.getUTCFullYear(), m = base.getUTCMonth(), d = base.getUTCDate();
    const alvo = new Date(Date.UTC(y, m + qtd, 1, base.getUTCHours(), base.getUTCMinutes()));
    alvo.setUTCDate(Math.min(d, ultimoDiaDoMes(alvo.getUTCFullYear(), alvo.getUTCMonth())));
    return alvo;
  }
  return new Date(base.getTime() + intervaloEmDias(qtd, u) * DIA_MS);
}
export function subtrairIntervalo(base: Date, qtd: number, unidade: string): Date {
  return somarIntervalo(base, -qtd, unidade);
}

/** "YYYY-MM-DD" (ou ISO) → Date meia-noite UTC; vazio/inválido → null. */
export function parseDia(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}
/** Date → "YYYY-MM-DD" em UTC. */
export function isoDia(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
/** Data de plano → "dd/mm/aaaa" (UTC, sem desvio de fuso). */
export function fmtDia(v: string | Date | null | undefined, comAno = true): string {
  const d = v instanceof Date ? v : parseDia(v);
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return comAno ? `${dd}/${mm}/${d.getUTCFullYear()}` : `${dd}/${mm}`;
}
export const fmtNum = (v: Num | null | undefined, dec = 0) =>
  v == null || v === "" ? "—" : n(v).toLocaleString("pt-BR", { maximumFractionDigits: dec });

/** Meia-noite UTC do dia de `agora`. */
export function inicioDoDia(agora: Date): Date {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
}
/** Dias inteiros de hoje até a data (negativo = passou). */
export function diasAte(data: Date, agora: Date): number {
  return Math.round((inicioDoDia(data).getTime() - inicioDoDia(agora).getTime()) / DIA_MS);
}
const somarDias = (d: Date, k: number) => new Date(d.getTime() + k * DIA_MS);
const domingoDaSemana = (d: Date) => somarDias(inicioDoDia(d), -d.getUTCDay());

/** Horário "HH:MM" válido ou null. */
export function normalizarHorario(h: unknown): string | null {
  const m = typeof h === "string" ? /^(\d{1,2}):(\d{2})$/.exec(h.trim()) : null;
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh >= 0 && hh < 24 && mm >= 0 && mm < 60 ? `${String(hh).padStart(2, "0")}:${m[2]}` : null;
}
/** Dia (UTC) + horário de Brasília → instante da OS programada. Sem horário: o próprio dia. */
export function comHorario(dia: Date, horario: string | null | undefined): Date {
  const h = normalizarHorario(horario);
  if (!h) return dia;
  const [hh, mm] = h.split(":").map(Number);
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hh + 3, mm));
}

const plural = (qtd: number, s: string, p: string) => `${fmtNum(qtd)} ${Math.abs(qtd) === 1 ? s : p}`;

/** "a cada 2 semanas" / "a cada 1 mês" / "a cada 30 dias". */
export function descreverIntervalo(qtd: number | null | undefined, unidade: string): string {
  if (!qtd) return "—";
  const u = UNIDADES_INTERVALO.find((x) => x.value === normalizarUnidade(unidade))!;
  return `a cada ${plural(qtd, u.singular, u.plural)}`;
}

// ── Recorrência (calendário) ─────────────────────────────────────────────────

export type Recorrencia = {
  repeticao?: string | null;
  intervaloDias: number | null;
  unidadeIntervalo?: string | null;
  diasSemana?: number[] | null;
  diaMes?: number | null;
  inicio?: string | Date | null;
};

export function diasSemanaValidos(v: unknown): number[] {
  const arr = Array.isArray(v) ? v.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

/**
 * Primeira ocorrência da regra a partir de `apos` (inclusive por padrão; `{ exclusiva: true }`
 * = estritamente depois). Nunca antes do `inicio`. Null quando a regra não está completa
 * ou é legado (repeticao null — nesse caso use somarIntervalo).
 */
export function proximaOcorrencia(rec: Recorrencia, apos: Date, opts: { exclusiva?: boolean } = {}): Date | null {
  const rep = normalizarRepeticao(rec.repeticao);
  if (!rep) return null;
  const inicio = parseDia(rec.inicio);
  let de = inicioDoDia(apos);
  if (opts.exclusiva) de = somarDias(de, 1);
  if (inicio && de < inicio) de = inicio;
  const dias = diasSemanaValidos(rec.diasSemana);

  if (rep === "DIARIA") return de;

  if (rep === "SEMANAL") {
    const marcados = dias.length ? dias : [(inicio ?? de).getUTCDay()];
    for (let i = 0; i < 7; i++) { const c = somarDias(de, i); if (marcados.includes(c.getUTCDay())) return c; }
    return null;
  }

  if (rep === "MENSAL") {
    const dia = rec.diaMes && rec.diaMes >= 1 && rec.diaMes <= 31 ? rec.diaMes : (inicio ?? de).getUTCDate();
    for (let k = 0; k < 3; k++) {
      const c = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth() + k, 1));
      c.setUTCDate(Math.min(dia, ultimoDiaDoMes(c.getUTCFullYear(), c.getUTCMonth())));
      if (c >= de) return c;
    }
    return null;
  }

  if (rep === "ANUAL") {
    const ref = inicio ?? de;
    for (let k = 0; k < 2; k++) {
      const y = de.getUTCFullYear() + k;
      const c = new Date(Date.UTC(y, ref.getUTCMonth(), Math.min(ref.getUTCDate(), ultimoDiaDoMes(y, ref.getUTCMonth()))));
      if (c >= de) return c;
    }
    return null;
  }

  // PERSONALIZADA: a cada N unidades a partir do início (âncora), com dias da semana opcionais nas semanas.
  const qtd = rec.intervaloDias && rec.intervaloDias >= 1 ? Math.round(rec.intervaloDias) : null;
  if (!qtd) return null;
  const unidade = normalizarUnidade(rec.unidadeIntervalo);
  const ancora = inicio ?? de;
  if (unidade === "SEMANAS" && dias.length) {
    const semana0 = domingoDaSemana(ancora);
    for (let i = 0; i <= qtd * 7 + 7; i++) {
      const c = somarDias(de, i);
      if (c < ancora) continue;
      const semanas = Math.round((domingoDaSemana(c).getTime() - semana0.getTime()) / (7 * DIA_MS));
      if (semanas % qtd === 0 && dias.includes(c.getUTCDay())) return c;
    }
    return null;
  }
  if (unidade === "MESES") {
    const difMeses = (de.getUTCFullYear() - ancora.getUTCFullYear()) * 12 + (de.getUTCMonth() - ancora.getUTCMonth());
    let k = Math.max(0, Math.floor(difMeses / qtd) * qtd - qtd);
    let c = somarIntervalo(ancora, k, "MESES");
    while (c < de) { k += qtd; c = somarIntervalo(ancora, k, "MESES"); }
    return c;
  }
  const passo = intervaloEmDias(qtd, unidade);
  const k = Math.max(0, Math.ceil((de.getTime() - ancora.getTime()) / (passo * DIA_MS)));
  return somarDias(ancora, k * passo);
}

const listarDias = (dias: number[]) => {
  const nomes = dias.map((d) => DIAS_SEMANA[d].nome);
  return nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
};

/**
 * Frase viva da recorrência: "Repete toda segunda e quinta", "Repete todo dia 5 do mês",
 * "Repete a cada 2 semanas, na segunda e quinta". `curta` tira o "Repete" (coluna da tabela).
 */
export function descreverRecorrencia(rec: Recorrencia, opts: { curta?: boolean; horario?: string | null } = {}): string {
  const rep = normalizarRepeticao(rec.repeticao);
  const dias = diasSemanaValidos(rec.diasSemana);
  let frase: string;
  if (!rep) frase = rec.intervaloDias ? descreverIntervalo(rec.intervaloDias, rec.unidadeIntervalo ?? "DIAS") : "—";
  else if (rep === "DIARIA") frase = "todo dia";
  else if (rep === "SEMANAL") {
    const ini = parseDia(rec.inicio);
    const marcados = dias.length ? dias : ini ? [ini.getUTCDay()] : [];
    frase = marcados.length ? `${DIAS_SEMANA[marcados[0]].fem ? "toda" : "todo"} ${listarDias(marcados)}` : "toda semana (escolha os dias)";
  } else if (rep === "MENSAL") {
    const dia = rec.diaMes ?? parseDia(rec.inicio)?.getUTCDate();
    frase = dia ? `todo dia ${dia} do mês` : "todo mês (informe o dia)";
  } else if (rep === "ANUAL") {
    const ini = parseDia(rec.inicio);
    frase = ini ? `todo ano em ${fmtDia(ini, false)}` : "todo ano (informe o início)";
  } else {
    const qtd = rec.intervaloDias ?? 0;
    const u = UNIDADES_INTERVALO.find((x) => x.value === normalizarUnidade(rec.unidadeIntervalo))!;
    frase = qtd >= 1 ? `a cada ${plural(qtd, u.singular, u.plural)}${u.value === "SEMANAS" && dias.length ? `, na ${listarDias(dias)}` : ""}` : "a cada… (informe o intervalo)";
  }
  const h = normalizarHorario(opts.horario);
  if (h) frase += ` às ${h}`;
  if (opts.curta) return frase;
  return /^(todo|toda|a cada)/.test(frase) ? `Repete ${frase}` : frase;
}

// ── Aplicação completa ───────────────────────────────────────────────────────

export type AplicacaoGatilho = Recorrencia & {
  gatilho: string;
  intervaloMedida: Num | null;
  margemMedida?: Num | null;
  proximoVencimento: string | Date | null;
  proximaMedida: Num | null;
  medidor?: { nome?: string; unidade: string; acumulado: Num } | null;
  horario?: string | null;
  fimTipo?: string | null; fimData?: string | Date | null; fimOcorrencias?: number | null; ocorrencias?: number | null;
  agendarProxima?: string | null;
  vencimentoDias?: number | null; lembreteDias?: number | null;
};

/** Coluna "Gatilho" legível: "toda segunda e quinta", "a cada 250 h", "a cada 250 h · ou a cada 90 dias". */
export function descreverGatilho(pa: AplicacaoGatilho): string {
  const cal = usaCalendario(pa.gatilho) ? descreverRecorrencia(pa, { curta: true, horario: pa.horario }) : null;
  const med = usaMedidor(pa.gatilho) && pa.intervaloMedida ? `a cada ${fmtNum(pa.intervaloMedida, 2)} ${pa.medidor?.unidade ?? ""}`.trim() : null;
  if (pa.gatilho === "AMBOS") return [med, cal ? `ou ${cal}` : null].filter(Boolean).join(" · ") || "—";
  return (pa.gatilho === "MEDIDOR" ? med : cal) ?? "—";
}

/** Margem efetiva do medidor: a informada ou 10% do intervalo. */
export function margemEfetiva(intervaloMedida: number, margem: Num | null | undefined): number {
  const m = n(margem);
  return Number.isFinite(m) && m >= 0 ? m : Math.round(intervaloMedida * 0.1 * 100) / 100;
}

/** Fim do plano atingido? (`candidata` = próxima data que seria gerada.) */
export function fimAtingido(pa: Pick<AplicacaoGatilho, "fimTipo" | "fimData" | "fimOcorrencias" | "ocorrencias">, candidata: Date | null): { atingido: boolean; motivo: string | null } {
  if (pa.fimTipo === "OCORRENCIAS" && pa.fimOcorrencias != null && (pa.ocorrencias ?? 0) >= pa.fimOcorrencias) {
    return { atingido: true, motivo: `encerrado: ${plural(pa.fimOcorrencias, "execução", "execuções")} geradas` };
  }
  const fim = parseDia(pa.fimData);
  if (pa.fimTipo === "DATA" && fim && candidata && inicioDoDia(candidata) > fim) return { atingido: true, motivo: `encerrou em ${fmtDia(fim)}` };
  return { atingido: false, motivo: null };
}

/**
 * Ritmo médio de uso (unidades do medidor por dia) pelas últimas leituras.
 * Soma só os trechos crescentes (troca de medidor zera e não conta como
 * "andar para trás"). Null quando não há duas leituras em dias distintos.
 */
export function ritmoMedio(leituras: { data: Date | string; valor: Num }[]): number | null {
  const ls = leituras
    .map((l) => ({ t: new Date(l.data).getTime(), v: n(l.valor) }))
    .filter((l) => Number.isFinite(l.t) && Number.isFinite(l.v))
    .sort((a, b) => a.t - b.t);
  let delta = 0, dias = 0;
  for (let i = 1; i < ls.length; i++) {
    const dv = ls[i].v - ls[i - 1].v, dt = (ls[i].t - ls[i - 1].t) / DIA_MS;
    if (dv >= 0 && dt > 0) { delta += dv; dias += dt; }
  }
  if (dias < 0.5 || delta <= 0) return null;
  return delta / dias;
}

export type Previsao = {
  calendario: { vencimento: string; diasAte: number } | null;
  medidor: { alvo: number; atual: number; faltam: number; unidade: string; margem: number; ritmoDia: number | null; dataPrevista: string | null; diasAte: number | null } | null;
  /** Próxima data prevista (o menor entre vencimento e previsão do medidor). */
  proximaData: string | null;
  /** Passou do marco (data vencida ou medidor já chegou no alvo). */
  atrasada: boolean;
  /** Já entra na janela do gerador (antecedência / margem) — e não está encerrada. */
  vencida: boolean;
  /** Fim do plano atingido (data ou nº de execuções): não gera mais. */
  encerrada: boolean;
  /** Qual lado disparou: CALENDARIO | MEDIDOR | null. */
  disparo: "CALENDARIO" | "MEDIDOR" | null;
  /** Texto curto p/ a tabela: "17/11/2026 (em 24 dias)" / "750 h · faltam 18 h · ~15/11 (8 h/dia)". */
  resumo: string;
  /** Motivo legível p/ a prévia: "vence em 12/11", "faltam 18 h para 750 h", "atrasada 23 dias". */
  motivo: string;
};

/**
 * Previsão de uma aplicação: quando vence, se já está na janela do gerador e
 * uma frase para o humano. `antecedenciaDias` vem do plano; `leituras` são as
 * últimas do medidor (para estimar o ritmo).
 */
export function preverAplicacao(
  pa: AplicacaoGatilho,
  opts: { antecedenciaDias: number; leituras?: { data: Date | string; valor: Num }[]; ritmoDia?: number | null; agora?: Date },
): Previsao {
  const agora = opts.agora ?? new Date();
  const motivos: string[] = [], motivosMed: string[] = [];
  let disparo: Previsao["disparo"] = null;
  let atrasada = false, vencida = false;

  let calendario: Previsao["calendario"] = null;
  const temRegra = !!normalizarRepeticao(pa.repeticao) || !!pa.intervaloDias;
  if (usaCalendario(pa.gatilho) && temRegra) {
    const venc = parseDia(pa.proximoVencimento) ?? proximaOcorrencia(pa, parseDia(pa.inicio) ?? agora) ?? inicioDoDia(agora);
    const d = diasAte(venc, agora);
    calendario = { vencimento: venc.toISOString(), diasAte: d };
    if (venc.getTime() - opts.antecedenciaDias * DIA_MS <= agora.getTime()) { vencida = true; disparo = "CALENDARIO"; }
    if (d < 0) { atrasada = true; motivos.push(`atrasada ${plural(-d, "dia", "dias")} (vencia em ${fmtDia(venc, false)})`); }
    else if (d === 0) motivos.push("vence hoje");
    else motivos.push(`vence em ${fmtDia(venc, false)} (em ${plural(d, "dia", "dias")})`);
  }

  let medidor: Previsao["medidor"] = null;
  if (usaMedidor(pa.gatilho) && pa.intervaloMedida && pa.medidor) {
    const intervalo = n(pa.intervaloMedida);
    const atual = n(pa.medidor.acumulado);
    const alvo = Number.isFinite(n(pa.proximaMedida)) ? n(pa.proximaMedida) : atual + intervalo;
    const margem = margemEfetiva(intervalo, pa.margemMedida);
    const faltam = alvo - atual;
    const ritmo = opts.ritmoDia !== undefined ? opts.ritmoDia : opts.leituras ? ritmoMedio(opts.leituras) : null;
    let dataPrevista: Date | null = null;
    if (faltam <= 0) dataPrevista = inicioDoDia(agora);
    else if (ritmo && ritmo > 0) dataPrevista = somarDias(inicioDoDia(agora), Math.ceil(faltam / ritmo));
    const un = pa.medidor.unidade;
    medidor = { alvo, atual, faltam, unidade: un, margem, ritmoDia: ritmo, dataPrevista: dataPrevista?.toISOString() ?? null, diasAte: dataPrevista ? diasAte(dataPrevista, agora) : null };
    if (atual >= alvo - margem) { vencida = true; if (!disparo || faltam <= 0) disparo = "MEDIDOR"; }
    if (faltam <= 0) { atrasada = true; motivosMed.push(`passou ${fmtNum(-faltam, 2)} ${un} do marco de ${fmtNum(alvo, 2)} ${un}`); }
    else motivosMed.push(`faltam ${fmtNum(faltam, 2)} ${un} para ${fmtNum(alvo, 2)} ${un}${dataPrevista ? ` (~${fmtDia(dataPrevista, false)} ao ritmo de ${fmtNum(ritmo, 1)} ${un}/dia)` : ""}`);
  }

  // Próxima data = o menor entre os dois lados (o que vencer primeiro).
  const datas = [calendario?.vencimento, medidor?.dataPrevista].filter((x): x is string => !!x).sort();
  const proximaData = datas[0] ?? null;

  // Fim do plano: atingido = não gera mais (e não conta como atrasada).
  const fim = fimAtingido(pa, proximaData ? new Date(proximaData) : null);
  if (fim.atingido) { vencida = false; atrasada = false; disparo = null; }

  const partes: string[] = [];
  if (calendario) partes.push(`${fmtDia(calendario.vencimento)}${calendario.diasAte < 0 ? ` (há ${plural(-calendario.diasAte, "dia", "dias")})` : calendario.diasAte === 0 ? " (hoje)" : ` (em ${plural(calendario.diasAte, "dia", "dias")})`}`);
  if (medidor) {
    const un = medidor.unidade;
    partes.push(`${fmtNum(medidor.alvo, 2)} ${un} · ${medidor.faltam <= 0 ? `passou ${fmtNum(-medidor.faltam, 2)} ${un}` : `faltam ${fmtNum(medidor.faltam, 2)} ${un}`}${medidor.dataPrevista && medidor.faltam > 0 ? ` · ~${fmtDia(medidor.dataPrevista, false)} (${fmtNum(medidor.ritmoDia, 1)} ${un}/dia)` : medidor.faltam > 0 ? " · sem ritmo conhecido" : ""}`);
  }
  // Em AMBOS, o lado que disparou vem primeiro no motivo.
  const motivo = fim.atingido ? fim.motivo! : (disparo === "MEDIDOR" ? [...motivosMed, ...motivos] : [...motivos, ...motivosMed]).join(" · ");
  return {
    calendario, medidor, proximaData, atrasada, vencida, encerrada: fim.atingido, disparo,
    resumo: fim.atingido ? fim.motivo! : partes.join(" · ou ") || "—",
    motivo: motivo || "sem gatilho configurado",
  };
}
