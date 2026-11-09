import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aprovadorPedidoCompras } from "@/lib/aprovacao-cotacao";
import {
  propostaCompleta, totalDaProposta, vencedorDaCompra,
  type ItemCompra, type PropostaCompra,
} from "@/lib/compras-processo";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { notificarUsuario, marcarNotificacoesLidasPorLink } from "@/lib/notificacoes";
import { buildCotacaoPDF } from "@/lib/pdf-cotacao";
import { sendTelegramDM, sendTelegramDocument, sendTelegramMessage, escMD } from "@/lib/telegram";
import { formatBRL } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo único de compras (docs/compras-fluxo-unico-prd.md). A "Nova compra" grava
// SC e cotação numa transação só; aprovação e geração do pedido seguem o motor
// de sempre (lib/aprovacao-cotacao.ts).
// ─────────────────────────────────────────────────────────────────────────────

export class ErroCompras extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type CorpoSolicitacao = {
  empresaId?: string;
  filialId?: string;
  localEstoqueId?: string;
  motivo?: string;
  solicitante?: string | null;
  colaboradorId?: string | null;
  setorId?: string | null;
  justificativa?: string | null;
  dataNecessidade?: string | null;
  observacoes?: string | null;
  prioridade?: number | string | null;
  centroCustoId?: string | null;
  tipoCompra?: string | null;
  categoria?: string | null;
  projeto?: string | null;
  classificacaoAuxiliar?: string | null;
  itens?: { itemId: string; quantidade: number | string; observacao?: string | null; unidade?: string | null }[];
};

export function erroDaSolicitacao(body: CorpoSolicitacao): string | null {
  if (!body.filialId) return "Filial é obrigatória";
  if (!body.localEstoqueId) return "Local de Estoque é obrigatório";
  if (!body.motivo?.trim()) return "Motivo de compra é obrigatório";
  if (!body.itens || body.itens.length === 0) return "Adicione pelo menos um item";
  return null;
}

/** A compra pode nascer para outra empresa do grupo (modo compras em grupo). */
export async function empresaDoDocumento(empresaIdPedida?: string): Promise<string> {
  const session = await getSession();
  const ativa = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (!empresaIdPedida || empresaIdPedida === ativa) return ativa;
  if (!(session?.empresaIds ?? []).includes(empresaIdPedida)) {
    throw new ErroCompras("Empresa não permitida para este usuário", 403);
  }
  return empresaIdPedida;
}

export function dadosDaSolicitacao(body: CorpoSolicitacao) {
  return {
    solicitante:           body.solicitante?.trim()           || null,
    colaboradorId:         body.colaboradorId                 || null,
    setorId:               body.setorId                       || null,
    justificativa:         body.justificativa?.trim()         || null,
    dataNecessidade:       body.dataNecessidade ? new Date(body.dataNecessidade) : null,
    observacoes:           body.observacoes?.trim()           || null,
    filialId:              body.filialId                      || null,
    prioridade:            body.prioridade ? parseInt(String(body.prioridade)) : 3,
    localEstoqueId:        body.localEstoqueId                || null,
    centroCustoId:         body.centroCustoId                 || null,
    tipoCompra:            body.tipoCompra?.trim()            || null,
    motivo:                body.motivo?.trim()                || null,
    categoria:             body.categoria?.trim()             || null,
    projeto:               body.projeto?.trim()               || null,
    classificacaoAuxiliar: body.classificacaoAuxiliar?.trim() || null,
    itens: {
      create: (body.itens ?? []).map((item) => ({
        itemId:     item.itemId,
        quantidade: parseFloat(String(item.quantidade)),
        observacao: item.observacao?.trim() || null,
        unidade:    item.unidade?.trim()    || null,
      })),
    },
  };
}

/** Cria SC + cotação com as propostas. Deve rodar dentro de uma transação. */
export async function criarCompra(
  tx: Prisma.TransactionClient,
  dados: {
    empresaId: string;
    numeroSC: string;
    numeroCT: string;
    body: CorpoSolicitacao;
    itens: ItemCompra[];
    propostas: PropostaCompra[];
    vencedorFornecedorId?: string | null;
  },
) {
  const { empresaId, numeroSC, numeroCT, body, itens, propostas, vencedorFornecedorId } = dados;

  const sc = await tx.necessidadeCompra.create({
    data: { ...dadosDaSolicitacao(body), numero: numeroSC, empresaId, status: "EM_COTACAO" },
  });

  const vencedor = vencedorDaCompra(itens, propostas, vencedorFornecedorId);
  const cotacao = await tx.cotacaoCompra.create({
    data: {
      numero: numeroCT,
      empresaId,
      necessidadeId: sc.id,
      nome: body.justificativa?.trim() || null,
      status: propostas.some((p) => propostaCompleta(itens, p)) ? "EM_ANALISE" : "PENDENTE",
      fornecedores: {
        create: propostas.map((p) => {
          const completa = propostaCompleta(itens, p);
          return {
            fornecedorId: p.fornecedorId,
            status: completa ? ("RESPONDIDA" as const) : ("AGUARDANDO" as const),
            melhorOpcao: p.fornecedorId === vencedor,
            totalCalculado: completa ? totalDaProposta(itens, p) : null,
            frete: p.frete ?? null,
            vrDesconto: p.vrDesconto ?? null,
            condicoesPagamento: p.condicoesPagamento?.trim() || null,
            prazoEntregaDias: p.prazoEntregaDias ?? null,
            itens: {
              create: itens.map((i) => {
                const preco = p.precos[i.itemId] ?? null;
                return {
                  itemId: i.itemId,
                  quantidade: i.quantidade,
                  precoUnitario: preco,
                  subtotal: preco == null ? null : Math.round(preco * i.quantidade * 100) / 100,
                };
              }),
            },
          };
        }),
      },
    },
  });

  return { solicitacao: sc, cotacao };
}

/** Linhas da mensagem ao aprovador: quantas propostas vieram e o valor de cada uma. */
export function linhasPropostasTelegram(propostas: { nome: string; total: number | null; indicada: boolean }[]): string[] {
  return [
    `• *Propostas recebidas:* ${propostas.length}`,
    ...propostas.map((p) =>
      `  ${escMD(p.nome)}: ${p.total == null ? "sem valor" : escMD(formatBRL(p.total))}${p.indicada ? " \\(indicada\\)" : ""}`,
    ),
  ];
}

/**
 * Envia a cotação para aprovação: cria a pendência, move para
 * AGUARDANDO_APROVACAO e avisa o aprovador. Um fornecedor respondido basta; quem
 * julga se a comparação foi suficiente é o aprovador.
 */
export async function submeterCotacaoParaAprovacao(params: {
  cotacaoId: string;
  usuarioId: string;
  cfId?: string;
  /** Quem acabou de criar para outra empresa do grupo passa o client sem escopo. */
  db?: typeof prisma;
}): Promise<{ semAprovador: boolean }> {
  const { cotacaoId, usuarioId, cfId } = params;
  const db = params.db ?? prisma;

  const cotacao = await db.cotacaoCompra.findUnique({
    where: { id: cotacaoId },
    include: {
      necessidade: { select: { numero: true } },
      fornecedores: {
        select: {
          id: true, status: true, totalCalculado: true, melhorOpcao: true,
          fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        },
      },
    },
  });
  if (!cotacao) throw new ErroCompras("Cotação não encontrada", 404);
  if (cotacao.status === "CONCLUIDA") throw new ErroCompras("Cotação já concluída");
  const respondidas = cotacao.fornecedores.filter((f) => f.status === "RESPONDIDA");
  if (respondidas.length === 0) throw new ErroCompras("Nenhum fornecedor respondeu a cotação ainda");

  const aprovador = await aprovadorPedidoCompras();
  const numeroRef = cotacao.nome || cotacao.necessidade?.numero || cotacao.numero;

  const aprovacaoId = await db.$transaction(async (tx) => {
    await tx.cotacaoCompra.update({ where: { id: cotacaoId }, data: { status: "AGUARDANDO_APROVACAO" } });
    // Vencedor proposto pelo comprador (opcional) → melhorOpcao, que a
    // aprovação usa ao gerar o pedido.
    if (cfId) {
      await tx.cotacaoFornecedor.updateMany({ where: { cotacaoId }, data: { melhorOpcao: false } });
      await tx.cotacaoFornecedor.update({ where: { id: cfId }, data: { melhorOpcao: true } });
    }
    // Substitui pendências anteriores desta cotação.
    await tx.aprovacaoSC.deleteMany({ where: { cotacaoId, status: "PENDENTE" } });
    if (!aprovador) return null;
    const ap = await tx.aprovacaoSC.create({
      data: {
        cotacaoId,
        etapaOrdem: 1,
        etapaNome: aprovador.etapaNome,
        aprovadorId: aprovador.aprovadorId,
        fluxoId: aprovador.fluxoId,
        status: "PENDENTE",
        solicitadoPor: usuarioId,
      },
    });
    return ap.id;
  });

  if (!aprovacaoId || !aprovador) return { semAprovador: !aprovador };

  // Notificação in-app (toast). Re-submissão não empilha "aguardando aprovação".
  await marcarNotificacoesLidasPorLink(aprovador.aprovadorId, `/suprimentos/cotacoes/${cotacaoId}`, "COTACAO_APROVACAO_SOLICITADA");
  await notificarUsuario({
    usuarioId: aprovador.aprovadorId,
    tipo: "COTACAO_APROVACAO_SOLICITADA",
    titulo: "Cotação aguardando aprovação",
    mensagem: `A cotação ${numeroRef} foi enviada para sua aprovação.`,
    link: `/suprimentos/cotacoes/${cotacaoId}`,
  });

  // Mensagem com botões (best-effort), na DM do aprovador: só ele decide e ela
  // pode ser editada ao aprovar. Sem DM configurada, cai no chat padrão do grupo.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const inlineKeyboard = [
    [
      { text: "✅ Aprovar", callbackData: `sc_APPROVE_${aprovacaoId}` },
      { text: "❌ Reprovar", callbackData: `sc_REJECT_${aprovacaoId}` },
    ],
    [{ text: "📋 Abrir cotação", url: `${baseUrl}/suprimentos/cotacoes/${cotacaoId}` }],
  ];
  const propostas = respondidas.map((f) => ({
    nome: f.fornecedor.nomeFantasia || f.fornecedor.razaoSocial,
    total: f.totalCalculado == null ? null : Number(f.totalCalculado),
    indicada: cfId ? f.id === cfId : f.melhorOpcao,
  }));
  const texto = [
    `🧾 *Cotação aguardando sua aprovação*`,
    ``,
    `• *Cotação:* ${escMD(numeroRef)}`,
    ...linhasPropostasTelegram(propostas),
    ``,
    `Aprovar gera o Pedido de Compras\\.`,
  ].join("\n");

  const colab = await db.colaborador.findFirst({
    where: { usuarioId: aprovador.aprovadorId },
    select: { telegramChatId: true },
  });
  const dmChatId = colab?.telegramChatId ?? null;

  try {
    if (dmChatId) {
      // Mensagem de texto editável + botões na DM; guarda chat/msg p/ editar
      // ao aprovar/reprovar. PDF vai como anexo separado (sem botões).
      const enviado = await sendTelegramDM(dmChatId, { text: texto, inlineKeyboard });
      if (enviado.ok && enviado.msgId) {
        await db.aprovacaoSC.update({
          where: { id: aprovacaoId },
          data: { telegramChatId: dmChatId, telegramMsgId: enviado.msgId },
        });
      }
      const pdf = await buildCotacaoPDF(cotacaoId).catch(() => null);
      if (pdf) await sendTelegramDocument({ chatId: dmChatId, filename: pdf.filename, buffer: pdf.buffer, caption: `Resumo — ${escMD(numeroRef)}` });
    } else {
      // Sem DM: fallback no grupo (não editável depois, mas notifica).
      const pdf = await buildCotacaoPDF(cotacaoId).catch(() => null);
      const enviado = pdf
        ? await sendTelegramDocument({ filename: pdf.filename, buffer: pdf.buffer, caption: texto, inlineKeyboard })
        : { ok: false as const };
      if (!enviado.ok) await sendTelegramMessage({ text: texto, inlineKeyboard });
    }
  } catch (e) {
    console.warn("[submeter-aprovacao] Telegram notify falhou (não bloqueia):", e);
  }

  return { semAprovador: false };
}
