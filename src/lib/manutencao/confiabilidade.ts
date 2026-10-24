import { prisma } from "@/lib/prisma";
import { WHERE_FALHA_MTBF, calcMtbf, calcMttr, diasNoMes } from "@/lib/pcm-mtbf";
import { dataReferenciaOS, horasParada, wherePeriodoOS } from "@/lib/manutencao/consultas";

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores de confiabilidade (docs/manutencao-prd.md §14 — tela Indicadores,
// que substitui o Ativo Saúde). Tudo calculado DIRETO das OS (a OS já é
// validada pelo PCM em duas etapas; o FechamentoMtbf deixou de existir —
// decisão do dono, 24/10/2026). Por ativo e no total, no período pedido:
//   falhas             OS de tipo que conta como falha (WHERE_FALHA_MTBF), não canceladas
//   horasParada        janelas paradaInicio→paradaFim das falhas (0 sem carimbo)
//   horasFuncionamento dias do período × horasPorDia (herdado do pai; padrão 24)
//   MTBF               (funcionamento − parada) / falhas
//   MTTR               parada / falhas
//   Disponibilidade    (funcionamento − parada) / funcionamento
//   Confiabilidade     R(t) = e^(−t/MTBF), t = horizonte em horas
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const round2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);

export interface Medidas {
  falhas: number;
  horasParada: number;
  horasFuncionamento: number;
  mtbf: number | null;
  mttr: number | null;
  disponibilidade: number | null; // 0–1
  confiabilidade: number | null; // 0–1 (null = sem falhas: MTBF indefinido)
}

export interface IndicadorAtivo extends Medidas {
  ativoId: string;
  codApl: number;
  tag: string;
  nome: string;
  tipo: string;
  criticidade: "A" | "B" | "C" | null;
  horasPorDia: number;
  /** falhas sem carimbo de parada (entraram com 0 h — rever a OS). */
  falhasSemParada: number;
}

export interface PontoTendencia extends Medidas {
  competencia: string; // "YYYY-MM"
  label: string; // "Out/26"
}

export interface IndicadoresResponse {
  periodo: { de: string; ate: string; dias: number };
  horizonteDias: number;
  total: Medidas & { ativos: number; falhasSemParada: number };
  porAtivo: IndicadorAtivo[];
  tendencia: PontoTendencia[];
}

export interface FiltrosIndicadores {
  de: Date;
  ate: Date;
  ativoId?: string | null;
  criticidade?: "A" | "B" | "C" | null;
  horizonteDias?: number;
}

function medidas(func: number, parada: number, falhas: number, horizonteH: number): Medidas {
  const mtbf = calcMtbf(func, parada, falhas);
  return {
    falhas,
    horasParada: round2(parada)!,
    horasFuncionamento: round2(func)!,
    mtbf: round2(mtbf),
    mttr: round2(calcMttr(parada, falhas)),
    disponibilidade: func > 0 ? Math.max(0, (func - parada) / func) : null,
    confiabilidade: mtbf != null && mtbf > 0 ? Math.exp(-horizonteH / mtbf) : null,
  };
}

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Dias (inclusive) do mês `ano/mes` que caem dentro de [de, ate]. */
function diasDoMesNoPeriodo(ano: number, mes: number, de: Date, ate: Date): number {
  const ini = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes - 1, diasNoMes(ano, mes));
  const a = Math.max(ini.getTime(), inicioDia(de).getTime());
  const b = Math.min(fim.getTime(), inicioDia(ate).getTime());
  return b < a ? 0 : Math.round((b - a) / DIA) + 1;
}

type Acc = { falhas: number; parada: number; semParada: number };

export async function indicadoresConfiabilidade(f: FiltrosIndicadores): Promise<IndicadoresResponse> {
  const de = inicioDia(f.de);
  const ate = inicioDia(f.ate);
  const horizonteDias = f.horizonteDias && f.horizonteDias > 0 ? f.horizonteDias : 30;
  const horizonteH = horizonteDias * 24;

  // Tendência: 12 meses inteiros terminando no mês de `ate` (pode começar antes de `de`).
  const inicio12 = new Date(ate.getFullYear(), ate.getMonth() - 11, 1);
  const inicioConsulta = inicio12 < de ? inicio12 : de;
  const fimConsulta = new Date(ate.getFullYear(), ate.getMonth(), diasNoMes(ate.getFullYear(), ate.getMonth() + 1), 23, 59, 59, 999);
  const fimPeriodo = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate(), 23, 59, 59, 999);

  // Todos os ativos (inclusive LOCAL/inativos) para herdar horasPorDia e resolver nomes.
  const todos = await prisma.manutAtivo.findMany({
    select: { id: true, codApl: true, tag: true, nome: true, tipo: true, paiId: true, ativo: true, criticidade: true, horasPorDia: true },
  });
  const porId = new Map(todos.map((a) => [a.id, a]));
  const hpdCache = new Map<string, number>();
  const horasPorDiaDe = (id: string): number => {
    const memo = hpdCache.get(id);
    if (memo != null) return memo;
    let cur = porId.get(id);
    let h = 24;
    for (let i = 0; cur && i < 20; i++) {
      if (cur.horasPorDia != null && cur.horasPorDia > 0) { h = cur.horasPorDia; break; }
      cur = cur.paiId ? porId.get(cur.paiId) : undefined;
    }
    hpdCache.set(id, h);
    return h;
  };

  // Seleção: um ativo específico, ou os ativos ativos não-LOCAL (filtrados por criticidade).
  let selecionados = todos.filter((a) => a.ativo && a.tipo !== "LOCAL");
  if (f.ativoId) selecionados = todos.filter((a) => a.id === f.ativoId);
  else if (f.criticidade) selecionados = selecionados.filter((a) => a.criticidade === f.criticidade);
  const selecionadosIds = new Set(selecionados.map((a) => a.id));

  const ordens = await prisma.manutOrdem.findMany({
    where: { AND: [WHERE_FALHA_MTBF, wherePeriodoOS(inicioConsulta, fimConsulta), { ativoId: { not: null } }] },
    select: { ativoId: true, programadaPara: true, createdAt: true, paradaInicio: true, paradaFim: true },
  });

  // Falhas/parada por ativo × mês (chave "id|ano-mes"). `calcMes` = mês inteiro
  // (tendência); `calcPeriodo` = só OS dentro de [de, ate] (totais, respeitando o
  // corte de dias quando o período começa/termina no meio do mês).
  const calcMes = new Map<string, Acc>();
  const calcPeriodo = new Map<string, Acc>();
  const somar = (m: Map<string, Acc>, k: string, o: { paradaInicio: Date | null; paradaFim: Date | null }) => {
    const acc = m.get(k) ?? { falhas: 0, parada: 0, semParada: 0 };
    acc.falhas += 1;
    acc.parada += horasParada(o);
    if (!o.paradaInicio || !o.paradaFim) acc.semParada += 1;
    m.set(k, acc);
  };
  for (const o of ordens) {
    if (!o.ativoId || !selecionadosIds.has(o.ativoId)) continue;
    const ref = dataReferenciaOS(o);
    const k = `${o.ativoId}|${ref.getFullYear()}-${ref.getMonth() + 1}`;
    somar(calcMes, k, o);
    if (ref >= de && ref <= fimPeriodo) somar(calcPeriodo, k, o);
  }

  // Meses do período [de, ate].
  const mesesPeriodo: { ano: number; mes: number }[] = [];
  for (let d = new Date(de.getFullYear(), de.getMonth(), 1); d <= ate; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    mesesPeriodo.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  }

  // ── Por ativo, no período [de, ate] ───────────────────────────────────────
  const porAtivo: IndicadorAtivo[] = [];
  let tFalhas = 0, tParada = 0, tFunc = 0, tSemParada = 0;
  for (const a of selecionados) {
    let falhas = 0, parada = 0, func = 0, semParada = 0;
    for (const m of mesesPeriodo) {
      const dias = diasDoMesNoPeriodo(m.ano, m.mes, de, ate);
      if (dias === 0) continue;
      const c = calcPeriodo.get(`${a.id}|${m.ano}-${m.mes}`);
      falhas += c?.falhas ?? 0; parada += c?.parada ?? 0; semParada += c?.semParada ?? 0;
      func += dias * horasPorDiaDe(a.id);
    }
    tFalhas += falhas; tParada += parada; tFunc += func; tSemParada += semParada;
    porAtivo.push({
      ativoId: a.id, codApl: a.codApl, tag: a.tag, nome: a.nome, tipo: a.tipo, criticidade: a.criticidade,
      horasPorDia: horasPorDiaDe(a.id), falhasSemParada: semParada,
      ...medidas(func, parada, falhas, horizonteH),
    });
  }
  // Piores primeiro: menor disponibilidade, depois mais falhas.
  porAtivo.sort((x, y) => (x.disponibilidade ?? 1) - (y.disponibilidade ?? 1) || y.falhas - x.falhas || x.tag.localeCompare(y.tag, "pt-BR"));

  // ── Tendência: 12 meses inteiros terminando no mês de `ate` ───────────────
  const tendencia: PontoTendencia[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(inicio12.getFullYear(), inicio12.getMonth() + i, 1);
    const ano = d.getFullYear(), mes = d.getMonth() + 1;
    // mês corrente conta só os dias já corridos (senão a disponibilidade infla)
    const diasMes = ano === ate.getFullYear() && mes === ate.getMonth() + 1 ? ate.getDate() : diasNoMes(ano, mes);
    let falhas = 0, parada = 0, func = 0;
    for (const a of selecionados) {
      const c = calcMes.get(`${a.id}|${ano}-${mes}`);
      falhas += c?.falhas ?? 0; parada += c?.parada ?? 0;
      func += diasMes * horasPorDiaDe(a.id);
    }
    tendencia.push({ competencia: `${ano}-${String(mes).padStart(2, "0")}`, label: `${MESES[mes - 1]}/${String(ano).slice(2)}`, ...medidas(func, parada, falhas, horizonteH) });
  }

  return {
    periodo: { de: de.toLocaleDateString("sv-SE"), ate: ate.toLocaleDateString("sv-SE"), dias: Math.round((ate.getTime() - de.getTime()) / DIA) + 1 },
    horizonteDias,
    total: { ativos: selecionados.length, falhasSemParada: tSemParada, ...medidas(tFunc, tParada, tFalhas, horizonteH) },
    porAtivo,
    tendencia,
  };
}
