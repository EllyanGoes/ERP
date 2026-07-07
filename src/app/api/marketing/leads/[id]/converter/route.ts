export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadConverterSchema } from "@/lib/validations/marketing-lead";

// Converte o lead em Cliente do ERP: vincula um existente ou cria um novo
// pré-preenchido; opcionalmente vincula o primeiro PedidoVenda.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = leadConverterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead || !lead.ativo) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const d = parsed.data;
  if (!d.criarCliente && d.clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: d.clienteId }, select: { id: true } });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (d.pedidoVendaId) {
    const pedido = await prisma.pedidoVenda.findUnique({ where: { id: d.pedidoVendaId }, select: { id: true } });
    if (!pedido) return NextResponse.json({ error: "Pedido de venda não encontrado" }, { status: 404 });
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    let clienteId = d.clienteId ?? null;
    if (d.criarCliente) {
      // Lead com empresa vira PJ (razão social = empresa, contato na fantasia);
      // sem empresa vira PF com o próprio nome.
      const cliente = await tx.cliente.create({
        data: {
          tipoPessoa: lead.empresaNome ? "JURIDICA" : "FISICA",
          razaoSocial: lead.empresaNome || lead.nome,
          nomeFantasia: lead.empresaNome ? lead.nome : null,
          email: lead.email,
          telefone: lead.telefone,
          cidade: lead.cidade,
          estado: lead.estado,
          observacoes: "Convertido do lead de marketing",
        },
      });
      clienteId = cliente.id;
    }

    // Move o lead para a etapa terminal de sucesso, se o pipeline tiver uma.
    const etapaGanho = await tx.etapaLead.findFirst({
      where: { ganho: true, ativo: true },
      orderBy: { ordem: "asc" },
    });

    const leadAtualizado = await tx.lead.update({
      where: { id: params.id },
      data: {
        clienteId,
        ...(d.pedidoVendaId ? { pedidoVendaId: d.pedidoVendaId } : {}),
        convertidoEm: new Date(),
        status: "GANHO",
        ...(etapaGanho ? { etapaId: etapaGanho.id } : {}),
      },
      include: { cliente: true },
    });

    await tx.leadEvento.create({
      data: {
        leadId: params.id,
        tipo: "CONVERSAO_CLIENTE",
        dados: { clienteId },
        criadoPor: auth.session.nome,
      },
    });
    if (d.pedidoVendaId) {
      await tx.leadEvento.create({
        data: {
          leadId: params.id,
          tipo: "CONVERSAO_PEDIDO",
          dados: { pedidoVendaId: d.pedidoVendaId },
          criadoPor: auth.session.nome,
        },
      });
    }

    return leadAtualizado;
  });

  return NextResponse.json({ data: atualizado });
}
