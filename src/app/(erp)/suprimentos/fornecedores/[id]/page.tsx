"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X, ExternalLink, Trash2, AlertTriangle, Plus, Loader2 } from "lucide-react";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Fornecedor = {
  id: string;
  tipoPessoa: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string;
  ie: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  contato: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
  observacoes: string | null;
  produtos: Array<{
    id: string;
    codigoFornecedor: string | null;
    precoUltimo: unknown;
    prazoEntregaDias: number | null;
    item: { id: string; codigo: string; descricao: string };
  }>;
  pedidosCompra: Array<{
    id: string;
    numero: string;
    status: string;
    valorTotal: unknown;
    createdAt: string;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO:    "Rascunho",
  ENVIADO:     "Enviado",
  CONFIRMADO:  "Confirmado",
  EM_TRANSITO: "Em Trânsito",
  RECEBIDO:    "Recebido",
  CANCELADO:   "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:    "bg-gray-100 text-gray-600",
  ENVIADO:     "bg-blue-100 text-blue-700",
  CONFIRMADO:  "bg-indigo-100 text-indigo-700",
  EM_TRANSITO: "bg-amber-100 text-amber-700",
  RECEBIDO:    "bg-emerald-100 text-emerald-700",
  CANCELADO:   "bg-red-100 text-red-700",
};

type PageTab = "dados" | "produtos" | "pedidos";

type ProdutoItem = { id: string; codigo: string; descricao: string };

export default function FornecedorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { tabs, closeTab } = useTabsContext();
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>("dados");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Fornecedor>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // ── Product linking ─────────────────────────────────────────────────
  const [prodList, setProdList] = useState<ProdutoItem[]>([]);
  const [showAddProd, setShowAddProd] = useState(false);
  const [addProd, setAddProd] = useState({ itemId: "", prazoEntregaDias: "" });
  const [addProdSaving, setAddProdSaving] = useState(false);
  const [addProdError, setAddProdError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/fornecedores/${id}`);
      const data = await res.json();
      setFornecedor(data);
      setEditForm(data);
    } catch {
      setError("Erro ao carregar fornecedor");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setEditForm({ ...fornecedor });
    setEditMode(true);
  }

  function cancelEdit() {
    setEditForm({ ...fornecedor });
    setEditMode(false);
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/suprimentos/fornecedores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Erro ao salvar");
        return;
      }
      await load();
      setEditMode(false);
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  function setField(key: keyof Fornecedor, value: unknown) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/suprimentos/fornecedores/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) { setDeleteError(j.error || "Erro ao excluir"); setDeleting(false); return; }
      // Close this tab and navigate to the list
      const thisTab = tabs.find((t) => t.href === `/suprimentos/fornecedores/${id}`);
      if (thisTab) closeTab(thisTab.id);
      else router.push("/suprimentos/fornecedores");
    } catch {
      setDeleteError("Erro de conexão");
      setDeleting(false);
    }
  }

  // Load product list for the combobox
  useEffect(() => {
    fetch("/api/suprimentos/produtos?limit=9999")
      .then((r) => r.json())
      .then((d) => {
        const items: ProdutoItem[] = (d.data ?? d).map((p: any) => ({
          id: p.id,
          codigo: p.codigo,
          descricao: p.descricao,
        }));
        setProdList(items);
      })
      .catch(() => {});
  }, []);

  async function addProduto() {
    if (!addProd.itemId) { setAddProdError("Selecione um produto"); return; }
    setAddProdSaving(true);
    setAddProdError("");
    try {
      const res = await fetch(`/api/suprimentos/fornecedores/${id}/produtos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addProd),
      });
      const j = await res.json();
      if (!res.ok) { setAddProdError(j.error || "Erro ao vincular produto"); return; }
      setShowAddProd(false);
      await load();
    } catch {
      setAddProdError("Erro de conexão");
    } finally {
      setAddProdSaving(false);
    }
  }

  async function removeProduto(produtoFornecedorId: string) {
    await fetch(`/api/suprimentos/fornecedores/${id}/produtos?produtoFornecedorId=${produtoFornecedorId}`, {
      method: "DELETE",
    });
    await load();
  }

  useTabTitle(fornecedor ? (fornecedor.nomeFantasia || fornecedor.razaoSocial) : null);

  if (loading) return <div className="px-8 pt-8 text-gray-400">Carregando...</div>;
  if (!fornecedor) return <div className="px-8 pt-8 text-red-500">{error || "Fornecedor não encontrado"}</div>;

  const pageTabs: { key: PageTab; label: string; count?: number }[] = [
    { key: "dados",    label: "Dados Cadastrais" },
    { key: "produtos", label: "Produtos",         count: fornecedor.produtos?.length ?? 0 },
    { key: "pedidos",  label: "Pedidos de Compra", count: fornecedor.pedidosCompra?.length ?? 0 },
  ];

  return (
    <div>
      <PageHeader
        title={fornecedor.nomeFantasia || fornecedor.razaoSocial}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Fornecedores", href: "/suprimentos/fornecedores" },
          { label: fornecedor.razaoSocial },
        ]}
        action={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                fornecedor.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              )}
            >
              {fornecedor.ativo ? "Ativo" : "Inativo"}
            </span>
            {editMode ? (
              <>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Edit className="w-4 h-4 mr-1" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setDeleteConfirm(true); setDeleteError(""); }}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Apagar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 mb-6 gap-1">
          {pageTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full font-semibold",
                    activeTab === t.key
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Dados Cadastrais ─────────────────────────────────────────── */}
        {activeTab === "dados" && (
          <div className="space-y-6 max-w-4xl">
            {/* Identificação */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identificação</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editMode ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Tipo de Pessoa</Label>
                      <Select
                        value={editForm.tipoPessoa as string}
                        onValueChange={(v) => setField("tipoPessoa", v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                          <SelectItem value="FISICA">Pessoa Física</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF/CNPJ</Label>
                      <Input value={editForm.cpfCnpj ?? ""} onChange={(e) => setField("cpfCnpj", e.target.value)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>Razão Social</Label>
                      <Input value={editForm.razaoSocial ?? ""} onChange={(e) => setField("razaoSocial", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nome Fantasia</Label>
                      <Input value={editForm.nomeFantasia ?? ""} onChange={(e) => setField("nomeFantasia", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>IE</Label>
                      <Input value={editForm.ie ?? ""} onChange={(e) => setField("ie", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select
                        value={editForm.ativo ? "true" : "false"}
                        onValueChange={(v) => setField("ativo", v === "true")}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Ativo</SelectItem>
                          <SelectItem value="false">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <InfoRow label="Tipo" value={fornecedor.tipoPessoa === "JURIDICA" ? "Pessoa Jurídica" : "Pessoa Física"} />
                    <InfoRow label="CPF/CNPJ" value={fornecedor.cpfCnpj} mono />
                    <InfoRow label="Razão Social" value={fornecedor.razaoSocial} />
                    <InfoRow label="Nome Fantasia" value={fornecedor.nomeFantasia} />
                    <InfoRow label="IE" value={fornecedor.ie} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Contato */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contato</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editMode ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>E-mail</Label>
                      <Input type="email" value={editForm.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Telefone</Label>
                      <Input value={editForm.telefone ?? ""} onChange={(e) => setField("telefone", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Celular</Label>
                      <Input value={editForm.celular ?? ""} onChange={(e) => setField("celular", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pessoa de Contato</Label>
                      <Input value={editForm.contato ?? ""} onChange={(e) => setField("contato", e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoRow label="E-mail" value={fornecedor.email} />
                    <InfoRow label="Telefone" value={fornecedor.telefone} />
                    <InfoRow label="Celular" value={fornecedor.celular} />
                    <InfoRow label="Contato" value={fornecedor.contato} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Endereço */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Endereço</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {editMode ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>CEP</Label>
                      <Input value={editForm.cep ?? ""} onChange={(e) => setField("cep", e.target.value)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>Logradouro</Label>
                      <Input value={editForm.logradouro ?? ""} onChange={(e) => setField("logradouro", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Número</Label>
                      <Input value={editForm.numero ?? ""} onChange={(e) => setField("numero", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Complemento</Label>
                      <Input value={editForm.complemento ?? ""} onChange={(e) => setField("complemento", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bairro</Label>
                      <Input value={editForm.bairro ?? ""} onChange={(e) => setField("bairro", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cidade</Label>
                      <Input value={editForm.cidade ?? ""} onChange={(e) => setField("cidade", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Estado (UF)</Label>
                      <Input value={editForm.estado ?? ""} onChange={(e) => setField("estado", e.target.value)} maxLength={2} />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoRow label="CEP" value={fornecedor.cep} />
                    <InfoRow label="Logradouro" value={fornecedor.logradouro} />
                    <InfoRow label="Número" value={fornecedor.numero} />
                    <InfoRow label="Complemento" value={fornecedor.complemento} />
                    <InfoRow label="Bairro" value={fornecedor.bairro} />
                    <InfoRow label="Cidade" value={fornecedor.cidade} />
                    <InfoRow label="Estado" value={fornecedor.estado} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Observações */}
            {editMode ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editForm.observacoes ?? ""}
                    onChange={(e) => setField("observacoes", e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>
            ) : fornecedor.observacoes ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{fornecedor.observacoes}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {/* ── Produtos ─────────────────────────────────────────────────── */}
        {activeTab === "produtos" && (
          <div className="max-w-5xl space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setAddProdError(""); setAddProd({ itemId: "", prazoEntregaDias: "" }); setShowAddProd(true); }}>
                <Plus className="w-4 h-4 mr-1" />Vincular Produto
              </Button>
            </div>

            {/* ── Product link dialog ─────────────────────────────────────── */}
            {showAddProd && typeof window !== "undefined" && createPortal(
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-base">Vincular Produto</h3>
                    <button type="button" onClick={() => setShowAddProd(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addProdError && (
                      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addProdError}</p>
                    )}
                    <div className="space-y-1.5">
                      <Label>Produto <span className="text-red-500">*</span></Label>
                      <ComboboxWithCreate
                        options={prodList.map((p) => ({ value: p.id, label: `${p.codigo} – ${p.descricao}` }))}
                        value={addProd.itemId}
                        onChange={(v) => setAddProd((prev) => ({ ...prev, itemId: v }))}
                        allowNone={false}
                        placeholder="Selecionar produto..."
                        createHref="/suprimentos/produtos/novo"
                        createParam="descricao"
                        createLabel="produto"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Prazo de Entrega (dias)</Label>
                      <Input type="number" value={addProd.prazoEntregaDias} onChange={(e) => setAddProd((p) => ({ ...p, prazoEntregaDias: e.target.value }))} placeholder="Ex: 7" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="sm" variant="outline" onClick={() => setShowAddProd(false)} disabled={addProdSaving}>Cancelar</Button>
                    <Button size="sm" onClick={addProduto} disabled={addProdSaving}>
                      {addProdSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            <Card>
              <CardContent className="p-0">
                {!fornecedor.produtos?.length ? (
                  <div className="text-center py-16 text-gray-400 text-sm">
                    Nenhum produto vinculado a este fornecedor
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Código</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Descrição</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Cód. Fornecedor</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Último Preço</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Prazo (dias)</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {fornecedor.produtos.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-blue-600">{p.item.codigo}</td>
                          <td className="px-4 py-3 text-gray-800">{p.item.descricao}</td>
                          <td className="px-4 py-3 text-gray-500">{p.codigoFornecedor || "—"}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {p.precoUltimo ? formatBRL(decimalToNumber(p.precoUltimo)) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {p.prazoEntregaDias ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 flex items-center justify-center gap-1">
                            <Link
                              href={`/suprimentos/produtos/${p.item.id}`}
                              className="text-gray-300 hover:text-blue-500 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeProduto(p.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Pedidos de Compra ─────────────────────────────────────────── */}
        {activeTab === "pedidos" && (
          <div className="max-w-5xl">
            <Card>
              <CardContent className="p-0">
                {!fornecedor.pedidosCompra?.length ? (
                  <div className="text-center py-16 text-gray-400 text-sm">
                    Nenhum pedido de compra para este fornecedor
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Número</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Valor Total</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Data</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {fornecedor.pedidosCompra.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{p.numero}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                              STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"
                            )}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-800">
                            {formatBRL(decimalToNumber(p.valorTotal))}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(p.createdAt)}</td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/suprimentos/pedidos-compra/${p.id}`}
                              className="text-gray-300 hover:text-blue-500 transition-colors flex justify-center"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Excluir fornecedor</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Tem certeza que deseja excluir <strong>{fornecedor.nomeFantasia || fornecedor.razaoSocial}</strong>?
                  Esta ação não pode ser desfeita.
                </p>
                {deleteError && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setDeleteConfirm(false); setDeleteError(""); }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white border-0"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleting ? "Excluindo..." : "Excluir definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={cn("text-sm text-gray-900", mono && "font-mono")}>{value || "—"}</p>
    </div>
  );
}
