"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decimalToNumber, formatBRL } from "@/lib/utils";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { Link2, X, Plus, Trash2, Search, ExternalLink, AlertTriangle, FileText, ChevronRight } from "lucide-react";
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
  valorTotal?: unknown;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: Array<{
    id: string;
    quantidade: unknown;
    precoUnitario?: unknown;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
  }>;
};

// Pedido de Compra compatível sugerido pelo endpoint /match (anti-duplicidade).
type MatchResult = {
  id: string;
  numero: string;
  status: string;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  necessidadeNumero: string | null;
  cotacaoNumero: string | null;
  matchCount: number;
  totalItens: number;
  itens: PedidoOption["itens"];
};

type ItemRow = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  localEstoqueId: string;
  quantidadePedida: string;
  quantidadeRecebida: string;
  vlrUnitario: string;
  desconto: string;
  vlrTotal: string;
  vlrIPI: string;
  vlrICMS: string;
  tipoEntrada: string;
  codFiscal: string;
};

function getItemStatus(pedida: number, recebida: number): { label: string; cls: string } {
  if (recebida === 0) return { label: "Faltante", cls: "bg-danger/15 text-danger" };
  if (Math.abs(pedida - recebida) > 0.001) return { label: "Divergência", cls: "bg-warning/15 text-warning" };
  return { label: "OK", cls: "bg-success/15 text-success" };
}

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
    quantidadeRecebida: "",
    vlrUnitario: "",
    desconto: "",
    vlrTotal: "",
    vlrIPI: "",
    vlrICMS: "",
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
          className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: 220, overflowY: "auto" }}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum resultado.</p>
          ) : filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => {
                onSelect(rowKey, p);
                setQuery(p.descricao);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b border-gray-50 last:border-0"
            >
              <span className="font-mono text-muted-foreground mr-2">{p.codigo}</span>
              <span className="font-medium text-foreground">{p.descricao}</span>
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
        className="w-full h-8 px-2 text-xs border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {dropdown}
    </>
  );
}

export default function NovoDocumentoEntradaPage() {
  const searchParams = useSearchParams();

  // Documento fields
  const [tipoDocumento, setTipoDocumento] = useState<"NF" | "SN">("NF");
  const [numeroNF, setNumeroNF]           = useState("");
  const [serie, setSerie]                 = useState("1");
  const [dtEmissao, setDtEmissao]         = useState(() => new Date().toLocaleDateString("sv-SE")); // hoje (dia local/SP), não UTC
  const [ufOrigem, setUfOrigem]           = useState("");
  const [espDocumento, setEspDocumento]   = useState("SPED");

  const isSN = tipoDocumento === "SN";

  // Fornecedor
  const [fornecedores, setFornecedores]   = useState<Fornecedor[]>([]);
  const [fornecedorId, setFornecedorId]   = useState("");

  // Responsável
  const [usuarios, setUsuarios]           = useState<{ id: string; nome: string; email: string }[]>([]);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState("");
  const [responsavel, setResponsavel]     = useState("");

  // Pedido vinculado — button in header
  const [vinculadoPedido, setVinculadoPedido] = useState<PedidoOption | null>(null);
  const [pcPopoverOpen, setPcPopoverOpen]     = useState(false);
  const [pedidoSearch, setPedidoSearch]       = useState("");
  const [pedidoOptions, setPedidoOptions]     = useState<PedidoOption[]>([]);
  const [pedidoLoading, setPedidoLoading]     = useState(false);
  const pcPopoverRef = useRef<HTMLDivElement>(null);

  // Anti-duplicidade — PCs compatíveis sugeridos quando o DE não está vinculado
  const [pcMatches, setPcMatches]             = useState<MatchResult[]>([]);
  const [pcMatchLoading, setPcMatchLoading]   = useState(false);
  const [avulsoConfirmed, setAvulsoConfirmed] = useState(false);
  const matchReqId = useRef(0);

  // Popup de escolha ao abrir a tela: vincular um PC ou marcar como avulso.
  // Pulado quando o PC já vem pela URL (?pedidoId=).
  const [choiceOpen, setChoiceOpen] = useState(() => !searchParams.get("pedidoId"));
  const [choiceStep, setChoiceStep] = useState<"choose" | "vincular">("choose");
  // PCs com itens expandidos na lista de vínculo
  const [expandedPcs, setExpandedPcs] = useState<Set<string>>(() => new Set());

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
  const { closeCurrentTab } = useTabsContext();

  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "documento de entrada",
    onNew: () => { window.location.href = "/suprimentos/conferencias/novo"; },
    viewHref: (id) => `/suprimentos/conferencias/${id}`,
  });

  // Load fornecedores
  useEffect(() => {
    fetch("/api/suprimentos/fornecedores")
      .then((r) => r.json())
      .then((j) => setFornecedores(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Load usuarios
  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((j) => setUsuarios(Array.isArray(j) ? j : (j.data ?? [])))
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

  // Busca PCs para vincular. Sem termo → lista os PCs "em aberto" (sem DE);
  // com termo → filtra por número/fornecedor. Sempre semDE=1 (só dá para
  // vincular um PC que ainda não tem Documento de Entrada).
  const searchPedidos = useCallback(async (q: string) => {
    setPedidoLoading(true);
    try {
      const qs = q.trim()
        ? `search=${encodeURIComponent(q.trim())}&semDE=1&limit=10`
        : `semDE=1&limit=20`;
      const res = await fetch(`/api/suprimentos/pedidos-compra?${qs}`);
      const json = await res.json();
      setPedidoOptions(json.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setPedidoLoading(false);
    }
  }, []);

  // O seletor de PC está ativo no popover do header OU no passo "vincular" do popup.
  const pcPickerOpen = pcPopoverOpen || (choiceOpen && choiceStep === "vincular");

  // Ao abrir o seletor, carrega os PCs em aberto na hora; ao digitar, debounce.
  useEffect(() => {
    if (!pcPickerOpen) return;
    const t = setTimeout(() => searchPedidos(pedidoSearch), pedidoSearch.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [pcPickerOpen, pedidoSearch, searchPedidos]);

  // Ao fechar o seletor, recolhe os itens expandidos (estado é compartilhado
  // entre o popover do header e o popup de escolha).
  useEffect(() => {
    if (!pcPickerOpen) setExpandedPcs(new Set());
  }, [pcPickerOpen]);

  // Agrupa os PCs da lista de vínculo por fornecedor (ordem alfabética).
  const pedidoGroups = useMemo(() => {
    const map = new Map<string, { nome: string; pedidos: PedidoOption[] }>();
    for (const p of pedidoOptions) {
      const nome = p.fornecedor.nomeFantasia || p.fornecedor.razaoSocial || "Sem fornecedor";
      const key = p.fornecedor.id || nome;
      if (!map.has(key)) map.set(key, { nome, pedidos: [] });
      map.get(key)!.pedidos.push(p);
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pedidoOptions]);

  // Chave estável dos itens escolhidos (ids únicos, ordenados) para disparar a busca
  const itemIdsKey = useMemo(() => {
    const ids = Array.from(new Set(itens.map((r) => r.itemId).filter(Boolean)));
    ids.sort();
    return ids.join(",");
  }, [itens]);

  // Anti-duplicidade: busca PCs compatíveis (debounce) quando há fornecedor + itens
  // e nenhum PC já vinculado. Protege contra respostas fora de ordem com matchReqId.
  useEffect(() => {
    if (vinculadoPedido || !fornecedorId || !itemIdsKey) {
      setPcMatches([]);
      setPcMatchLoading(false);
      return;
    }
    const id = ++matchReqId.current;
    const ctrl = new AbortController();
    setPcMatchLoading(true);
    const t = setTimeout(() => {
      fetch(
        `/api/suprimentos/pedidos-compra/match?fornecedorId=${encodeURIComponent(fornecedorId)}&itemIds=${encodeURIComponent(itemIdsKey)}`,
        { signal: ctrl.signal }
      )
        .then((r) => r.json())
        .then((j) => {
          if (id !== matchReqId.current) return;
          setPcMatches(Array.isArray(j.matches) ? j.matches : []);
          setPcMatchLoading(false);
        })
        .catch(() => {
          if (id !== matchReqId.current) return;
          setPcMatchLoading(false);
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [fornecedorId, vinculadoPedido, itemIdsKey]);

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

  // Fecha o popup de escolha e volta ao passo inicial.
  function closeChoice() {
    setChoiceOpen(false);
    setChoiceStep("choose");
    setPedidoSearch("");
    setExpandedPcs(new Set());
  }

  // Expande/recolhe os itens de um PC na lista de vínculo.
  function toggleExpand(id: string) {
    setExpandedPcs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        quantidadeRecebida: "0",
        vlrUnitario: "",
        desconto: "",
        vlrTotal: "",
        vlrIPI: "",
        vlrICMS: "",
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

  function updateItemAndCalc(key: string, field: "vlrUnitario" | "quantidadeRecebida" | "desconto", value: string) {
    setItens((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        const updated = { ...r, [field]: value };
        const qtd  = parseFloat(field === "quantidadeRecebida" ? value : r.quantidadeRecebida) || 0;
        const unit = parseFloat(field === "vlrUnitario" ? value : r.vlrUnitario) || 0;
        const pct  = parseFloat(field === "desconto" ? value : r.desconto) || 0;
        if (qtd > 0 && unit > 0) {
          const bruto = qtd * unit;
          updated.vlrTotal = (bruto - (bruto * pct) / 100).toFixed(2);
        }
        return updated;
      })
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
  const vlrMercadoria = itens.reduce((s, r) => s + (parseFloat(r.vlrTotal) || 0), 0);
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

    if (!responsavel) {
      setError("Selecione o responsável pela conferência.");
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

    // Anti-duplicidade: se há PC compatível e o usuário não vinculou nem confirmou avulso
    if (!vinculadoPedido && !avulsoConfirmed && pcMatches.length > 0) {
      setError("Existe Pedido de Compra compatível. Vincule um PC ou confirme que este é um documento avulso.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fornecedorId,
        responsavel: responsavel || null,
        pedidoId: vinculadoPedido?.id ?? null,
        confirmAvulso: avulsoConfirmed,
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
          quantidadeRecebida: parseFloat(r.quantidadeRecebida) || 0,
          vlrUnitario: parseFloat(r.vlrUnitario) || null,
          desconto: parseFloat(r.desconto) || null,
          vlrTotal: parseFloat(r.vlrTotal) || null,
          vlrIPI: parseFloat(r.vlrIPI) || null,
          vlrICMS: parseFloat(r.vlrICMS) || null,
          localEstoqueId: r.localEstoqueId || null,
          tipoEntrada: r.tipoEntrada || null,
          codFiscal: r.codFiscal || null,
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
        // Servidor detectou PC compatível — mostra os candidatos no banner
        if (json.error === "PC_COMPATIVEL") {
          setPcMatches(Array.isArray(json.matches) ? json.matches : []);
          setAvulsoConfirmed(false);
          setError(json.message || "Existe Pedido de Compra compatível. Vincule um PC ou confirme que este é um documento avulso.");
          return;
        }
        setError(json.error || "Erro ao criar documento");
        return;
      }
      confirmCreated(json.data.id);
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
              variant="outline"
              size="sm"
              onClick={() => setPcPopoverOpen((v) => !v)}
              className={cn(
                "gap-1.5 transition-colors",
                vinculadoPedido
                  // Vinculado: azul sólido (vínculo ativo)
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                  // Sem vínculo: azul claro (clicável, mas nada vinculado ainda)
                  : "border-blue-300 bg-info/10 text-info hover:bg-info/15 hover:text-info"
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
              <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-card rounded-xl border border-border shadow-xl overflow-hidden">
                {/* Search */}
                <div className="p-3 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={pedidoSearch}
                      onChange={(e) => setPedidoSearch(e.target.value)}
                      placeholder="Buscar PC… (ou escolha um abaixo)"
                      className="w-full pl-8 pr-3 h-8 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Lista agrupada por fornecedor (mesmo componente do popup de escolha) */}
                <PcLinkList
                  pedidoOptions={pedidoOptions}
                  pedidoGroups={pedidoGroups}
                  loading={pedidoLoading}
                  searchActive={!!pedidoSearch.trim()}
                  expandedPcs={expandedPcs}
                  onToggleExpand={toggleExpand}
                  onSelect={selectPedido}
                  maxHeightClass="max-h-72"
                />

                {/* Linked summary */}
                {vinculadoPedido && (
                  <div className="px-4 py-2.5 bg-info/10 border-t border-info/20 flex items-center justify-between">
                    <span className="text-xs font-medium text-info flex items-center gap-1">
                      <Link2 className="w-3 h-3" /> {vinculadoPedido.numero}
                    </span>
                    <Link
                      href={`/suprimentos/pedidos-compra/${vinculadoPedido.id}`}
                      target="_blank"
                      className="text-xs text-info hover:underline flex items-center gap-0.5"
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
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Anti-duplicidade: PCs compatíveis ────────────────────────────── */}
        {!vinculadoPedido && !avulsoConfirmed && pcMatchLoading && pcMatches.length === 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-border border-t-transparent rounded-full animate-spin" />
            Verificando Pedidos de Compra compatíveis…
          </div>
        )}

        {!vinculadoPedido && !avulsoConfirmed && pcMatches.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm text-warning">
                <p className="font-medium">
                  {pcMatches.length === 1
                    ? "Encontramos 1 Pedido de Compra compatível com este documento."
                    : `Encontramos ${pcMatches.length} Pedidos de Compra compatíveis com este documento.`}
                </p>
                <p className="text-xs text-warning mt-0.5">
                  Mesmo fornecedor e itens em comum. Vincule um deles para dar baixa automática na Solicitação e no Pedido, ou confirme que este é um documento avulso.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {pcMatches.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 bg-card border border-amber-100 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-foreground text-sm">{m.numero}</span>
                      {m.necessidadeNumero && (
                        <span className="text-xs text-muted-foreground">SC {m.necessidadeNumero}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                        {m.matchCount} de {m.totalItens} {m.totalItens === 1 ? "item" : "itens"} em comum
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.fornecedor.nomeFantasia || m.fornecedor.razaoSocial}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/suprimentos/pedidos-compra/${m.id}`}
                      target="_blank"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        selectPedido({
                          id: m.id,
                          numero: m.numero,
                          fornecedor: m.fornecedor,
                          itens: m.itens,
                        })
                      }
                      className="h-7 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Link2 className="w-3 h-3" /> Vincular
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setAvulsoConfirmed(true)}
                className="text-xs text-warning hover:text-amber-900 underline"
              >
                Não, este é um documento avulso
              </button>
            </div>
          </div>
        )}

        {!vinculadoPedido && avulsoConfirmed && (
          <div className="flex items-center justify-between bg-muted border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
            <span>Documento avulso — sem vínculo com Pedido de Compra.</span>
            <button
              type="button"
              onClick={() => setAvulsoConfirmed(false)}
              className="text-muted-foreground hover:text-muted-foreground underline"
            >
              Revisar
            </button>
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
              <Label className="text-xs text-muted-foreground">Tipo de Documento</Label>
              <select
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value as "NF" | "SN")}
                className="w-full h-9 px-3 border border-border rounded-md text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="NF">NF — Nota Fiscal</option>
                <option value="SN">SN — Sem Nota</option>
              </select>
            </div>

            {/* Número NF */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Número NF
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : numeroNF}
                onChange={(e) => setNumeroNF(e.target.value)}
                placeholder={isSN ? "—" : "000000"}
                disabled={isSN}
                className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
              />
            </div>

            {/* Série */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Série
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder={isSN ? "—" : "1"}
                disabled={isSN}
                className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
              />
            </div>

            {/* DT Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">DT Emissão</Label>
              <Input
                type="date"
                value={dtEmissao}
                onChange={(e) => setDtEmissao(e.target.value)}
              />
            </div>

            {/* Espécie de Documento */}
            <div className="space-y-1.5">
              <Label className={cn("text-xs", isSN ? "text-muted-foreground/60" : "text-muted-foreground")}>
                Espécie de Documento
                {isSN && <span className="ml-1 text-[10px] italic">(não obrigatório)</span>}
              </Label>
              <Input
                value={isSN ? "" : espDocumento}
                onChange={(e) => setEspDocumento(e.target.value)}
                placeholder={isSN ? "—" : "SPED"}
                disabled={isSN}
                className={isSN ? "bg-muted text-muted-foreground/60 cursor-not-allowed" : ""}
              />
            </div>

            {/* UF Origem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">UF Origem</Label>
              <ComboboxWithCreate
                value={ufOrigem}
                onChange={(v) => setUfOrigem(v)}
                placeholder="Selecione..."
                noneLabel="Selecione..."
                triggerClassName="h-9 rounded-md"
                options={UF_LIST.map((uf) => ({ value: uf, label: uf }))}
              />
            </div>

            {/* Loja (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Loja</Label>
              <Input value="01" readOnly className="bg-muted" />
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
                <Label className="text-xs text-muted-foreground">
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
                  <Label className="text-xs text-muted-foreground">CNPJ / CPF</Label>
                  <Input
                    value={selectedFornecedor.cpfCnpj ?? "—"}
                    readOnly
                    className="bg-muted font-mono"
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
                <Label className="text-xs text-muted-foreground">Modo de entrada</Label>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
                  <button
                    type="button"
                    onClick={() => handleModoChange("GLOBAL")}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      modoLocalEstoque === "GLOBAL"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
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
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Por Item
                  </button>
                </div>
              </div>

              {/* Global selector */}
              {modoLocalEstoque === "GLOBAL" && (
                <div className="space-y-1.5 flex-1 max-w-xs">
                  <Label className="text-xs text-muted-foreground">
                    Local de Estoque <span className="text-red-500">*</span>
                  </Label>
                  <ComboboxWithCreate
                    value={localEstoqueGlobalId}
                    onChange={handleGlobalLocalChange}
                    placeholder="Selecionar local..."
                    noneLabel="Selecionar local"
                    triggerClassName={cn("h-9 rounded-md", !localEstoqueGlobalId && "border-red-300")}
                    options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                  />
                </div>
              )}

              {modoLocalEstoque === "POR_ITEM" && (
                <p className="text-xs text-muted-foreground self-end pb-1.5">
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
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs w-8">#NF</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Produto</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs min-w-[180px]">Descrição</th>
                    {modoLocalEstoque === "POR_ITEM" && (
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs min-w-[130px]">
                        Local Estoque <span className="text-red-500">*</span>
                      </th>
                    )}
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs w-14">U.M.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Qtd. Pedida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Qtd. Recebida</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Vlr. Unit.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-20">% Desc.</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Vlr. Total</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Vlr. IPI</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">Vlr. ICMS</th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs w-20">Status</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itens.map((row, idx) => {
                    const prodSearch = prodSearchMap[row._key] ?? row.descricao ?? "";
                    const qtdPedida   = parseFloat(row.quantidadePedida) || 0;
                    const qtdRecebida = parseFloat(row.quantidadeRecebida) || 0;
                    const itemStatus  = getItemStatus(qtdPedida, qtdRecebida);

                    return (
                      <tr key={row._key} className="hover:bg-muted">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>

                        {/* Produto — código */}
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {row.codigo || "—"}
                        </td>

                        {/* Descrição — search cell */}
                        <td className="px-3 py-2">
                          <ProdSearchCell
                            rowKey={row._key}
                            value={prodSearch}
                            produtos={produtos}
                            onSelect={selectProduto}
                            onClear={(key) => {
                              updateItem(key, "itemId", "");
                              updateItem(key, "codigo", "");
                              updateItem(key, "descricao", "");
                              setProdSearchMap((prev) => ({ ...prev, [key]: "" }));
                            }}
                          />
                        </td>

                        {/* Local Estoque — only in Por Item mode */}
                        {modoLocalEstoque === "POR_ITEM" && (
                          <td className="px-3 py-2">
                            <ComboboxWithCreate
                              value={row.localEstoqueId}
                              onChange={(v) => updateItem(row._key, "localEstoqueId", v)}
                              noneLabel="—"
                              triggerClassName={cn("h-7 rounded text-xs", !row.localEstoqueId && "border-red-400 bg-danger/10 text-danger")}
                              options={locaisEstoque.map((l) => ({ value: l.id, label: l.nome }))}
                            />
                          </td>
                        )}

                        {/* U.M. */}
                        <td className="px-3 py-2">
                          <span className="text-xs text-muted-foreground">{row.unidadeMedida || "—"}</span>
                        </td>

                        {/* Qtd. Pedida */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.quantidadePedida}
                            onChange={(e) => updateItem(row._key, "quantidadePedida", e.target.value)}
                            className="w-20 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* Qtd. Recebida */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.quantidadeRecebida}
                            onChange={(e) => updateItemAndCalc(row._key, "quantidadeRecebida", e.target.value)}
                            className="w-20 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* Vlr. Unit */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.vlrUnitario}
                            onChange={(e) => updateItemAndCalc(row._key, "vlrUnitario", e.target.value)}
                            className="w-24 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* % Desc. */}
                        <td className="px-3 py-2">
                          <div className="relative w-20 ml-auto">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={row.desconto}
                              onChange={(e) => updateItemAndCalc(row._key, "desconto", e.target.value)}
                              className="w-20 text-right h-7 text-xs pr-5"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                          </div>
                        </td>

                        {/* Vlr. Total */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.vlrTotal}
                            onChange={(e) => updateItem(row._key, "vlrTotal", e.target.value)}
                            className="w-24 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* Vlr. IPI */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.vlrIPI}
                            onChange={(e) => updateItem(row._key, "vlrIPI", e.target.value)}
                            className="w-24 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* Vlr. ICMS */}
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.vlrICMS}
                            onChange={(e) => updateItem(row._key, "vlrICMS", e.target.value)}
                            className="w-24 ml-auto text-right h-7 text-xs"
                          />
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${itemStatus.cls}`}>
                            {itemStatus.label}
                          </span>
                        </td>

                        {/* Delete */}
                        <td className="px-3 py-2">
                          {itens.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRow(row._key)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
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
                <Label className="text-xs text-muted-foreground">Vlr. Mercadoria</Label>
                <Input value={formatBRL(vlrMercadoria)} readOnly className="bg-muted text-right font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Frete</Label>
                <Input type="number" step="0.01" min="0" value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Seguro</Label>
                <Input type="number" step="0.01" min="0" value={seguro} onChange={(e) => setSeguro(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Despesas</Label>
                <Input type="number" step="0.01" min="0" value={despesas} onChange={(e) => setDespesas(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Desconto</Label>
                <Input type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vlr. Bruto</Label>
                <Input value={formatBRL(vlrBruto)} readOnly className="bg-info/10 text-right font-bold text-blue-900 border-info/30" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Responsável ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1.5 max-w-xs">
              <Label>
                Responsável pela Conferência <span className="text-red-500">*</span>
              </Label>
              <ComboboxWithCreate
                value={usuarioResponsavelId}
                onChange={(v) => {
                  setUsuarioResponsavelId(v);
                  setResponsavel(usuarios.find((u) => u.id === v)?.nome ?? "");
                }}
                placeholder="— Selecionar usuário —"
                noneLabel="Selecionar usuário"
                triggerClassName={cn("h-9 rounded-md", !usuarioResponsavelId && "border-red-300")}
                options={usuarios.map((u) => ({ value: u.id, label: u.nome }))}
              />
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

      {/* ── Popup de escolha (vincular PC ou avulso) ──────────────────────── */}
      {choiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
                {choiceStep === "choose"
                  ? "Como deseja criar este documento?"
                  : "Vincular a um Pedido de Compra"}
              </h2>
              {/* Sem escape "silencioso": no passo de escolha o X fecha o
                  diálogo E a página (aba), pois ficar no formulário sem optar é
                  justamente o que queremos impedir; no passo de vínculo o X
                  apenas retorna à escolha. Assim o usuário é obrigado a optar
                  (vincular ou avulso) — ou fechar a página de vez. */}
              {choiceStep === "choose" ? (
                <button
                  type="button"
                  onClick={closeCurrentTab}
                  className="text-muted-foreground hover:text-muted-foreground"
                  aria-label="Fechar página"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setChoiceStep("choose"); setPedidoSearch(""); }}
                  className="text-muted-foreground hover:text-muted-foreground"
                  aria-label="Voltar"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {choiceStep === "choose" ? (
              <div className="p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para evitar registros duplicados, informe se esta entrada vem de um Pedido de Compra.
                </p>

                {/* Vincular */}
                <button
                  type="button"
                  onClick={() => setChoiceStep("vincular")}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-info/30 bg-info/10 hover:bg-info/15 text-left transition-colors"
                >
                  <Link2 className="w-5 h-5 text-info mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-info">
                      Vincular a um Pedido de Compra
                    </span>
                    <span className="block text-xs text-info mt-0.5">
                      Puxa fornecedor e itens do PC e dá baixa automática na Solicitação e no Pedido ao concluir.
                    </span>
                  </span>
                </button>

                {/* Avulso */}
                <button
                  type="button"
                  onClick={() => { setAvulsoConfirmed(true); closeChoice(); }}
                  className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted text-left transition-colors"
                >
                  <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Não, é um documento avulso
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Entrada sem Pedido de Compra. Você preenche fornecedor e itens manualmente.
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <div>
                {/* Search */}
                <div className="p-4 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      autoFocus
                      type="text"
                      value={pedidoSearch}
                      onChange={(e) => setPedidoSearch(e.target.value)}
                      placeholder="Buscar PC… (ou escolha um abaixo)"
                      className="w-full pl-8 pr-3 h-9 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Lista agrupada por fornecedor (componente compartilhado) */}
                <PcLinkList
                  pedidoOptions={pedidoOptions}
                  pedidoGroups={pedidoGroups}
                  loading={pedidoLoading}
                  searchActive={!!pedidoSearch.trim()}
                  expandedPcs={expandedPcs}
                  onToggleExpand={toggleExpand}
                  onSelect={(p) => { selectPedido(p); closeChoice(); }}
                  maxHeightClass="max-h-72"
                />

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                  <button
                    type="button"
                    onClick={() => { setChoiceStep("choose"); setPedidoSearch(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAvulsoConfirmed(true); closeChoice(); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    É um documento avulso
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {createdDialog}
    </div>
  );
}

// ── Lista de PCs para vincular (compartilhada) ───────────────────────────────
// Mesma UI usada no popover do botão "Vincular PC" e no popup de escolha:
// agrupada por fornecedor, com nº/itens/valor e expandir para ver os itens.
function PcLinkList({
  pedidoOptions,
  pedidoGroups,
  loading,
  searchActive,
  expandedPcs,
  onToggleExpand,
  onSelect,
  maxHeightClass = "max-h-72",
}: {
  pedidoOptions: PedidoOption[];
  pedidoGroups: { nome: string; pedidos: PedidoOption[] }[];
  loading: boolean;
  searchActive: boolean;
  expandedPcs: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (p: PedidoOption) => void;
  maxHeightClass?: string;
}) {
  return (
    <div className={cn(maxHeightClass, "overflow-y-auto")}>
      {loading && pedidoOptions.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground italic text-center">Carregando…</p>
      ) : pedidoOptions.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground italic text-center">
          {searchActive ? "Nenhum resultado." : "Nenhum Pedido de Compra em aberto para vincular."}
        </p>
      ) : pedidoGroups.map((g) => (
        <div key={g.nome}>
          <div className="px-4 py-1.5 bg-muted border-b border-border">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {g.nome}
            </span>
          </div>
          {g.pedidos.map((p) => {
            const expanded = expandedPcs.has(p.id);
            return (
              <div key={p.id} className="border-b border-gray-50 last:border-0">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="flex-1 flex items-center justify-between px-4 py-2.5 text-sm hover:bg-info/10 text-left transition-colors"
                  >
                    <span className="font-mono font-semibold text-foreground">{p.numero}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {p.itens.length} {p.itens.length === 1 ? "item" : "itens"}
                      </span>
                      <span className="font-semibold text-foreground">
                        {p.valorTotal != null ? formatBRL(decimalToNumber(p.valorTotal)) : "—"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand(p.id); }}
                    className="px-3 text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                    aria-label={expanded ? "Ocultar itens" : "Ver itens"}
                  >
                    <ChevronRight className={cn("w-4 h-4 transition-transform", expanded && "rotate-90")} />
                  </button>
                </div>
                {expanded && (
                  <ul className="px-4 pb-2.5 pt-0.5 bg-muted/60 space-y-1">
                    {p.itens.map((it) => (
                      <li key={it.id} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                        <span className="font-mono text-muted-foreground shrink-0 w-24 text-right">
                          {decimalToNumber(it.quantidade)} {it.item.unidadeMedida}
                        </span>
                        <span className="font-mono text-muted-foreground shrink-0">{it.item.codigo}</span>
                        <span className="truncate">{it.item.descricao}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
