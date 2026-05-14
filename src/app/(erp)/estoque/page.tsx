import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import EstoqueTable from "@/components/estoque/EstoqueTable";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const estoques = await prisma.estoqueItem.findMany({
    include: { item: { select: { id: true, codigo: true, descricao: true, tipo: true, unidadeMedida: true, ativo: true } } },
    orderBy: { item: { codigo: "asc" } },
  });

  return (
    <div>
      <PageHeader
        title="Estoque"
        breadcrumbs={[{ label: "Estoque & Produtos" }, { label: "Estoque" }]}
      />
      <div className="px-8 pb-8">
        <EstoqueTable estoques={estoques} />
      </div>
    </div>
  );
}
