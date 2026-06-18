"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import { formatBRL, decimalToNumber } from "@/lib/utils";

type ItemRow = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  unidadeMedida: string;
  precoVenda: unknown;
  ativo: boolean;
  estoqueItems: Array<{ quantidadeAtual: unknown; localEstoque: { nome: string } | null }>;
};

const tipoLabels: Record<string, string> = {
  PRODUTO: "Produto",
  SERVICO: "Serviço",
  MATERIA_PRIMA: "Mat. Prima",
};

export default function ItensTable({ itens }: { itens: ItemRow[] }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<ItemRow>[]>(() => [
    { accessorKey: "codigo", header: "Código", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.codigo}</span> },
    { accessorKey: "descricao", header: "Descrição" },
    { accessorKey: "tipo", header: "Tipo", cell: ({ row }) => <span className="text-xs">{tipoLabels[row.original.tipo] ?? row.original.tipo}</span> },
    { accessorKey: "unidadeMedida", header: "Un.", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.unidadeMedida}</span> },
    {
      accessorKey: "precoVenda",
      header: "Preço Venda",
      cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.precoVenda))}</span>,
    },
    {
      id: "estoque",
      header: "Estoque",
      cell: ({ row }) => {
        const qtd = row.original.estoqueItems[0] ? decimalToNumber(row.original.estoqueItems[0]?.quantidadeAtual) : null;
        if (qtd === null) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className={`font-medium ${qtd === 0 ? "text-danger" : "text-foreground"}`}>{qtd}</span>;
      },
    },
    {
      id: "ativo",
      header: "Status",
      cell: ({ row }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.original.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
          {row.original.ativo ? "Ativo" : "Inativo"}
        </span>
      ),
    },
  ], []);

  return (
    <DataTable
      data={itens}
      columns={columns}
      searchPlaceholder="Buscar por código ou descrição..."
      onRowClick={(row) => router.push(`/itens/${row.id}/editar`)}
    />
  );
}
