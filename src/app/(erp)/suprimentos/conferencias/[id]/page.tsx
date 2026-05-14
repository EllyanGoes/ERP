"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatDate, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";

type ConferenciaItem = {
  id: string;
  quantidadePedida: unknown;
  quantidadeRecebida: unknown;
  divergencia: boolean;
  observacao: string | null;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
};

type Conferencia = {
  id: string;
  numero: string;
  status: string;
  dataConferencia: string | null;
  responsavel: string | null;
  observacoes: string | null;
  pedido: {
    id: string;
    numero: string;
    fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  };
  itens: ConferenciaItem[];
};

type EditItem = {
  id: string;
  quantidadeRecebida: string;
  observacao: string;
};

function getItemStatus(pedida: number, recebida: number): { label: string; cls: string } {
  if (recebida === 0) return { label: "Faltante", cls: "bg-red-100 text-red-700" };
  if (Math.abs(pedida - recebida) > 0.001) return { label: "Divergência", cls: "bg-amber-100 text-amber-700" };
  return { label: "OK", cls: "bg-green-100 text-green-700" };
}

export default function ConferenciaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);
  const [autoVinculoMsg, setAutoVinculoMsg] = useState<string | null>(null);

  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`);
      const json = await res.json();
      const conf: Conferencia = json.data;
      setConferencia(conf);
      setResponsavel(conf.responsavel ?? "");
      setObservacoes(conf.observacoes ?? "");
      setEditItems(
        conf.itens.map((i) => ({
          id: i.id,
          quantidadeRecebida: decimalToNumber(i.quantidadeRecebida).toString(),
          observacao: i.observacao ?? "",
        }))
      );
    } catch {
      setError("Erro ao carregar conferência");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function updateEditItem(itemId: string, key: keyof EditItem, value: string) {
    setEditItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, [key]: value } : i)));
  }

  async function salvarConferencia() {
    setSaving(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observacoes: observacoes || null,
          itens: editItems.map((i) => ({
            id: i.id,
            quantidadeRecebida: parseFloat(i.quantidadeRecebida) || 0,
            observacao: i.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao salvar");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function concluir() {
    setActioning(true);
    setActionError("");
    try {
      // First save items
      await salvarConferencia();

      // Then finalize
      const res = await fetch(`/api/suprimentos/conferencias/${id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Erro ao concluir conferência");
        return;
      }
      await load();
      if (json.autoVinculos?.length > 0) {
        setAutoVinculoMsg(
          `Vinculação automática: ${json.autoVinculos.join(", ")} ${json.autoVinculos.length === 1 ? "foi vinculado" : "foram vinculados"} ao fornecedor deste pedido.`
        );
        setTimeout(() => setAutoVinculoMsg(null), 7000);
      }
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function iniciarConferencia() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/conferencias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [] }), // triggers EM_CONFERENCIA status
      });
      if (!res.ok) {
        const j = await res.json();
        setActionError(j.error || "Erro ao iniciar");
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  // Set tab title dynamically
  useTabTitle(conferencia ? `Conf. ${conferencia.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400">Carregando...</div>;
  if (!conferencia) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isEditable = conferencia.status === "EM_CONFERENCIA";
  const totalPedido = conferencia.itens.reduce((s, i) => s + decimalToNumber(i.quantidadePedida), 0);
  const totalRecebido = editItems.reduce((s, i) => s + (parseFloat(i.quantidadeRecebida) || 0), 0);
  const hasDivergencias = editItems.some((ei) => {
    const item = conferencia.itens.find((i) => i.id === ei.id);
    if (!item) return false;
    return Math.abs(decimalToNumber(item.quantidadePedida) - (parseFloat(ei.quantidadeRecebida) || 0)) > 0.001;
  });

  return (
    <div>
      {/* Auto-vínculo toast */}
      {autoVinculoMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-700 text-white text-sm px-5 py-3 rounded-2xl shadow-lg max-w-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          <span>{autoVinculoMsg}</span>
          <button onClick={() => setAutoVinculoMsg(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <PageHeader
        title={`Conferência ${conferencia.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Conferências", href: "/suprimentos/conferencias" },
          { label: conferencia.numero },
        ]}
        action={<StatusBadge status={conferencia.status} />}
      />
      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Info */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Pedido</p>
              <Link
                href={`/suprimentos/pedidos-compra/${conferencia.pedido.id}`}
                className="text-sm font-medium text-blue-600 hover:underline font-mono"
              >
                {conferencia.pedido.numero}
              </Link>
            </div>
            <div>
              <p className="text-xs text-gray-500">Fornecedor</p>
              <p className="text-sm font-medium">
                {conferencia.pedido.fornecedor.nomeFantasia || conferencia.pedido.fornecedor.razaoSocial}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <div className="mt-1"><StatusBadge status={conferencia.status} /></div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data de Conferência</p>
              <p className="text-sm font-medium">{formatDate(conferencia.dataConferencia)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium">Total Pedido</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{totalPedido.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</p>
            <p className="text-xs text-blue-500">itens solicitados</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium">Total Recebido</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{totalRecebido.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</p>
            <p className="text-xs text-green-500">itens contados</p>
          </div>
          <div className={`rounded-xl p-4 ${hasDivergencias ? "bg-amber-50" : "bg-gray-50"}`}>
            <p className={`text-xs font-medium ${hasDivergencias ? "text-amber-600" : "text-gray-500"}`}>Divergências</p>
            <p className={`text-2xl font-bold mt-1 ${hasDivergencias ? "text-amber-900" : "text-gray-700"}`}>
              {hasDivergencias ? "Sim" : "Nenhuma"}
            </p>
          </div>
        </div>

        {/* Responsavel */}
        {isEditable && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-1.5 max-w-xs">
                <Label>Responsável pela Conferência</Label>
                <Input
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Nome do conferente"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens para Conferência</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qtd. Pedida</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qtd. Recebida</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {conferencia.itens.map((item, idx) => {
                  const ei = editItems[idx];
                  const qtdPedida = decimalToNumber(item.quantidadePedida);
                  const qtdRecebida = parseFloat(ei?.quantidadeRecebida ?? "0") || 0;
                  const itemStatus = getItemStatus(qtdPedida, qtdRecebida);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 ${item.divergencia && !isEditable ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.item.codigo}</td>
                      <td className="px-4 py-3">{item.item.descricao}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {qtdPedida.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.item.unidadeMedida}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditable && ei ? (
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            className="w-28 ml-auto text-right"
                            value={ei.quantidadeRecebida}
                            onChange={(e) => updateEditItem(item.id, "quantidadeRecebida", e.target.value)}
                          />
                        ) : (
                          <span className="text-gray-700">
                            {decimalToNumber(item.quantidadeRecebida).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${itemStatus.cls}`}>
                          {isEditable ? itemStatus.label : (item.divergencia ? "Divergência" : "OK")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isEditable && ei ? (
                          <Input
                            value={ei.observacao}
                            onChange={(e) => updateEditItem(item.id, "observacao", e.target.value)}
                            placeholder="Observação..."
                            className="text-xs"
                          />
                        ) : (
                          <span className="text-xs text-gray-500">{item.observacao || "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {conferencia.status === "PENDENTE" && (
            <Button onClick={iniciarConferencia} disabled={actioning}>
              {actioning ? "Iniciando..." : "Iniciar Conferência"}
            </Button>
          )}

          {isEditable && (
            <>
              <Button variant="outline" onClick={salvarConferencia} disabled={saving}>
                {saving ? "Salvando..." : "Salvar Progresso"}
              </Button>
              <Button
                onClick={concluir}
                disabled={actioning}
                className={hasDivergencias ? "bg-amber-600 hover:bg-amber-700" : ""}
              >
                {actioning
                  ? "Concluindo..."
                  : hasDivergencias
                  ? "Concluir com Divergências"
                  : "Concluir Conferência"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
