"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDate, formatBRL, decimalToNumber } from "@/lib/utils";
import { useColumnOrder } from "@/lib/use-column-order";
import ColumnConfigurator, { ColDef } from "@/components/shared/ColumnConfigurator";

// ── Minimal type for the API response ────────────────────────────────────────
type ConferenciaRow = {
  id: string;
  numero: string;
  numeroNF: string | null;
  status: string;
  dtEmissao: string | null;
  vrTotal: unknown;
  pedido: {
    id: string;
    numero: string;
    fornecedor: { razaoSocial: string; nomeFantasia: string | null } | null;
  } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  itens: Array<{ id: string; vlrTotal: unknown }>;
};

function getFornecedorNome(doc: ConferenciaRow): string {
  if (doc.fornecedor) {
    return doc.fornecedor.nomeFantasia || doc.fornecedor.razaoSocial;
  }
  if (doc.pedido?.fornecedor) {
    return doc.pedido.fornecedor.nomeFantasia || doc.pedido.fornecedor.razaoSocial;
  }
  return "—";
}

function calcValorTotal(doc: ConferenciaRow): number {
  const vr = decimalToNumber(doc.vrTotal);
  if (vr > 0) return vr;
  return doc.itens.reduce((s, i) => s + decimalToNumber(i.vlrTotal), 0);
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLS: ColDef<ConferenciaRow>[] = [
  {
    id: "numero",
    label: "Nº Doc",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs font-medium text-gray-900",
    render: (doc) => doc.numero,
  },
  {
    id: "numeroNF",
    label: "Nº NF",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 font-mono text-xs text-gray-600",
    render: (doc) => doc.numeroNF || "—",
  },
  {
    id: "fornecedor",
    label: "Fornecedor",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-700",
    render: (doc) => getFornecedorNome(doc),
  },
  {
    id: "dtEmissao",
    label: "Data Emissão",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-gray-600",
    render: (doc) => doc.dtEmissao ? formatDate(doc.dtEmissao) : "—",
  },
  {
    id: "status",
    label: "Status",
    thClass: "text-left px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3",
    render: (doc) => <StatusBadge status={doc.status} />,
  },
  {
    id: "valorTotal",
    label: "Valor Total",
    thClass: "text-right px-4 py-3 font-medium text-gray-600",
    tdClass: "px-4 py-3 text-right text-gray-700",
    render: (doc) => {
      const valorTotal = calcValorTotal(doc);
      return valorTotal > 0 ? formatBRL(valorTotal) : "—";
    },
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DocumentosEntradaPage() {
  const [docs, setDocs]     = useState<ConferenciaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/suprimentos/conferencias");
    const json = await res.json();
    setDocs(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Column order
  const [colOrder, setColOrder] = useColumnOrder("conferencias", COLS.map((c) => c.id));
  const orderedCols = colOrder.map((id) => COLS.find((c) => c.id === id)).filter((c): c is ColDef<ConferenciaRow> => c !== undefined);

  return (
    <div>
      <PageHeader
        title="Documentos de Entrada"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Doc. de Entrada" }]}
        action={
          <div className="flex items-center gap-2">
            <ColumnConfigurator columns={COLS} order={colOrder} onOrderChange={setColOrder} />
            <Button asChild size="sm">
              <Link href="/suprimentos/conferencias/novo">Novo Documento de Entrada</Link>
            </Button>
          </div>
        }
      />
      <div className="px-8 pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">Nenhum documento registrado</p>
            <p className="text-sm mt-1">
              Documentos são criados ao receber mercadorias de pedidos ou manualmente.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {orderedCols.map((col) => (
                    <th key={col.id} className={col.thClass}>{col.label}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => window.location.href = `/suprimentos/conferencias/${doc.id}`}>
                    {orderedCols.map((col) => (
                      <td key={col.id} className={col.tdClass}>{col.render(doc)}</td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/suprimentos/conferencias/${doc.id}`}
                        className="text-blue-600 hover:underline text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
