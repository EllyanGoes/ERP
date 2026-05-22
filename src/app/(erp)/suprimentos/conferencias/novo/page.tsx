"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decimalToNumber, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Link2, X, Plus, Trash2, Search, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cpfCnpj: string | null;
};

type Produto = {
  id: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
};

type LocalEstoque = {
  id: string;
  nome: string;
};

type PedidoOption = {
  id: string;
  numero: string;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
};

type ItemRow = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  localEstoqueId: string;
  quantidadePedida: string;
  vlrUnitario: string;
  tipoEntrada: string;
  codFiscal: string;
};

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): ItemRow {
  return {
    _key: makeKey(),
    itemId: "",
    codigo: "",
    descricao: "",
    unidadeMedida: "",
    localEstoqueId: "",
    quantidadePedida: "",
    vlrUnitario: "",
    tipoEntrada: "",
    codFiscal: "",
  };
}

/* Portal-based product search cell — avoids clipping by overflow-x-auto */
function ProdSearchCell({
  rowKey,
  value,
  produtos,
  onSelect,
  onClear,
}: {
  rowKey: string;
  value: string;
  produtos: Produto[];
  onSelect: (key: string, p: Produto) => void;
  onClear: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setQuery(value); }, [value]);

  function openDrop() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: Math.max(r.width, 288) });
    }
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return produtos.filter((p) => p.descricao.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)).slice(0, 12);
  }, [produtos, query]);

  const dropdown = open && mounted && pos
    ? createPortal(
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 220, overflowY: "auto" }}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 italic">Nenhum resultado.</p>
          ) : filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => {
                onSelect(rowKey, p);
                setQuery(p.descricao);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0"
            >
              <span className="font-mono text-gray-500 mr-2">{p.codigo}</span>
              <span className="font-medium text-gray-900">{p.descricao}</span>
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest("td")?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          openDrop();
          if (!e.target.value) onClear(rowKey);
        }}
        onFocus={openDrop}
        placeholder="Buscar produto..."
        className="w-full h-8 px-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {dropdown}
    </>
  );
}

export default function NovoDocumentoEntradaPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Documento fields
  const [tipoDocumento, setTipoDocumento] = useState<"NF" | "SN">("NF");
  const [numeroNF, setNumeroNF]           = useState("");
  const [serie, setSerie]                 = useState("1");
  const [dtEmissao, setDtEmissao]         = useState(() => new Date().toISOString().slice(0, 10));
  const [ufOrigem, setUfOrigem]           = useState("");
  const [espDocumento, setEspDocumento]   = useState("SPED");

  const isSN = tipoDocumento === "SN";

  // Fornecedor
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [fornecedorId, setFornecedorId]   = useState("");

  // Pedido vinculado — button in header
  const [vinculadoPedido, setVinculadoPedido] = useState<PedidoOption | null>(null);
  const [pcPopoverOpen, setPcPopoverOpen]     = useState(false);
  const [pedidoSearch, setPedidoSearch]       = useState("");
  const [pedidoOptions, setPedidoOptions]     = useState<PedidoOption[]>([]);
  const pcPopoverRef = useRef<HTMLDivElement>(null);

  // Local de Estoque (Global vs Por Item)
  const [modoLocalEstoque, setModoLocalEstoque] = useState<"GLOBAL" | "POR_ITEM">("POR_ITEM");
  const [localEstoqueGlobalId, setLocalEstoqueGlobalId] = useState("");

  // Items
  const [itens, setItens]                       = useState<ItemRow[]>([emptyRow()]);
  const [produtos, setProdutos]                 = useState<Produto[]>([]);
  const [locaisEstoque, setLocaisEstoque]       = useState<LocalEstoque[]>([]);
  const [prodSearchMap, setProdSearchMap]       = useState<Record<string, string>>({});

  // Totals
  const [frete, setFrete]       = useState("");
  const [seguro, setSeguro]     = useState("");
  const [despesas, setDespesas] = useState("");
  const [desconto, setDesconto] = useState("");

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  useTabTitle("Novo Doc. Entrada");

  // Load fornecedores
  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Load produtos
  useEffect(() => {
    fetch("/api/suprimentos/produtos")
      .then((r) => r.json())
      .then((j) => setProdutos(j.data ?? []))
      .catch(() => {});
  }, []);

  // Load locais-estoque
  useEffect(() => {
    fetch("/api/suprimentos/locais-estoque")
      .then((r) => r.json())
      .then((j) => setLocaisEstoque(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Search pedidos when typing
  const searchPedidos = useCallback(async (q: string) => {
    if (!q.trim()) { setPedidoOptions([]); return; }
    try {
      const res = await fetch(`/api/suprimentos/pedidos-compra?search=${encodeURIComponent(q)}&limit=10`);
      const json = await res.json();
      setPedidoOptions(json.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPedidos(pedidoSearch), 300);
    return () => clearTimeout(t);
  }, [pedidoSearch, searchPedidos]);

  // Auto-fill from pedidoId URL param
  useEffect(() => {
    const pedidoId = searchParams.get("pedidoId");
    if (!pedidoId) return;
    fetch(`/api/suprimentos/pedidos-compra/${pedidoId}`)
      .then((r) => r.json())
      .then((j) => {
        const pc = j.data;
        if (!pc) return;
        selectPedido({
          id: pc.id,
          numero: pc.numero,
          fornecedor: { id: pc.fornecedor.id, razaoSocial: pc.fornecedor.razaoSocial, nomeFantasia: pc.fornecedor.nomeFantasia },
          itens: pc.itens.map((i: { id: string; quantidade: unknown; item: { id: string; codigo: string; descricao: string; unidadeMedida: string } }) => ({
            id: i.id,
            quantidade: i.quantidade,
            item: i.item,
          })),
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close PC popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (pcPopoverRef.current && !pcPopoverRef.current.contains(e.target as Node)) {
        setPcPopoverOpen(false);
      }
    }
    if (pcPopoverOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [pcPopoverOpen]);


  // Clear NF-specific fields when switching to SN
  useEffect(() => {
    if (isSN) {
      setNumeroNF("");
      setSerie("");
      setEspDocumento("");
    } else {
      setSerie("1");
      setEspDocumento("SPED");
    }
  }, [isSN]);

  function handleModoChange(novo: "GLOBAL" | "POR_ITEM") {
    setModoLocalEstoque(novo);
    if (novo === "GLOBAL") {
      // propagate current global local to all rows
      setItens((prev) => prev.map((r) => ({ ...r, localEstoqueId: localEstoqueGlobalId })));
    }
  }

  function handleGlobalLocalChange(localId: string) {
    setLocalEstoqueGlobalId(localId);
    setItens((prev) => prev.map((r) => ({ ...r, localEstoqueId: localId })));
  }

  function selectFornecedor(f: Fornecedor) {
    setFornecedorId(f.id);
  }

  function selectPedido(p: PedidoOption) {
    setVinculadoPedido(p);
    setPcPopoverOpen(false);
    setPedidoSearch("");
    setPedidoOptions([]);
    // Auto-fill fornecedor from pedido
    selectFornecedor({
      id: p.fornecedor.id,
      razaoSocial: p.fornecedor.razaoSocial,
      nomeFantasia: p.fornecedor.nomeFantasia,
      cpfCnpj: null,
    });
    // Pull items from pedido; pre-fill local if global mode
    setItens(
      p.itens.map((pi) => ({
        _key: makeKey(),
        itemId: pi.item.id,
        codigo: pi.item.codigo,
        descricao: pi.item.descricao,
        unidadeMedida: pi.item.unidadeMedida,
        localEstoqueId: modoLocalEstoque === "GLOBAL" ? localEstoqueGlobalId : "",
        quantidadePedida: decimalToNumber(pi.quantidade).toString(),
        vlrUnitario: "",
        tipoEntrada: "",
        codFiscal: "",
      }))
    );
  }

  function clearPedido() {
    setVinculadoPedido(null);
    setPedidoSearch("");
    setPedidoOptions([]);
  }

  function updateItem(key: string, field: keyof ItemRow, value: string) {
    setItens((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
    );
  }

  function selectProduto(key: string, p: Produto) {
    setItens((prev) =>
      prev.map((r) =>
        r._key === key
          ? { ...r, itemId: p.id, codigo: p.codigo, descricao: p.descricao, unidadeMedida: p.unidadeMedida }
          : r
      )
    );
    setProdSearchMap((prev) => ({ ...prev, [key]: p.descricao }));
  }

  function addRow() {
    const row = emptyRow();
    if (modoLocalEstoque === "GLOBAL") row.localEstoqueId = localEstoqueGlobalId;
    setItens((prev) => [...prev, row]);
  }

  function removeRow(key: string) {
    setItens((prev) => prev.filter((r) => r._key !== key));
  }

  // Computed totals
  const vlrMercadoria = itens.reduce((s, r) => {
    const qtd  = parseFloat(r.quantidadePedida) || 0;
    const unit = parseFloat(r.vlrUnitario) || 0;
    return s + qtd * unit;
  }, 0);
  const freteNum    = parseFloat(frete)    || 0;
  const seguroNum   = parseFloat(seguro)   || 0;
  const despesasNum = parseFloat(despesas) || 0;
  const descontoNum = parseFloat(desconto) || 0;
  const vlrBruto    = vlrMercadoria + freteNum + seguroNum + despesasNum - descontoNum;

  async function handleSubmit() {
    setError("");

    if (!fornecedorId) {
      setError("Selecione um fornecedor.");
      return;
    }

    const validItens = itens.filter((r) => r.itemId && parseFloat(r.quantidadePedida) > 0);
    if (validItens.length === 0) {
      setError("Adicione pelo menos 1 item com produto e quantidade.");
      return;
    }

    if (modoLocalEstoque === "GLOBAL" && !localEstoqueGlobalId) {
      setError("Selecione o Local de Estoque.");
      return;
    }
    if (modoLocalEstoque === "POR_ITEM") {
      const itensSemLocal = validItens.filter((r) => !r.localEstoqueId);
      if (itensSemLocal.length > 0) {
        setError("Informe o Local de Estoque para todos os itens.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fornecedorId,
        pedidoId: vinculadoPedido?.id ?? null,
        modoLocalEstoque,
        localEstoqueId: modoLocalEstoque === "GLOBAL" ? (localEstoqueGlobalId || null) : null,
        tipoNota: tipoDocumento,
        numeroNF:    isSN ? null : (numeroNF || null),
        serie:       isSN ? null : (serie    || null),
        dtEmissao:   dtEmissao    || null,
        ufOrigem:    ufOrigem     || null,
        espDocumento: isSN ? null : (espDocumento || "SPED"),
        frete:    freteNum    > 0 ? freteNum    : null,
        tipoFrete: null,
        seguro:   seguroNum   > 0 ? seguroNum   : null,
        despesas: despesasNum > 0 ? despesasNum : null,
        desconto: descontoNum > 0 ? descontoNum : null,
        itens: validItens.map((r, idx) => ({
          itemId: r.itemId,
          quantidadePedida: parseFloat(r.quantidadePedida),
          vlrUnitario:  parseFloat(r.vlrUnitario) || null,
          localEstoqueId: r.localEstoqueId || null,
          tipoEntrada:  r.tipoEntrada || null,
          codFiscal:    r.codFiscal   || null,
          itemNF: idx + 1,
        })),
      };

      const res  = await fetch("/api/suprimentos/conferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erro ao criar documento");
        return;
      }
      router.push(`/suprimentos/conferencias/${json.data.id}`);
    } catch {
      setError("Erro de conexão");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedFornecedor = fornecedores.find((f) => f.id === fornecedorId);

  return (
    <div>
      <PageHeader
        title="Novo Documento de Entrada"
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Doc. de Entrada", href: "/suprimentos/conferencias" },
          { label: "Novo" },
        ]}
        action={
          /* ── Botão Vincular PC ─────────────────────────────────────────── */
          <div className="relative" ref={pcPopoverRef}>
            <Button
              type="button"
              variant={vinculadoPedido ? "default" : "outline"}
              size="sm"
              onClick={() => setPcPopoverOpen((v) => !v)}
              className={cn(
                "gap-1.5",
                vinculadoPedido && "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              <Link2 className="w-3.5 h-3.5" />
              {vinculadoPedido ? vinculadoPedido.numero : "Vincular PC"}
              {vinculadoPedido && (
                <span
                  role="button"
                  onPointerDown={(e) => { e.stopPropagation(); clearPedido(); }}
                  className="ml-0.5 opacity-70 hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </Button>

            {pcPopoverOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                {/* Search */}
                <div className="p-3 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={pedidoSearch}
                      onChange={(e) => setPedidoSearch(e.target.value)}
                      placeholder="Buscar PC… (ex: PC-2025-0001)"
                      className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="max-h-52 overflow-y-auto">
                  {pedidoOptions.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-gray-400 italic text-center">
                      {pedidoSearch.trim() ? "Nenhum resultado." : "Digite para buscar um Pedido de Compra."}
                    </p>
                  ) : pedidoOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => selectPedido(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono font-semibold text-gray-800">{p.numero}</span>
                      <span className="text-xs text-gray-400 truncate max-w-[140px]">
                        {p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Linked summary */}
                {vinculadoPedido && (
                  <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700 flex items-center gap-1">
                      <Link2 className="w-3 h-3" /> {vinculadoPedido.numero}
                    </span>
                    <Link
                      href={`/suprimentos/pedidos-compra/${vinculadoPedido.id}`}
                      target="_blank"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8 max-w-6xl space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Dados do Documento ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados do Documento</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* Tipo de Documento */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Tipo de Documento</Label>
              <select
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value as "NF" | "SN")}
                className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="NF">NF — Nota Fiscal</option>
                <option value="SN">SN — Sem Nota</option>
              </select>
            </div>

            {/* Número NF */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-gray-300" : "text-gray-500")}>
                Número NF
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : numeroNF}
                onChange={(e) => setNumeroNF(e.target.value)}
                placeholder={isSN ? "—" : "000000"}
                disabled={isSN}
                className={isSN ? "bg-gray-50 text-gray-300 cursor-not-allowed" : ""}
              />
            </div>

            {/* Série */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-gray-300" : "text-gray-500")}>
                Série
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder={isSN ? "—" : "1"}
                disabled={isSN}
                className={isSN ? "bg-gray-50 text-gray-300 cursor-not-allowed" : ""}
              />
            </div>

            {/* DT Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">DT Emissão</Label>
              <Input
                type="date"
                value={dtEmissao}
                onChange={(e) => setDtEmissao(e.target.value)}
              />
            </div>

            {/* Espécie de Documento */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-gray-300" : "text-gray-500")}>
                Espécie de Documento
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : espDocumento}
                onChange={(e) => setEspDocumento(e.target.value)}
                placeholder={isSN ? "—" : "SPED"}
                disabled={isSN}
                className={isSN ? "bg-gray-50 text-gray-300 cursor-not-allowed" : ""}
              />
            </div>

            {/* UF Origem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">UF Origem</Label>
              <select
                value={ufOrigem}
                onChange={(e) => setUfOrigem(e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {UF_LIST.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            {/* Loja (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Loja</Label>
              <Input value="01" readOnly className="bg-gray-50" />
            </div>
          </CardContent>
        </Card>

        {/* ── Fornecedor ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fornecedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-gray-500">
                  Fornecedor <span className="text-red-500">*</span>
                </Label>
                <ComboboxWithCreate
                  options={fornecedores.map((f) => ({
                    value: f.id,
                    label: f.nomeFantasia || f.razaoSocial,
                    code: f.cpfCnpj ?? undefined,
                  }))}
                  value={fornecedorId}
                  onChange={setFornecedorId}
                  allowNone={false}
                  placeholder="Selecionar fornecedor..."
                  createHref="/suprimentos/fornecedores/novo"
                  createLabel="fornecedor"
                />
              </div>

              {selectedFornecedor && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">CNPJ / CPF</Label>
                  <Input
                    value={selectedFornecedor.cpfCnpj ?? "—"}
                    readOnly
                    className="bg-gray-50 font-mono"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Local de Estoque ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Local de Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-6">
              {/* Toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Modo de entrada</Label>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                  <button
                    type="button"
                    onClick={() => handleModoChange("GLOBAL")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      modoLocalEstoque === "GLOBAL"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModoChange("POR_ITEM")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      modoLocalEstoque === "POR_ITEM"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Por Item
                  </button>
                </div>
              </div>

              {/* Global selector */}
              {modoLocalEstoque === "GLOBAL" && (
                <div className="space-y-1.5 flex-1 max-w-xs">
                  <Label className="text-xs text-gray-500">
                    Local de Estoque <span className="text-red-500">*</span>
                  </Label>
                  <select
                    value={localEstoqueGlobalId}
                    onChange={(e) => handleGlobalLocalChange(e.target.value)}
                    className={cn(
                      "w-full h-9 px-3 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500",
                      !localEstoqueGlobalId ? "border-red-300" : "border-gray-200"
                    )}
                  >
                    <option value="">Selecionar local...</option>
                    {locaisEstoque.map((l) => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {modoLocalEstoque === "POR_ITEM" && (
                <p className="text-xs text-gray-400 self-end pb-1.5">
                  O local de estoque será definido individualmente para cada item na tabela abaixo.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Items Table ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs w-6">#</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs min-w-[200px]">Produto</th>
                    {modoLocalEstoque === "POR_ITEM" && (
                      <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs min-w-[140px]">
                        Local Estoque <span className="text-red-500">*</span>
                      </th>
                    )}
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs w-16">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs w-28">Qtd. Pedida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs w-28">Vlr. Unit.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-gray-600 text-xs w-28">Vlr. Total</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs w-28">Tipo Entrada</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-600 text-xs w-24">Cód. Fiscal</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itens.map((row, idx) => {
                    const qtd   = parseFloat(row.quantidadePedida) || 0;
                    const unit  = parseFloat(row.vlrUnitario) || 0;
                    const total = qtd * unit;
                    const prodSearch = prodSearchMap[row._key] ?? row.descricao ?? "";

                    return (
                      <tr key={row._key} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>

                        {/* Produto */}
                        <td className="px-3 py-2">
                          <ProdSearchCell
                            rowKey={row._key}
                            value={prodSearch}
                            produtos={produtos}
                            onSelect={selectProduto}
                            onClear={(key) => {
                              updateItem(key, "itemId", "");
                              updateItem(key, "descricao", "");
                              setProdSearchMap((prev) => ({ ...prev, [key]: "" }));
                            }}
                          />
                        </td>

                        {/* Local Estoque — only in Por Item mode */}
                        {modoLocalEstoque === "POR_ITEM" && (
                          <td className="px-3 py-2">
                            <select
                              value={row.localEstoqueId}
                              onChange={(e) => updateItem(row._key, "localEstoqueId", e.target.value)}
                              className={cn(
                                "w-full h-8 px-2 border rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-red-400",
                                !row.localEstoqueId ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 text-gray-800"
                              )}
                            >
                              <option value="">Selecionar local...</option>
                              {locaisEstoque.map((l) => (
                                <option key={l.id} value={l.id}>{l.nome}</option>
                              ))}
                            </select>
                          </td>
                        )}

                        {/* U.M. */}
                        <td className="px-3 py-2">
                          <span className="text-xs text-gray-500">{row.unidadeMedida || "—"}</span>
                        </td>

                        {/* Qtd. Pedida */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.quantidadePedida}
                            onChange={(e) => updateItem(row._key, "quantidadePedida", e.target.value)}
                            className="text-right h-8 text-xs"
                          />
                        </td>

                        {/* Vlr. Unit */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.vlrUnitario}
                            onChange={(e) => updateItem(row._key, "vlrUnitario", e.target.value)}
                            className="text-right h-8 text-xs"
                          />
                        </td>

                        {/* Vlr. Total */}
                        <td className="px-3 py-2 text-right text-xs text-gray-600 whitespace-nowrap">
                          {total > 0 ? formatBRL(total) : "—"}
                        </td>

                        {/* Tipo Entrada */}
                        <td className="px-3 py-2">
                          <Input
                            value={row.tipoEntrada}
                            onChange={(e) => updateItem(row._key, "tipoEntrada", e.target.value)}
                            placeholder="—"
                            className="h-8 text-xs"
                          />
                        </td>

                        {/* Cód. Fiscal */}
                        <td className="px-3 py-2">
                          <Input
                            value={row.codFiscal}
                            onChange={(e) => updateItem(row._key, "codFiscal", e.target.value)}
                            placeholder="—"
                            className="h-8 text-xs font-mono"
                          />
                        </td>

                        {/* Delete */}
                        <td className="px-3 py-2">
                          {itens.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(row._key)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Totals ───────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Totais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Vlr. Mercadoria</Label>
                <Input value={formatBRL(vlrMercadoria)} readOnly className="bg-gray-50 text-right font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Frete</Label>
                <Input type="number" step="0.01" min="0" value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Seguro</Label>
                <Input type="number" step="0.01" min="0" value={seguro} onChange={(e) => setSeguro(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Despesas</Label>
                <Input type="number" step="0.01" min="0" value={despesas} onChange={(e) => setDespesas(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Desconto</Label>
                <Input type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Vlr. Bruto</Label>
                <Input value={formatBRL(vlrBruto)} readOnly className="bg-blue-50 text-right font-bold text-blue-900 border-blue-200" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/suprimentos/conferencias">Cancelar</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Incluindo..." : "Incluir"}
          </Button>
        </div>
      </div>
    </div>
  );
}
