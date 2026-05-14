import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContaReceberForm from "@/components/financeiro/ContaReceberForm";

export const dynamic = "force-dynamic";

export default async function NovaContaReceberPage() {
  const clientes = await prisma.cliente.findMany({
    where: { status: "ATIVO" },
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true },
  });
  return (
    <div>
      <PageHeader
        title="Nova Conta a Receber"
        breadcrumbs={[{ label: "Contas a Receber", href: "/contas-receber" }, { label: "Nova" }]}
      />
      <div className="px-8 pb-8 max-w-2xl">
        <ContaReceberForm clientes={clientes} />
      </div>
    </div>
  );
}
