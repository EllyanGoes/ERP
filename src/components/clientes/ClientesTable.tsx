"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef, type FilterFn } from "@tanstack/react-table";
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

// Busca por nome OU CPF/CNPJ — casa os dígitos ignorando pontuação.
const filtroCliente: FilterFn<ClienteRow> = (row, _col, value) => {
  const q = String(value ?? "").toLowerCase().trim();
  if (!q) return true;
  const c = row.original;
  const nome = `${c.razaoSocial} ${c.nomeFantasia ?? ""}`.toLowerCase();
  if (nome.includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  return qDigits.length > 0 && (c.cpfCnpj ?? "").replace(/\D/g, "").includes(qDigits);
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
      globalFilterFn={filtroCliente}
      searchPlaceholder="Buscar por nome, CPF ou CNPJ..."
      onRowClick={(row) => router.push(`/clientes/${row.id}`)}
    />
  );
}
