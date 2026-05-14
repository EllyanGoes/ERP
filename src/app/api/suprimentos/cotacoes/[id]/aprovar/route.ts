export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocNumber } from "@/lib/utils";

// POST /api/suprimentos/cotacoes/[id]/aprovar
// Marks the cotação as CONCLUIDA and generates a PedidoCompra from the melhorOpcao supplier
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const cotacao = await tx.cotacaoCompra.findUnique({
        where: { id: params.id },
        include: {
          fornecedores: {
            include: {
              fornecedor: true,
              itens: { include: { item: true } },
            },
          },
        },
      });

      if (!cotacao) throw new Error("Cotação não encontrada");
      if (cotacao.status === "CONCLUIDA") throw new Error("Cotação já concluída");

      // Find melhorOpcao supplier; if none set, pick the respondida with lowest total
      let melhor = cotacao.fornecedores.find((f) => f.melhorOpcao);
      if (!melhor) {
        const respondidas = cotacao.fornecedores
          .filter((f) => f.status === "RESPONDIDA" && f.totalCalculado != null)
          .sort(
            (a, b) =>
              parseFloat(String(a.totalCalculado)) - parseFloat(String(b.totalCalculado))
          );
        melhor = respondidas[0];
      }

      if (!melhor) throw new Error("Nenhum fornecedor com proposta respondida");

      // Set melhorOpcao
      await tx.cotacaoFornecedor.updateMany({
        where: { cotacaoId: params.id },
        data: { melhorOpcao: false },
      });
      await tx.cotacaoFornecedor.update({
        where: { id: melhor.id },
        data: { melhorOpcao: true },
      });

      // Generate PedidoCompra number
      const seq = await tx.sequencia.upsert({
        where: { prefixo: "PC" },
        create: { prefixo: "PC", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateDocNumber("PC", seq.ultimo);

      const itensComPreco = melhor.itens.filter((i) => i.precoUnitario != null);
      const valorTotal = itensComPreco.reduce(
        (sum, i) => sum + parseFloat(String(i.subtotal ?? 0)),
        0
      );

      const pedidoCompra = await tx.pedidoCompra.create({
        data: {
          numero,
          cotacaoId: cotacao.id,
          fornecedorId: melhor.fornecedorId,
          valorTotal,
          itens: {
            create: itensComPreco.map((i) => ({
              itemId: i.itemId,
              quantidade: parseFloat(String(i.quantidade)),
              precoUnitario: parseFloat(String(i.precoUnitario ?? 0)),
              valorTotal: parseFloat(String(i.subtotal ?? 0)),
            })),
          },
        },
        include: {
          fornecedor: { select: { id: true, razaoSocial: true } },
          itens: {
            include: { item: { select: { id: true, codigo: true, descricao: true } } },
          },
        },
      });

      // Mark cotação as CONCLUIDA
      const updatedCotacao = await tx.cotacaoCompra.update({
        where: { id: params.id },
        data: {
          status: "CONCLUIDA",
          dataAprovacao: new Date(),
          fornecedorVencedorId: melhor.fornecedorId,
        },
      });

      return { cotacao: updatedCotacao, pedidoCompra };
    });

    return NextResponse.json({ data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
