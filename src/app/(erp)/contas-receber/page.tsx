import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContasReceberTable from "@/components/financeiro/ContasReceberTable";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import { formatBRL, decimalToNumber, isVencida } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage() {
  const contas = await prisma.contaReceber.findMany({
    where: { status: { notIn: ["CANCELADA"] } },
    include: { cliente: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  const emAberto = contas
    .filter((c) => c.status === "ABERTA" || c.status === "PARCIAL")
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const vencido = contas
    .filter((c) => (c.status === "ABERTA" || c.status === "PARCIAL") && isVencida(c.dataVencimento))
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const now = new Date();
  const recebidoMes = contas
    .filter((c) => c.dataPagamento && new Date(c.dataPagamento).getMonth() === now.getMonth() && new Date(c.dataPagamento).getFullYear() === now.getFullYear())
    .reduce((s, c) => s + decimalToNumber(c.valorPago), 0);

  return (
    <div>
      <PageHeader
        title="Contas a Receber"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas a Receber" }]}
        action={
          <NovaContaButton tipo="receber" />
        }
      />
      <div className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm font-medium text-blue-700">Em Aberto</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{formatBRL(emAberto)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-sm font-medium text-red-700">Vencido</p>
            <p className="text-2xl font-bold text-red-800 mt-1">{formatBRL(vencido)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-sm font-medium text-green-700">Recebido no Mês</p>
            <p className="text-2xl font-bold text-green-800 mt-1">{formatBRL(recebidoMes)}</p>
          </div>
        </div>
        <ContasReceberTable contas={contas as any} />
      </div>
    </div>
  );
}
