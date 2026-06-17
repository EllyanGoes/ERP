import { prisma } from "@/lib/prisma";
import Link from "next/link";
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

  // Vínculo: este cliente também está cadastrado como fornecedor? (mesmo CPF/CNPJ)
  const cnpjDigits = (cliente.cpfCnpj ?? "").replace(/\D/g, "");
  const fornecedorVinculo =
    cnpjDigits.length >= 11
      ? (
          await prisma.$queryRawUnsafe<{ id: string; razaoSocial: string; nomeFantasia: string | null }[]>(
            `SELECT id, "razaoSocial", "nomeFantasia" FROM "Fornecedor"
             WHERE regexp_replace(coalesce("cpfCnpj", ''), '\\D', '', 'g') = $1 LIMIT 1`,
            cnpjDigits,
          )
        )[0] ?? null
      : null;

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
            {fornecedorVinculo && (
              <Link href={`/suprimentos/fornecedores/${fornecedorVinculo.id}`}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                title="Mesmo CPF/CNPJ cadastrado como fornecedor">
                Também é fornecedor ↗
              </Link>
            )}
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
