import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ComodatoClient from "@/components/comodato/ComodatoClient";
import { decimalToNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComodatoPage() {
  const [clientes, itens, movimentos] = await Promise.all([
    prisma.cliente.findMany({
      where: { status: "ATIVO" },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
    }),
    prisma.item.findMany({
      where: { comodato: true, ativo: true },
      orderBy: { descricao: "asc" },
      select: { id: true, codigo: true, descricao: true, precoVenda: true },
    }),
    prisma.movimentacaoComodato.findMany({
      include: {
        cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        item: { select: { id: true, codigo: true, descricao: true } },
      },
      orderBy: { data: "desc" },
    }),
  ]);

  const itensPlain = itens.map((i) => ({
    id: i.id,
    codigo: i.codigo,
    descricao: i.descricao,
    precoVenda: decimalToNumber(i.precoVenda),
  }));

  const movimentosPlain = movimentos.map((m) => ({
    id: m.id,
    clienteId: m.clienteId,
    itemId: m.itemId,
    tipo: m.tipo as "SAIDA" | "RETORNO",
    quantidade: decimalToNumber(m.quantidade),
    valorUnitario: decimalToNumber(m.valorUnitario),
    origem: m.origem as "MANUAL" | "AUTOMATICO",
    data: m.data.toISOString(),
    documento: m.documento,
    observacoes: m.observacoes,
    criadoPor: m.criadoPor,
    atualizadoPor: m.atualizadoPor,
    cliente: m.cliente,
    item: m.item,
  }));

  return (
    <div>
      <PageHeader
        title="Comodato"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Comodato" }]}
      />
      <div className="px-8 pb-8 space-y-6">
        <ComodatoClient clientes={clientes} itens={itensPlain} movimentos={movimentosPlain} />
      </div>
    </div>
  );
}
