import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { sendTelegramMessage, sendTelegramDM, escMD, type TGMessage } from "@/lib/telegram";

// Notificações de Pedido de Venda no Telegram.
//
// Grupo dedicado a pedidos: chave de config "tg_chat_pedidos". Se ela NÃO estiver
// configurada, cai no chat padrão (tg_chat_id) — funciona de cara e o usuário pode
// apontar para um grupo só de pedidos depois, apenas criando essa chave em
// Configurações, sem mexer no código.
const CHANNEL_KEY = "tg_chat_pedidos";

async function sendToPedidosChat(msg: TGMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const rec = await prisma.configuracao.findUnique({ where: { chave: CHANNEL_KEY } });
    if (rec?.valor) return sendTelegramDM(rec.valor, msg);
  } catch {
    /* ignora e usa o chat padrão abaixo */
  }
  return sendTelegramMessage(msg);
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBRT(date = new Date()): string {
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── (a) Aviso a cada pedido criado ────────────────────────────────────────────
export async function notifyPedidoVendaCriado(pedido: {
  numero: string;
  valorTotal: unknown;
  dataEmissao?: Date | string | null;
  cliente?: { razaoSocial: string; nomeFantasia?: string | null } | null;
  empresa?: { razaoSocial: string; nomeFantasia?: string | null } | null;
  itens?: unknown[] | null;
}): Promise<void> {
  try {
    const empresaNome = pedido.empresa?.nomeFantasia || pedido.empresa?.razaoSocial || "—";
    const clienteNome = pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || "—";
    const total = Number(pedido.valorTotal) || 0;
    const qtdItens = Array.isArray(pedido.itens) ? pedido.itens.length : 0;
    const data = pedido.dataEmissao ? new Date(pedido.dataEmissao) : new Date();

    const text = [
      "📝 *Novo Pedido de Venda*",
      "",
      `💼 Empresa: *${escMD(empresaNome)}*`,
      `📄 Pedido: *${escMD(pedido.numero)}*`,
      `👤 Cliente: ${escMD(clienteNome)}`,
      `📦 Itens: ${escMD(String(qtdItens))}`,
      `💰 Total: *${escMD(fmtBRL(total))}*`,
      `📅 Emissão: ${escMD(dataBRT(data))}`,
    ].join("\n");

    await sendToPedidosChat({ text });
  } catch (err) {
    // Telegram nunca pode quebrar a criação do pedido.
    console.error("[notifyPedidoVendaCriado]", err);
  }
}

// ── (b) Relatório diário (chamado pelo cron no fim do dia) ─────────────────────
export async function enviarRelatorioDiarioPedidosVenda(
  now = new Date()
): Promise<{ ok: boolean; qtd: number; total: number; error?: string }> {
  // Intervalo do dia em horário de Brasília (UTC−3), em instantes UTC.
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const inicio = new Date(
    Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0) + 3 * 60 * 60 * 1000
  );
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

  // prismaSemEscopo: o cron roda SEM sessão, então o proxy escopado só enxergaria
  // a Tramontin. Para o relatório do grupo precisamos das 3 empresas.
  const pedidos = await prismaSemEscopo.pedidoVenda.findMany({
    where: { createdAt: { gte: inicio, lt: fim } },
    select: {
      numero: true,
      valorTotal: true,
      empresaId: true,
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const qtd = pedidos.length;
  const total = pedidos.reduce((s, p) => s + (Number(p.valorTotal) || 0), 0);

  const linhas: string[] = [
    "📊 *Relatório de Pedidos de Venda*",
    `📅 ${escMD(dataBRT(now))}`,
    "",
    `🧾 Pedidos no dia: *${escMD(String(qtd))}*`,
    `💰 Total do grupo: *${escMD(fmtBRL(total))}*`,
  ];

  if (qtd > 0) {
    // Agrupa por empresa.
    type Grupo = { nome: string; subtotal: number; pedidos: typeof pedidos };
    const grupos = new Map<string, Grupo>();
    for (const p of pedidos) {
      const g = grupos.get(p.empresaId) ?? {
        nome: p.empresa?.nomeFantasia || p.empresa?.razaoSocial || "—",
        subtotal: 0,
        pedidos: [],
      };
      g.subtotal += Number(p.valorTotal) || 0;
      g.pedidos.push(p);
      grupos.set(p.empresaId, g);
    }
    // Empresa com maior subtotal primeiro; empate por nome.
    const ordenados = Array.from(grupos.values()).sort(
      (a, b) => b.subtotal - a.subtotal || a.nome.localeCompare(b.nome),
    );

    // Teto global de linhas de pedido (limite de 4096 chars do Telegram).
    const MAX = 30;
    let listados = 0;
    for (const g of ordenados) {
      linhas.push("");
      linhas.push(`💼 *${escMD(g.nome)}* — ${escMD(String(g.pedidos.length))} ${g.pedidos.length === 1 ? "pedido" : "pedidos"} — *${escMD(fmtBRL(g.subtotal))}*`);
      for (const p of g.pedidos) {
        if (listados >= MAX) break;
        const nome = p.cliente?.nomeFantasia || p.cliente?.razaoSocial || "—";
        linhas.push(`• ${escMD(p.numero)} — ${escMD(nome)} — ${escMD(fmtBRL(Number(p.valorTotal) || 0))}`);
        listados++;
      }
    }
    if (qtd > MAX) linhas.push("", escMD(`… e mais ${qtd - MAX} pedido(s)`));
  } else {
    linhas.push("");
    linhas.push(escMD("Nenhum pedido de venda registrado hoje."));
  }

  const res = await sendToPedidosChat({ text: linhas.join("\n") });
  return { ok: res.ok, qtd, total, error: res.error };
}
