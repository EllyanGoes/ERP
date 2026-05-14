import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import ClientesTable from "@/components/clientes/ClientesTable";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [clientes, counts] = await Promise.all([
    prisma.cliente.findMany({ orderBy: { razaoSocial: "asc" } }),
    prisma.cliente.groupBy({ by: ["status"], _count: true }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div>
      <PageHeader
        title="Clientes"
        breadcrumbs={[{ label: "Comercial" }, { label: "Clientes" }]}
        action={
          <Button asChild>
            <Link href="/clientes/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Cliente
            </Link>
          </Button>
        }
      />
      <div className="px-8 pb-8 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Ativos", key: "ATIVO", color: "text-green-600 bg-green-50" },
            { label: "Inativos", key: "INATIVO", color: "text-gray-500 bg-gray-50" },
            { label: "Prospectos", key: "PROSPECTO", color: "text-sky-600 bg-sky-50" },
          ].map(({ label, key, color }) => (
            <div key={key} className={`rounded-xl p-4 ${color}`}>
              <p className="text-sm font-medium opacity-75">{label}</p>
              <p className="text-3xl font-bold mt-1">{countMap[key] ?? 0}</p>
            </div>
          ))}
        </div>
        <ClientesTable clientes={clientes} />
      </div>
    </div>
  );
}
