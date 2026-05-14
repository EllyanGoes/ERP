import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/itens/ItemForm";

export const dynamic = "force-dynamic";

export default async function EditarItemPage({ params }: { params: { id: string } }) {
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: { estoqueItems: { include: { localEstoque: true } } },
  });
  if (!item) notFound();

  return (
    <div>
      <PageHeader
        title="Editar Item"
        breadcrumbs={[{ label: "Itens", href: "/itens" }, { label: item.codigo }]}
      />
      <div className="px-8 pb-8 max-w-3xl">
        <ItemForm item={item} />
      </div>
    </div>
  );
}
