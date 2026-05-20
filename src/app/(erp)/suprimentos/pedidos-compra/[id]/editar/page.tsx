"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFormPersist } from "@/lib/form-persist";
import { useDirtyForm } from "@/lib/dirty-form-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Plus, Trash2, Loader2, Save, CheckCircle2 } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

type Fornecedor = {
  id: string; razaoSocial: string; nomeFantasia: string | null;
  cpfCnpj: string | null; contato: string | null; email: string | null;
};
type ItemOption = { id: string; codigo: string; descricao: string; unidadeMedida: string };

type ItemRow = {
  itemId: string;
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  situacao: "CONSIDERA" | "NAO_CONSIDERA";
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
  const router = useRouter();
  const { save: saveForm, load: loadForm, clear: clearForm } = useFormPersist<FormSnapshot>(`pc:edit:${id}`);

  // Data
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [itemOptions, setItemOptions]     = useState<ItemOption[]>([]);
  const [condicoesList, setCondicoesList] = useState<{ id: string; nome: string }[]>([]);

  // Loading state
  const [loadingPedido, setLoadingPedido] = useState(true);
  const [pedidoNumero, setPedidoNumero]   = useState("");
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
          }) => ({
            itemId:        it.item.id,
            quantidade:    String(decimalToNumber(it.quantidade)),
            precoUnitario: String(decimalToNumber(it.precoUnitario)),
            desconto:      it.desconto != null ? String(decimalToNumber(it.desconto)) : "",
            situacao:      (it.situacao === "NAO_CONSIDERA" ? "NAO_CONSIDERA" : "CONSIDERA") as ItemRow["situacao"],
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
        ? pedido.itens.map((it: { item: { id: string }; quantidade: unknown; precoUnitario: unknown; desconto?: unknown; situacao?: string }) => ({
            itemId:        it.item.id,
            quantidade:    String(decimalToNumber(it.quantidade)),
            precoUnitario: String(decimalToNumber(it.precoUnitario)),
            desconto:      it.desconto != null ? String(decimalToNumber(it.desconto)) : "",
            situacao:      (it.situacao === "NAO_CONSIDERA" ? "NAO_CONSIDERA" : "CONSIDERA") as ItemRow["situacao"],
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
      router.push(`/suprimentos/pedidos-compra/${id}`);
    } catch {
      // error already set inside handleSaveOnly; set fallback only if still empty
      setError((prev) => prev || "Erro de conexão. Tente novamente.");
    }
  }

  if (loadingPedido) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
            <Button variant="outline" onClick={() => router.push(`/suprimentos/pedidos-compra/${id}`)}>
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
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Seção Fornecedor */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Fornecedor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Código fornecedor</Label>
              <Input value={codigoForn || "—"} readOnly className="font-mono bg-gray-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs text-gray-500">Nome Fornecedor</Label>
              <Input value={fornNome || "—"} readOnly className="bg-gray-50" />
            </div>

            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs text-gray-500">Fornecedor <span className="text-red-500">*</span></Label>
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
              <Label className="text-xs text-gray-500">Contato</Label>
              <Input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome do contato" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@fornecedor.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Proposta</Label>
              <Input value="PROPOSTA 01" readOnly className="bg-gray-50 font-mono" />
            </div>
          </div>
        </div>

        {/* Seção Financeiro */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Cotação</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total itens</Label>
              <Input
                value={totalItensQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                readOnly className="bg-gray-50 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Total Cotação</Label>
              <Input value={formatBRL(totalCotacao)} readOnly className="bg-gray-50 text-right font-semibold" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">% Desconto</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vr Desconto</Label>
              <Input value={formatBRL(vrDescontoCalc)} readOnly className="bg-gray-50 text-right" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Frete</Label>
              <Input
                type="number" step="0.01" min="0"
                value={frete} onChange={(e) => setFrete(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Tipo Frete</Label>
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
              <Label className="text-xs text-gray-500">Condição pagamento</Label>
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
              <Label className="text-xs text-gray-500">Despesas</Label>
              <Input
                type="number" step="0.01" min="0"
                value={despesas} onChange={(e) => setDespesas(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Seguro</Label>
              <Input
                type="number" step="0.01" min="0"
                value={seguro} onChange={(e) => setSeguro(e.target.value)}
                placeholder="0,00" className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Entrega Prevista</Label>
              <Input type="date" value={dataEntregaPrevista} onChange={(e) => setDataEntregaPrevista(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-800">Itens da cotação</h2>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">U.M.</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">Situação</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Quantidade</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-36">Preço Unitário</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-24">% Desc.</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">Total Item</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((row, i) => {
                  const opt    = itemOptions.find((o) => o.id === row.itemId);
                  const preco  = parseFloat(row.precoUnitario) || 0;
                  const qtd    = parseFloat(row.quantidade)    || 0;
                  const pctDesc = parseFloat(row.desconto)     || 0;
                  const bruto  = preco * qtd;
                  const total  = row.situacao === "CONSIDERA" ? bruto - (bruto * pctDesc) / 100 : 0;
                  const isNao  = row.situacao === "NAO_CONSIDERA";

                  return (
                    <tr key={i} className={cn("hover:bg-gray-50", isNao && "opacity-50")}>
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
                      <td className="px-4 py-2 text-gray-600 text-xs">{opt?.descricao ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{opt?.unidadeMedida ?? "—"}</td>
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
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {isNao ? "—" : formatBRL(total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                {descontoTotalItens > 0 && (
                  <tr className="text-sm">
                    <td colSpan={6} className="px-4 py-1.5 text-right text-gray-500">
                      Desconto Total Itens
                    </td>
                    <td />
                    <td className="px-4 py-1.5 text-right text-red-600 font-medium">
                      -{formatBRL(descontoTotalItens)}
                    </td>
                    <td />
                  </tr>
                )}
                {vrDescontoCalc > 0 && (
                  <tr className="text-sm">
                    <td colSpan={6} className="px-4 py-1.5 text-right text-gray-500">
                      Desconto Global Total
                    </td>
                    <td />
                    <td className="px-4 py-1.5 text-right text-red-600 font-medium">
                      -{formatBRL(vrDescontoCalc)}
                    </td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-right font-semibold text-gray-700 text-sm">
                    Total da cotação
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{formatBRL(totalCotacao)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Observações */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Observações</h2>
          </div>
          <div className="p-4">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações do pedido..."
              rows={3}
              className="w-full text-sm rounded-md border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Situação badge legend */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" /> Considera
          </span>
          <span>— item incluído no total</span>
        </div>
      </div>
    </div>
  );
}
