export const dynamic = "force-dynamic";

import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ClickableRow from "@/components/shared/ClickableRow";
import { Button } from "@/components/ui/button";
import { formatDate, formatBRL, decimalToNumber } from "@/lib/utils";

type ConferenciaItem = {
  id: string;
  vlrTotal: unknown;
};

type ConferenciaDoc = {
  id: string;
  numero: string;
  status: string;
  numeroNF: string | null;
  dtEmissao: string | null;
  vrTotal: unknown;
  createdAt: string;
  pedido: {
    id: string;
    numero: string;
    fornecedor: { razaoSocial: string; nomeFantasia: string | null };
  } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  itens: ConferenciaItem[];
};

async function getConferencias(): Promise<ConferenciaDoc[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/suprimentos/conferencias`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

function getFornecedorNome(doc: ConferenciaDoc): string {
  if (doc.fornecedor) {
    return doc.fornecedor.nomeFantasia || doc.fornecedor.razaoSocial;
  }
  if (doc.pedido?.fornecedor) {
    return doc.pedido.fornecedor.nomeFantasia || doc.pedido.fornecedor.razaoSocial;
  }
  return "—";
}

function calcValorTotal(doc: ConferenciaDoc): number {
  const vr = decimalToNumber(doc.vrTotal);
  if (vr > 0) return vr;
  return doc.itens.reduce((s, i) => s + decimalToNumber(i.vlrTotal), 0);
}

export default async function DocumentosEntradaPage() {
  const docs = await getConferencias();

  return (
    <div>
      <PageHeader
        title="Documentos de Entrada"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Doc. de Entrada" }]}
        action={
          <Button asChild size="sm">
            <Link href="/suprimentos/conferencias/novo">Novo Documento de Entrada</Link>
          </Button>
        }
      />
      <div className="px-8 pb-8">
        {docs.length === 0 ? (
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nº Doc</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nº NF</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fornecedor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Emissão</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Valor Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((doc) => {
                  const valorTotal = calcValorTotal(doc);
                  return (
                    <ClickableRow key={doc.id} href={`/suprimentos/conferencias/${doc.id}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                        {doc.numero}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {doc.numeroNF || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{getFornecedorNome(doc)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {doc.dtEmissao ? formatDate(doc.dtEmissao) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {valorTotal > 0 ? formatBRL(valorTotal) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/suprimentos/conferencias/${doc.id}`}
                          className="text-blue-600 hover:underline text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ver
                        </Link>
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
