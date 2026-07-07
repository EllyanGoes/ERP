import { prismaSemEscopo } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Agregação diária do tracking (PRD seção 3.4).
//
// O matching evento→nó acontece AQUI (no cron), não na ingestão — a ingestão
// fica O(1) e mudanças nos urlPatterns dos nós são recuperadas pela janela
// retroativa do cron. O canvas (modo análise) lê só de MetricaNoDiaria.
//
// Fuso: o "dia" é o dia civil em America/Sao_Paulo. O projeto não tem lib de
// timezone (date-fns puro não converte fuso), então usamos offset FIXO -03:00.
// Limitação conhecida: se o Brasil voltar a ter horário de verão, o corte do
// dia fica 1h deslocado nesses períodos (aceitável para métricas de funil).
// ─────────────────────────────────────────────────────────────────────────────

const OFFSET_SP = "-03:00";

/** "YYYY-MM-DD" do dia civil em São Paulo para um instante qualquer. */
function diaSP(instante: Date): string {
  const deslocado = new Date(instante.getTime() - 3 * 3600_000);
  return deslocado.toISOString().slice(0, 10);
}

/**
 * Intervalo UTC [inicio, fim) do dia civil SP que contém o instante, e a data
 * (meia-noite UTC) usada em MetricaNoDiaria.data (@db.Date). Compartilhado com
 * a agregação do ERP (agrega-erp.ts).
 */
export function intervaloDiaSP(instante: Date): {
  dia: string;
  inicio: Date;
  fim: Date;
  dataMetrica: Date;
} {
  const dia = diaSP(instante);
  const inicio = new Date(`${dia}T00:00:00.000${OFFSET_SP}`);
  return {
    dia,
    inicio,
    fim: new Date(inicio.getTime() + 24 * 3600_000),
    dataMetrica: new Date(`${dia}T00:00:00.000Z`),
  };
}

/**
 * Glob simples com `*` (case-insensitive). O pattern pode ser uma URL completa
 * ("https://site.com/lp-promo*") — nesse caso só o pathname dela é usado.
 */
export function matchUrlPattern(pattern: string, path: string): boolean {
  let p = pattern.trim();
  if (!p) return false;
  if (p.includes("://")) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* usa a string crua */
    }
  }
  if (!p.startsWith("/")) p = `/${p}`;
  // Escapa tudo que é especial de regex, exceto o *, que vira ".*".
  const regex = new RegExp(
    `^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    "i",
  );
  return regex.test(path);
}

type ConfigPagina = { urlPatterns?: string[] };
type ConfigAcao = { eventoNome?: string };

export type ResumoAgregacao = {
  dia: string;
  funis: number;
  nosComMetrica: number;
  eventosDoDia: number;
};

/**
 * Agrega um dia de TrackingEvento em MetricaNoDiaria (fonte=TRACKING) para
 * todos os funis ATIVOS. Idempotente: delete+insert do dia por funil.
 */
export async function agregarDia(data: Date): Promise<ResumoAgregacao> {
  const { dia, inicio, fim, dataMetrica } = intervaloDiaSP(data);

  const funis = await prismaSemEscopo.funil.findMany({
    where: { status: "ATIVO", ativo: true },
    select: {
      id: true,
      nos: {
        where: { ativo: true, tipo: { in: ["PAGINA", "ACAO"] } },
        select: { noId: true, tipo: true, config: true },
      },
    },
  });
  const funisComNos = funis.filter((f) => f.nos.length > 0);

  const resumo: ResumoAgregacao = { dia, funis: funisComNos.length, nosComMetrica: 0, eventosDoDia: 0 };
  if (funisComNos.length === 0) return resumo;

  // Eventos do dia uma vez só, compartilhados por todos os funis. Volume
  // diário é baixo o suficiente para contar DISTINCT em JS (groupBy do Prisma
  // não faz distinct count); o glob dos urlPatterns exigiria regex no SQL.
  const eventos = await prismaSemEscopo.trackingEvento.findMany({
    where: { createdAt: { gte: inicio, lt: fim } },
    select: { tipo: true, nome: true, path: true, sessaoId: true, visitanteId: true },
  });
  resumo.eventosDoDia = eventos.length;

  for (const funil of funisComNos) {
    const linhas: {
      funilId: string;
      noId: string;
      data: Date;
      fonte: string;
      visitantes: number;
      sessoes: number;
      eventos: number;
    }[] = [];

    for (const no of funil.nos) {
      let doNo: typeof eventos;
      if (no.tipo === "PAGINA") {
        const patterns = ((no.config as ConfigPagina | null)?.urlPatterns ?? []).filter(Boolean);
        if (patterns.length === 0) continue;
        doNo = eventos.filter(
          (e) => e.tipo === "pageview" && patterns.some((p) => matchUrlPattern(p, e.path)),
        );
      } else {
        const eventoNome = (no.config as ConfigAcao | null)?.eventoNome?.trim();
        if (!eventoNome) continue;
        doNo = eventos.filter(
          (e) => e.tipo === "evento" && (e.nome ?? "").toLowerCase() === eventoNome.toLowerCase(),
        );
      }
      if (doNo.length === 0) continue;

      linhas.push({
        funilId: funil.id,
        noId: no.noId,
        data: dataMetrica,
        fonte: "TRACKING",
        visitantes: new Set(doNo.map((e) => e.visitanteId)).size,
        sessoes: new Set(doNo.map((e) => e.sessaoId)).size,
        eventos: doNo.length,
      });
    }

    // Idempotente: reagrega o funil+dia inteiro (delete+insert).
    await prismaSemEscopo.$transaction([
      prismaSemEscopo.metricaNoDiaria.deleteMany({
        where: { funilId: funil.id, data: dataMetrica, fonte: "TRACKING" },
      }),
      ...(linhas.length > 0
        ? [prismaSemEscopo.metricaNoDiaria.createMany({ data: linhas })]
        : []),
    ]);
    resumo.nosComMetrica += linhas.length;
  }

  return resumo;
}

/** Purga eventos crus mais antigos que `dias` (o agregado fica para sempre). */
export async function purgarEventosAntigos(dias = 90): Promise<number> {
  const corte = new Date(Date.now() - dias * 24 * 3600_000);
  const r = await prismaSemEscopo.trackingEvento.deleteMany({
    where: { createdAt: { lt: corte } },
  });
  return r.count;
}
