"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { TipoProdutoQuickCreate, UnidadeQuickCreate } from "@/components/shared/QuickCreateDialogs";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { ShoppingBag } from "lucide-react";

type TipoProduto = { id: string; nome: string };
type Unidade     = { id: string; sigla: string; nome: string };

type FormData = {
  descricao: string;
  tipo: "PRODUTO" | "MATERIA_PRIMA" | "SERVICO";
  tipoProdutoId: string;
  unidadeId: string;
  ncm: string;
  precoVenda: string;
  estoqueMin: string;
  estoqueMax: string;
  vendavel: boolean;
};

const INITIAL: FormData = {
  descricao: "",
  tipo: "PRODUTO",
  tipoProdutoId: "",
  unidadeId: "",
  ncm: "",
  precoVenda: "",
  estoqueMin: "",
  estoqueMax: "",
  vendavel: true, // always true for this page
};

export default function NovoProdutoVendaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    descricao: searchParams.get("descricao") ?? searchParams.get("nome") ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "produto para venda",
    onNew: () => { setForm({ ...INITIAL }); setErrors({}); setServerError(""); },
  });

  const [tiposProduto, setTiposProduto] = useState<TipoProduto[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/tipos-produto").then((r) => r.json()),
      fetch("/api/suprimentos/unidades").then((r) => r.json()),
    ]).then(([tp, un]) => {
      setTiposProduto(Array.isArray(tp) ? tp : tp.data ?? []);
      setUnidades(Array.isArray(un) ? un : un.data ?? []);
    });
  }, []);

  function set(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.descricao.trim()) newErrors.descricao = "Descrição é obrigatória";
    if (!form.tipoProdutoId) newErrors.tipoProdutoId = "Tipo de Produto é obrigatório";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setServerError("");
    try {
      const payload: Record<string, unknown> = {
        descricao: form.descricao.trim(),
        tipo: form.tipo,
        ncm: form.ncm?.trim() || null,
        precoVenda: parseFloat(form.precoVenda) || 0,
        estoqueMin: form.estoqueMin ? parseFloat(form.estoqueMin) : null,
        estoqueMax: form.estoqueMax ? parseFloat(form.estoqueMax) : null,
        vendavel: true, // always true
      };
      if (form.tipoProdutoId) payload.tipoProdutoId = form.tipoProdutoId;
      if (form.unidadeId)    payload.unidadeId    = form.unidadeId;

      const res = await fetch("/api/suprimentos/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || "Erro ao salvar produto");
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
        title="Novo Produto para Venda"
        breadcrumbs={[
          { label: "Comercial" },
          { label: "Produtos para Venda", href: "/comercial/produtos-venda" },
          { label: "Novo" },
        ]}
      />
      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6 max-w-4xl">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {serverError}
          </div>
        )}

        {/* Identificação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-gray-200 bg-gray-50">
                <span className="text-sm text-gray-400 italic">Gerado automaticamente</span>
                <span className="ml-auto text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">auto</span>
              </div>
              <p className="text-[10px] text-gray-400">Ex: PROD-0001, PROD-0002 …</p>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as FormData["tipo"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUTO">Produto</SelectItem>
                  <SelectItem value="MATERIA_PRIMA">Matéria-prima</SelectItem>
                  <SelectItem value="SERVICO">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>
                Descrição <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Descrição do produto"
              />
              {errors.descricao && <p className="text-red-500 text-xs">{errors.descricao}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Produto <span className="text-red-500">*</span></Label>
              <ComboboxWithCreate
                options={tiposProduto.map((tp) => ({ value: tp.id, label: tp.nome }))}
                value={form.tipoProdutoId}
                onChange={(v) => set("tipoProdutoId", v)}
                placeholder="Selecionar tipo..."
                createHref="/suprimentos/tipos-produto"
                createParam="nome"
                createLabel="tipo de produto"
                renderCreateModal={(args) => <TipoProdutoQuickCreate {...args} />}
                triggerClassName={errors.tipoProdutoId ? "border-red-300 focus:ring-red-400" : undefined}
              />
              {errors.tipoProdutoId && <p className="text-red-500 text-xs">{errors.tipoProdutoId}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Unidade de Medida</Label>
              <ComboboxWithCreate
                options={unidades.map((u) => ({ value: u.id, label: `${u.sigla} — ${u.nome}` }))}
                value={form.unidadeId}
                onChange={(v) => set("unidadeId", v)}
                noneLabel="Padrão (UN)"
                placeholder="Selecionar unidade..."
                createHref="/suprimentos/unidades"
                createParam="nome"
                createLabel="unidade de medida"
                renderCreateModal={(args) => <UnidadeQuickCreate {...args} />}
              />
            </div>

            <div className="space-y-1.5">
              <Label>NCM</Label>
              <Input
                value={form.ncm}
                onChange={(e) => set("ncm", e.target.value)}
                placeholder="0000.00.00"
              />
            </div>

            {/* Vendável — locked on for this flow */}
            <div className="md:col-span-2">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                <div className="w-5 h-5 rounded border-2 border-blue-600 bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Este produto é vendável</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Produtos cadastrados por aqui são sempre marcados como vendáveis e aparecem no módulo Comercial.
                  </p>
                </div>
                <ShoppingBag className="w-4 h-4 text-blue-400 ml-auto mt-0.5 shrink-0" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preços */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preços</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Custo Médio (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.precoVenda}
                onChange={(e) => set("precoVenda", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="flex items-start gap-2 md:col-span-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              <span>
                O <strong>Custo Médio</strong> é calculado automaticamente pelo sistema com base nas
                movimentações de entrada (Custo Médio Ponderado Móvel). Informe o custo unitário ao
                registrar cada entrada de material.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Estoque */}
        {form.tipo !== "SERVICO" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estoque</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Estoque Mínimo</Label>
                <Input
                  type="number" step="0.001" min="0"
                  value={form.estoqueMin}
                  onChange={(e) => set("estoqueMin", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque Máximo</Label>
                <Input
                  type="number" step="0.001" min="0"
                  value={form.estoqueMax}
                  onChange={(e) => set("estoqueMax", e.target.value)}
                  placeholder="0"
                />
              </div>
              <p className="col-span-2 text-xs text-gray-400">
                O local de estoque é definido ao registrar uma movimentação de entrada.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar Produto"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/comercial/produtos-venda")}>
            Cancelar
          </Button>
        </div>
      </form>

      {dialog}
    </div>
  );
}
