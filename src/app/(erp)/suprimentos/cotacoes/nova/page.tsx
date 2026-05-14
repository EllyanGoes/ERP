"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Necessidade = { id: string; numero: string; status: string };
type Fornecedor = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemOption = { id: string; codigo: string; descricao: string };

type ItemRow = { itemId: string; quantidade: string };

export default function NovaCotacaoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const necessidadeIdParam = searchParams.get("necessidadeId");

  const [necessidades, setNecessidades] = useState<Necessidade[]>([]);
  const [fornecedoresList, setFornecedoresList] = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);

  const [necessidadeId, setNecessidadeId] = useState(necessidadeIdParam || "");
  const [dataLimiteResposta, setDataLimiteResposta] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [selectedFornecedores, setSelectedFornecedores] = useState<string[]>([]);
  const [itens, setItens] = useState<ItemRow[]>([{ itemId: "", quantidade: "1" }]);

  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/necessidades?status=APROVADA").then((r) => r.json()),
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
      fetch("/api/suprimentos/produtos").then((r) => r.json()),
    ]).then(([nc, forn, prod]) => {
      const ncData = Array.isArray(nc) ? nc : nc.data ?? [];
      setNecessidades(ncData.filter((n: Necessidade) => n.status === "APROVADA"));
      setFornecedoresList(Array.isArray(forn) ? forn : forn.data ?? []);
      setItemOptions(Array.isArray(prod) ? prod : prod.data ?? []);
    });
  }, []);

  // Prefill if necessidade selected
  useEffect(() => {
    if (!necessidadeId) return;
    fetch(`/api/suprimentos/necessidades/${necessidadeId}`)
      .then((r) => r.json())
      .then((json) => {
        const nc = json.data;
        if (nc?.itens) {
          setItens(
            nc.itens.map((i: { item: { id: string }; quantidade: unknown; quantidadeAprovada: unknown }) => ({
              itemId: i.item.id,
              quantidade: String(i.quantidadeAprovada ?? i.quantidade),
            }))
          );
        }
      });
  }, [necessidadeId]);

  function toggleFornecedor(fId: string) {
    setSelectedFornecedores((prev) =>
      prev.includes(fId) ? prev.filter((f) => f !== fId) : [...prev, fId]
    );
  }

  function addItemRow() {
    setItens((p) => [...p, { itemId: "", quantidade: "1" }]);
  }

  function removeItemRow(i: number) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItens = itens.filter((row) => row.itemId && parseFloat(row.quantidade) > 0);
    if (validItens.length === 0) {
      setServerError("Adicione pelo menos um item");
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const res = await fetch("/api/suprimentos/cotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          necessidadeId: necessidadeId || null,
          dataLimiteResposta: dataLimiteResposta || null,
          observacoes: observacoes || null,
          fornecedorIds: selectedFornecedores,
          itens: validItens.map((row) => ({
            itemId: row.itemId,
            quantidade: parseFloat(row.quantidade),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || "Erro ao criar cotação");
        return;
      }
      router.push(`/suprimentos/cotacoes/${json.data.id}`);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nova Cotação de Compra"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Cotações", href: "/suprimentos/cotacoes" },
          { label: "Nova" },
        ]}
      />
      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6 max-w-5xl">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{serverError}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Cotação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Necessidade de Compra (opcional)</Label>
              <Select value={necessidadeId || "none"} onValueChange={(v) => setNecessidadeId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Vincular a uma necessidade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {necessidades.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo Limite de Resposta</Label>
              <Input
                type="date"
                value={dataLimiteResposta}
                onChange={(e) => setDataLimiteResposta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Fornecedores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Fornecedores Convidados</CardTitle>
            <button
              type="button"
              onClick={() => router.push("/suprimentos/fornecedores/novo")}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-500 hover:text-blue-700"
            >
              <Plus className="w-3 h-3" /> Novo fornecedor
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {fornecedoresList.map((f) => {
                const selected = selectedFornecedores.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFornecedor(f.id)}
                    className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-800"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    {selected && <span className="mr-1">✓</span>}
                    {f.nomeFantasia || f.razaoSocial}
                  </button>
                );
              })}
            </div>
            {selectedFornecedores.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">{selectedFornecedores.length} fornecedor(es) selecionado(s)</p>
            )}
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens para Cotar</CardTitle>
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={addItemRow}>
                <Plus className="w-4 h-4 mr-1" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-8 space-y-1.5">
                  {i === 0 && <Label>Produto</Label>}
                  <ComboboxWithCreate
                    options={itemOptions.map((opt) => ({ value: opt.id, label: `[${opt.codigo}] ${opt.descricao}` }))}
                    value={row.itemId}
                    onChange={(v) => updateItem(i, "itemId", v)}
                    allowNone={false}
                    placeholder="Selecionar produto..."
                    createHref="/suprimentos/produtos/novo"
                    createParam="descricao"
                    createLabel="produto"
                  />
                </div>
                <div className="col-span-3 space-y-1.5">
                  {i === 0 && <Label>Quantidade</Label>}
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={row.quantidade}
                    onChange={(e) => updateItem(i, "quantidade", e.target.value)}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {itens.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeItemRow(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Criando..." : "Criar Cotação"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
