export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";
import { STATUS_OS_LABEL, PRIORIDADE_LABEL, type StatusOS } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// Relatório de O.S. sobre as ordens nativas (ManutOrdem). O período é pela data
// de abertura (createdAt = DATENT do histórico importado). Os status nativos são
// agrupados nas 5 faixas que o relatório sempre mostrou:
//   A Em aberto    = ABERTA, PLANEJADA
//   E Em espera    = PAUSADA, AGUARDANDO_MATERIAL, AGUARDANDO_TERCEIRO
//   P Em execução  = EM_EXECUCAO, ENCERRADA (aguardando validação do PCM)
//   F Concluída    = CONCLUIDA          C Cancelada = CANCELADA
// Corretiva = ManutTipo.natureza CORRETIVA; o resto conta como preventiva.
// ─────────────────────────────────────────────────────────────────────────────

export type FaixaStatus = "A" | "E" | "P" | "F" | "C";

function faixaStatus(status: string): FaixaStatus {
  switch (status) {
    case "CONCLUIDA": return "F";
    case "CANCELADA": return "C";
    case "PAUSADA":
    case "AGUARDANDO_MATERIAL":
    case "AGUARDANDO_TERCEIRO": return "E";
    case "EM_EXECUCAO":
    case "ENCERRADA": return "P";
    default: return "A";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PeriodoOS {
  label: string;       // "11/02 - 15/02" ou "Jan/25"
  criadas: number;
  concluidas: number;
  preventivas: number;
  corretivas: number;
}

export interface DetalheOS {
  id: string;           // ManutOrdem.id → /pcm/os/<id>
  numero: string;       // OS-2572
  titulo: string;
  local: string;
  equipamento: string;
  tipo: string;
  statord: FaixaStatus; // faixa do relatório
  status: string;       // status nativo
  statusLabel: string;
  prioridade: string | null; // "Alta", "Média"…
  datent: string;  // "YYYY-MM-DD HH:mm"
}

export interface AplicacaoEmAberto {
  ativoId: string | null;
  codApl: number | null;
  tag: string | null;
  equipamento: string;
  local: string;
  emAberto: number;
  emEspera: number;
  emProgresso: number;
  total: number;
  ordens: DetalheOS[]; // O.S. abertas do ativo (drill do backlog)
}

export interface OrdensResponse {
  periodo: number;
  agrupamento: string;
  totais: { criadas: number; concluidas: number; indiceConclusao: number };
  tipoTotais: { preventivas: number; corretivas: number; pctPreventivas: number };
  periodos: PeriodoOS[];
  status: {
    emAberto: number;
    emEspera: number;
    emProgresso: number;
    concluidas: number;
    canceladas: number;
    total: number;
  };
  detalhe: Record<string, DetalheOS[]>;
  aplicacoesEmAberto: AplicacaoEmAberto[];
  source: "db";
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Segunda-feira (00:00) da semana da data. */
function inicioSemana(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

function chavePeriodo(d: Date, agrupamento: "semana" | "mes"): { chave: string; label: string } {
  if (agrupamento === "mes") {
    return { chave: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
  }
  const seg = inicioSemana(d);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return {
    chave: `${seg.getFullYear()}-${pad(seg.getMonth() + 1)}-${pad(seg.getDate())}`,
    label: `${pad(seg.getDate())}/${pad(seg.getMonth() + 1)} - ${pad(dom.getDate())}/${pad(dom.getMonth() + 1)}`,
  };
}

function fmtDatetime(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SELECT_OS = {
  id: true, numero: true, descricao: true, status: true, prioridade: true, createdAt: true, localTexto: true,
  ativoId: true,
  tipo: { select: { nome: true, natureza: true } },
  ativo: { select: { codApl: true, tag: true, nome: true, localizacao: true, pai: { select: { nome: true } } } },
} as const;

type OsLinha = {
  id: string; numero: string; descricao: string; status: string; prioridade: string; createdAt: Date; localTexto: string | null;
  ativoId: string | null;
  tipo: { nome: string; natureza: string };
  ativo: { codApl: number; tag: string; nome: string; localizacao: string | null; pai: { nome: string } | null } | null;
};

const localDe = (o: OsLinha) => o.ativo?.localizacao || o.ativo?.pai?.nome || o.localTexto || "Não informado";

function detalheDe(o: OsLinha): DetalheOS {
  return {
    id: o.id,
    numero: o.numero,
    titulo: o.descricao?.trim() || "Sem descrição",
    local: localDe(o),
    equipamento: o.ativo?.nome ?? "Não informado",
    tipo: o.tipo.nome,
    statord: faixaStatus(o.status),
    status: o.status,
    statusLabel: STATUS_OS_LABEL[o.status as StatusOS] ?? o.status,
    prioridade: PRIORIDADE_LABEL[o.prioridade] ?? null,
    datent: fmtDatetime(o.createdAt),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const params      = req.nextUrl.searchParams;
  const dias        = Math.max(1, parseInt(params.get("dias") ?? "365", 10) || 365);
  const agrupamento = (params.get("agrupamento") === "mes" ? "mes" : "semana") as "semana" | "mes";
  const desde       = new Date(Date.now() - dias * 86_400_000);

  try {
    const [doPeriodo, abertas] = await Promise.all([
      prisma.manutOrdem.findMany({
        where: { createdAt: { gte: desde } },
        select: SELECT_OS,
        orderBy: { createdAt: "desc" },
      }) as Promise<OsLinha[]>,
      // backlog atual (independe do período)
      prisma.manutOrdem.findMany({
        where: { status: { in: STATUS_ABERTOS } },
        select: SELECT_OS,
        orderBy: { createdAt: "desc" },
      }) as Promise<OsLinha[]>,
    ]);

    // ── 1. Períodos ──────────────────────────────────────────────────────────
    const porPeriodo = new Map<string, PeriodoOS>();
    const status: OrdensResponse["status"] = { emAberto: 0, emEspera: 0, emProgresso: 0, concluidas: 0, canceladas: 0, total: 0 };
    const detalhe: Record<string, DetalheOS[]> = { A: [], E: [], P: [], F: [], C: [] };

    for (const o of doPeriodo) {
      const { chave, label } = chavePeriodo(o.createdAt, agrupamento);
      const p = porPeriodo.get(chave) ?? { label, criadas: 0, concluidas: 0, preventivas: 0, corretivas: 0 };
      const faixa = faixaStatus(o.status);
      p.criadas++;
      if (faixa === "F") p.concluidas++;
      if (o.tipo.natureza === "CORRETIVA") p.corretivas++;
      else p.preventivas++;
      porPeriodo.set(chave, p);

      // ── 2. Status ──────────────────────────────────────────────────────────
      if (faixa === "A") status.emAberto++;
      else if (faixa === "E") status.emEspera++;
      else if (faixa === "P") status.emProgresso++;
      else if (faixa === "F") status.concluidas++;
      else status.canceladas++;

      // ── 3. Detalhe (abertas todas; concluídas/canceladas: as 50 mais recentes)
      if (faixa === "F" || faixa === "C") {
        if (detalhe[faixa].length < 50) detalhe[faixa].push(detalheDe(o));
      } else {
        detalhe[faixa].push(detalheDe(o));
      }
    }
    const periodos = Array.from(porPeriodo.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, p]) => p);

    // ── 4. Ativos com O.S. em aberto ─────────────────────────────────────────
    const porAtivo = new Map<string, AplicacaoEmAberto>();
    for (const o of abertas) {
      const chave = o.ativoId ?? "_sem_ativo";
      const a = porAtivo.get(chave) ?? {
        ativoId: o.ativoId,
        codApl: o.ativo?.codApl ?? null,
        tag: o.ativo?.tag ?? null,
        equipamento: o.ativo?.nome ?? "Sem ativo",
        local: o.ativo ? localDe(o) : "Sem local",
        emAberto: 0, emEspera: 0, emProgresso: 0, total: 0,
        ordens: [],
      };
      const faixa = faixaStatus(o.status);
      if (faixa === "A") a.emAberto++;
      else if (faixa === "E") a.emEspera++;
      else a.emProgresso++;
      a.total++;
      a.ordens.push(detalheDe(o));
      porAtivo.set(chave, a);
    }
    const aplicacoesEmAberto = Array.from(porAtivo.values()).sort((a, b) => b.total - a.total);

    // ── Totais derivados ─────────────────────────────────────────────────────
    const totalCriadas     = periodos.reduce((s, p) => s + p.criadas, 0);
    const totalConcluidas  = periodos.reduce((s, p) => s + p.concluidas, 0);
    const totalPreventivas = periodos.reduce((s, p) => s + p.preventivas, 0);
    const totalCorretivas  = periodos.reduce((s, p) => s + p.corretivas, 0);
    status.total = totalCriadas;

    const response: OrdensResponse = {
      periodo: dias,
      agrupamento,
      totais: {
        criadas: totalCriadas,
        concluidas: totalConcluidas,
        indiceConclusao: totalCriadas > 0 ? Math.round((totalConcluidas / totalCriadas) * 1000) / 10 : 0,
      },
      tipoTotais: {
        preventivas: totalPreventivas,
        corretivas: totalCorretivas,
        pctPreventivas: totalPreventivas + totalCorretivas > 0
          ? Math.round((totalPreventivas / (totalPreventivas + totalCorretivas)) * 1000) / 10
          : 0,
      },
      periodos,
      status,
      detalhe,
      aplicacoesEmAberto,
      source: "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[pcm/ordens]", err);
    return NextResponse.json({ error: "Não foi possível montar o relatório de O.S." }, { status: 500 });
  }
}
