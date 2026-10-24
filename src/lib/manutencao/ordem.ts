import { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { custosComFallback } from "@/lib/custo-empresa";

// ─────────────────────────────────────────────────────────────────────────────
// Motor da Ordem de Serviço (docs/manutencao-prd.md §5). Única porta de mudança
// de status: grava a linha do tempo, valida as pré-condições e mantém custo e
// status do ativo em dia. Conclusão em DUAS etapas: o técnico ENCERRA, o PCM
// CONCLUI (ou devolve para execução).
// ─────────────────────────────────────────────────────────────────────────────

type Db = typeof prismaSemEscopo | Prisma.TransactionClient;

export const STATUS_OS = [
  "ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL",
  "AGUARDANDO_TERCEIRO", "ENCERRADA", "CONCLUIDA", "CANCELADA",
] as const;
export type StatusOS = (typeof STATUS_OS)[number];

export const STATUS_OS_LABEL: Record<StatusOS, string> = {
  ABERTA: "Aberta",
  PLANEJADA: "Planejada",
  EM_EXECUCAO: "Em execução",
  PAUSADA: "Pausada",
  AGUARDANDO_MATERIAL: "Aguardando material",
  AGUARDANDO_TERCEIRO: "Aguardando terceiro",
  ENCERRADA: "Encerrada (validar)",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const STATUS_OS_ABERTOS: StatusOS[] = ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ENCERRADA"];

export const PRIORIDADES = ["EMERGENCIA", "ALTA", "MEDIA", "BAIXA"] as const;
export const PRIORIDADE_LABEL: Record<string, string> = { EMERGENCIA: "Emergência", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
/** Prioridade padrão da OS a partir da criticidade do ativo. */
export const PRIORIDADE_POR_CRITICIDADE: Record<string, string> = { A: "ALTA", B: "MEDIA", C: "BAIXA" };

export const ACOES_OS = [
  "planejar", "iniciar", "pausar", "aguardar_material", "aguardar_terceiro", "retomar",
  "encerrar", "concluir", "devolver", "reabrir", "cancelar",
] as const;
export type AcaoOS = (typeof ACOES_OS)[number];

/** Ações que exigem o papel de PCM (permissão de editar ordens), não só o técnico. */
export const ACOES_PCM: AcaoOS[] = ["concluir", "devolver", "reabrir", "cancelar", "planejar"];

const ORIGEM: Record<AcaoOS, StatusOS[]> = {
  planejar: ["ABERTA", "PLANEJADA"],
  iniciar: ["ABERTA", "PLANEJADA"],
  pausar: ["EM_EXECUCAO"],
  aguardar_material: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_TERCEIRO"],
  aguardar_terceiro: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL"],
  retomar: ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"],
  encerrar: ["EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ABERTA", "PLANEJADA"],
  concluir: ["ENCERRADA"],
  devolver: ["ENCERRADA"],
  reabrir: ["CONCLUIDA"],
  cancelar: ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO", "ENCERRADA"],
};

const DESTINO: Record<AcaoOS, StatusOS> = {
  planejar: "PLANEJADA",
  iniciar: "EM_EXECUCAO",
  pausar: "PAUSADA",
  aguardar_material: "AGUARDANDO_MATERIAL",
  aguardar_terceiro: "AGUARDANDO_TERCEIRO",
  retomar: "EM_EXECUCAO",
  encerrar: "ENCERRADA",
  concluir: "CONCLUIDA",
  devolver: "EM_EXECUCAO",
  reabrir: "EM_EXECUCAO",
  cancelar: "CANCELADA",
};

export function acoesPermitidas(status: string): AcaoOS[] {
  return ACOES_OS.filter((a) => ORIGEM[a].includes(status as StatusOS));
}

export class ErroOS extends Error {
  constructor(msg: string, public status = 422) { super(msg); }
}

export async function proximoNumeroOS(empresaId: string): Promise<string> {
  return `OS-${String(await proximaSequenciaDaEmpresa(empresaId, "OS")).padStart(4, "0")}`;
}
export async function proximoNumeroSS(empresaId: string): Promise<string> {
  return `SS-${String(await proximaSequenciaDaEmpresa(empresaId, "SS")).padStart(4, "0")}`;
}

export function horasApontamento(a: { inicio: Date; fim: Date | null }): number {
  if (!a.fim) return 0;
  return Math.max(0, (a.fim.getTime() - a.inicio.getTime()) / 3_600_000);
}

/**
 * Pendências que impedem ENCERRAR a OS (regra na conclusão, não no relatório):
 * cronômetro aberto, parada sem fim, checklist sem resposta e — em tipo que conta
 * como falha — nenhuma linha com sintoma e causa.
 */
export async function pendenciasEncerramento(ordemId: string, db: Db = prismaSemEscopo): Promise<string[]> {
  const o = await db.manutOrdem.findUnique({
    where: { id: ordemId },
    include: { tipo: true, apontamentos: true, servicos: true },
  });
  if (!o) return ["OS não encontrada."];
  const p: string[] = [];
  if (!o.ativoId) p.push("Informe o ativo da OS.");
  if (o.apontamentos.some((a) => !a.fim)) p.push("Há apontamento de mão de obra em andamento — finalize o cronômetro.");
  if (o.apontamentos.length === 0 && !o.tipo.natureza.startsWith("INSPECAO")) p.push("Aponte as horas de quem executou.");
  if (o.paradaInicio && !o.paradaFim) p.push("Informe quando o ativo voltou a funcionar (fim da parada).");
  const checklist = o.servicos.filter((s) => s.tipoResposta !== "NENHUMA");
  if (checklist.some((s) => s.resposta == null || s.resposta === "")) p.push("Responda todos os itens do checklist.");
  if (o.tipo.contaComoFalha && !o.servicos.some((s) => s.sintomaId && s.causaId)) {
    p.push("OS corretiva: registre ao menos um serviço com sintoma (defeito) e causa.");
  }
  return p;
}

/** Recalcula e persiste custo de MO, material e terceiros da OS. */
export async function recalcularCustoOrdem(ordemId: string, db: Db = prismaSemEscopo): Promise<void> {
  const o = await db.manutOrdem.findUnique({
    where: { id: ordemId },
    select: {
      empresaId: true,
      equipe: { select: { custoHora: true } },
      apontamentos: { select: { inicio: true, fim: true, custoHora: true } },
      materiais: { where: { origem: "LEGADO" }, select: { valorTotal: true } },
      terceiros: { select: { valor: true } },
      requisicoes: {
        where: { status: "ATENDIDA" },
        select: { tipo: true, itens: { select: { itemId: true, quantidade: true } } },
      },
    },
  });
  if (!o) return;
  const custoEquipe = o.equipe?.custoHora ? Number(o.equipe.custoHora) : 0;
  const mo = o.apontamentos.reduce((s, a) => s + horasApontamento(a) * (a.custoHora != null ? Number(a.custoHora) : custoEquipe), 0);
  let mat = o.materiais.reduce((s, m) => s + Number(m.valorTotal), 0);
  const itemIds = Array.from(new Set(o.requisicoes.flatMap((r) => r.itens.map((i) => i.itemId))));
  if (itemIds.length) {
    const custos = await custosComFallback(db as never, o.empresaId, itemIds);
    for (const r of o.requisicoes) {
      const sinal = r.tipo === "DEVOLUCAO" ? -1 : 1;
      for (const i of r.itens) mat += sinal * Number(i.quantidade) * (custos.get(i.itemId) ?? 0);
    }
  }
  const terc = o.terceiros.reduce((s, t) => s + Number(t.valor), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  await db.manutOrdem.update({
    where: { id: ordemId },
    data: { custoMaoObra: r2(mo), custoMaterial: r2(mat), custoTerceiros: r2(terc) },
  });
}

/** Ativo PARADO se existe OS não cancelada com parada iniciada e sem fim. */
export async function recomputarStatusAtivo(ativoId: string | null | undefined, db: Db = prismaSemEscopo): Promise<void> {
  if (!ativoId) return;
  const parada = await db.manutOrdem.count({
    where: { ativoId, status: { not: "CANCELADA" }, paradaInicio: { not: null }, paradaFim: null },
  });
  await db.manutAtivo.update({ where: { id: ativoId }, data: { status: parada > 0 ? "PARADO" : "OPERANDO" } });
}

export async function registrarEvento(ordemId: string, tipo: string, detalhe: string | null, usuario: string | null, db: Db = prismaSemEscopo) {
  await db.manutOrdemEvento.create({ data: { ordemId, tipo, detalhe, usuario } });
}

/**
 * Executa uma ação de status na OS. `motivo` é obrigatório em pausar/aguardar/
 * devolver/reabrir/cancelar. Ao CONCLUIR OS de plano, atualiza o próximo
 * vencimento da aplicação do plano.
 */
export async function transicionarOrdem(
  ordemId: string,
  acao: AcaoOS,
  opts: { usuario: string; motivo?: string | null; programadaPara?: Date | null; fimParada?: Date | null },
  db: typeof prismaSemEscopo = prismaSemEscopo,
): Promise<StatusOS> {
  const o = await db.manutOrdem.findUnique({ where: { id: ordemId } });
  if (!o) throw new ErroOS("OS não encontrada.", 404);
  if (!ORIGEM[acao].includes(o.status as StatusOS)) {
    throw new ErroOS(`Não é possível "${acao}" uma OS ${STATUS_OS_LABEL[o.status as StatusOS] ?? o.status}.`);
  }
  const motivo = opts.motivo?.trim() || null;
  if (["pausar", "aguardar_material", "aguardar_terceiro", "devolver", "reabrir", "cancelar"].includes(acao) && !motivo) {
    throw new ErroOS("Informe o motivo.");
  }
  const agora = new Date();
  const data: Prisma.ManutOrdemUpdateInput = { status: DESTINO[acao] };

  if (acao === "planejar" && opts.programadaPara) data.programadaPara = opts.programadaPara;
  if (acao === "iniciar" && !o.iniciadaEm) data.iniciadaEm = agora;
  if (acao === "encerrar") {
    if (o.paradaInicio && !o.paradaFim && opts.fimParada) {
      await db.manutOrdem.update({ where: { id: ordemId }, data: { paradaFim: opts.fimParada } });
    }
    const pend = await pendenciasEncerramento(ordemId, db);
    if (pend.length) throw new ErroOS(pend.join(" "));
    data.encerradaEm = agora;
    data.encerradaPor = opts.usuario;
  }
  if (acao === "concluir") {
    const pend = await pendenciasEncerramento(ordemId, db);
    if (pend.length) throw new ErroOS(pend.join(" "));
    data.concluidaEm = agora;
    data.concluidaPor = opts.usuario;
  }
  if (acao === "devolver") { data.encerradaEm = null; data.encerradaPor = null; }
  if (acao === "reabrir") { data.concluidaEm = null; data.concluidaPor = null; data.encerradaEm = null; data.encerradaPor = null; }
  if (acao === "cancelar") { data.canceladaEm = agora; data.motivoCancelamento = motivo; }

  await db.manutOrdem.update({ where: { id: ordemId }, data });
  await db.manutOrdemEvento.create({ data: { ordemId, tipo: acao.toUpperCase(), detalhe: motivo, usuario: opts.usuario } });

  if (acao === "concluir" && o.planoAtivoId) await atualizarVencimentoPlano(o.planoAtivoId, agora, o.leituraMedidor, db);
  if (acao === "concluir" || acao === "reabrir" || acao === "cancelar") await recalcularCustoOrdem(ordemId, db);
  await recomputarStatusAtivo(o.ativoId, db);
  return DESTINO[acao];
}

export type NovaOrdem = {
  empresaId: string;
  ativoId: string;
  tipoId: string;
  descricao: string;
  prioridade?: string | null;
  equipeId?: string | null;
  responsavelId?: string | null;
  programadaPara?: Date | null;
  prazo?: Date | null;
  horasEstimadas?: number | null;
  exigeParada?: boolean;
  paradaInicio?: Date | null;
  planoId?: string | null;
  planoAtivoId?: string | null;
  planoRef?: string | null;
  status?: StatusOS;
  usuario: string;
  origem?: string;
};

/**
 * Cria a OS (número da sequência da empresa, prioridade padrão pela criticidade,
 * centro de custo herdado do ativo) e o evento CRIADA. Parada informada já
 * marca o ativo como PARADO.
 */
export async function criarOrdem(n: NovaOrdem, db: typeof prismaSemEscopo = prismaSemEscopo) {
  const ativo = await db.manutAtivo.findUnique({ where: { id: n.ativoId }, select: { id: true, codApl: true, centroCustoId: true, empresaId: true } });
  if (!ativo) throw new ErroOS("Ativo não encontrado.", 404);
  if (ativo.empresaId !== n.empresaId) throw new ErroOS("O ativo é de outra empresa.");
  let prioridade = n.prioridade && PRIORIDADES.includes(n.prioridade as never) ? n.prioridade : null;
  if (!prioridade) {
    const crit = await db.ativoCriticidade.findUnique({ where: { codApl: ativo.codApl }, select: { criticidade: true } });
    prioridade = crit ? PRIORIDADE_POR_CRITICIDADE[crit.criticidade] : "MEDIA";
  }
  const numero = await proximoNumeroOS(n.empresaId);
  const ordem = await db.manutOrdem.create({
    data: {
      empresaId: n.empresaId, numero, ativoId: n.ativoId, tipoId: n.tipoId, descricao: n.descricao.trim(), prioridade,
      equipeId: n.equipeId || null, responsavelId: n.responsavelId || null,
      programadaPara: n.programadaPara ?? null, prazo: n.prazo ?? null,
      horasEstimadas: n.horasEstimadas ?? null, exigeParada: !!n.exigeParada,
      paradaInicio: n.paradaInicio ?? null, centroCustoId: ativo.centroCustoId,
      planoId: n.planoId ?? null, planoAtivoId: n.planoAtivoId ?? null, planoRef: n.planoRef ?? null,
      status: n.status ?? "ABERTA", criadoPor: n.usuario,
    },
  });
  await db.manutOrdemEvento.create({ data: { ordemId: ordem.id, tipo: "CRIADA", detalhe: n.origem ?? null, usuario: n.usuario } });
  if (n.paradaInicio) await recomputarStatusAtivo(n.ativoId, db);
  return ordem;
}

/** Após concluir OS de plano: grava a última execução e calcula o próximo vencimento. */
export async function atualizarVencimentoPlano(planoAtivoId: string, execucao: Date, leitura: Prisma.Decimal | null, db: Db = prismaSemEscopo) {
  const pa = await db.manutPlanoAtivo.findUnique({
    where: { id: planoAtivoId },
    include: { plano: { select: { baseNaConclusao: true } }, medidor: { select: { acumulado: true } } },
  });
  if (!pa) return;
  if (pa.gatilho === "CALENDARIO" && pa.intervaloDias) {
    const base = pa.plano.baseNaConclusao || !pa.proximoVencimento ? execucao : pa.proximoVencimento;
    await db.manutPlanoAtivo.update({
      where: { id: planoAtivoId },
      data: { ultimaExecucao: execucao, proximoVencimento: new Date(base.getTime() + pa.intervaloDias * 86_400_000) },
    });
  } else if (pa.gatilho === "MEDIDOR" && pa.intervaloMedida) {
    const medida = leitura != null ? Number(leitura) : pa.medidor ? Number(pa.medidor.acumulado) : null;
    const base = pa.plano.baseNaConclusao || pa.proximaMedida == null ? medida : Number(pa.proximaMedida);
    await db.manutPlanoAtivo.update({
      where: { id: planoAtivoId },
      data: {
        ultimaExecucao: execucao,
        ultimaMedida: medida,
        proximaMedida: base != null ? base + Number(pa.intervaloMedida) : null,
      },
    });
  }
}
