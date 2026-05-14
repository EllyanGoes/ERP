import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import ContasPagarTable from "@/components/financeiro/ContasPagarTable";
import { formatBRL, decimalToNumber, isVencida } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const contas = await prisma.contaPagar.findMany({
    where: { status: { notIn: ["CANCELADA"] } },
    include: { fornecedor: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  const emAberto = contas
    .filter((c) => c.status === "ABERTA" || c.status === "PARCIAL")
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const vencido = contas
    .filter((c) => (c.status === "ABERTA" || c.status === "PARCIAL") && isVencida(c.dataVencimento))
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const now = new Date();
  const pagoMes = contas
    .filter((c) => c.dataPagamento && new Date(c.dataPagamento).getMonth() === now.getMonth() && new Date(c.dataPagamento).getFullYear() === now.getFullYear())
    .reduce((s, c) => s + decimalToNumber(c.valorPago), 0);

  return (
    <div>
      <PageHeader
        title="Contas a Pagar"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas a Pagar" }]}
        action={
          <Button asChild>
            <Link href="/contas-pagar/nova">
              <Plus className="w-4 h-4 mr-2" />
              Nova Conta
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-orange-50 rounded-xl p-4">
            <p className="text-sm font-medium text-orange-700">A Pagar</p>
            <p className="text-2xl font-bold text-orange-800 mt-1">{formatBRL(emAberto)}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-sm font-medium text-red-700">Vencido</p>
            <p className="text-2xl font-bold text-red-800 mt-1">{formatBRL(vencido)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-600">Pago no Mês</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatBRL(pagoMes)}</p>
          </div>
        </div>
        <ContasPagarTable contas={contas as any} />
      </div>
    </div>
  );
}
