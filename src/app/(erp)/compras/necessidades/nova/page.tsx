"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, ChevronDown, Loader2, Save } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Filial       = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque = { id: string; nome: string };
type CentroCusto  = { id: string; codigo: string; nome: string };
type ItemOption   = { id: string; codigo: string; descricao: string };

type ItemRow = { itemId: string; quantidade: string; observacao: string };

const PRIORIDADES = [
  { value: 1, label: "1 - Muito Baixa" },
  { value: 2, label: "2 - Baixa" },
  { value: 3, label: "3 - Média" },
  { value: 4, label: "4 - Alta" },
  { value: 5, label: "5 - Crítica" },
];

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled,
}: {
  options: T[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  getLabel: (item: T) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-left transition-colors",
          disabled ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-gray-300",
          open && "border-blue-400 ring-1 ring-blue-200"
        )}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-auto max-h-52">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 text-left"
            >
              (Nenhum)
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left hover:bg-blue-50 hover:text-blue-700 transition-colors",
                  o.id === value && "bg-blue-50 text-blue-700 font-medium"
                )}
              >
                {getLabel(o)}
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400 italic">Nenhuma opção disponível</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NovasolicitacaoPage() {
  const router     = useRouter();
  const { user }   = useSession();

  // Header fields
  const [filialId,             setFilialId]             = useState("");
  const [descricao,            setDescricao]            = useState("");
  const [prioridade,           setPrioridade]           = useState(3);
  const [entregaDesejada,      setEntregaDesejada]      = useState("");
  const [solicitante,          setSolicitante]          = useState("");
  const [tipoCompra,           setTipoCompra]           = useState("");
  const [motivo,               setMotivo]               = useState("");
  const [localEstoqueId,       setLocalEstoqueId]       = useState("");
  const [centroCustoId,        setCentroCustoId]        = useState("");
  const [categoria,            setCategoria]            = useState("");
  const [projeto,              setProjeto]              = useState("");
  const [classificacaoAuxiliar, setClassificacaoAuxiliar] = useState("");
  const [observacoes,          setObservacoes]          = useState("");

  // Items
  const [itens,       setItens]       = useState<ItemRow[]>([{ itemId: "", quantidade: "1", observacao: "" }]);
  const [saving,      setSaving]      = useState(false);
  const [serverError, setServerError] = useState("");

  // Options
  const [filiais,       setFiliais]       = useState<Filial[]>([]);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoque[]>([]);
  const [centrosCusto,  setCentrosCusto]  = useState<CentroCusto[]>([]);
  const [itemOptions,   setItemOptions]   = useState<ItemOption[]>([]);

  // Pre-fill solicitante with logged user name
  useEffect(() => {
    if (user?.nome) setSolicitante(user.nome);
  }, [user]);

  // Load static data
  useEffect(() => {
    fetch("/api/empresa/filiais?ativo=true")
      .then((r) => r.json())
      .then((j) => setFiliais(Array.isArray(j) ? j : []));

    fetch("/api/empresa/centros-custo?ativo=true")
      .then((r) => r.json())
      .then((j) => setCentrosCusto(Array.isArray(j) ? j : []));

    fetch("/api/suprimentos/produtos")
      .then((r) => r.json())
      .then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, []);

  // Load locais de estoque filtered by filial
  const loadLocais = useCallback(async (fId: string) => {
    const url = fId
      ? `/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`
      : "/api/suprimentos/locais-estoque?ativo=true";
    const res  = await fetch(url);
    const json = await res.json();
    setLocaisEstoque(Array.isArray(json) ? json : []);
    // Reset almoxarifado if not in the new list
    if (localEstoqueId && !json.find((l: LocalEstoque) => l.id === localEstoqueId)) {
      setLocalEstoqueId("");
    }
  }, [localEstoqueId]);

  useEffect(() => { loadLocais(filialId); }, [filialId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items management
  function addRow() { setItens((p) => [...p, { itemId: "", quantidade: "1", observacao: "" }]); }
  function removeRow(i: number) { setItens((p) => p.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, key: keyof ItemRow, value: string) {
    setItens((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) {
      setServerError("Adicione pelo menos um item com quantidade válida");
      return;
    }
    if (!descricao.trim()) {
      setServerError("Descrição é obrigatória");
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      const res = await fetch("/api/suprimentos/necessidades", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId:             filialId             || null,
          justificativa:        descricao.trim(),
          prioridade,
          dataNecessidade:      entregaDesejada      || null,
          solicitante:          solicitante.trim()   || null,
          tipoCompra:           tipoCompra.trim()    || null,
          motivo:               motivo.trim()        || null,
          localEstoqueId:       localEstoqueId       || null,
          centroCustoId:        centroCustoId        || null,
          categoria:            categoria.trim()     || null,
          projeto:              projeto.trim()       || null,
          classificacaoAuxiliar: classificacaoAuxiliar.trim() || null,
          observacoes:          observacoes.trim()   || null,
          itens: validItens.map((r) => ({
            itemId:     r.itemId,
            quantidade: parseFloat(r.quantidade),
            observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error || "Erro ao criar solicitação"); return; }
      router.push(`/compras/necessidades/${json.data.id}`);
    } catch {
      setServerError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Nova Solicitação de Compras"
        breadcrumbs={[
          { label: "Compras" },
          { label: "Solicitações de Compras", href: "/compras/necessidades" },
          { label: "Nova" },
        ]}
      />

      <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5 max-w-5xl">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {serverError}
          </div>
        )}

        {/* ── Informações ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Filial */}
            <div className="space-y-1.5">
              <Label>Filial <span className="text-red-500">*</span></Label>
              <SelectField
                options={filiais}
                value={filialId}
                onChange={setFilialId}
                placeholder="Selecionar filial..."
                getLabel={(f) => f.nomeFantasia ?? f.razaoSocial}
              />
            </div>

            {/* Descrição + Prioridade + Entrega */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 space-y-1.5">
                <Label>Descrição <span className="text-red-500">*</span></Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva o que está sendo solicitado..."
                />
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Prioridade <span className="text-red-500">*</span></Label>
                <select
                  value={prioridade}
                  onChange={(e) => setPrioridade(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label>Entrega desejada</Label>
                <Input
                  type="date"
                  value={entregaDesejada}
                  onChange={(e) => setEntregaDesejada(e.target.value)}
                />
              </div>
            </div>

            {/* Solicitante + Tipo de compra + Motivo */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Solicitação para (Destino) <span className="text-red-500">*</span></Label>
                <Input
                  value={solicitante}
                  onChange={(e) => setSolicitante(e.target.value)}
                  placeholder="Nome do solicitante"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de compra <span className="text-red-500">*</span></Label>
                <Input
                  value={tipoCompra}
                  onChange={(e) => setTipoCompra(e.target.value)}
                  placeholder="Ex: Reposição, Novo investimento..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo da solicitação..."
                />
              </div>
            </div>

            {/* Almoxarifado + Centro de Custo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Almoxarifado</Label>
                <SelectField
                  options={locaisEstoque}
                  value={localEstoqueId}
                  onChange={setLocalEstoqueId}
                  placeholder={filialId ? "Selecionar almoxarifado..." : "Selecione a filial primeiro"}
                  getLabel={(l) => l.nome}
                  disabled={!filialId && locaisEstoque.length === 0}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Centro de Custo</Label>
                <SelectField
                  options={centrosCusto}
                  value={centroCustoId}
                  onChange={setCentroCustoId}
                  placeholder="Selecionar centro de custo..."
                  getLabel={(c) => `${c.codigo} - ${c.nome}`}
                />
              </div>
            </div>

            {/* Categoria + Projeto + Classificação auxiliar */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder="Ex: Material de escritório..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Projeto</Label>
                <Input
                  value={projeto}
                  onChange={(e) => setProjeto(e.target.value)}
                  placeholder="Nome do projeto..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Classificação auxiliar</Label>
                <Input
                  value={classificacaoAuxiliar}
                  onChange={(e) => setClassificacaoAuxiliar(e.target.value)}
                  placeholder="Classificação adicional..."
                />
              </div>
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Informações adicionais sobre a solicitação..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Itens ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Itens Solicitados</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Item
            </Button>
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
                    <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeRow(i)}>
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
            {saving
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</>
              : <><Save className="w-4 h-4 mr-1" />Criar Solicitação</>
            }
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
