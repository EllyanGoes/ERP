"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Fornecedor = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
};

export default function NovoPedidoCompraPage() {
  const router = useRouter();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemRow[]>([{ itemId: "", quantidade: "1", precoUnitario: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : j.data ?? []));
    fetch("/api/itens?tipo=PRODUTO&limit=200")
      .then((r) => r.json())
      .then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  function addRow() {
    setItens((p) => [...p, { itemId: "", quantidade: "1", precoUnitario: "" }]);
  }

  function removeRow(i: number) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  const total = itens.reduce((sum, row) => {
    const q = parseFloat(row.quantidade) || 0;
    const p = parseFloat(row.precoUnitario) || 0;
    return sum + q * p;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fornecedorId) { setError("Selecione um fornecedor"); return; }
    const validItens = itens.filter((row) => row.itemId && parseFloat(row.quantidade) > 0 && parseFloat(row.precoUnitario) > 0);
    if (validItens.length === 0) { setError("Adicione pelo menos um item com quantidade e preço válidos"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/suprimentos/pedidos-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId,
          dataEntregaPrevista: dataEntregaPrevista || null,
          observacoes: observacoes || null,
          itens: validItens.map((row) => ({
            itemId: row.itemId,
            quantidade: parseFloat(row.quantidade),
            precoUnitario: parseFloat(row.precoUnitario),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao criar pedido"); return; }
      router.push(`/suprimentos/pedidos-compra/${json.data.id}`);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo Pedido de Compra"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: "Novo" },
        ]}
      />
      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6 max-w-5xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Pedido</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <ComboboxWithCreate
                options={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia || f.razaoSocial }))}
                value={fornecedorId}
                onChange={setFornecedorId}
                allowNone={false}
                placeholder="Selecionar fornecedor..."
                createHref="/suprimentos/fornecedores/novo"
                createParam="nome"
                createLabel="fornecedor"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de Entrega Prevista</Label>
              <Input type="date" value={dataEntregaPrevista} onChange={(e) => setDataEntregaPrevista(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações do pedido..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens do Pedido</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => {
              const subtotal = (parseFloat(row.quantidade) || 0) * (parseFloat(row.precoUnitario) || 0);
              return (
                <div key={i} className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-5 space-y-1.5">
                    {i === 0 && <Label>Produto</Label>}
                    <ComboboxWithCreate
                      options={itemOptions.map((opt) => ({ value: opt.id, label: `[${opt.codigo}] ${opt.descricao}` }))}
                      value={row.itemId}
                      onChange={(v) => updateRow(i, "itemId", v)}
                      allowNone={false}
                      placeholder="Selecionar produto..."
                      createHref="/suprimentos/produtos/novo"
                      createParam="descricao"
                      createLabel="produto"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Quantidade</Label>}
                    <Input
                      type="number" step="0.001" min="0.001"
                      value={row.quantidade}
                      onChange={(e) => updateRow(i, "quantidade", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Preço Unit. (R$)</Label>}
                    <Input
                      type="number" step="0.01" min="0"
                      value={row.precoUnitario}
                      onChange={(e) => updateRow(i, "precoUnitario", e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    {i === 0 && <Label>Subtotal</Label>}
                    <div className="h-10 flex items-center px-3 bg-gray-50 rounded-md border border-gray-200 text-sm font-medium text-gray-700">
                      {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {itens.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeRow(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {total > 0 && (
              <div className="flex justify-end pt-3 border-t border-gray-100">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total do Pedido</p>
                  <p className="text-lg font-bold text-gray-900">
                    {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {saving ? "Criando..." : "Criar Pedido de Compra"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}
