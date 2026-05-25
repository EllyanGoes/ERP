"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Search, Loader2, Tag } from "lucide-react";
import { formatBRL, decimalToNumber, cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type ClienteOption = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemOption    = { id: string; codigo: string; descricao: string; precoVenda: unknown; unidadeMedida: string };
type TabelaOption  = {
  id: string; codigo: string; descricao: string;
  condicaoPagamento: string | null; ativa: boolean;
  itens: Array<{ itemId: string | null; precoVenda: unknown; vlrDesconto: unknown }>;
};

type LineItem = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  precoUnitario: string;
  descontoPct: string;   // %
  valorDesconto: string; // R$ computed
  valorTotal: string;    // R$ computed
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcLine(qty: number, price: number, pct: number) {
  const bruto   = qty * price;
  const vlrDesc = (bruto * pct) / 100;
  const total   = bruto - vlrDesc;
  return { valorDesconto: vlrDesc, valorTotal: total };
}

function emptyLine(): LineItem {
  return {
    _key: crypto.randomUUID(), itemId: "",
    codigo: "", descricao: "", unidade: "",
    quantidade: "1", precoUnitario: "0",
    descontoPct: "0", valorDesconto: "0", valorTotal: "0",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PedidoForm({
  clientes,
  itens: catalogItens,
}: {
  clientes:   ClienteOption[];
  itens:      ItemOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"orcamento" | "confirmado" | null>(null);
  const [submitError, setSubmitError] = useState("");

  // Header form
  const [clienteId,         setClienteId]         = useState("");
  const [tabelaPrecoId,     setTabelaPrecoId]     = useState("");
  const [dataEmissao,       setDataEmissao]       = useState(new Date().toISOString().slice(0, 10));
  const [dataEntrega,       setDataEntrega]       = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [valorFrete,        setValorFrete]        = useState("0");
  const [observacoes,       setObservacoes]       = useState("");

  // Tabelas de Preço
  const [tabelas,        setTabelas]        = useState<TabelaOption[]>([]);
  const [tabelaLoading,  setTabelaLoading]  = useState(false);
  const tabelaSelecionada = tabelas.find((t) => t.id === tabelaPrecoId) ?? null;

  // Line items
  const [linhas, setLinhas] = useState<LineItem[]>([]);

  // Cliente search
  const [clienteSearch,   setClienteSearch]   = useState("");
  const [clienteOpen,     setClienteOpen]     = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  // Item search popover per line
  const [itemSearchRow,   setItemSearchRow]   = useState<string | null>(null);
  const [itemSearchQ,     setItemSearchQ]     = useState("");
  const [itemResults,     setItemResults]     = useState<ItemOption[]>([]);
  const [itemSearching,   setItemSearching]   = useState(false);
  const itemSearchRef = useRef<HTMLDivElement>(null);

  // Load tabelas de preço on mount
  useEffect(() => {
    setTabelaLoading(true);
    fetch("/api/comercial/tabelas-preco")
      .then((r) => r.json())
      .then((j) => setTabelas(j.data ?? []))
      .catch(() => {})
      .finally(() => setTabelaLoading(false));
  }, []);

  // When tabela changes → update condicaoPagamento auto
  useEffect(() => {
    if (!tabelaSelecionada) return;
    if (tabelaSelecionada.condicaoPagamento) setCondicaoPagamento(tabelaSelecionada.condicaoPagamento);
  }, [tabelaPrecoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside click: close cliente dropdown
  useEffect(() => {
    function h(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node))
        setClienteOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Outside click: close item search
  useEffect(() => {
    function h(e: MouseEvent) {
      if (itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node))
        setItemSearchRow(null);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Item search debounce
  useEffect(() => {
    if (!itemSearchRow) return;
    const delay = itemSearchQ.trim() ? 300 : 0;
    const t = setTimeout(() => {
      const q = itemSearchQ.toLowerCase();
      const filtered = q
        ? catalogItens.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q))
        : catalogItens;
      setItemResults(filtered.slice(0, 20));
    }, delay);
    return () => clearTimeout(t);
  }, [itemSearchQ, itemSearchRow, catalogItens]);

  // ── Line item helpers ────────────────────────────────────────────────────────

  function addLinha() {
    setLinhas((prev) => [...prev, emptyLine()]);
  }

  function removeLinha(key: string) {
    setLinhas((prev) => prev.filter((l) => l._key !== key));
  }

  function updateLinha(key: string, field: keyof LineItem, value: string) {
    setLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const updated = { ...l, [field]: value };
      // Recalc when relevant fields change
      if (field === "quantidade" || field === "precoUnitario" || field === "descontoPct") {
        const qty   = parseFloat(field === "quantidade"     ? value : l.quantidade)     || 0;
        const price = parseFloat(field === "precoUnitario"  ? value : l.precoUnitario)  || 0;
        const pct   = parseFloat(field === "descontoPct"    ? value : l.descontoPct)    || 0;
        const { valorDesconto, valorTotal } = calcLine(qty, price, pct);
        updated.valorDesconto = valorDesconto.toFixed(2);
        updated.valorTotal    = valorTotal.toFixed(2);
      }
      return updated;
    }));
  }

  function selectItem(key: string, prod: ItemOption) {
    const price = decimalToNumber(prod.precoVenda);
    // Check if tabela has a price for this item
    const tabelaItem = tabelaSelecionada?.itens.find((ti) => ti.itemId === prod.id);
    const finalPrice = tabelaItem ? decimalToNumber(tabelaItem.precoVenda) : price;
    const pct        = tabelaItem ? decimalToNumber(tabelaItem.vlrDesconto) : 0;

    setLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const qty = parseFloat(l.quantidade) || 1;
      const { valorDesconto, valorTotal } = calcLine(qty, finalPrice, pct);
      return {
        ...l, itemId: prod.id,
        codigo: prod.codigo, descricao: prod.descricao, unidade: prod.unidadeMedida,
        precoUnitario: finalPrice.toFixed(2),
        descontoPct:   pct.toFixed(4),
        valorDesconto: valorDesconto.toFixed(2),
        valorTotal:    valorTotal.toFixed(2),
      };
    }));
    setItemSearchRow(null);
    setItemSearchQ("");
  }

  // ── Totals ───────────────────────────────────────────────────────────────────

  const subtotal     = linhas.reduce((s, l) => s + (parseFloat(l.valorTotal) || 0), 0);
  const freteVal     = parseFloat(valorFrete) || 0;
  const totalGeral   = subtotal + freteVal;

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(status: "ORCAMENTO" | "CONFIRMADO") {
    setSubmitError("");
    if (!clienteId)     { setSubmitError("Selecione o cliente"); return; }
    if (!dataEmissao)   { setSubmitError("Informe a data de emissão"); return; }
    if (linhas.length === 0) { setSubmitError("Adicione pelo menos um item"); return; }
    const invalid = linhas.find((l) => !l.itemId);
    if (invalid) { setSubmitError("Selecione o produto em todas as linhas"); return; }

    setSubmitting(status === "ORCAMENTO" ? "orcamento" : "confirmado");
    try {
      const payload = {
        clienteId,
        tabelaPrecoId: tabelaPrecoId || null,
        dataEmissao,
        dataEntrega: dataEntrega || null,
        condicaoPagamento: condicaoPagamento || null,
        valorDesconto: 0,
        valorFrete: freteVal,
        observacoes: observacoes || null,
        itens: linhas.map((l) => ({
          itemId:        l.itemId,
          quantidade:    parseFloat(l.quantidade) || 0,
          precoUnitario: parseFloat(l.precoUnitario) || 0,
          descontoPct:   parseFloat(l.descontoPct) || 0,
          valorDesconto: parseFloat(l.valorDesconto) || 0,
          desconto:      parseFloat(l.valorDesconto) || 0,
          valorTotal:    parseFloat(l.valorTotal) || 0,
        })),
      };

      const res = await fetch("/api/pedidos-venda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        setSubmitError(json.error || "Erro ao criar pedido");
        return;
      }

      const json = await res.json();
      const pedidoId = json.data.id;

      if (status === "CONFIRMADO") {
        await fetch(`/api/pedidos-venda/${pedidoId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMADO" }),
        });
      }

      router.push(`/pedidos-venda/${pedidoId}`);
      router.refresh();
    } catch { setSubmitError("Erro de conexão"); }
    finally { setSubmitting(null); }
  }

  // ── Filtered cliente list ────────────────────────────────────────────────────

  const clientesFiltrados = clienteSearch.trim()
    ? clientes.filter((c) =>
        c.razaoSocial.toLowerCase().includes(clienteSearch.toLowerCase()) ||
        (c.nomeFantasia ?? "").toLowerCase().includes(clienteSearch.toLowerCase())
      )
    : clientes;

  const clienteSelecionado = clientes.find((c) => c.id === clienteId);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{submitError}</div>
      )}

      {/* ── Dados do Pedido ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-sm text-gray-800">Dados do Pedido</h2>
        </div>
        <div className="p-4 space-y-4">

          {/* Cliente */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Cliente *</Label>
            <div className="relative" ref={clienteRef}>
              <button
                type="button"
                onClick={() => { setClienteOpen((v) => !v); setClienteSearch(""); }}
                className={cn(
                  "w-full flex items-center justify-between h-9 px-3 rounded-lg border text-sm text-left transition-colors",
                  clienteOpen ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300",
                  clienteSelecionado ? "text-gray-900" : "text-gray-400"
                )}
              >
                <span className="truncate">
                  {clienteSelecionado
                    ? clienteSelecionado.razaoSocial + (clienteSelecionado.nomeFantasia ? ` (${clienteSelecionado.nomeFantasia})` : "")
                    : "Selecione o cliente..."}
                </span>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {clienteOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl">
                  <div className="relative border-b border-gray-100">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      autoFocus type="text"
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {clientesFiltrados.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400 italic text-center">Nenhum cliente encontrado</p>
                    ) : clientesFiltrados.map((c) => (
                      <button
                        key={c.id} type="button"
                        onMouseDown={() => { setClienteId(c.id); setClienteOpen(false); }}
                        className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0", clienteId === c.id && "bg-blue-50 text-blue-700")}
                      >
                        <span className="font-medium">{c.razaoSocial}</span>
                        {c.nomeFantasia && <span className="text-gray-500 text-xs ml-1.5">({c.nomeFantasia})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Data Emissão */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Data de Emissão</Label>
              <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
            </div>

            {/* Previsão de Entrega */}
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Previsão de Entrega</Label>
              <Input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
            </div>
          </div>

          {/* Tabela de Preço */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-600 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tabela de Preço
            </Label>
            <select
              value={tabelaPrecoId}
              onChange={(e) => setTabelaPrecoId(e.target.value)}
              disabled={tabelaLoading}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sem tabela de preço —</option>
              {tabelas.filter((t) => t.ativa !== false).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.descricao}
                  {t.condicaoPagamento ? ` · ${t.condicaoPagamento}` : ""}
                </option>
              ))}
            </select>
            {tabelaSelecionada && (
              <p className="text-xs text-blue-600 mt-0.5">
                Preços e descontos serão preenchidos automaticamente ao selecionar produtos
              </p>
            )}
          </div>

          {/* Condição de Pagamento */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Condição de Pagamento</Label>
            <Input
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
              placeholder="Ex: 30/60/90 DDL, À vista..."
            />
          </div>
        </div>
      </div>

      {/* ── Itens do Pedido ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-800">Itens do Pedido</h2>
          <Button type="button" size="sm" variant="outline" onClick={addLinha}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
          </Button>
        </div>

        {linhas.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-sm">Nenhum item adicionado. Clique em &quot;Adicionar Item&quot;.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-center px-3 py-2.5 font-semibold w-12">Item</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Produto</th>
                  <th className="text-center px-3 py-2.5 font-semibold w-16">Unidade</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-24">Quantidade</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-28">Preço Unit.</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-24">% Desconto</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-28">Vlr. Desconto</th>
                  <th className="text-right px-3 py-2.5 font-semibold w-28">Valor Total</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((linha, idx) => (
                  <tr key={linha._key} className="hover:bg-gray-50/60 group">

                    {/* # */}
                    <td className="px-3 py-2 text-center text-xs font-mono text-gray-500 font-semibold">
                      {idx + 1}
                    </td>

                    {/* Produto — search popover */}
                    <td className="px-3 py-2 relative min-w-[220px]">
                      <button
                        type="button"
                        onClick={() => { setItemSearchRow(linha._key); setItemSearchQ(linha.codigo); setItemResults(catalogItens.slice(0, 20)); }}
                        className={cn(
                          "w-full h-8 px-2.5 rounded-lg border text-left text-xs transition-colors",
                          linha.itemId
                            ? "border-gray-200 bg-white text-gray-800 hover:border-blue-400"
                            : "border-dashed border-gray-300 text-gray-400 hover:border-blue-400"
                        )}
                      >
                        {linha.itemId ? (
                          <span>
                            <span className="font-mono text-gray-500 mr-1.5">{linha.codigo}</span>
                            <span className="text-gray-800">{linha.descricao}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1"><Search className="w-3 h-3" /> Buscar produto...</span>
                        )}
                      </button>

                      {itemSearchRow === linha._key && (
                        <div ref={itemSearchRef} className="absolute left-0 top-full mt-1 z-50 w-96 bg-white rounded-xl border border-gray-200 shadow-xl">
                          <div className="relative border-b border-gray-100">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <input
                              autoFocus type="text"
                              value={itemSearchQ}
                              onChange={(e) => setItemSearchQ(e.target.value)}
                              placeholder="Código ou descrição..."
                              className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {itemSearching ? (
                              <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
                              </div>
                            ) : itemResults.length === 0 ? (
                              <p className="px-4 py-3 text-xs text-gray-400 italic text-center">Nenhum produto encontrado</p>
                            ) : itemResults.map((p) => (
                              <button
                                key={p.id} type="button"
                                onMouseDown={() => selectItem(linha._key, p)}
                                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
                              >
                                <span className="font-mono text-xs text-gray-500 shrink-0 w-20">{p.codigo}</span>
                                <span className="text-sm text-gray-800 truncate flex-1">{p.descricao}</span>
                                <span className="text-xs text-gray-500 shrink-0">{p.unidadeMedida}</span>
                                <span className="text-xs font-medium text-blue-600 shrink-0">{formatBRL(decimalToNumber(p.precoVenda))}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Unidade */}
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {linha.unidade || "—"}
                      </span>
                    </td>

                    {/* Quantidade */}
                    <td className="px-3 py-2">
                      <Input
                        type="number" min="0.001" step="0.001"
                        value={linha.quantidade}
                        onChange={(e) => updateLinha(linha._key, "quantidade", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </td>

                    {/* Preço Unit. */}
                    <td className="px-3 py-2">
                      <Input
                        type="number" min="0" step="0.01"
                        value={linha.precoUnitario}
                        onChange={(e) => updateLinha(linha._key, "precoUnitario", e.target.value)}
                        className="h-8 text-xs text-right"
                      />
                    </td>

                    {/* % Desconto */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <Input
                          type="number" min="0" max="100" step="0.01"
                          value={linha.descontoPct}
                          onChange={(e) => updateLinha(linha._key, "descontoPct", e.target.value)}
                          className="h-8 text-xs text-right pr-6"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                      </div>
                    </td>

                    {/* Vlr. Desconto — read-only computed */}
                    <td className="px-3 py-2 text-right">
                      <span className={cn(
                        "text-xs font-medium",
                        parseFloat(linha.valorDesconto) > 0 ? "text-red-600" : "text-gray-400"
                      )}>
                        {parseFloat(linha.valorDesconto) > 0
                          ? `− ${formatBRL(parseFloat(linha.valorDesconto))}`
                          : "—"}
                      </span>
                    </td>

                    {/* Valor Total */}
                    <td className="px-3 py-2 text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatBRL(parseFloat(linha.valorTotal) || 0)}
                      </span>
                    </td>

                    {/* Remove */}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => removeLinha(linha._key)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="px-4 py-4 border-t border-gray-100 flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>Frete (R$)</span>
              <Input
                type="number" step="0.01" min="0"
                value={valorFrete}
                onChange={(e) => setValorFrete(e.target.value)}
                className="h-7 w-28 text-xs text-right"
              />
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span>{formatBRL(totalGeral)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className="space-y-1">
        <Label className="text-xs text-gray-600">Observações</Label>
        <Textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Observações do pedido..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button" variant="outline"
          onClick={() => handleSubmit("ORCAMENTO")}
          disabled={!!submitting}
        >
          {submitting === "orcamento" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : "Salvar como Orçamento"}
        </Button>
        <Button
          type="button"
          onClick={() => handleSubmit("CONFIRMADO")}
          disabled={!!submitting}
        >
          {submitting === "confirmado" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Confirmando...</> : "Confirmar Pedido"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={!!submitting}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
