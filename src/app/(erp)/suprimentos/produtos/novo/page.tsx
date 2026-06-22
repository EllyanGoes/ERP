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
import { UnidadeQuickCreate } from "@/components/shared/QuickCreateDialogs";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import CategoriaEstoqueSelect from "@/components/shared/CategoriaEstoqueSelect";
import EstadosWipMultiSelect from "@/components/shared/EstadosWipMultiSelect";

type Unidade     = { id: string; sigla: string; nome: string };

type FormData = {
  descricao: string;
  tipo: "PRODUTO" | "SERVICO";
  categoriaEstoque: string;
  estadosWip: string[];
  unidadeId: string;
  ncm: string;
  precoVenda: string;
  estoqueMin: string;
  estoqueMax: string;
  vendavel: boolean;
  comodato: boolean;
  consumivel: boolean;
};

const INITIAL: FormData = {
  descricao: "",
  tipo: "PRODUTO",
  categoriaEstoque: "",
  estadosWip: [],
  unidadeId: "",
  ncm: "",
  precoVenda: "",
  estoqueMin: "",
  estoqueMax: "",
  vendavel: false,
  comodato: false,
  consumivel: true,
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

  const [unidades, setUnidades] = useState<Unidade[]>([]);

  useEffect(() => {
    fetch("/api/suprimentos/unidades").then((r) => r.json()).then((un) => {
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
        consumivel: form.consumivel,
      };
      if (form.categoriaEstoque) payload.categoriaEstoque = form.categoriaEstoque;
      payload.estadosWip = form.estadosWip;
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
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
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
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted">
                <span className="text-sm text-muted-foreground italic">Gerado automaticamente</span>
                <span className="ml-auto text-[10px] font-semibold text-blue-500 bg-info/10 px-1.5 py-0.5 rounded">auto</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Ex: PROD-0001, PROD-0002 …</p>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as FormData["tipo"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUTO">Produto</SelectItem>
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
              <Label>Categoria</Label>
              <CategoriaEstoqueSelect value={form.categoriaEstoque} onChange={(v) => set("categoriaEstoque", v)} allowNone />
              <p className="text-[10px] text-muted-foreground">Natureza do produto — define em quais locais de estoque ele pode entrar.</p>
            </div>

            {(form.categoriaEstoque === "PRODUTO_ACABADO" || form.categoriaEstoque === "WIP") && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Estados de WIP atendidos</Label>
                <EstadosWipMultiSelect value={form.estadosWip} onChange={(v) => setForm((p) => ({ ...p, estadosWip: v }))} />
                <p className="text-[10px] text-muted-foreground">Fases que este produto atende (ex.: úmido, seco, queimado). Usado para filtrar os produtos nos blocos de WIP do fluxo.</p>
              </div>
            )}

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
                  <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors group-hover:border-blue-400 flex items-center justify-center">
                    {form.vendavel && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Este produto é vendável</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
                  <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-orange-500 peer-checked:border-orange-500 transition-colors group-hover:border-orange-400 flex items-center justify-center">
                    {form.comodato && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Item de comodato (vasilhame retornável)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pallets, engradados e outros itens emprestados ao cliente que devem retornar. Aparece na tela de Comodato.
                  </p>
                </div>
              </label>
            </div>

            {/* Consumível */}
            <div className="md:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={form.consumivel}
                    onChange={(e) => setForm((prev) => ({ ...prev, consumivel: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded border-2 border-border bg-card peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-colors group-hover:border-cyan-400 flex items-center justify-center">
                    {form.consumivel && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Item consumível</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Marcado: dá baixa no estoque ao ser consumido. Desmarcado: item permanente (ex.: ferramentas), requisitado e devolvido ao almoxarifado.
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
            <div className="flex items-start gap-2 md:col-span-2 bg-info/10 border border-info/20 rounded-lg px-4 py-3 text-sm text-info">
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
              <p className="col-span-2 text-xs text-muted-foreground">
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
