"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Edit } from "lucide-react";
import { formatCPFCNPJ } from "@/lib/utils";

type ClienteRow = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  cidade: string | null;
  estado: string | null;
  status: string;
};

export default function ClientesTable({ clientes }: { clientes: ClienteRow[] }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<ClienteRow>[]>(() => [
    {
      accessorKey: "razaoSocial",
      header: "Razão Social",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900">{row.original.razaoSocial}</p>
          {row.original.nomeFantasia && (
            <p className="text-xs text-gray-400">{row.original.nomeFantasia}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "cpfCnpj",
      header: "CPF/CNPJ",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.cpfCnpj ? formatCPFCNPJ(row.original.cpfCnpj) : "—"}</span>
      ),
    },
    {
      id: "localidade",
      header: "Cidade/UF",
      cell: ({ row }) => {
        const loc = [row.original.cidade, row.original.estado].filter(Boolean).join(" / ");
        return <span className="text-sm text-gray-500">{loc || "—"}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/clientes/${row.original.id}/editar`}><Edit className="w-4 h-4" /></Link>
        </Button>
      ),
    },
  ], []);

  return (
    <DataTable
      data={clientes}
      columns={columns}
      searchPlaceholder="Buscar por razão social ou CPF/CNPJ..."
      onRowClick={(row) => router.push(`/clientes/${row.id}`)}
    />
  );
}
