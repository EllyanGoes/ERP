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
import { CATEGORIA_ESTOQUE_VALUES, CATEGORIA_ESTOQUE_LABELS } from "@/lib/categoria-estoque-ui";

type TipoProduto = { id: string; nome: string };
type Unidade     = { id: string; sigla: string; nome: string };

type FormData = {
  descricao: string;
  tipo: "PRODUTO" | "MATERIA_PRIMA" | "SERVICO";
  tipoProdutoId: string;
  categoriaEstoque: string;
  unidadeId: string;
  ncm: string;
  precoVenda: string;
  estoqueMin: string;
  estoqueMax: string;
  vendavel: boolean;
  comodato: boolean;
};

const INITIAL: FormData = {
  descricao: "",
  tipo: "PRODUTO",
  tipoProdutoId: "",
  categoriaEstoque: "",
  unidadeId: "",
  ncm: "",
  precoVenda: "",
  estoqueMin: "",
  estoqueMax: "",
  vendavel: false,
  comodato: false,
};

export default function NovoProdutoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormData>({
    ...INITIAL,
    descricao: searchParams.get("descricao") ?? searchParams.get("nome") ?? "",
    vendavel:  searchParams.get("vendavel") === "1" ? true : false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "produto",
    onNew: () => { setForm(INITIAL); setErrors({}); setServerError(""); },
    viewHref: (id) => `/suprimentos/produtos/${id}`,
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
        vendavel: form.vendavel,
        comodato: form.comodato,
      };
      if (form.tipoProdutoId) payload.tipoProdutoId = form.tipoProdutoId;
      if (form.categoriaEstoque) payload.categoriaEstoque = form.categoriaEstoque;
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
        title="Novo Produto"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Produtos", href: "/suprimentos/produtos" },
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
              <Label>Categoria de estoque</Label>
              <Select value={form.categoriaEstoque || "__none"} onValueChange={(v) => set("categoriaEstoque", v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Não classificado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Não classificado</SelectItem>
                  {CATEGORIA_ESTOQUE_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORIA_ESTOQUE_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400">Define em quais locais de estoque o produto pode entrar.</p>
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

            {/* Vendável */}
            <div className="md:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={form.vendavel}
                    onChange={(e) => setForm((prev) => ({ ...prev, vendavel: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-gray-300 bg-white peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors group-hover:border-blue-400 flex items-center justify-center">
                    {form.vendavel && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Este produto é vendável</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Marque se este produto pode ser comercializado e incluído em Pedidos de Venda.
                  </p>
                </div>
              </label>
            </div>

            {/* Comodato */}
            <div className="md:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={form.comodato}
                    onChange={(e) => setForm((prev) => ({ ...prev, comodato: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-gray-300 bg-white peer-checked:bg-orange-500 peer-checked:border-orange-500 transition-colors group-hover:border-orange-400 flex items-center justify-center">
                    {form.comodato && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Item de comodato (vasilhame retornável)</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pallets, engradados e outros itens emprestados ao cliente que devem retornar. Aparece na tela de Comodato.
                  </p>
                </div>
              </label>
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
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>

      {dialog}
    </div>
  );
}
