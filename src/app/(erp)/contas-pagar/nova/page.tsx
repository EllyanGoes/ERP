import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContaPagarForm from "@/components/financeiro/ContaPagarForm";

export const dynamic = "force-dynamic";

export default async function NovaContaPagarPage() {
  const fornecedores = await prisma.fornecedor.findMany({
    where: { ativo: true },
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true },
  });
  return (
    <div>
      <PageHeader
        title="Nova Conta a Pagar"
        breadcrumbs={[{ label: "Contas a Pagar", href: "/contas-pagar" }, { label: "Nova" }]}
      />
      <div className="px-8 pb-8 max-w-2xl">
        <ContaPagarForm fornecedores={fornecedores} />
      </div>
    </div>
  );
}
