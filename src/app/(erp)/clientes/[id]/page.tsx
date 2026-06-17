import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClienteDetail from "@/components/clientes/ClienteDetail";
import EditarTabButton from "@/components/shared/EditarTabButton";
import { decimalToNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const [cliente, movimentacoesRaw, contaContabil] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: params.id },
      include: {
        pedidosVenda: { orderBy: { createdAt: "desc" }, take: 20, include: { cliente: { select: { razaoSocial: true } } } },
        contasReceber: { orderBy: { dataVencimento: "asc" }, take: 20 },
      },
    }),
    prisma.movimentacaoComodato.findMany({
      where: { clienteId: params.id },
      orderBy: { data: "desc" },
      include: { item: { select: { id: true, codigo: true, descricao: true } } },
    }),
    // Conta contábil do cliente na empresa ativa (escopo do prisma).
    prisma.contaContabil.findFirst({ where: { clienteId: params.id }, select: { codigo: true, nome: true } }),
  ]);
  if (!cliente) notFound();

  const contaContabilLabel = contaContabil ? `${contaContabil.codigo} — ${contaContabil.nome}` : null;

  // Movimentações de comodato deste cliente (saldo é calculado no componente).
  const comodato = movimentacoesRaw.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    tipo: m.tipo as "SAIDA" | "RETORNO",
    quantidade: decimalToNumber(m.quantidade),
    valorUnitario: decimalToNumber(m.valorUnitario),
    item: m.item,
  }));

  return (
    <div>
      <PageHeader
        title={cliente.nomeFantasia || cliente.razaoSocial}
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: cliente.razaoSocial }]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={cliente.status} />
            <EditarTabButton href={`/clientes/${cliente.id}/editar`} />
          </div>
        }
      />
      <div className="px-8 pb-8">
        <ClienteDetail cliente={cliente as any} comodato={comodato} contaContabil={contaContabilLabel} />
      </div>
    </div>
  );
}
