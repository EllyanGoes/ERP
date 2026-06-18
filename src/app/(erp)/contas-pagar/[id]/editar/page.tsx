import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import ContaPagarForm from "@/components/financeiro/ContaPagarForm";
import { decimalToNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditarContaPagarPage({ params }: { params: { id: string } }) {
  const [conta, fornecedores] = await Promise.all([
    prisma.contaPagar.findUnique({ where: { id: params.id } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true } }),
  ]);
  if (!conta) notFound();

  const editing = {
    id: conta.id,
    fornecedorId: conta.fornecedorId ?? "",
    descricao: conta.descricao,
    categoria: conta.categoria ?? "",
    valorOriginal: decimalToNumber(conta.valorOriginal),
    dataVencimento: conta.dataVencimento ? conta.dataVencimento.toISOString().split("T")[0] : "",
    formaPagamento: conta.formaPagamento ?? "",
    notaFiscal: conta.notaFiscal ?? "",
    observacoes: conta.observacoes ?? "",
    naturezaFinanceiraId: conta.naturezaFinanceiraId ?? "",
    centroCustoId: conta.centroCustoId ?? "",
    contaBancariaId: conta.contaBancariaId ?? "",
  };

  return (
    <div>
      <PageHeader
        title={`Editar ${conta.numero}`}
        breadcrumbs={[{ label: "Contas a Pagar", href: "/contas-pagar" }, { label: conta.numero }, { label: "Editar" }]}
      />
      <div className="px-8 pb-8 max-w-2xl">
        <ContaPagarForm fornecedores={fornecedores} editing={editing} />
      </div>
    </div>
  );
}
