import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContaPagarForm from "@/components/financeiro/ContaPagarForm";

export const dynamic = "force-dynamic";

export default async function NovaContaPagarPage() {
  const [fornecedores, colaboradores, naturezas] = await Promise.all([
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true } }),
    prisma.colaborador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.naturezaFinanceira.findMany({ where: { ativo: true, tipo: "SAIDA" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Nova Conta a Pagar"
        breadcrumbs={[{ label: "Contas a Pagar", href: "/contas-pagar" }, { label: "Nova" }]}
      />
      <div className="px-8 pb-8 max-w-2xl">
        <ContaPagarForm fornecedores={fornecedores} colaboradores={colaboradores} naturezas={naturezas} />
      </div>
    </div>
  );
}
