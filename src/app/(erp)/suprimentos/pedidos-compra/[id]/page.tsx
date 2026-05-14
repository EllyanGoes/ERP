"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type PedidoCompra = {
  id: string;
  numero: string;
  status: string;
  valorTotal: unknown;
  dataEntregaPrevista: string | null;
  observacoes: string | null;
  cotacaoId: string | null;
  cotacao: { id: string; numero: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario: unknown;
    valorTotal: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
  conferencia: { id: string; numero: string; status: string } | null;
};

const STATUS_NEXT: Record<string, { label: string; next: string; variant: "default" | "outline" }[]> = {
  RASCUNHO: [{ label: "Enviar Pedido", next: "ENVIADO", variant: "default" }],
  ENVIADO: [{ label: "Confirmar Recebimento", next: "CONFIRMADO", variant: "default" }],
  CONFIRMADO: [
    { label: "Marcar Em Trânsito", next: "EM_TRANSITO", variant: "outline" },
    { label: "Registrar Chegada", next: "RECEBIDO", variant: "default" },
  ],
  EM_TRANSITO: [{ label: "Registrar Chegada", next: "RECEBIDO", variant: "default" }],
  RECEBIDO: [],
  CANCELADO: [],
};

export default function PedidoCompraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<PedidoCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`);
      const json = await res.json();
      setPedido(json.data);
    } catch {
      setError("Erro ao carregar pedido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro na operação");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function registrarConferencia() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch("/api/suprimentos/conferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao criar conferência");
        return;
      }
      router.push(`/suprimentos/conferencias/${json.data.id}`);
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  // Set tab title dynamically
  useTabTitle(pedido ? `PC ${pedido.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400">Carregando...</div>;
  if (!pedido) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const totalGeral = decimalToNumber(pedido.valorTotal);
  const nextActions = STATUS_NEXT[pedido.status] ?? [];

  return (
    <div>
      <PageHeader
        title={`Pedido ${pedido.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: pedido.numero },
        ]}
        action={<StatusBadge status={pedido.status} />}
      />
      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Info */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Fornecedor</p>
              <p className="text-sm font-medium">
                <Link href={`/suprimentos/fornecedores/${pedido.fornecedor.id}`} className="text-blue-600 hover:underline">
                  {pedido.fornecedor.nomeFantasia || pedido.fornecedor.razaoSocial}
                </Link>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cotação</p>
              <p className="text-sm font-medium">
                {pedido.cotacao ? (
                  <Link href={`/suprimentos/cotacoes/${pedido.cotacao.id}`} className="text-blue-600 hover:underline">
                    {pedido.cotacao.numero}
                  </Link>
                ) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Entrega Prevista</p>
              <p className="text-sm font-medium">{formatDate(pedido.dataEntregaPrevista)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Valor Total</p>
              <p className="text-lg font-bold text-gray-900">{formatBRL(totalGeral)}</p>
            </div>
            {pedido.conferencia && (
              <div>
                <p className="text-xs text-gray-500">Conferência</p>
                <Link
                  href={`/suprimentos/conferencias/${pedido.conferencia.id}`}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  {pedido.conferencia.numero} — <StatusBadge status={pedido.conferencia.status} />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Quantidade</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Preço Unit.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedido.itens.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.item.codigo}</td>
                    <td className="px-4 py-3">{item.item.descricao}</td>
                    <td className="px-4 py-3 text-right">
                      {decimalToNumber(item.quantidade).toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3,
                      })}{" "}
                      {item.item.unidadeMedida}
                    </td>
                    <td className="px-4 py-3 text-right">{formatBRL(decimalToNumber(item.precoUnitario))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatBRL(decimalToNumber(item.valorTotal))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-900">Total Geral</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 text-base">{formatBRL(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {pedido.observacoes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{pedido.observacoes}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {nextActions.map((action) => (
            <Button
              key={action.next}
              variant={action.variant}
              onClick={() => changeStatus(action.next)}
              disabled={actioning}
            >
              {actioning ? "Processando..." : action.label}
            </Button>
          ))}
          {pedido.status === "CONFIRMADO" && !pedido.conferencia && (
            <Button onClick={registrarConferencia} disabled={actioning}>
              {actioning ? "Criando..." : "Registrar Conferência"}
            </Button>
          )}
          {pedido.status === "EM_TRANSITO" && !pedido.conferencia && (
            <Button onClick={registrarConferencia} disabled={actioning}>
              {actioning ? "Criando..." : "Registrar Conferência"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
