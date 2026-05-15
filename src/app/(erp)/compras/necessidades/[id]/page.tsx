"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatDate, decimalToNumber } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";

type Necessidade = {
  id: string;
  numero: string;
  status: string;
  solicitante: string | null;
  justificativa: string | null;
  dataNecessidade: string | null;
  observacoes: string | null;
  aprovadoPor: string | null;
  dataAprovacao: string | null;
  motivoReprovacao: string | null;
  filial: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  localEstoque: { id: string; nome: string } | null;
  centroCusto: { id: string; codigo: string; nome: string } | null;
  itens: Array<{
    id: string;
    quantidade: unknown;
    quantidadeAprovada: unknown;
    observacao: string | null;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
  }>;
  cotacoes: Array<{ id: string; numero: string; status: string }>;
};

export default function NecessidadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [necessidade, setNecessidade] = useState<Necessidade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning] = useState(false);

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Approval fields
  const [aprovadoPor, setAprovadoPor] = useState("");
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`);
      const json = await res.json();
      setNecessidade(json.data);
    } catch {
      setError("Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string, extra?: Record<string, string>) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro na operação"); return; }
      setShowApproveForm(false);
      setShowRejectForm(false);
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true); setDeleteError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError((await res.json()).error || "Não foi possível excluir");
        setDeleteLoading(false); return;
      }
      router.push("/compras/necessidades");
    } catch {
      setDeleteError("Erro de conexão");
      setDeleteLoading(false);
    }
  }

  async function gerarCotacao() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch("/api/suprimentos/cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          necessidadeId: id,
          fornecedorIds: [],
          itens: necessidade?.itens.map((i) => ({
            itemId: i.item.id,
            quantidade: decimalToNumber(i.quantidadeAprovada ?? i.quantidade),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao gerar cotação"); return; }
      router.push(`/suprimentos/cotacoes/${json.data.id}`);
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  useTabTitle(necessidade ? `Solicitação ${necessidade.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...</div>;
  if (!necessidade) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isRascunho = necessidade.status === "RASCUNHO";

  return (
    <div>
      <PageHeader
        title={`Solicitação ${necessidade.numero}`}
        breadcrumbs={[
          { label: "Compras" },
          { label: "Solicitações de Compras", href: "/compras/necessidades" },
          { label: necessidade.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={necessidade.status} />
            {isRascunho && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/compras/necessidades/${id}/editar`)}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => { setShowDelete(true); setDeleteError(""); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Excluir
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 space-y-6 max-w-5xl">
        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {necessidade.filial && (
              <div>
                <p className="text-xs text-gray-500">Filial</p>
                <p className="text-sm font-medium">{necessidade.filial.nomeFantasia || necessidade.filial.razaoSocial}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Solicitante</p>
              <p className="text-sm font-medium">{necessidade.solicitante || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Data de Necessidade</p>
              <p className="text-sm font-medium">{formatDate(necessidade.dataNecessidade)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <div className="mt-1"><StatusBadge status={necessidade.status} /></div>
            </div>
            {necessidade.localEstoque && (
              <div>
                <p className="text-xs text-gray-500">Local de Estoque</p>
                <p className="text-sm font-medium">{necessidade.localEstoque.nome}</p>
              </div>
            )}
            {necessidade.centroCusto && (
              <div>
                <p className="text-xs text-gray-500">Centro de Custo</p>
                <p className="text-sm font-medium">{necessidade.centroCusto.codigo} — {necessidade.centroCusto.nome}</p>
              </div>
            )}
            {necessidade.justificativa && (
              <div className="md:col-span-3">
                <p className="text-xs text-gray-500">Justificativa / Descrição</p>
                <p className="text-sm text-gray-700 mt-1">{necessidade.justificativa}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval info */}
        {(necessidade.status === "APROVADA" || necessidade.status === "REPROVADA") && (
          <Card className={necessidade.status === "APROVADA" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {necessidade.status === "APROVADA" && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Aprovado por</p>
                    <p className="text-sm font-medium">{necessidade.aprovadoPor || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Data de Aprovação</p>
                    <p className="text-sm font-medium">{formatDate(necessidade.dataAprovacao)}</p>
                  </div>
                </>
              )}
              {necessidade.status === "REPROVADA" && (
                <div className="md:col-span-3">
                  <p className="text-xs text-red-600">Motivo da Reprovação</p>
                  <p className="text-sm text-red-800 mt-1">{necessidade.motivoReprovacao || "—"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qtd. Solicitada</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">Un.</th>
                  {necessidade.status === "APROVADA" && (
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Qtd. Aprovada</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {necessidade.itens.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{item.item.codigo}</td>
                    <td className="px-4 py-3">{item.item.descricao}</td>
                    <td className="px-4 py-3 text-right">
                      {decimalToNumber(item.quantidade).toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {item.item.unidade?.sigla ?? item.item.unidadeMedida}
                    </td>
                    {necessidade.status === "APROVADA" && (
                      <td className="px-4 py-3 text-right text-green-700 font-medium">
                        {item.quantidadeAprovada
                          ? decimalToNumber(item.quantidadeAprovada).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.observacao || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Cotações link */}
        {necessidade.cotacoes?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cotações Geradas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {necessidade.cotacoes.map((c) => (
                <Link
                  key={c.id}
                  href={`/suprimentos/cotacoes/${c.id}`}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline border border-blue-200 rounded px-3 py-1"
                >
                  {c.numero} — <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Action buttons */}
        <div className="space-y-4">
          {necessidade.status === "RASCUNHO" && (
            <Button onClick={() => changeStatus("AGUARDANDO_APROVACAO")} disabled={actioning}>
              {actioning ? "Enviando..." : "Enviar para Aprovação"}
            </Button>
          )}

          {necessidade.status === "AGUARDANDO_APROVACAO" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-green-500 text-green-700 hover:bg-green-50"
                  onClick={() => { setShowApproveForm(true); setShowRejectForm(false); }}
                >
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  className="border-red-500 text-red-700 hover:bg-red-50"
                  onClick={() => { setShowRejectForm(true); setShowApproveForm(false); }}
                >
                  Reprovar
                </Button>
                <Button
                  variant="ghost"
                  className="text-gray-500"
                  onClick={() => changeStatus("CANCELADA")}
                  disabled={actioning}
                >
                  Cancelar Necessidade
                </Button>
              </div>

              {showApproveForm && (
                <Card className="border-green-200">
                  <CardContent className="pt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Aprovado por</Label>
                      <Input
                        value={aprovadoPor}
                        onChange={(e) => setAprovadoPor(e.target.value)}
                        placeholder="Nome do aprovador"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => changeStatus("APROVADA", { aprovadoPor })}
                        disabled={actioning}
                      >
                        {actioning ? "Aprovando..." : "Confirmar Aprovação"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowApproveForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {showRejectForm && (
                <Card className="border-red-200">
                  <CardContent className="pt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Motivo da Reprovação</Label>
                      <Input
                        value={motivoReprovacao}
                        onChange={(e) => setMotivoReprovacao(e.target.value)}
                        placeholder="Descreva o motivo..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => changeStatus("REPROVADA", { motivoReprovacao })}
                        disabled={actioning}
                      >
                        {actioning ? "Reprovando..." : "Confirmar Reprovação"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowRejectForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {necessidade.status === "APROVADA" && (
            <Button onClick={gerarCotacao} disabled={actioning}>
              {actioning ? "Gerando..." : "Gerar Cotação de Compra"}
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Excluir solicitação?</p>
                <p className="text-sm text-gray-500 mt-0.5">{necessidade.numero}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">Esta ação é permanente e não pode ser desfeita.</p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDelete(false)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
