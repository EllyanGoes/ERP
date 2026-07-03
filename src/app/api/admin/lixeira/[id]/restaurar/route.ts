export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { baixarEstoqueVenda } from "@/lib/baixa-estoque";
import { recontabilizarMinuta, contabilizarPedidoVenda } from "@/lib/contabilidade";
import { faturarEntregasPedido } from "@/lib/contas-receber";
import { recomputarStatusPedido } from "@/lib/pedido-totais";
import { notificarUsuario } from "@/lib/notificacoes";

// POST /api/admin/lixeira/[id]/restaurar — restauração automática (MVP: MINUTA).
// Replay do fluxo real (o mesmo caminho da recuperação manual da MIN-0201):
// recria a minuta do snapshot, rebaixa o estoque quando o status original era
// SAIU/ENTREGUE, re-contabiliza e refaz faturamento/status do pedido. Custos são
// revalorados ao custo ATUAL (comportamento padrão de reprocesso). Demais tipos:
// 501 — restauração assistida pelos dados do snapshot na tela.

type ItemSnapshot = {
  pedidoVendaItemId?: string | null;
  itemId: string;
  quantidade: unknown;
  unidadeId?: string | null;
};
type MinutaSnapshot = {
  id: string; empresaId: string; numero: string; numeroFisico?: string | null;
  pedidoVendaId?: string | null; localEstoqueId?: string | null; motoristaId?: string | null;
  tipo?: string | null; status: string; dataEmissao?: string | null; dataEntrega?: string | null;
  placa?: string | null; observacoes?: string | null;
  itens: ItemSnapshot[];
};

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  const registro = await prismaSemEscopo.lixeira.findUnique({ where: { id: params.id } });
  if (!registro) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  if (registro.restauradoEm) {
    return NextResponse.json({ error: "Este documento já foi restaurado." }, { status: 409 });
  }
  if (registro.tipo !== "MINUTA") {
    return NextResponse.json(
      { error: "Restauração automática disponível apenas para minutas por enquanto — use os dados do snapshot para reconstruir manualmente." },
      { status: 501 },
    );
  }

  const snap = registro.snapshot as unknown as MinutaSnapshot;
  if (!snap?.itens?.length) {
    return NextResponse.json({ error: "Snapshot sem itens — reconstrução manual necessária." }, { status: 422 });
  }
  if (!snap.pedidoVendaId || snap.itens.some((si) => !si.pedidoVendaItemId || !si.itemId)) {
    return NextResponse.json({ error: "Snapshot sem vínculo ao pedido — reconstrução manual necessária." }, { status: 422 });
  }
  const empresaId = registro.empresaId;
  const pedidoVendaId = snap.pedidoVendaId; // narrowed (guard acima) — o closure da tx perde o narrowing

  // Pedido ainda existe? E o que foi apagado ainda CABE no pendente de entrega?
  const pedido = snap.pedidoVendaId
    ? await prismaSemEscopo.pedidoVenda.findUnique({
        where: { id: snap.pedidoVendaId },
        select: {
          id: true, numero: true, status: true,
          itens: {
            select: {
              id: true, quantidade: true, item: { select: { id: true, descricao: true } },
              minutaItens: { where: { minuta: { status: { not: "CANCELADA" } } }, select: { quantidade: true } },
            },
          },
        },
      })
    : null;
  if (snap.pedidoVendaId && !pedido) {
    return NextResponse.json({ error: "O pedido de venda original foi apagado — restaure/recrie o pedido antes da minuta." }, { status: 422 });
  }
  if (pedido) {
    const pendentePorPvi = new Map(pedido.itens.map((it) => [
      it.id,
      decimalToNumber(it.quantidade) - it.minutaItens.reduce((s, mi) => s + decimalToNumber(mi.quantidade), 0),
    ]));
    const naoCabe = snap.itens.filter((si) => {
      const pend = si.pedidoVendaItemId ? pendentePorPvi.get(si.pedidoVendaItemId) : undefined;
      return pend !== undefined && decimalToNumber(si.quantidade) > pend + 0.0001;
    });
    if (naoCabe.length > 0) {
      return NextResponse.json({
        error: "As quantidades do snapshot excedem o pendente de entrega do pedido (outra minuta já cobriu). Ajuste/exclua a entrega conflitante antes de restaurar.",
      }, { status: 422 });
    }
  }

  // Recursos opcionais que podem ter sido apagados desde então.
  const [localOk, motoristaOk] = await Promise.all([
    snap.localEstoqueId ? prismaSemEscopo.localEstoque.findUnique({ where: { id: snap.localEstoqueId }, select: { id: true } }) : null,
    snap.motoristaId ? prismaSemEscopo.motorista.findUnique({ where: { id: snap.motoristaId }, select: { id: true } }).catch(() => null) : null,
  ]);

  const avisos: string[] = [];
  const statusOriginal = snap.status;
  const baixaEstoque = statusOriginal === "SAIU_PARA_ENTREGA" || statusOriginal === "ENTREGUE";

  const resultado = await prismaSemEscopo.$transaction(async (tx) => {
    // Número: reaproveita o original se estiver livre na empresa; senão gera novo.
    const numeroLivre = (await tx.minuta.count({ where: { empresaId, numero: snap.numero } })) === 0;
    let numero = snap.numero;
    if (!numeroLivre) {
      const seq = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId, prefixo: "MIN" } },
        update: { ultimo: { increment: 1 } },
        create: { empresaId, prefixo: "MIN", ultimo: 1 },
      });
      numero = generateDocNumber("MIN", seq.ultimo);
      avisos.push(`O número ${snap.numero} já está em uso — restaurada como ${numero}.`);
    }

    const obs = `${snap.observacoes ? `${snap.observacoes} · ` : ""}Restaurada da lixeira em ${new Date().toLocaleDateString("pt-BR")} por ${auth.session.nome}`;
    const minuta = await tx.minuta.create({
      data: {
        empresaId,
        numero,
        numeroFisico: snap.numeroFisico ?? null,
        pedidoVendaId,
        localEstoqueId: (localOk ? snap.localEstoqueId : undefined) ?? undefined,
        motoristaId: (motoristaOk ? snap.motoristaId : undefined) ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tipo: (snap.tipo ?? "ENTREGA") as any,
        status: "PENDENTE",
        dataEmissao: snap.dataEmissao ? new Date(snap.dataEmissao) : new Date(),
        dataEntrega: snap.dataEntrega ? new Date(snap.dataEntrega) : null,
        placa: snap.placa ?? null,
        observacoes: obs,
        itens: {
          create: snap.itens.map((si) => ({
            pedidoVendaItemId: si.pedidoVendaItemId!,
            itemId: si.itemId,
            quantidade: decimalToNumber(si.quantidade),
            unidadeId: si.unidadeId ?? null,
          })),
        },
      },
      select: { id: true, numero: true },
    });
    if (!localOk && snap.localEstoqueId) avisos.push("Local de estoque original não existe mais — saída resolvida por item.");
    if (!motoristaOk && snap.motoristaId) avisos.push("Motorista original não existe mais — campo ficou vazio.");

    // Status original SAIU/ENTREGUE → rebaixa o estoque (local por item + guard)
    // e aplica o status. O SaldoNegativoError aborta tudo (422 no catch).
    if (baixaEstoque) {
      const seqMov = await tx.sequencia.upsert({
        where: { empresaId_prefixo: { empresaId, prefixo: "MOV" } },
        update: { ultimo: { increment: 1 } },
        create: { empresaId, prefixo: "MOV", ultimo: 1 },
      });
      const lote = await tx.loteMovimentacao.create({
        data: {
          empresaId, numero: generateDocNumber("MOV", seqMov.ultimo), tipo: "SAIDA",
          documento: minuta.numero, observacoes: `Restauração da lixeira — minuta ${minuta.numero}`,
        },
        select: { id: true },
      });
      const descrs = await tx.item.findMany({
        where: { id: { in: snap.itens.map((i) => i.itemId) } }, select: { id: true, descricao: true },
      });
      const descrDe = new Map(descrs.map((d) => [d.id, d.descricao]));
      await baixarEstoqueVenda(tx, {
        empresaId,
        itens: snap.itens.map((si) => ({
          itemId: si.itemId,
          quantidade: decimalToNumber(si.quantidade),
          pedidoVendaItemId: si.pedidoVendaItemId ?? null,
          unidadeId: si.unidadeId ?? null,
          descricao: descrDe.get(si.itemId) ?? null,
        })),
        fallbackLocalId: localOk ? snap.localEstoqueId ?? null : null,
        documento: minuta.numero,
        observacoes: `Saída restaurada da lixeira — minuta ${minuta.numero}`,
        loteId: lote.id,
      });
      await tx.minuta.update({ where: { id: minuta.id }, data: { status: statusOriginal as "SAIU_PARA_ENTREGA" | "ENTREGUE" } });
    }

    if (snap.pedidoVendaId) await recomputarStatusPedido(tx, snap.pedidoVendaId);
    await tx.lixeira.update({
      where: { id: registro.id },
      data: { restauradoEm: new Date(), restauradoComoId: minuta.id },
    });
    return minuta;
  });

  // Pós-commit: contábil (CMV + receita na entrega), faturamento por entrega e
  // auto-conclusão do pedido (mesmos passos do fluxo normal).
  if (statusOriginal === "ENTREGUE" || statusOriginal === "SAIU_PARA_ENTREGA") {
    await recontabilizarMinuta(resultado.id).catch((e) => console.error("[lixeira/restaurar] contabilizar:", e));
  }
  if (snap.pedidoVendaId) {
    if (statusOriginal === "ENTREGUE") {
      await faturarEntregasPedido(snap.pedidoVendaId).catch((e) => console.error("[lixeira/restaurar] faturar:", e));
      // Auto-conclusão: se tudo entregue, o pedido volta a CONCLUIDO.
      const p = await prismaSemEscopo.pedidoVenda.findUnique({
        where: { id: snap.pedidoVendaId }, select: { status: true, statusEntrega: true },
      });
      if (p && p.statusEntrega === "ENTREGUE" && p.status !== "CONCLUIDO" && p.status !== "CANCELADO") {
        await prismaSemEscopo.pedidoVenda.update({
          where: { id: snap.pedidoVendaId },
          data: { status: "CONCLUIDO", dataConclusao: snap.dataEntrega ? new Date(snap.dataEntrega) : new Date() },
        });
      }
    }
    await contabilizarPedidoVenda(snap.pedidoVendaId).catch((e) => console.error("[lixeira/restaurar] pedido:", e));
  }

  await notificarUsuario({
    usuarioId: auth.session.sub,
    tipo: "LIXEIRA",
    titulo: "Documento restaurado",
    mensagem: `Minuta ${resultado.numero} restaurada da lixeira.${avisos.length ? ` ${avisos.join(" ")}` : ""}`,
    link: "/comercial/minutas",
  });

  return NextResponse.json({ data: { id: resultado.id, numero: resultado.numero, avisos } });
}
