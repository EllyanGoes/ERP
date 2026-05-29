"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";

type PedidoRow = {
  id: string;
  numero: string;
  status: string;
  dataEmissao: Date | string;
  dataEntrega: Date | string | null;
  valorTotal: unknown;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
};

export default function PedidosTable({ pedidos }: { pedidos: PedidoRow[] }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<PedidoRow>[]>(() => [
    {
      accessorKey: "numero",
      header: "Número",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.numero}</span>,
    },
    {
      id: "cliente",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.cliente.razaoSocial}</p>
          {row.original.cliente.nomeFantasia && (
            <p className="text-xs text-gray-400">{row.original.cliente.nomeFantasia}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "dataEmissao",
      header: "Emissão",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.dataEmissao)}</span>,
    },
    {
      accessorKey: "dataEntrega",
      header: "Conclusão",
      cell: ({ row }) => <span className="text-sm text-gray-500">{row.original.dataEntrega ? formatDate(row.original.dataEntrega) : "—"}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "valorTotal",
      header: "Total",
      cell: ({ row }) => <span className="font-semibold">{formatBRL(decimalToNumber(row.original.valorTotal))}</span>,
    },
  ], []);

  return (
    <DataTable
      data={pedidos}
      columns={columns}
      searchPlaceholder="Buscar por número ou cliente..."
      onRowClick={(row) => router.push(`/pedidos-venda/${row.id}`)}
    />
  );
}
