"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";

type ItemOption = { id: string; codigo: string; descricao: string };

type ItemRow = {
  itemId: string;
  quantidade: string;
  observacao: string;
};

export default function NovaNecessidadePage() {
  const router = useRouter();
  const [solicitante, setSolicitante] = useState("");
  const [dataNecessidade, setDataNecessidade] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [itens, setItens] = useState<ItemRow[]>([{ itemId: "", quantidade: "1", observacao: "" }]);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "necessidade",
    gender: "f",
    onNew: () => {
      setSolicitante(""); setDataNecessidade(""); setJustificativa("");
      setItens([{ itemId: "", quantidade: "1", observacao: "" }]); setServerError("");
    },
    viewHref: (id) => `/suprimentos/necessidades/${id}`,
  });

  useEffect(() => {
    fetch("/api/suprimentos/produtos")
      .then((r) => r.json())
      .then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  function addRow() {
    setItens((prev) => [...prev, { itemId: "", quantidade: "1", observacao: "" }]);
  }

  function removeRow(i: number) {
    setItens((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItens = itens.filter((row) => row.itemId && parseFloat(row.quantidade) > 0);
    if (validItens.length === 0) {
      setServerError("Adicione pelo menos um item com quantidade válida");
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const res = await fetch("/api/suprimentos/necessidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          solicitante: solicitante || null,
          dataNecessidade: dataNecessidade || null,
          justificativa: justificativa || null,
          itens: validItens.map((row) => ({
            itemId: row.itemId,
            quantidade: parseFloat(row.quantidade),
            observacao: row.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || "Erro ao criar necessidade");
        return;
      }
      confirmCreated(json.data.id);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nova Necessidade de Compra"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Necessidades", href: "/suprimentos/necessidades" },
          { label: "Nova" },
        ]}
      />
      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6 max-w-5xl">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {serverError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Solicitante</Label>
              <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nome do solicitante" />
            </div>
            <div className="space-y-1.5">
              <Label>Data de Necessidade</Label>
              <Input type="date" value={dataNecessidade} onChange={(e) => setDataNecessidade(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Justificativa</Label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Motivo da necessidade de compra..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((row, i) => (
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
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={row.quantidade}
                    onChange={(e) => updateRow(i, "quantidade", e.target.value)}
                  />
                </div>
                <div className="col-span-4 space-y-1.5">
                  {i === 0 && <Label>Observação</Label>}
                  <Input
                    value={row.observacao}
                    onChange={(e) => updateRow(i, "observacao", e.target.value)}
                    placeholder="Opcional..."
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {itens.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => removeRow(i)}
                    >
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
            {saving ? "Salvando..." : "Criar Necessidade"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
      {dialog}
    </div>
  );
}
