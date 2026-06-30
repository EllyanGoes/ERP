"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef, type FilterFn } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Edit } from "lucide-react";
import { formatCPFCNPJ, cn } from "@/lib/utils";

type ClienteRow = {
  id: string;
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
  cidade: string | null;
  estado: string | null;
  status: string;
  mapeado?: boolean; // mapeado na Inteligência Comercial (tem Concorrente vinculado)
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

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "JURIDICA", label: "Pessoa Jurídica (PJ)" },
  { value: "FISICA", label: "Pessoa Física (PF)" },
] as const;

const MAPEADO_FILTROS = [
  { value: "", label: "Todos" },
  { value: "sim", label: "Mapeados" },
  { value: "nao", label: "Não mapeados" },
] as const;

export default function ClientesTable({ clientes }: { clientes: ClienteRow[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"" | "JURIDICA" | "FISICA">("");
  const [mapFiltro, setMapFiltro] = useState<"" | "sim" | "nao">("");

  const dados = useMemo(
    () => clientes.filter((c) =>
      (!tipo || c.tipoPessoa === tipo) &&
      (!mapFiltro || (mapFiltro === "sim" ? !!c.mapeado : !c.mapeado)),
    ),
    [clientes, tipo, mapFiltro],
  );

  const columns = useMemo<ColumnDef<ClienteRow>[]>(() => [
    {
      accessorKey: "razaoSocial",
      header: "Razão Social",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div>
            <p className="font-medium text-foreground">{row.original.razaoSocial}</p>
            {row.original.nomeFantasia && (
              <p className="text-xs text-muted-foreground">{row.original.nomeFantasia}</p>
            )}
          </div>
          <span className={cn(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
            row.original.tipoPessoa === "JURIDICA"
              ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
              : "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
          )}>
            {row.original.tipoPessoa === "JURIDICA" ? "PJ" : "PF"}
          </span>
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
        return <span className="text-sm text-muted-foreground">{loc || "—"}</span>;
      },
    },
    {
      id: "mapeado",
      header: "Inteligência Comercial",
      cell: ({ row }) => (
        row.original.mapeado ? (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">Mapeado</span>
        ) : (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Não mapeado</span>
        )
      ),
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
    <div className="space-y-3">
      {/* Filtro PF / PJ */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTipo(t.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                tipo === t.value ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Filtro mapeado na Inteligência Comercial */}
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {MAPEADO_FILTROS.map((t) => (
            <button
              key={t.value}
              onClick={() => setMapFiltro(t.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                mapFiltro === t.value ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{dados.length} cliente{dados.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable
        data={dados}
        columns={columns}
        globalFilterFn={filtroCliente}
        searchPlaceholder="Buscar por nome, CPF ou CNPJ..."
        onRowClick={(row) => router.push(`/clientes/${row.id}`)}
      />
    </div>
  );
}
