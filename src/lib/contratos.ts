// Contratos — motor (docs/contratos-prd.md §5). Funções puras sobre o
// contrato + aditivos: termos vigentes numa data, eventos projetados (janela de
// aviso prévio, fim, reajuste), pendências tipadas e agregados do painel.
// Regras de conformidade entram aqui, nunca na UI.
import type { Prisma } from "@prisma/client";
import { prismaSemEscopo } from "@/lib/prisma";

export const DIA_MS = 86_400_000;
export const diasAte = (d: Date, hoje: Date) => Math.ceil((d.getTime() - hoje.getTime()) / DIA_MS);
export function somaMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + meses);
  return r;
}

export type SeveridadeContrato = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
export type TipoPendenciaContrato =
  | "SEM_DOCUMENTO" | "NAO_ASSINADO" | "SEM_RESPONSAVEL"
  | "VENCE_EM_BREVE" | "VENCIDO" | "JANELA_RESCISAO" | "REAJUSTE_PENDENTE"
  | "ADITIVO_SEM_DOCUMENTO" | "MINUTA_PARADA";
export type PendenciaContrato = {
  tipo: TipoPendenciaContrato; severidade: SeveridadeContrato; titulo: string; detalhe?: string;
  contratoId: string; contratoNumero: string; contratoTitulo: string; vence?: Date | null; link: string;
};

export const CONTRATO_SELECT = {
  id: true, empresaId: true, numero: true, titulo: true, tipo: true, lado: true, status: true,
  fornecedorId: true, clienteId: true, responsavelId: true, centroCustoId: true, naturezaFinanceiraId: true,
  objeto: true, inicio: true, fim: true, renovacao: true, renovacaoMeses: true, avisoPrevioDias: true,
  modalidade: true, valor: true, valorTotalEstimado: true, periodicidade: true, diaVencimento: true, primeiroVencimento: true,
  reajusteTipo: true, reajusteIndice: true, reajustePercentual: true, reajusteMesBase: true, reajusteProximo: true,
  multaRescisoria: true, garantia: true, documentoId: true, assinadoEm: true, observacoes: true, tags: true,
  encerradoEm: true, motivoEncerramento: true, criadoPor: true, atualizadoPor: true, createdAt: true, updatedAt: true,
  fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } },
  cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true, cpfCnpj: true } },
  responsavel: { select: { id: true, nome: true } },
  centroCusto: { select: { id: true, codigo: true, nome: true } },
  naturezaFinanceira: { select: { id: true, codigo: true, nome: true } },
  aditivos: { orderBy: { numero: "asc" as const } },
} satisfies Prisma.ContratoSelect;

export type ContratoComAditivos = Prisma.ContratoGetPayload<{ select: typeof CONTRATO_SELECT }>;

export type TermosVigentes = {
  valor: number | null; periodicidade: ContratoComAditivos["periodicidade"]; fim: Date | null;
  reajusteTipo: ContratoComAditivos["reajusteTipo"]; reajusteIndice: ContratoComAditivos["reajusteIndice"]; reajustePercentual: number | null;
  aditivosAplicados: number[];
};

/** Termos válidos na data: contrato + aditivos com efeito até a data, em ordem. */
export function termosVigentes(c: ContratoComAditivos, data = new Date()): TermosVigentes {
  const t: TermosVigentes = {
    valor: c.valor == null ? null : Number(c.valor), periodicidade: c.periodicidade, fim: c.fim,
    reajusteTipo: c.reajusteTipo, reajusteIndice: c.reajusteIndice, reajustePercentual: c.reajustePercentual == null ? null : Number(c.reajustePercentual),
    aditivosAplicados: [],
  };
  for (const a of [...c.aditivos].sort((x, y) => x.efeitoEm.getTime() - y.efeitoEm.getTime() || x.numero - y.numero)) {
    if (a.efeitoEm.getTime() > data.getTime()) continue;
    if (a.novoFim) t.fim = a.novoFim;
    if (a.novoValor != null) t.valor = Number(a.novoValor);
    if (a.novaPeriodicidade) t.periodicidade = a.novaPeriodicidade;
    if (a.novoReajusteTipo) t.reajusteTipo = a.novoReajusteTipo;
    if (a.novoReajusteIndice) t.reajusteIndice = a.novoReajusteIndice;
    if (a.novoReajustePercentual != null) t.reajustePercentual = Number(a.novoReajustePercentual);
    t.aditivosAplicados.push(a.numero);
  }
  return t;
}

/** Fim de vigência considerando aditivos de prazo (o último aditivo manda). */
export function fimVigente(c: ContratoComAditivos): Date | null {
  const ad = [...c.aditivos].filter((a) => a.novoFim).sort((x, y) => x.efeitoEm.getTime() - y.efeitoEm.getTime());
  return ad.length ? ad[ad.length - 1].novoFim! : c.fim;
}

/** Valor mensalizado (p/ comprometido/mês): FIXO_MENSAL por periodicidade; demais = 0. */
export function valorMensal(c: ContratoComAditivos, hoje = new Date()): number {
  const t = termosVigentes(c, hoje);
  if (t.valor == null) return 0;
  if (c.modalidade === "FIXO_MENSAL") {
    const meses = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }[t.periodicidade ?? "MENSAL"];
    return t.valor / meses;
  }
  if (c.modalidade === "ESTIMADO" && c.valorTotalEstimado != null && c.inicio && t.fim) {
    const meses = Math.max(1, Math.round((t.fim.getTime() - c.inicio.getTime()) / (30 * DIA_MS)));
    return Number(c.valorTotalEstimado) / meses;
  }
  return 0;
}

export type EventoProjetado = { tipo: "JANELA_AVISO_PREVIO" | "FIM_VIGENCIA" | "REAJUSTE_PROJETADO"; data: Date; descricao: string };

/** Eventos futuros que o motor projeta a partir dos termos vigentes. */
export function projetarEventos(c: ContratoComAditivos, hoje = new Date()): EventoProjetado[] {
  if (!["VIGENTE", "EM_RENOVACAO"].includes(c.status)) return [];
  const out: EventoProjetado[] = [];
  const fim = fimVigente(c);
  if (fim) {
    if (c.renovacao === "AUTOMATICA" && c.avisoPrevioDias) {
      const janela = new Date(fim.getTime() - c.avisoPrevioDias * DIA_MS);
      out.push({ tipo: "JANELA_AVISO_PREVIO", data: janela, descricao: `Último dia para rescindir sem renovar (aviso prévio de ${c.avisoPrevioDias} dias)` });
      out.push({ tipo: "FIM_VIGENCIA", data: fim, descricao: `Fim do período — renova automaticamente por ${c.renovacaoMeses ?? 12} meses` });
    } else {
      out.push({ tipo: "FIM_VIGENCIA", data: fim, descricao: c.renovacao === "MANUAL" ? "Fim da vigência — decidir renovação" : "Fim da vigência — contrato encerra" });
    }
  }
  const t = termosVigentes(c, hoje);
  if (t.reajusteTipo !== "NENHUM") {
    let prox = c.reajusteProximo ?? null;
    if (!prox && c.reajusteMesBase) {
      prox = new Date(hoje.getFullYear(), c.reajusteMesBase - 1, 1);
      if (prox.getTime() < hoje.getTime()) prox = new Date(hoje.getFullYear() + 1, c.reajusteMesBase - 1, 1);
    }
    if (!prox) prox = somaMeses(c.inicio, 12);
    if (!fim || prox.getTime() <= fim.getTime()) {
      out.push({ tipo: "REAJUSTE_PROJETADO", data: prox, descricao: `Reajuste ${t.reajusteTipo === "INDICE" ? (t.reajusteIndice ?? "índice") : t.reajusteTipo === "PERCENTUAL" ? `${t.reajustePercentual ?? 0}%` : "negociado"}` });
    }
  }
  return out.sort((a, b) => a.data.getTime() - b.data.getTime());
}

/** Próximo evento (projetado) a partir de hoje — para a coluna da lista. */
export function proximoEvento(c: ContratoComAditivos, hoje = new Date()): EventoProjetado | null {
  return projetarEventos(c, hoje).find((e) => e.data.getTime() >= hoje.getTime() - DIA_MS) ?? null;
}

const JANELAS_AVISO = [90, 60, 30];

/** Pendências de um contrato (função pura). */
export function pendenciasContrato(c: ContratoComAditivos, hoje = new Date()): PendenciaContrato[] {
  const out: PendenciaContrato[] = [];
  const base = { contratoId: c.id, contratoNumero: c.numero, contratoTitulo: c.titulo, link: `/contratos/${c.id}` };
  const encerrado = ["ENCERRADO", "RESCINDIDO"].includes(c.status);
  if (encerrado) return out;

  if (c.status === "MINUTA" && diasAte(c.createdAt, hoje) < -15) {
    out.push({ ...base, tipo: "MINUTA_PARADA", severidade: "BAIXA", titulo: "Minuta parada há mais de 15 dias", detalhe: "Ative o contrato ou exclua a minuta." });
  }
  if (!c.documentoId) out.push({ ...base, tipo: "SEM_DOCUMENTO", severidade: c.status === "VIGENTE" ? "ALTA" : "MEDIA", titulo: "Sem o contrato anexado no GED" });
  else if (!c.assinadoEm) out.push({ ...base, tipo: "NAO_ASSINADO", severidade: "MEDIA", titulo: "Contrato anexado sem data de assinatura" });
  for (const a of c.aditivos) if (!a.documentoId) out.push({ ...base, tipo: "ADITIVO_SEM_DOCUMENTO", severidade: "MEDIA", titulo: `${a.numero}º aditivo sem documento anexado` });

  if (!["VIGENTE", "EM_RENOVACAO"].includes(c.status)) return out;
  const fim = fimVigente(c);
  if (fim) {
    const d = diasAte(fim, hoje);
    if (c.renovacao === "AUTOMATICA" && c.avisoPrevioDias) {
      const dJanela = d - c.avisoPrevioDias;
      if (dJanela < 0 && d >= 0) out.push({ ...base, tipo: "JANELA_RESCISAO", severidade: "ALTA", titulo: `Janela de rescisão passou — renova automaticamente em ${d} dia(s)`, detalhe: `Aviso prévio de ${c.avisoPrevioDias} dias já não pode ser cumprido.`, vence: fim });
      else if (dJanela >= 0 && dJanela <= 30) out.push({ ...base, tipo: "JANELA_RESCISAO", severidade: "CRITICA", titulo: `Decidir renovação: ${dJanela} dia(s) para o aviso prévio`, detalhe: `Sem aviso até ${new Date(fim.getTime() - c.avisoPrevioDias * DIA_MS).toLocaleDateString("pt-BR")}, renova por ${c.renovacaoMeses ?? 12} meses.`, vence: new Date(fim.getTime() - c.avisoPrevioDias * DIA_MS) });
    } else {
      if (d < 0) out.push({ ...base, tipo: "VENCIDO", severidade: "CRITICA", titulo: `Vigência terminou há ${-d} dia(s)`, detalhe: "Renove (aditivo de prazo) ou encerre.", vence: fim });
      else if (d <= JANELAS_AVISO[0]) out.push({ ...base, tipo: "VENCE_EM_BREVE", severidade: d <= 30 ? "ALTA" : "MEDIA", titulo: `Vence em ${d} dia(s)`, detalhe: c.renovacao === "MANUAL" ? "Decidir renovação." : "Contrato encerra no fim da vigência.", vence: fim });
    }
  }
  const reaj = projetarEventos(c, hoje).find((e) => e.tipo === "REAJUSTE_PROJETADO");
  if (reaj) {
    const d = diasAte(reaj.data, hoje);
    if (d < 0) out.push({ ...base, tipo: "REAJUSTE_PENDENTE", severidade: "ALTA", titulo: `Reajuste atrasado há ${-d} dia(s)`, detalhe: reaj.descricao, vence: reaj.data });
    else if (d <= 30) out.push({ ...base, tipo: "REAJUSTE_PENDENTE", severidade: "MEDIA", titulo: `Reajuste em ${d} dia(s)`, detalhe: reaj.descricao, vence: reaj.data });
  }
  return out;
}

export function semaforo(p: PendenciaContrato[]): "OK" | "ATENCAO" | "CRITICO" {
  if (p.some((x) => x.severidade === "CRITICA" || x.severidade === "ALTA")) return "CRITICO";
  return p.length ? "ATENCAO" : "OK";
}

/** Próximo número CT-0001 por empresa (sem ano — padrão do sistema). */
export async function proximoNumeroContrato(tx: Pick<Prisma.TransactionClient, "contrato">, empresaId: string) {
  const ult = await tx.contrato.findFirst({ where: { empresaId, numero: { startsWith: "CT-" } }, orderBy: { numero: "desc" }, select: { numero: true } });
  const n = ult ? parseInt(ult.numero.replace(/\D/g, "")) || 0 : 0;
  return `CT-${String(n + 1).padStart(4, "0")}`;
}

/** Regrava os eventos projetados (apaga os antigos projetados e insere os atuais). */
export async function sincronizarEventosProjetados(tx: Pick<Prisma.TransactionClient, "contratoEvento">, c: ContratoComAditivos, hoje = new Date()) {
  await tx.contratoEvento.deleteMany({ where: { contratoId: c.id, projetado: true } });
  const ev = projetarEventos(c, hoje);
  if (ev.length) await tx.contratoEvento.createMany({ data: ev.map((e) => ({ contratoId: c.id, tipo: e.tipo, data: e.data, descricao: e.descricao, projetado: true })) });
}

export async function registrarEvento(tx: Pick<Prisma.TransactionClient, "contratoEvento">, contratoId: string, tipo: Prisma.ContratoEventoCreateInput["tipo"], descricao: string, usuarioId?: string | null, dados?: Prisma.InputJsonValue) {
  await tx.contratoEvento.create({ data: { contratoId, tipo, data: new Date(), descricao, usuarioId: usuarioId ?? null, dados } });
}

/** Renovação automática vencida sem decisão: renova (fato jurídico) e registra. Chamado pelo cron. */
export async function aplicarRenovacoesAutomaticas(hoje = new Date()) {
  const lista = await prismaSemEscopo.contrato.findMany({ where: { status: { in: ["VIGENTE", "EM_RENOVACAO"] }, renovacao: "AUTOMATICA", fim: { lt: hoje } }, select: CONTRATO_SELECT });
  const renovados: string[] = [];
  for (const c of lista) {
    const fim = fimVigente(c);
    if (!fim || fim.getTime() >= hoje.getTime()) continue;
    const novoFim = somaMeses(fim, c.renovacaoMeses ?? 12);
    await prismaSemEscopo.$transaction(async (tx) => {
      const n = c.aditivos.length + 1;
      await tx.contratoAditivo.create({ data: { contratoId: c.id, numero: n, tipo: "PRAZO", efeitoEm: fim, descricao: `Renovação automática por ${c.renovacaoMeses ?? 12} meses (cláusula de renovação)`, novoFim, aplicadoEm: hoje, criadoPor: "sistema" } });
      await tx.contrato.update({ where: { id: c.id }, data: { fim: novoFim, status: "VIGENTE", atualizadoPor: "sistema" } });
      await registrarEvento(tx, c.id, "RENOVADO", `Renovado automaticamente até ${novoFim.toLocaleDateString("pt-BR")}`, null);
      const atual = await tx.contrato.findUnique({ where: { id: c.id }, select: CONTRATO_SELECT });
      if (atual) await sincronizarEventosProjetados(tx, atual, hoje);
    });
    renovados.push(c.numero);
  }
  return renovados;
}

/** Vigência terminada sem renovação automática: encerra. Chamado pelo cron. */
export async function encerrarVencidos(hoje = new Date()) {
  const lista = await prismaSemEscopo.contrato.findMany({ where: { status: { in: ["VIGENTE", "EM_RENOVACAO"] }, renovacao: "NENHUMA", fim: { lt: new Date(hoje.getTime() - 7 * DIA_MS) } }, select: CONTRATO_SELECT });
  const encerrados: string[] = [];
  for (const c of lista) {
    const fim = fimVigente(c);
    if (!fim || fim.getTime() >= hoje.getTime() - 7 * DIA_MS) continue;
    await prismaSemEscopo.$transaction(async (tx) => {
      await tx.contrato.update({ where: { id: c.id }, data: { status: "ENCERRADO", encerradoEm: fim, motivoEncerramento: "Fim da vigência (sem cláusula de renovação)", atualizadoPor: "sistema" } });
      await registrarEvento(tx, c.id, "ENCERRADO", "Encerrado automaticamente: fim da vigência sem renovação", null);
      await tx.contratoEvento.deleteMany({ where: { contratoId: c.id, projetado: true } });
    });
    encerrados.push(c.numero);
  }
  return encerrados;
}

/** Agregados do painel por empresa. */
export async function resumoContratos(empresaId: string, hoje = new Date()) {
  const lista = await prismaSemEscopo.contrato.findMany({ where: { empresaId, status: { notIn: ["ENCERRADO", "RESCINDIDO"] } }, select: CONTRATO_SELECT });
  const pendencias = lista.flatMap((c) => pendenciasContrato(c, hoje));
  const vigentes = lista.filter((c) => ["VIGENTE", "EM_RENOVACAO"].includes(c.status));
  const em90 = new Date(hoje.getTime() + 90 * DIA_MS);
  const porSeveridade = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 } as Record<SeveridadeContrato, number>;
  for (const p of pendencias) porSeveridade[p.severidade]++;
  return {
    totais: {
      vigentes: vigentes.length, minutas: lista.filter((c) => c.status === "MINUTA").length, suspensos: lista.filter((c) => c.status === "SUSPENSO").length,
      comprometidoMes: vigentes.filter((c) => c.lado === "DESPESA").reduce((s, c) => s + valorMensal(c, hoje), 0),
      receitaMes: vigentes.filter((c) => c.lado === "RECEITA").reduce((s, c) => s + valorMensal(c, hoje), 0),
      vencem90: vigentes.filter((c) => { const f = fimVigente(c); return f && f.getTime() <= em90.getTime(); }).length,
      decisoes: pendencias.filter((p) => p.tipo === "JANELA_RESCISAO" || p.tipo === "VENCIDO" || (p.tipo === "VENCE_EM_BREVE" && p.severidade === "ALTA")).length,
      reajustes: pendencias.filter((p) => p.tipo === "REAJUSTE_PENDENTE").length,
      semDocumento: pendencias.filter((p) => p.tipo === "SEM_DOCUMENTO").length,
    },
    porSeveridade,
    pendencias,
    proximos: vigentes.map((c) => ({ contrato: { id: c.id, numero: c.numero, titulo: c.titulo, contraparte: c.fornecedor?.nomeFantasia || c.fornecedor?.razaoSocial || c.cliente?.nomeFantasia || c.cliente?.razaoSocial || null }, eventos: projetarEventos(c, hoje).filter((e) => e.data.getTime() <= new Date(hoje.getTime() + 180 * DIA_MS).getTime()) }))
      .flatMap((x) => x.eventos.map((e) => ({ ...e, contrato: x.contrato }))).sort((a, b) => a.data.getTime() - b.data.getTime()).slice(0, 30),
  };
}
