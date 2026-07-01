"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Plus, Trash2, Loader2, Save, CheckCircle2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";

type Fornecedor = {
  id: string; razaoSocial: string; nomeFantasia: string | null;
  cpfCnpj: string | null; contato: string | null; email: string | null;
};
type ItemUnidadeOpt = { unidadeId: string; fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string } };
type ItemOption = {
  id: string; codigo: string; descricao: string; unidadeMedida: string;
  unidade?: { sigla: string } | null;
  itemUnidades?: ItemUnidadeOpt[];
};

// Opções de unidade (base + alternativas) com o fator de conversão.
function unidadesDoItem(opt: ItemOption | undefined): { unidadeId: string; sigla: string; fator: number; base: boolean }[] {
  const baseSigla = opt?.unidade?.sigla ?? opt?.unidadeMedida ?? "un";
  const alt = (opt?.itemUnidades ?? [])
    .filter((iu) => !iu.isPrincipal && iu.fatorConversao != null)
    .map((iu) => ({ unidadeId: iu.unidadeId, sigla: iu.unidade.sigla, fator: parseFloat(String(iu.fatorConversao)), base: false }))
    .filter((u) => Number.isFinite(u.fator) && u.fator > 0);
  return [{ unidadeId: "", sigla: baseSigla, fator: 1, base: true }, ...alt];
}

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  situacao: "CONSIDERA" | "NAO_CONSIDERA";
  unidadeId?: string;
};

type FormSnapshot = {
  fornecedorId: string;
  contato: string;
  email: string;
  frete: string;
  tipoFrete: string;
  desconto: string;
  despesas: string;
  seguro: string;
  condicoesPagamento: string;
  dataEntregaPrevista: string;
  observacoes: string;
  itens: ItemRow[];
};

const TIPO_FRETE_OPTIONS = [
  { value: "C", label: "C-CIF" },
  { value: "F", label: "F-FOB" },
  { value: "T", label: "T-CIF/FOB" },
  { value: "O", label: "Outro" },
];

export default function EditarPedidoCompraPage() {
  const { id } = useParams<{ id: string }>();
  const { replaceCurrentTab } = useTabsContext();
  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>(`pc:edit:${id}`);

  // Data
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions]     = useState<ItemOption[]>([]);
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);

  // Loading state
  const [loadingPedido, setLoadingPedido] = useState(true);
  const [pedidoNumero, setPedidoNumero]   = useState("");
  useTabTitle(pedidoNumero || null);
  const baselineRef = useRef<string | null>(null);

  // Fornecedor section
  const [fornecedorId, setFornecedorIdState] = useState("");
  const [contato, setContato]                = useState("");
  const [email, setEmail]                    = useState("");

  // Financeiro section
  const [frete, setFrete]                           = useState("");
  const [tipoFrete, setTipoFrete]                   = useState("");
  const [desconto, setDesconto]                     = useState("");
  const [despesas, setDespesas]                     = useState("");
  const [seguro, setSeguro]                         = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("");
  const [dataEntregaPrevista, setDataEntregaPrevista] = useState("");
  const [observacoes, setObservacoes]               = useState("");

  // Items
  const [itens, setItens] = useState<ItemRow[]>([
    { itemId: "", quantidade: "1", precoUnitario: "", desconto: "", situacao: "CONSIDERA" },
  ]);

  // Form state
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // Auto-save effect
  useEffect(() => {
    saveForm({ fornecedorId, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, observacoes, itens });
  }, [fornecedorId, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, observacoes, itens, saveForm]);

  // Load reference data + pedido in parallel
  const formRestoredRef = useRef(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/suprimentos/fornecedores").then((r) => r.json()),
      fetch("/api/itens?tipo=PRODUTO&limit=200").then((r) => r.json()),
      fetch("/api/suprimentos/condicoes-pagamento").then((r) => r.json()).catch(() => []),
      fetch(`/api/suprimentos/pedidos-compra/${id}`).then((r) => r.json()),
    ]).then(([fornJson, itemJson, condicoesJson, pedidoJson]) => {
      setFornecedores(Array.isArray(fornJson) ? fornJson : fornJson.data ?? []);
      setItemOptions(Array.isArray(itemJson) ? itemJson : itemJson.data ?? []);
      if (Array.isArray(condicoesJson)) setCondicoesList(condicoesJson);

      const pedido = pedidoJson?.data;
      if (!pedido) { setError("Pedido não encontrado"); setLoadingPedido(false); return; }

      setPedidoNumero(pedido.numero ?? "");

      // Check cache first — restore unsaved user changes; fall back to API data
      const saved = formRestoredRef.current ? null : loadForm();
      formRestoredRef.current = true;

      if (saved && saved.fornecedorId) {
        setFornecedorIdState(saved.fornecedorId);
        setContato(saved.contato ?? "");
        setEmail(saved.email ?? "");
        setFrete(saved.frete ?? "");
        setTipoFrete(saved.tipoFrete ?? "");
        setDesconto(saved.desconto ?? "");
        setDespesas(saved.despesas ?? "");
        setSeguro(saved.seguro ?? "");
        setCondicoesPagamento(saved.condicoesPagamento ?? "");
        setDataEntregaPrevista(saved.dataEntregaPrevista ?? "");
        setObservacoes(saved.observacoes ?? "");
        if (saved.itens && saved.itens.length > 0) setItens(saved.itens);
      } else {
        setFornecedorIdState(pedido.fornecedor?.id ?? "");

        // Use PC-level contato/email if available, fall back to fornecedor's
        setContato(pedido.contato ?? pedido.fornecedor?.contato ?? "");
        setEmail(pedido.email ?? pedido.fornecedor?.email ?? "");

        // Financial fields from cotacaoFornecedor (which for manual PCs mirrors PC own fields)
        const cf = pedido.cotacaoFornecedor;
        if (cf) {
          const freteNum    = decimalToNumber(cf.frete);
          const descontoNum = decimalToNumber(cf.desconto);
          const despesasNum = decimalToNumber(cf.despesas);
          const seguroNum   = decimalToNumber(cf.seguro);
          if (freteNum)    setFrete(String(freteNum));
          if (cf.tipoFrete) setTipoFrete(cf.tipoFrete);
          if (descontoNum) setDesconto(String(descontoNum));
          if (despesasNum) setDespesas(String(despesasNum));
          if (seguroNum)   setSeguro(String(seguroNum));
          if (cf.condicoesPagamento) setCondicoesPagamento(cf.condicoesPagamento);
        }

        if (pedido.dataEntregaPrevista) {
          // Format ISO date to YYYY-MM-DD for date input
          setDataEntregaPrevista(pedido.dataEntregaPrevista.slice(0, 10));
        }

        if (pedido.observacoes) setObservacoes(pedido.observacoes);

        // Map existing items
        if (Array.isArray(pedido.itens) && pedido.itens.length > 0) {
          setItens(pedido.itens.map((it: {
            item: { id: string };
            quantidade: unknown;
            precoUnitario: unknown;
            desconto?: unknown;
            situacao?: string;
            unidadeId?: string | null;
          }) => ({
            itemId:        it.item.id,
            quantidade:    String(decimalToNumber(it.quantidade)),
            precoUnitario: String(decimalToNumber(it.precoUnitario)),
            desconto:      it.desconto != null ? String(decimalToNumber(it.desconto)) : "",
            situacao:      (it.situacao === "NAO_CONSIDERA" ? "NAO_CONSIDERA" : "CONSIDERA") as ItemRow["situacao"],
            unidadeId:     it.unidadeId ?? "",
          })));
        }
      }

      // Capture baseline from fresh API data
      const cf = pedido.cotacaoFornecedor;
      const baselineFreteNum    = cf ? decimalToNumber(cf.frete)    : 0;
      const baselineDescontoNum = cf ? decimalToNumber(cf.desconto) : 0;
      const baseDespesasNum     = cf ? decimalToNumber(cf.despesas) : 0;
      const baseSeguroNum       = cf ? decimalToNumber(cf.seguro)   : 0;
      const baselineItens = Array.isArray(pedido.itens) && pedido.itens.length > 0
        ? pedido.itens.map((it: { item: { id: string }; quantidade: unknown; precoUnitario: unknown; desconto?: unknown; situacao?: string; unidadeId?: string | null }) => ({
            itemId:        it.item.id,
            quantidade:    String(decimalToNumber(it.quantidade)),
            precoUnitario: String(decimalToNumber(it.precoUnitario)),
            desconto:      it.desconto != null ? String(decimalToNumber(it.desconto)) : "",
            situacao:      (it.situacao === "NAO_CONSIDERA" ? "NAO_CONSIDERA" : "CONSIDERA") as ItemRow["situacao"],
            unidadeId:     it.unidadeId ?? "",
          }))
        : [{ itemId: "", quantidade: "1", precoUnitario: "", desconto: "", situacao: "CONSIDERA" as ItemRow["situacao"] }];
      baselineRef.current = JSON.stringify({
        fornecedorId:        pedido.fornecedor?.id ?? "",
        contato:             pedido.contato ?? pedido.fornecedor?.contato ?? "",
        email:               pedido.email   ?? pedido.fornecedor?.email   ?? "",
        frete:               baselineFreteNum    ? String(baselineFreteNum)    : "",
        tipoFrete:           cf?.tipoFrete ?? "",
        desconto:            baselineDescontoNum ? String(baselineDescontoNum) : "",
        despesas:            baseDespesasNum     ? String(baseDespesasNum)     : "",
        seguro:              baseSeguroNum       ? String(baseSeguroNum)       : "",
        condicoesPagamento:  cf?.condicoesPagamento ?? "",
        dataEntregaPrevista: pedido.dataEntregaPrevista ? pedido.dataEntregaPrevista.slice(0, 10) : "",
        observacoes:         pedido.observacoes ?? "",
        itens:               baselineItens,
      });

      setLoadingPedido(false);
    }).catch(() => {
      setError("Erro ao carregar pedido");
      setLoadingPedido(false);
    });
  }, [id]);

  function setFornecedorId(newId: string) {
    setFornecedorIdState(newId);
    const f = fornecedores.find((f) => f.id === newId);
    if (f) {
      setContato(f.contato ?? "");
      setEmail(f.email ?? "");
    }
  }

  function addRow() {
    setItens((p) => [...p, { itemId: "", quantidade: "1", precoUnitario: "", desconto: "", situacao: "CONSIDERA" }]);
  }
  function removeRow(i: number) {
    setItens((p) => p.filter((_, idx) => idx !== i));
  }
  function updateRow<K extends keyof ItemRow>(i: number, key: K, value: ItemRow[K]) {
    setItens((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  // Computed values
  const totalItensQtd = itens.reduce((s, i) => s + (parseFloat(i.quantidade) || 0), 0);

  const subtotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => s + (parseFloat(i.quantidade) || 0) * (parseFloat(i.precoUnitario) || 0), 0);

  const descontoTotalItens = itens
    .filter((i) => i.situacao === "CONSIDERA")
    .reduce((s, i) => {
      const bruto = (parseFloat(i.quantidade) || 0) * (parseFloat(i.precoUnitario) || 0);
      return s + (bruto * (parseFloat(i.desconto) || 0)) / 100;
    }, 0);

  const subtotalAposDescontoItens = subtotalItens - descontoTotalItens;

  const descontoVal    = parseFloat(desconto)  || 0;
  const freteVal       = parseFloat(frete)     || 0;
  const despesasVal    = parseFloat(despesas)  || 0;
  const seguroVal      = parseFloat(seguro)    || 0;
  const vrDescontoCalc = (subtotalAposDescontoItens * descontoVal) / 100;
  const totalCotacao   = subtotalAposDescontoItens - vrDescontoCalc + freteVal + despesasVal + seguroVal;

  const selectedForn = fornecedores.find((f) => f.id === fornecedorId);
  const fornNome     = selectedForn ? (selectedForn.nomeFantasia || selectedForn.razaoSocial) : "";
  const codigoForn   = fornecedorId ? fornecedorId.slice(-8).toUpperCase() : "";

  const currentJson = JSON.stringify({ fornecedorId, contato, email, frete, tipoFrete, desconto, despesas, seguro, condicoesPagamento, dataEntregaPrevista, observacoes, itens });
  const isDirty = baselineRef.current !== null && currentJson !== baselineRef.current;

  async function handleSaveOnly() {
    if (!fornecedorId) throw new Error("Selecione um fornecedor");
    const validItens = itens.filter(
      (row) => row.itemId && parseFloat(row.quantidade) > 0
    );
    if (validItens.length === 0) throw new Error("Adicione pelo menos um item");

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit:               true,
          fornecedorId,
          contato:            contato            || null,
          email:              email              || null,
          frete:              freteVal           || null,
          tipoFrete:          tipoFrete          || null,
          desconto:           descontoVal        || null,
          despesas:           despesasVal        || null,
          seguro:             seguroVal          || null,
          condicoesPagamento: condicoesPagamento || null,
          dataEntregaPrevista: dataEntregaPrevista || null,
          observacoes:        observacoes        || null,
          itens: validItens.map((row) => ({
            itemId:        row.itemId,
            unidadeId:     row.unidadeId || null,
            quantidade:    parseFloat(row.quantidade),
            precoUnitario: parseFloat(row.precoUnitario) || 0,
            desconto:      parseFloat(row.desconto) || null,
            situacao:      row.situacao,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao salvar pedido"); throw new Error(json.error); }
      clearForm();
      baselineRef.current = null;
    } finally {
      setSaving(false);
    }
  }

  useDirtyForm(isDirty, handleSaveOnly);

  async function handleSave() {
    if (!fornecedorId) { setError("Selecione um fornecedor"); return; }
    const validItens = itens.filter(
      (row) => row.itemId && parseFloat(row.quantidade) > 0
    );
    if (validItens.length === 0) { setError("Adicione pelo menos um item"); return; }
    try {
      await handleSaveOnly();
      replaceCurrentTab(`/suprimentos/pedidos-compra/${id}`);
    } catch {
      // error already set inside handleSaveOnly; set fallback only if still empty
      setError((prev) => prev || "Erro de conexão. Tente novamente.");
    }
  }

  if (loadingPedido) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Editar ${pedidoNumero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Pedidos de Compra", href: "/suprimentos/pedidos-compra" },
          { label: pedidoNumero, href: `/suprimentos/pedidos-compra/${id}` },
          { label: "Editar" },
        ]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => replaceCurrentTab(`/suprimentos/pedidos-compra/${id}`)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-5xl space-y-6">
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Seção Fornecedor */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Código fornecedor</Label>
              <Input value={codigoForn || "—"} readOnly className="font-mono bg-muted" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value="01" readOnly className="bg-muted" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs text-muted-foreground">Nome Fornecedor</Label>
              <Input value={fornNome || "—"} readOnly className="bg-muted" />
            </div>

            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-muted-foreground">Fornecedor <span className="text-red-500">*</span></Label>
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contato</Label>
              <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proposta</Label>
              <Input value="PROPOSTA 01" readOnly className="bg-muted font-mono" />
            </div>
          </div>
        </div>

        {/* Seção Financeiro */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly className="bg-muted text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Total Cotação</Label>
              <Input value={formatBRL(totalCotacao)} readOnly className="bg-muted text-right font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">% Desconto</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vr Desconto</Label>
              <Input value={formatBRL(vrDescontoCalc)} readOnly className="bg-muted text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Frete</Label>
              <Input
                type="number" step="0.01" min="0"
                value={frete} onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo Frete</Label>
              <Select value={tipoFrete || "__none__"} onValueChange={(v) => setTipoFrete(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecionar</SelectItem>
                  {TIPO_FRETE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Condição pagamento</Label>
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
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Despesas</Label>
              <Input
                type="number" step="0.01" min="0"
                value={despesas} onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Seguro</Label>
              <Input
                type="number" step="0.01" min="0"
                value={seguro} onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Entrega Prevista</Label>
              <DatePicker value={dataEntregaPrevista} onChange={(v) => setDataEntregaPrevista(v)} />
            </div>
          </div>
        </div>

        {/* Itens */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Itens da cotação</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">% Desc.</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Total Item</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((row, i) => {
                  const opt    = itemOptions.find((o) => o.id === row.itemId);
                  const preco  = parseFloat(row.precoUnitario) || 0;
                  const qtd    = parseFloat(row.quantidade)    || 0;
                  const pctDesc = parseFloat(row.desconto)     || 0;
                  const bruto  = preco * qtd;
                  const total  = row.situacao === "CONSIDERA" ? bruto - (bruto * pctDesc) / 100 : 0;
                  const isNao  = row.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={i} className={cn("hover:bg-muted", isNao && "opacity-50")}>
                      <td className="px-4 py-2 w-44">
                        <ComboboxWithCreate
                          options={itemOptions.map((o) => ({ value: o.id, label: `[${o.codigo}] ${o.descricao}` }))}
                          value={row.itemId}
                          onChange={(v) => updateRow(i, "itemId", v)}
                          allowNone={false}
                          placeholder="Produto..."
                          createHref="/suprimentos/produtos/novo"
                          createParam="descricao"
                          createLabel="produto"
                        />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{opt?.descricao ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {(() => {
                          const uns = unidadesDoItem(opt);
                          if (uns.length <= 1) return <span>{opt?.unidade?.sigla ?? opt?.unidadeMedida ?? "—"}</span>;
                          const sel = uns.find((u) => u.unidadeId === (row.unidadeId ?? "")) ?? uns[0];
                          const qtdBase = (parseFloat(row.quantidade) || 0) * sel.fator;
                          return (
                            <div className="flex flex-col gap-0.5">
                              <select
                                value={row.unidadeId ?? ""}
                                onChange={(e) => updateRow(i, "unidadeId", e.target.value)}
                                className="h-8 rounded border border-border bg-card px-1 text-xs"
                                title="Unidade da compra"
                              >
                                {uns.map((u) => (
                                  <option key={u.unidadeId || "base"} value={u.unidadeId}>{u.sigla}{u.base ? "" : ` (×${u.fator})`}</option>
                                ))}
                              </select>
                              {!sel.base && (
                                <span className="text-[10px] text-muted-foreground">= {qtdBase.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {uns[0].sigla}</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          value={row.situacao}
                          onValueChange={(v) => updateRow(i, "situacao", v as ItemRow["situacao"])}
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
                      <td className="px-4 py-2">
                        <Input
                          type="number" step="0.001" min="0"
                          value={row.quantidade}
                          onChange={(e) => updateRow(i, "quantidade", e.target.value)}
                          className="text-right h-8 w-24 ml-auto"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number" step="0.01" min="0"
                          disabled={isNao}
                          value={row.precoUnitario}
                          onChange={(e) => updateRow(i, "precoUnitario", e.target.value)}
                          placeholder="0,00"
                          className="text-right h-8"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative">
                          <Input
                            type="number" step="0.01" min="0" max="100"
                            disabled={isNao}
                            value={row.desconto}
                            onChange={(e) => updateRow(i, "desconto", e.target.value)}
                            placeholder="0"
                            className="text-right h-8 pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-foreground">
                        {isNao ? "—" : formatBRL(total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted">
                {descontoTotalItens > 0 && (
                  <tr className="text-sm">
                    <td colSpan={6} className="px-4 py-1.5 text-right text-muted-foreground">
                      Desconto Total Itens
                    </td>
                    <td />
                    <td className="px-4 py-1.5 text-right text-danger font-medium">
                      -{formatBRL(descontoTotalItens)}
                    </td>
                    <td />
                  </tr>
                )}
                {vrDescontoCalc > 0 && (
                  <tr className="text-sm">
                    <td colSpan={6} className="px-4 py-1.5 text-right text-muted-foreground">
                      Desconto Global Total
                    </td>
                    <td />
                    <td className="px-4 py-1.5 text-right text-danger font-medium">
                      -{formatBRL(vrDescontoCalc)}
                    </td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-right font-semibold text-foreground text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-foreground">{formatBRL(totalCotacao)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Observações */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <h2 className="font-semibold text-sm text-foreground">Observações</h2>
          </div>
          <div className="p-4">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações do pedido..."
              rows={3}
              className="w-full text-sm rounded-md border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Situação badge legend */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-success bg-success/10 border border-success/30 rounded px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Considera
          </span>
          <span>— item incluído no total</span>
        </div>
      </div>
    </div>
  );
}
