export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, empresasDoEscopo } from "@/lib/prisma";
import { wherePeriodoOS } from "@/lib/manutencao/consultas";

// ─────────────────────────────────────────────────────────────────────────────
// Qualidade dos dados da Manutenção (regras nativas — docs/manutencao-prd.md §7).
// Tudo sobre ManutAtivo/ManutOrdem da empresa ativa (escopo automático):
//   • OS sem ativo                       • ativo sem localização
//   • corretiva concluída sem sintoma/causa (não entra direito no MTBF/FMEA)
//   • OS com parada iniciada e sem fim   • apontamento aberto há > 24h
//   • ativo crítico A sem plano ativo
// ─────────────────────────────────────────────────────────────────────────────

export interface OsRef {
  id: string;
  numero: string;
  data: string;      // ISO (programada ou abertura)
  status: string;
  tipo: string;
  ativo: string | null; // "TAG — nome"
}

export interface AtivoRef {
  codApl: number;
  tag: string;
  descricao: string;
}

export interface QualidadeResponse {
  periodo: number; // dias analisados
  totalOs: number;          // OS (não canceladas) no período
  totalCorretivas: number;  // corretivas concluídas no período
  // Crítico
  osSemAtivo:        { total: number; pct: number; lista: OsRef[] };
  corretivaSemFalha: { total: number; pct: number; semSintoma: number; semCausa: number; lista: (OsRef & { falta: string })[] };
  // Importante
  comParada:         { total: number; pct: number }; // corretivas concluídas com início+fim de parada
  paradaSemFim:      { total: number; fechadas: number; lista: (OsRef & { paradaInicio: string; horas: number })[] };
  apontamentoAberto: { total: number; lista: { ordemId: string; numero: string; nome: string; inicio: string; horas: number }[] };
  // Complementar
  ativoSemLocal:     { total: number; totalAtivos: number; lista: AtivoRef[] };
  criticoSemPlano:   { total: number; totalCriticos: number; lista: AtivoRef[] };
  // Resumo score (0-100)
  score: number;
  source: "db";
  generatedAt: string;
}

const HORA = 3_600_000;
const STATUS_FECHADOS = ["ENCERRADA", "CONCLUIDA"];

const SELECT_OS = {
  id: true, numero: true, status: true, programadaPara: true, createdAt: true,
  tipo: { select: { sigla: true, nome: true } },
  ativo: { select: { tag: true, nome: true } },
} as const;

type OsRow = {
  id: string; numero: string; status: string; programadaPara: Date | null; createdAt: Date;
  tipo: { sigla: string; nome: string }; ativo: { tag: string; nome: string } | null;
};

function osRef(o: OsRow): OsRef {
  return {
    id: o.id,
    numero: o.numero,
    data: (o.programadaPara ?? o.createdAt).toISOString(),
    status: o.status,
    tipo: `${o.tipo.sigla} — ${o.tipo.nome}`,
    ativo: o.ativo ? `${o.ativo.tag} — ${o.ativo.nome}` : null,
  };
}

async function calcular(dias: number): Promise<Omit<QualidadeResponse, "source" | "generatedAt">> {
  const agora = new Date();
  const desde = new Date(agora.getTime() - dias * 24 * HORA);
  const noPeriodo = { ...wherePeriodoOS(desde, agora), status: { not: "CANCELADA" } };
  const corretivaConcluida = {
    status: "CONCLUIDA",
    tipo: { contaComoFalha: true },
    concluidaEm: { gte: desde },
  };

  // ManutApontamento não é escopado: filtra pela empresa da OS à mão.
  const empresas = await empresasDoEscopo();

  const [
    totalOs, semAtivoTotal, semAtivoLista,
    corretivas, paradaAberta, apontamentos,
    ativos, criticos,
  ] = await Promise.all([
    prisma.manutOrdem.count({ where: noPeriodo }),
    prisma.manutOrdem.count({ where: { ...noPeriodo, ativoId: null } }),
    prisma.manutOrdem.findMany({
      where: { ...noPeriodo, ativoId: null },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: SELECT_OS,
    }),
    prisma.manutOrdem.findMany({
      where: corretivaConcluida,
      orderBy: { concluidaEm: "desc" },
      select: {
        ...SELECT_OS,
        paradaInicio: true, paradaFim: true,
        servicos: { select: { sintomaId: true, causaId: true } },
      },
    }),
    prisma.manutOrdem.findMany({
      where: { status: { not: "CANCELADA" }, paradaInicio: { not: null }, paradaFim: null },
      orderBy: { paradaInicio: "asc" },
      select: { ...SELECT_OS, paradaInicio: true },
    }),
    prisma.manutApontamento.findMany({
      where: {
        fim: null,
        inicio: { lt: new Date(agora.getTime() - 24 * HORA) },
        ordem: { status: { not: "CANCELADA" }, empresaId: { in: empresas } },
      },
      orderBy: { inicio: "asc" },
      take: 100,
      select: { ordemId: true, nome: true, inicio: true, ordem: { select: { numero: true } } },
    }),
    prisma.manutAtivo.findMany({
      where: { ativo: true },
      select: {
        id: true, codApl: true, tag: true, nome: true, tipo: true, localizacao: true,
        planos: { where: { ativo: true, plano: { ativo: true } }, select: { id: true }, take: 1 },
      },
      orderBy: { tag: "asc" },
    }),
    prisma.ativoCriticidade.findMany({ where: { criticidade: "A" }, select: { codApl: true } }),
  ]);

  // ── Corretivas concluídas sem sintoma/causa ──────────────────────────────
  let semSintoma = 0;
  let semCausa = 0;
  const semFalha: (OsRef & { falta: string })[] = [];
  let comParadaTotal = 0;
  for (const o of corretivas) {
    if (o.paradaInicio && o.paradaFim) comParadaTotal++;
    const temSintoma = o.servicos.some((s) => s.sintomaId);
    const temCausa = o.servicos.some((s) => s.causaId);
    if (temSintoma && temCausa) continue;
    if (!temSintoma) semSintoma++;
    if (!temCausa) semCausa++;
    semFalha.push({ ...osRef(o), falta: !temSintoma && !temCausa ? "sintoma e causa" : !temSintoma ? "sintoma" : "causa" });
  }

  // ── Ativos ───────────────────────────────────────────────────────────────
  // LOCAL é nó agrupador: a própria árvore já diz onde ele está.
  const equipamentos = ativos.filter((a) => a.tipo !== "LOCAL");
  const semLocal = equipamentos.filter((a) => !a.localizacao);
  const codCriticos = new Set(criticos.map((c) => c.codApl));
  const ativosCriticos = ativos.filter((a) => codCriticos.has(a.codApl));
  const criticoSemPlano = ativosCriticos.filter((a) => a.planos.length === 0);
  const ref = (a: { codApl: number; tag: string; nome: string }): AtivoRef => ({ codApl: a.codApl, tag: a.tag, descricao: a.nome });

  const totalCorretivas = corretivas.length;
  const pctDe = (n: number, total: number) => (total > 0 ? parseFloat(((n / total) * 100).toFixed(1)) : 0);
  const fechadas = paradaAberta.filter((o) => STATUS_FECHADOS.includes(o.status)).length;

  // Score: OS sem ativo (25), corretiva sem sintoma/causa (25), parada registrada
  // nas corretivas (20), ativo sem local (10), crítico sem plano (10),
  // apontamentos/paradas esquecidos (10).
  const sOsAtivo = 100 - pctDe(semAtivoTotal, totalOs);
  const sFalha = 100 - pctDe(semFalha.length, totalCorretivas);
  const sParada = totalCorretivas > 0 ? pctDe(comParadaTotal, totalCorretivas) : 100;
  const sLocal = 100 - pctDe(semLocal.length, equipamentos.length);
  const sCritico = 100 - pctDe(criticoSemPlano.length, ativosCriticos.length);
  const sEsquecidos = Math.max(0, 100 - (apontamentos.length + fechadas) * 5);
  const score = Math.round(
    sOsAtivo * 0.25 + sFalha * 0.25 + sParada * 0.2 + sLocal * 0.1 + sCritico * 0.1 + sEsquecidos * 0.1,
  );

  return {
    periodo: dias,
    totalOs,
    totalCorretivas,
    osSemAtivo: { total: semAtivoTotal, pct: pctDe(semAtivoTotal, totalOs), lista: semAtivoLista.map(osRef) },
    corretivaSemFalha: {
      total: semFalha.length,
      pct: pctDe(semFalha.length, totalCorretivas),
      semSintoma,
      semCausa,
      lista: semFalha.slice(0, 50),
    },
    comParada: { total: comParadaTotal, pct: pctDe(comParadaTotal, totalCorretivas) },
    paradaSemFim: {
      total: paradaAberta.length,
      fechadas,
      lista: paradaAberta.map((o) => ({
        ...osRef(o),
        paradaInicio: o.paradaInicio!.toISOString(),
        horas: Math.round((agora.getTime() - o.paradaInicio!.getTime()) / HORA),
      })),
    },
    apontamentoAberto: {
      total: apontamentos.length,
      lista: apontamentos.map((a) => ({
        ordemId: a.ordemId,
        numero: a.ordem.numero,
        nome: a.nome,
        inicio: a.inicio.toISOString(),
        horas: Math.round((agora.getTime() - a.inicio.getTime()) / HORA),
      })),
    },
    ativoSemLocal: { total: semLocal.length, totalAtivos: equipamentos.length, lista: semLocal.map(ref) },
    criticoSemPlano: { total: criticoSemPlano.length, totalCriticos: ativosCriticos.length, lista: criticoSemPlano.map(ref) },
    score,
  };
}

// GET /api/pcm/qualidade[?dias=365]
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const n = Number(req.nextUrl.searchParams.get("dias"));
  const dias = Number.isInteger(n) && n > 0 && n <= 3650 ? n : 365;
  const data = await calcular(dias);
  return NextResponse.json({ ...data, source: "db", generatedAt: new Date().toISOString() } satisfies QualidadeResponse);
}
