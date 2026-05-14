import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import ItensTable from "@/components/itens/ItensTable";

export const dynamic = "force-dynamic";

export default async function ItensPage() {
  const itens = await prisma.item.findMany({
    include: { estoqueItems: { include: { localEstoque: true } } },
    orderBy: { codigo: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Itens"
        breadcrumbs={[{ label: "Estoque & Produtos" }, { label: "Itens" }]}
        action={
          <Button asChild>
            <Link href="/itens/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Item
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        <ItensTable itens={itens} />
      </div>
    </div>
  );
}
