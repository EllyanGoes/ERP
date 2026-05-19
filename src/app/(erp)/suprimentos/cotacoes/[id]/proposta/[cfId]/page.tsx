"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2, ChevronDown, Save, X, Plus } from "lucide-react";
import AnexosSection from "@/components/shared/AnexosSection";

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemForm = {
  id: string;
  itemId: string;
  quantidade: number;
  precoUnitario: string;
  situacao: string;
  item: {
    id: string;
    codigo: string;
    descricao: string;
    unidadeMedida: string;
  };
};

type PropostaData = {
  id: string;
  status: "AGUARDANDO" | "RESPONDIDA" | "RECUSADA";
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
  observacao: string | null;
  totalCalculado: unknown;
  frete: unknown;
  tipoFrete: string | null;
  desconto: unknown;
  vrDesconto: unknown;
  despesas: unknown;
  seguro: unknown;
  fornecedor: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cpfCnpj: string | null;
    email: string | null;
    contato: string | null;
  };
  itens: Array<{
    id: string;
    itemId: string;
    quantidade: unknown;
    precoUnitario: unknown;
    subtotal: unknown;
    disponivel: boolean;
    situacao: string | null;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
  cotacao: {
    id: string;
    numero: string;
    nome: string | null;
  };
  propostaNumero: number; // sequential index among all fornecedores
};

const TIPO_FRETE_OPTIONS = [
  { value: "C", label: "C-CIF" },
  { value: "F", label: "F-FOB" },
  { value: "T", label: "T-CIF/FOB" },
  { value: "O", label: "Outro" },
];

// ── Component ──────────────────────────────────────────────────────────────────
type FormSnapshot = {
  contato: string; email: string; condicoesPagamento: string;
  frete: string; tipoFrete: string; desconto: string; vrDescontoInput: string;
  despesas: string; seguro: string;
  itens: ItemForm[];
};

export default function EditPropostaPage() {
  const { id: cotacaoId, cfId } = useParams<{ id: string; cfId: string }>();
  const router = useRouter();

  const [data, setData] = useState<PropostaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

  // ── Form state ────────────────────────────────────────────────────────────
  const [contato, setContato] = useState("");
  const [email, setEmail] = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);
  const [frete, setFrete] = useState("");
  const [tipoFrete, setTipoFrete] = useState("");
  const [desconto, setDesconto] = useState("");
  const [vrDescontoInput, setVrDescontoInput] = useState("");
  const [despesas, setDespesas] = useState("");
  const [seguro, setSeguro] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);

  // ── Dirty tracking ────────────────────────────────────────────────────────
  const [isDirty, setIsDirty] = useState(false);
  const baselineRef = useRef<string | null>(null);

  // ── Persistência entre abas ───────────────────────────────────────────────
  const { save: saveForm, load: loadForm, clear: clearForm } =
    useFormPersist<FormSnapshot>(`proposta:${cfId}`);
  const dataLoadedRef = useRef(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch the cotacao + specific fornecedor
      const res = await fetch(`/api/suprimentos/cotacoes/${cotacaoId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro"); return; }

      const cotacao = json.data;
      const cfIndex = cotacao.fornecedores.findIndex((f: { id: string }) => f.id === cfId);
      const cf = cotacao.fornecedores[cfIndex];
      if (!cf) { setError("Proposta não encontrada"); return; }

      const combined: PropostaData = {
        ...cf,
        cotacao: { id: cotacao.id, numero: cotacao.numero, nome: cotacao.nome },
        propostaNumero: cfIndex + 1,
      };
      setData(combined);

      // Build API-derived item list first
      const apiItens: ItemForm[] = cf.itens.map((i: PropostaData["itens"][0]) => ({
        id: i.id, itemId: i.itemId,
        quantidade: decimalToNumber(i.quantidade),
        precoUnitario: i.precoUnitario != null ? decimalToNumber(i.precoUnitario).toString() : "",
        situacao: i.situacao ?? "CONSIDERA",
        item: i.item,
      }));

      // Prefer cached values (user may have typed unsaved data)
      const cached = loadForm();
      let resolvedContato: string;
      let resolvedEmail: string;
      let resolvedCondicoes: string;
      let resolvedFrete: string;
      let resolvedTipoFrete: string;
      let resolvedDesconto: string;
      let resolvedVrDesconto: string;
      let resolvedDespesas: string;
      let resolvedSeguro: string;
      let resolvedItens: ItemForm[];

      if (cached && !dataLoadedRef.current) {
        resolvedContato = cached.contato ?? cf.fornecedor.contato ?? "";
        resolvedEmail = cached.email ?? cf.fornecedor.email ?? "";
        resolvedCondicoes = cached.condicoesPagamento ?? cf.condicoesPagamento ?? "";
        resolvedFrete = cached.frete ?? (cf.frete != null ? decimalToNumber(cf.frete).toString() : "");
        resolvedTipoFrete = cached.tipoFrete ?? cf.tipoFrete ?? "";
        resolvedDesconto = cached.desconto ?? (cf.desconto != null ? decimalToNumber(cf.desconto).toString() : "");
        resolvedVrDesconto = cached.vrDescontoInput ?? (cf.vrDesconto != null ? decimalToNumber(cf.vrDesconto).toString() : "");
        resolvedDespesas = cached.despesas ?? (cf.despesas != null ? decimalToNumber(cf.despesas).toString() : "");
        resolvedSeguro = cached.seguro ?? (cf.seguro != null ? decimalToNumber(cf.seguro).toString() : "");
        const sameItems = cached.itens?.length === apiItens.length &&
          cached.itens.every((ci, idx) => ci.id === apiItens[idx]?.id);
        resolvedItens = sameItems ? cached.itens : apiItens;
      } else {
        resolvedContato = cf.fornecedor.contato ?? "";
        resolvedEmail = cf.fornecedor.email ?? "";
        resolvedCondicoes = cf.condicoesPagamento ?? "";
        resolvedFrete = cf.frete != null ? decimalToNumber(cf.frete).toString() : "";
        resolvedTipoFrete = cf.tipoFrete ?? "";
        resolvedDesconto = cf.desconto != null ? decimalToNumber(cf.desconto).toString() : "";
        resolvedVrDesconto = cf.vrDesconto != null ? decimalToNumber(cf.vrDesconto).toString() : "";
        resolvedDespesas = cf.despesas != null ? decimalToNumber(cf.despesas).toString() : "";
        resolvedSeguro = cf.seguro != null ? decimalToNumber(cf.seguro).toString() : "";
        resolvedItens = apiItens;
      }

      setContato(resolvedContato);
      setEmail(resolvedEmail);
      setCondicoesPagamento(resolvedCondicoes);
      setFrete(resolvedFrete);
      setTipoFrete(resolvedTipoFrete);
      setDesconto(resolvedDesconto);
      setVrDescontoInput(resolvedVrDesconto);
      setDespesas(resolvedDespesas);
      setSeguro(resolvedSeguro);
      setItens(resolvedItens);

      // Capture baseline for dirty tracking
      baselineRef.current = JSON.stringify({
        contato: resolvedContato,
        email: resolvedEmail,
        condicoesPagamento: resolvedCondicoes,
        frete: resolvedFrete,
        tipoFrete: resolvedTipoFrete,
        desconto: resolvedDesconto,
        vrDescontoInput: resolvedVrDesconto,
        despesas: resolvedDespesas,
        seguro: resolvedSeguro,
        itens: resolvedItens,
      });
      setIsDirty(false);

      dataLoadedRef.current = true;
    } catch {
      setError("Erro ao carregar proposta");
    } finally {
      setLoading(false);
    }
  }, [cotacaoId, cfId, loadForm]);

  // ── Auto-save ao mudar qualquer campo do formulário ───────────────────────
  useEffect(() => {
    if (loading) return;
    saveForm({ contato, email, condicoesPagamento, frete, tipoFrete, desconto, vrDescontoInput, despesas, seguro, itens });
  }, [contato, email, condicoesPagamento, frete, tipoFrete, desconto, vrDescontoInput, despesas, seguro, itens, loading, saveForm]);

  // ── Dirty state tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (baselineRef.current === null || loading) return;
    const current = JSON.stringify({ contato, email, condicoesPagamento, frete, tipoFrete, desconto, vrDescontoInput, despesas, seguro, itens });
    setIsDirty(current !== baselineRef.current);
  }, [contato, email, condicoesPagamento, frete, tipoFrete, desconto, vrDescontoInput, despesas, seguro, itens, loading]);

  useDirtyForm(isDirty, async () => { await handleSave(); });

  useEffect(() => { load(); }, [load]);

  // ── Load condições de pagamento ───────────────────────────────────────────
  const loadCondicoes = useCallback(async () => {
    try {
      const r = await fetch("/api/suprimentos/condicoes-pagamento");
      const list = await r.json();
      if (Array.isArray(list)) setCondicoesList(list);
    } catch {}
  }, []);
  useEffect(() => { loadCondicoes(); }, [loadCondicoes]);

  // ── Modal nova condição de pagamento ──────────────────────────────────────
  const [showNovaCondicao, setShowNovaCondicao] = useState(false);
  const [novaCondicaoNome, setNovaCondicaoNome] = useState("");
  const [novaCondicaoDesc, setNovaCondicaoDesc] = useState("");
  const [savingCondicao, setSavingCondicao] = useState(false);
  const [erroCondicao, setErroCondicao] = useState("");

  async function handleCriarCondicao() {
    if (!novaCondicaoNome.trim()) { setErroCondicao("Nome é obrigatório"); return; }
    setSavingCondicao(true); setErroCondicao("");
    try {
      const res = await fetch("/api/suprimentos/condicoes-pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaCondicaoNome.trim(), descricao: novaCondicaoDesc.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setErroCondicao(json.error || "Erro ao criar"); return; }
      await loadCondicoes();
      setCondicoesPagamento(json.nome);
      setShowNovaCondicao(false);
      setNovaCondicaoNome("");
      setNovaCondicaoDesc("");
    } catch { setErroCondicao("Erro de conexão"); }
    finally { setSavingCondicao(false); }
  }

  useTabTitle(data ? `Proposta ${data.fornecedor.nomeFantasia || data.fornecedor.razaoSocial}` : null);

  // ── Computed values ───────────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.quantidade, 0);

  const subtotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => {
      const p = parseFloat(i.precoUnitario) || 0;
      return s + p * i.quantidade;
    }, 0);

  const freteVal = parseFloat(frete) || 0;
  const despesasVal = parseFloat(despesas) || 0;
  const seguroVal = parseFloat(seguro) || 0;
  // vrDesconto is the source of truth; % is kept in sync
  const vrDescontoCalc = parseFloat(vrDescontoInput) || 0;
  const totalCotacao = subtotalItens - vrDescontoCalc + freteVal + despesasVal + seguroVal;

  // ── Discount two-way sync handlers ────────────────────────────────────────
  function handleDescontoPctChange(val: string) {
    setDesconto(val);
    const pct = parseFloat(val) || 0;
    const nominal = (pct * subtotalItens) / 100;
    setVrDescontoInput(nominal > 0 || val !== "" ? nominal.toFixed(2) : "");
  }

  function handleVrDescontoChange(val: string) {
    setVrDescontoInput(val);
    const nominal = parseFloat(val) || 0;
    const pct = subtotalItens > 0 ? (nominal / subtotalItens) * 100 : 0;
    setDesconto(pct > 0 || val !== "" ? pct.toFixed(4).replace(/\.?0+$/, "") : "");
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const body = {
        status: "RESPONDIDA",
        condicoesPagamento: condicoesPagamento || null,
        frete: freteVal || null,
        tipoFrete: tipoFrete || null,
        desconto: parseFloat(desconto) || null,
        vrDesconto: vrDescontoCalc || null,
        despesas: despesasVal || null,
        seguro: seguroVal || null,
        itens: itens.map((i) => ({
          id: i.id,
          quantidade: i.quantidade,
          precoUnitario: parseFloat(i.precoUnitario) || 0,
          disponivel: i.situacao === "CONSIDERA",
          situacao: i.situacao,
        })),
      };

      const res = await fetch(`/api/suprimentos/cotacoes/${cotacaoId}/fornecedores/${cfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error || "Erro ao salvar"); return; }

      clearForm();
      setIsDirty(false);
      baselineRef.current = null;
      router.push(`/suprimentos/cotacoes/${cotacaoId}`);
    } catch {
      setSaveError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  if (!data) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const fornNome = data.fornecedor.nomeFantasia || data.fornecedor.razaoSocial;
  const codigoForn = data.fornecedor.id.slice(-8).toUpperCase();
  const propostaLabel = `PROPOSTA ${String(data.propostaNumero).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title={`Editar Cotação - ${data.cotacao.numero} - ${fornNome}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Cotações", href: "/suprimentos/cotacoes" },
          { label: `Editar cotação`, href: `/suprimentos/cotacoes/${cotacaoId}` },
          { label: "Proposta" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" className="gap-1">
                  Outras Ações <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/suprimentos/cotacoes/${cotacaoId}`)}>
                  Visualizar cotação
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => router.push(`/suprimentos/cotacoes/${cotacaoId}`)}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{saveError}</div>
        )}

        {/* ── Seção Fornecedor ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Código fornecedor</Label>
              <Input value={codigoForn} readOnly className="font-mono bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Nome Fornecedor</Label>
              <Input value={fornNome} readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="Nome do contato"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@fornecedor.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Proposta</Label>
              <Input value={propostaLabel} readOnly className="bg-gray-50 font-mono" />
            </div>
          </div>
        </div>

        {/* ── Seção Cotação ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total itens</Label>
              <Input
                value={totalItens.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly
                className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total Cotação</Label>
              <Input
                value={formatBRL(totalCotacao)}
                readOnly
                className="bg-gray-50 text-right font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">% Desconto</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={desconto}
                  onChange={(e) => handleDescontoPctChange(e.target.value)}
                  placeholder="0,00"
                  className="text-right pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vr Desconto</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={vrDescontoInput}
                onChange={(e) => handleVrDescontoChange(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={frete}
                onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo Frete</Label>
              <Select value={tipoFrete} onValueChange={setTipoFrete}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_FRETE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-500">Condição pagamento</Label>
                <button
                  type="button"
                  onClick={() => { setShowNovaCondicao(true); setNovaCondicaoNome(""); setNovaCondicaoDesc(""); setErroCondicao(""); }}
                  className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  title="Nova condição de pagamento"
                >
                  <Plus className="w-3 h-3" /> Nova
                </button>
              </div>
              <Select
                value={condicoesPagamento || "__none__"}
                onValueChange={(v) => setCondicoesPagamento(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar condição..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {condicoesList.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Despesas</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={despesas}
                onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={seguro}
                onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00"
                className="text-right"
              />
            </div>
          </div>
        </div>

        {/* ── Itens da cotação ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Itens da cotação</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Total Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((item, idx) => {
                  const preco = parseFloat(item.precoUnitario) || 0;
                  const totalItem = item.situacao === "CONSIDERA" ? preco * item.quantidade : 0;
                  const isNaoConsidera = item.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={item.id} className={cn("hover:bg-gray-50", isNaoConsidera && "opacity-50")}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.item.codigo}</td>
                      <td className="px-4 py-2 text-gray-800">{item.item.descricao}</td>
                      <td className="px-4 py-2 text-gray-600">{item.item.unidadeMedida}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={item.situacao}
                          onValueChange={(v) =>
                            setItens((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, situacao: v } : it))
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CONSIDERA">Considera</SelectItem>
                            <SelectItem value="NAO_CONSIDERA">Não Considera</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={isNaoConsidera}
                          value={item.precoUnitario}
                          onChange={(e) =>
                            setItens((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, precoUnitario: e.target.value } : it
                              )
                            )
                          }
                          className="text-right h-8"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {isNaoConsidera ? "—" : formatBRL(totalItem)}
                      </td>
                    </tr>
                  );
                })}
                {itens.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">
                      Nenhum item na proposta
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-gray-900">
                    {formatBRL(totalCotacao)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Anexos ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Documentos da Proposta</h2>
          </div>
          <div className="p-4">
            <AnexosSection
              apiBase={`/api/suprimentos/cotacoes/${cotacaoId}/fornecedores/${cfId}/anexos`}
            />
          </div>
        </div>
      </div>

      {/* ── Modal Nova Condição de Pagamento ─────────────────────────────────── */}
      {showNovaCondicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Nova Condição de Pagamento</h2>
              <button onClick={() => setShowNovaCondicao(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {erroCondicao && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroCondicao}</p>
              )}
              <div className="space-y-1.5">
                <Label>Nome <span className="text-red-500">*</span></Label>
                <Input
                  autoFocus
                  value={novaCondicaoNome}
                  onChange={(e) => setNovaCondicaoNome(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCriarCondicao()}
                  placeholder="Ex: 30/60/90 dias"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-600">Descrição <span className="text-gray-400 text-xs font-normal">(opcional)</span></Label>
                <Input
                  value={novaCondicaoDesc}
                  onChange={(e) => setNovaCondicaoDesc(e.target.value)}
                  placeholder="Detalhes da condição..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNovaCondicao(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCriarCondicao} disabled={savingCondicao}>
                {savingCondicao ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Criar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
