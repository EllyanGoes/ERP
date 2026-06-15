"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Search, Loader2, Tag, Package } from "lucide-react";
import { formatBRL, decimalToNumber, cn, parseDecimal } from "@/lib/utils";
import { useSession } from "@/lib/session-context";
import { useVoltarCriacao } from "@/components/shared/CreateDrawer";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import PagamentosInput, {
  novaLinhaPagamento, parseValorBR,
  type LinhaPagamento, type FormaOpt,
} from "@/components/pedidos-venda/PagamentosInput";

// ── Types ──────────────────────────────────────────────────────────────────────

type ClienteOption    = { id: string; razaoSocial: string; nomeFantasia: string | null };
type ItemUnidadeOption = { unidadeId: string; fatorConversao: unknown; unidade: { id: string; sigla: string; nome: string } };
type ItemOption       = {
  id: string; codigo: string; descricao: string; precoVenda: unknown; unidadeMedida: string;
  unidade?: { id: string; sigla: string } | null;
  itemUnidades?: ItemUnidadeOption[];
};
type TabelaOption     = {
  id: string; codigo: string; descricao: string; empresaId?: string;
  condicaoPagamento: string | null; ativa: boolean;
  itens: Array<{ itemId: string | null; precoVenda: unknown; vlrDesconto: unknown }>;
};
type CondicaoOption   = { id: string; nome: string };
type ItemComodatoOption = { id: string; codigo: string; descricao: string; precoVenda: number };

// Comodato já lançado (modo edição) — vem do banco para pré-preencher o rascunho.
type ComodatoInicial = { id: string; itemId: string; quantidade: unknown; valorUnitario: unknown; documento: string | null };

type ComodatoLine = {
  _key: string;
  id?: string;          // id da movimentação existente (edição); vazio = nova linha
  itemId: string;
  quantidade: string;
  valorUnitario: string;
  documento: string;
};

type LineItem = {
  _key: string;
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string;           // sigla da unidade selecionada (display)
  unidadeId: string;         // id da unidade selecionada
  unidadeBaseId: string;     // id da unidade base do item
  fatorConversao: number;    // qty_digitada × fator = qty_base
  itemUnidades: ItemUnidadeOption[]; // unidades disponíveis para o item
  quantidade: string;           // em unidade selecionada (ex: PLT)
  quantidadeUnitaria: string;   // em unidade base = quantidade × fator (ex: 400 UN)
  precoUnitario: string;        // preço por unidade base
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
    unidadeId: "", unidadeBaseId: "", fatorConversao: 1, itemUnidades: [],
    quantidade: "1", quantidadeUnitaria: "1", precoUnitario: "0",
    descontoPct: "0", valorDesconto: "0", valorTotal: "0",
  };
}

function emptyComodatoLine(): ComodatoLine {
  return { _key: crypto.randomUUID(), id: "", itemId: "", quantidade: "1", valorUnitario: "0", documento: "" };
}

// Pré-preenche o rascunho de comodato a partir das movimentações já gravadas (edição).
function buildInitialComodato(movs?: ComodatoInicial[]): ComodatoLine[] {
  if (!movs || movs.length === 0) return [];
  return movs.map((m) => ({
    _key: crypto.randomUUID(),
    id: m.id,
    itemId: m.itemId,
    quantidade: decimalToNumber(m.quantidade).toString(),
    valorUnitario: decimalToNumber(m.valorUnitario).toFixed(2),
    documento: m.documento ?? "",
  }));
}

// ── Edit mode ────────────────────────────────────────────────────────────────

type PedidoInicialItem = {
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeSigla: string;
  unidadeBaseId: string;
  itemUnidades: ItemUnidadeOption[];
  quantidade: unknown;
  precoUnitario: unknown;
  desconto: unknown;     // valor do desconto em R$
  valorTotal: unknown;
};

type PedidoInicial = {
  id: string;
  numero: string;
  numeroOrcamento: string | null;
  clienteId: string;
  tabelaPrecoId: string | null;
  vendedorId: string | null;
  dataEmissao: string;   // ISO
  dataEntrega: string | null;
  condicaoPagamento: string | null;
  naturezaFinanceiraId?: string | null;
  formaPagamento: string | null;
  pagamentos?: { forma: string; valor: unknown; contaBancariaId?: string | null }[];
  pago?: boolean;   // pedido já recebido → conta de destino editável
  pagamentoData?: string | null; // data do recebimento (YYYY-MM-DD), editável se pago
  valorFrete: unknown;
  observacoes: string | null;
  itens: PedidoInicialItem[];
};

// Date-only value stored as UTC midnight → "YYYY-MM-DD" for <input type="date">.
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// "Hoje" no fuso de São Paulo (YYYY-MM-DD) para o default da data de emissão,
// evitando que perto da meia-noite a data UTC mostre o dia seguinte.
function hojeInputSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // en-CA já entrega "YYYY-MM-DD"
}

function buildInitialLinhas(pedido?: PedidoInicial): LineItem[] {
  if (!pedido) return [];
  return pedido.itens.map((it) => {
    const qty     = decimalToNumber(it.quantidade);
    const price   = decimalToNumber(it.precoUnitario);
    const vlrDesc = decimalToNumber(it.desconto);
    const total   = decimalToNumber(it.valorTotal);
    const bruto   = qty * price;
    const pct     = bruto > 0 ? (vlrDesc / bruto) * 100 : 0;
    return {
      _key: crypto.randomUUID(),
      itemId: it.itemId,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidadeSigla,
      unidadeId: it.unidadeBaseId,
      unidadeBaseId: it.unidadeBaseId,
      fatorConversao: 1,
      itemUnidades: it.itemUnidades ?? [],
      quantidade: qty.toString(),
      quantidadeUnitaria: qty.toString(),
      precoUnitario: price.toFixed(2),
      descontoPct: pct.toFixed(4),
      valorDesconto: vlrDesc.toFixed(2),
      valorTotal: total.toFixed(2),
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PedidoForm({
  clientes,
  itens: catalogItens,
  itensComodato = [],
  comodatoInicial = [],
  pedido,
  modalidade,
}: {
  clientes:      ClienteOption[];
  itens:         ItemOption[];
  itensComodato?: ItemComodatoOption[];
  comodatoInicial?: ComodatoInicial[];
  pedido?:       PedidoInicial;
  modalidade?:   "BALCAO" | "AGENDADA"; // só na criação; define o tipo do pedido
}) {
  const router = useRouter();
  const isEdit = !!pedido;
  // Ao editar, mantém o código do PV no título da aba (mesma aba do detalhe).
  useTabTitle(pedido?.numero);
  const { replaceCurrentTab } = useTabsContext();
  const { confirmCreated, dialog: createdDialog } = useCreateFlow({
    entity: "pedido",
    onNew: () => { window.location.href = "/pedidos-venda/novo"; },
    viewHref: (id) => `/pedidos-venda/${id}`,
  });
  const [submitting, setSubmitting] = useState<"orcamento" | "confirmado" | "salvando" | null>(null);
  const [submitError, setSubmitError] = useState("");

  // Header form
  const CONSUMIDOR_FINAL_ID = "cli_consumidor_final"; // seed da migração 20260613110000
  const [clienteId,         setClienteId]         = useState(pedido?.clienteId ?? "");
  const { user: usuarioSessao } = useSession();
  const voltarLista = useVoltarCriacao("/pedidos-venda");
  const empresasGrupo = usuarioSessao?.empresas ?? [];
  // Campo Empresa só aparece na criação quando há mais de uma empresa no grupo.
  const mostrarEmpresa = !pedido && empresasGrupo.length > 1;
  const [empresaId, setEmpresaId] = useState(""); // "" = empresa ativa (só na criação)
  // Venda à ordem (triangular): estoque sai de outra empresa do grupo, que cria
  // automaticamente o pedido de entrega ao confirmar.
  const [estoqueOrigemId, setEstoqueOrigemId] = useState("");
  const [precoTransferencia, setPrecoTransferencia] = useState("");
  const [numeroOrcamento,   setNumeroOrcamento]   = useState(pedido?.numeroOrcamento ?? "");
  const [tabelaPrecoId,     setTabelaPrecoId]     = useState(pedido?.tabelaPrecoId ?? "");
  const [vendedorId,        setVendedorId]        = useState(pedido?.vendedorId ?? "");
  const [vendedores,        setVendedores]        = useState<{ id: string; nome: string; ativo?: boolean }[]>([]);
  const [dataEmissao,       setDataEmissao]       = useState(pedido ? isoToDateInput(pedido.dataEmissao) : hojeInputSP());
  const [dataEntrega,       setDataEntrega]       = useState(pedido ? isoToDateInput(pedido.dataEntrega) : "");
  const [condicaoPagamento, setCondicaoPagamento] = useState(pedido?.condicaoPagamento ?? "");
  // Pagamento misto: formas previstas com valores (PIX + dinheiro etc.).
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>(
    pedido?.pagamentos && pedido.pagamentos.length > 0
      ? pedido.pagamentos.map((p) => novaLinhaPagamento(p.forma, p.contaBancariaId ?? "", decimalToNumber(p.valor).toFixed(2).replace(".", ",")))
      : [novaLinhaPagamento(pedido?.formaPagamento ?? "")],
  );
  // Pedido já pago → mostra e permite editar a conta de destino de cada forma.
  const pago = pedido?.pago === true;
  const [contas, setContas] = useState<{ id: string; nome: string; tipo?: string; ativo?: boolean }[]>([]);
  // Data do recebimento (editável quando pago) — move o lançamento no caixa.
  const [pagamentoData, setPagamentoData] = useState(pedido?.pagamentoData ?? "");
  const [valorFrete,        setValorFrete]        = useState(pedido ? decimalToNumber(pedido.valorFrete).toString() : "0");
  const [observacoes,       setObservacoes]       = useState(pedido?.observacoes ?? "");

  // Tabelas de Preço
  const [tabelas,        setTabelas]        = useState<TabelaOption[]>([]);
  const [tabelaLoading,  setTabelaLoading]  = useState(false);
  const tabelaSelecionada = tabelas.find((t) => t.id === tabelaPrecoId) ?? null;

  // Condições de Pagamento
  const [condicoes,         setCondicoes]         = useState<CondicaoOption[]>([]);
  const [condicoesLoading,  setCondicoesLoading]  = useState(false);
  // Natureza financeira (entrada) dos títulos a gerar.
  const [naturezaFinanceiraId, setNaturezaFinanceiraId] = useState(pedido?.naturezaFinanceiraId ?? "");
  const [naturezas, setNaturezas] = useState<{ id: string; nome: string; grupo: string }[]>([]);
  const [condicaoOpen,      setCondicaoOpen]      = useState(false);
  const [condicaoSearch,    setCondicaoSearch]    = useState("");
  const [newCondicaoName,   setNewCondicaoName]   = useState("");
  const [savingCondicao,    setSavingCondicao]    = useState(false);
  const [showNewCondicao,   setShowNewCondicao]   = useState(false);
  const [condicaoDropPos,   setCondicaoDropPos]   = useState<{ top: number; left: number; width: number } | null>(null);
  const condicaoRef       = useRef<HTMLDivElement>(null);
  const condicaoBtnRef    = useRef<HTMLButtonElement>(null);
  const condicaoPortalRef = useRef<HTMLDivElement>(null);

  // Line items
  const [linhas, setLinhas] = useState<LineItem[]>(() => buildInitialLinhas(pedido));

  // Tabs (Itens | Comodato) — disponível no novo pedido e na edição
  const [activeTab, setActiveTab] = useState<"itens" | "comodato">("itens");

  // Comodato (saída) — linhas a lançar/editar junto com o pedido
  const [comodatoLinhas, setComodatoLinhas] = useState<ComodatoLine[]>(() => buildInitialComodato(comodatoInicial));

  // Cliente search
  const [clienteSearch,   setClienteSearch]   = useState("");
  const [clienteOpen,     setClienteOpen]     = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  // Item search popover per line
  const [itemSearchRow,   setItemSearchRow]   = useState<string | null>(null);
  const [itemSearchQ,     setItemSearchQ]     = useState("");
  const [itemResults,     setItemResults]     = useState<ItemOption[]>([]);
  const [itemSearching,   setItemSearching]   = useState(false);
  const [itemDropPos,     setItemDropPos]     = useState<{ top: number; left: number; width: number } | null>(null);
  const [portalMounted,   setPortalMounted]   = useState(false);
  const itemInputRef = useRef<HTMLInputElement>(null);

  // Load tabelas de preço on mount
  useEffect(() => {
    setTabelaLoading(true);
    fetch("/api/comercial/tabelas-preco")
      .then((r) => r.json())
      .then((j) => setTabelas(j.data ?? []))
      .catch(() => {})
      .finally(() => setTabelaLoading(false));
  }, []);

  // Load vendedores on mount
  useEffect(() => {
    fetch("/api/comercial/vendedores?ativo=true")
      .then((r) => r.json())
      .then((j) => setVendedores(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Load condições de pagamento on mount
  useEffect(() => {
    setCondicoesLoading(true);
    fetch("/api/suprimentos/condicoes-pagamento")
      .then((r) => r.json())
      .then((j) => setCondicoes(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {})
      .finally(() => setCondicoesLoading(false));
  }, []);

  // Load formas de pagamento on mount
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  useEffect(() => {
    fetch("/api/suprimentos/formas-pagamento")
      .then((r) => r.json())
      .then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Naturezas financeiras de ENTRADA (classificação dos títulos de venda).
  useEffect(() => {
    fetch("/api/financeiro/naturezas?tipo=ENTRADA&ativo=1")
      .then((r) => r.json())
      .then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, []);

  // Contas bancárias (só quando o pedido já está pago — conta editável).
  useEffect(() => {
    if (!pago) return;
    fetch("/api/financeiro/contas")
      .then((r) => r.json())
      .then((j) => setContas(Array.isArray(j) ? j : (j.data ?? [])))
      .catch(() => {});
  }, [pago]);

  // When tabela changes → update condicaoPagamento auto
  useEffect(() => {
    if (!tabelaSelecionada) return;
    if (tabelaSelecionada.condicaoPagamento) setCondicaoPagamento(tabelaSelecionada.condicaoPagamento);
  }, [tabelaPrecoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tabela é por empresa: trocar a empresa do pedido limpa tabela de outra empresa
  useEffect(() => {
    if (pedido) return;
    const alvo = empresaId || usuarioSessao?.activeEmpresaId;
    const t = tabelas.find((x) => x.id === tabelaPrecoId);
    if (t?.empresaId && alvo && t.empresaId !== alvo) setTabelaPrecoId("");
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside click: close cliente dropdown
  useEffect(() => {
    function h(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node))
        setClienteOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Outside click / scroll: close condição dropdown
  useEffect(() => {
    if (!condicaoOpen) return;
    function closeDD() {
      setCondicaoOpen(false);
      setShowNewCondicao(false);
      setNewCondicaoName("");
      setCondicaoSearch("");
    }
    function h(e: MouseEvent) {
      const t = e.target as Node;
      // Keep open if click is inside trigger button OR inside the portal
      if (condicaoBtnRef.current?.contains(t)) return;
      if (condicaoPortalRef.current?.contains(t)) return;
      closeDD();
    }
    function onScroll(e: Event) {
      if (condicaoPortalRef.current?.contains(e.target as Node)) return;
      closeDD();
    }
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [condicaoOpen]);

  async function saveNovaCondicao() {
    const nome = newCondicaoName.trim();
    if (!nome) return;
    setSavingCondicao(true);
    try {
      const res = await fetch("/api/suprimentos/condicoes-pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (res.ok) {
        const created: CondicaoOption = await res.json();
        setCondicoes((prev) => [...prev, { id: created.id, nome: created.nome }].sort((a, b) => a.nome.localeCompare(b.nome)));
        setCondicaoPagamento(created.nome);
        setCondicaoOpen(false);
        setShowNewCondicao(false);
        setNewCondicaoName("");
        setCondicaoSearch("");
      }
    } finally {
      setSavingCondicao(false);
    }
  }

  useEffect(() => { setPortalMounted(true); }, []);

  // Close item search on outside click or scroll
  useEffect(() => {
    if (!itemSearchRow) return;
    function h(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-item-search]"))
        closeItemSearch();
    }
    function onScroll(e: Event) {
      if ((e.target as HTMLElement).closest?.("[data-item-search]")) return;
      closeItemSearch();
    }
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [itemSearchRow]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeItemSearch() {
    setItemSearchRow(null);
    setItemDropPos(null);
    setItemSearchQ("");
  }

  function openItemSearch(key: string, triggerEl: HTMLElement, initialQ: string) {
    const r = triggerEl.getBoundingClientRect();
    setItemDropPos({
      top:   r.bottom + window.scrollY + 4,
      left:  r.left   + window.scrollX,
      width: Math.max(r.width, 400),
    });
    setItemSearchRow(key);
    setItemSearchQ(initialQ);
    setItemResults(catalogItens.slice(0, 20));
    setTimeout(() => itemInputRef.current?.focus(), 0);
  }

  // Item search — filter on query change
  useEffect(() => {
    if (!itemSearchRow) return;
    const q = itemSearchQ.trim().toLowerCase();
    const filtered = q
      ? catalogItens.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q))
      : catalogItens;
    setItemResults(filtered.slice(0, 20));
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

      // Quando quantidade muda → recalcula quantidadeUnitaria
      if (field === "quantidade") {
        const qty = parseDecimal(value) || 0;
        updated.quantidadeUnitaria = (qty * l.fatorConversao).toFixed(3).replace(/\.?0+$/, "");
      }
      // Quando quantidadeUnitaria é editada diretamente → mantém como está

      // A base de cálculo é sempre quantidadeUnitaria
      const qtdUnit = parseDecimal(
        field === "quantidadeUnitaria" ? value : updated.quantidadeUnitaria
      ) || 0;
      const price = parseDecimal(field === "precoUnitario" ? value : l.precoUnitario) || 0;
      const bruto = qtdUnit * price;

      if (["quantidade", "quantidadeUnitaria", "precoUnitario", "descontoPct"].includes(field)) {
        const pct = parseDecimal(field === "descontoPct" ? value : l.descontoPct) || 0;
        const { valorDesconto, valorTotal } = calcLine(qtdUnit, price, pct);
        updated.valorDesconto = valorDesconto.toFixed(2);
        updated.valorTotal    = valorTotal.toFixed(2);
      } else if (field === "valorDesconto") {
        const vlrDesc = parseDecimal(value) || 0;
        updated.descontoPct = bruto > 0 ? ((vlrDesc / bruto) * 100).toFixed(4) : "0";
        updated.valorTotal  = (bruto - vlrDesc).toFixed(2);
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

    // Base unit info
    const baseUnitId  = prod.unidade?.id ?? "";
    const baseUnitSigla = prod.unidade?.sigla ?? prod.unidadeMedida;
    const itemUnidades  = prod.itemUnidades ?? [];

    setLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const qty = parseDecimal(l.quantidade) || 1;
      // fator = 1 (unidade base selecionada), então qtdUnit = qty
      const { valorDesconto, valorTotal } = calcLine(qty, finalPrice, pct);
      return {
        ...l, itemId: prod.id,
        codigo: prod.codigo, descricao: prod.descricao,
        unidade: baseUnitSigla, unidadeId: baseUnitId,
        unidadeBaseId: baseUnitId, fatorConversao: 1,
        itemUnidades,
        quantidadeUnitaria: qty.toString(),
        precoUnitario: finalPrice.toFixed(2),
        descontoPct:   pct.toFixed(4),
        valorDesconto: valorDesconto.toFixed(2),
        valorTotal:    valorTotal.toFixed(2),
      };
    }));
    setItemSearchRow(null);
    setItemSearchQ("");
  }

  function changeUnidade(key: string, newUnidadeId: string) {
    setLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;

      // Base unit (fator = 1)
      if (newUnidadeId === l.unidadeBaseId || !newUnidadeId) {
        const qty     = parseDecimal(l.quantidade) || 0;
        const qtdUnit = qty; // fator = 1
        const price   = parseDecimal(l.precoUnitario) || 0;
        const pct     = parseDecimal(l.descontoPct) || 0;
        const { valorDesconto, valorTotal } = calcLine(qtdUnit, price, pct);
        return {
          ...l,
          unidadeId: l.unidadeBaseId,
          fatorConversao: 1,
          quantidadeUnitaria: qty.toString(),
          unidade: l.itemUnidades.find((u) => u.unidadeId === l.unidadeBaseId)?.unidade.sigla
            ?? l.unidade,
          valorDesconto: valorDesconto.toFixed(2),
          valorTotal:    valorTotal.toFixed(2),
        };
      }

      // Alternative unit
      const iu = l.itemUnidades.find((u) => u.unidadeId === newUnidadeId);
      if (!iu) return l;
      const fator   = decimalToNumber(iu.fatorConversao) || 1;
      const qty     = parseDecimal(l.quantidade) || 0;
      const qtdUnit = qty * fator;
      const price   = parseDecimal(l.precoUnitario) || 0;
      const pct     = parseDecimal(l.descontoPct) || 0;
      const { valorDesconto, valorTotal } = calcLine(qtdUnit, price, pct);

      return {
        ...l,
        unidadeId: newUnidadeId,
        fatorConversao: fator,
        quantidadeUnitaria: qtdUnit.toFixed(3).replace(/\.?0+$/, ""),
        unidade: iu.unidade.sigla,
        valorDesconto: valorDesconto.toFixed(2),
        valorTotal:    valorTotal.toFixed(2),
      };
    }));
  }

  // ── Comodato (saída) helpers ─────────────────────────────────────────────────

  function addComodatoLinha() {
    setComodatoLinhas((prev) => [...prev, emptyComodatoLine()]);
  }

  function removeComodatoLinha(key: string) {
    setComodatoLinhas((prev) => prev.filter((l) => l._key !== key));
  }

  function updateComodatoLinha(key: string, field: keyof ComodatoLine, value: string) {
    setComodatoLinhas((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const updated = { ...l, [field]: value };
      // Ao escolher o item, auto-preenche o valor unitário com o preço de venda
      if (field === "itemId") {
        const it = itensComodato.find((i) => i.id === value);
        if (it) updated.valorUnitario = it.precoVenda.toFixed(2);
      }
      return updated;
    }));
  }

  // ── Totals ───────────────────────────────────────────────────────────────────

  const subtotal     = linhas.reduce((s, l) => s + (parseDecimal(l.valorTotal) || 0), 0);
  const freteVal     = parseDecimal(valorFrete) || 0;

  const comodatoTotalQtd   = comodatoLinhas.reduce((s, l) => s + (parseDecimal(l.quantidade) || 0), 0);
  const comodatoTotalValor = comodatoLinhas.reduce((s, l) => s + (parseDecimal(l.quantidade) || 0) * (parseDecimal(l.valorUnitario) || 0), 0);

  // O comodato (saída) entra no total do pedido.
  const totalGeral   = subtotal + freteVal + comodatoTotalValor;

  // ── Submit ───────────────────────────────────────────────────────────────────

  function validate(): boolean {
    setSubmitError("");
    if (!clienteId)     { setSubmitError("Selecione o cliente"); return false; }
    if (!dataEmissao)   { setSubmitError("Informe a data de emissão"); return false; }
    if (linhas.length === 0) { setSubmitError("Adicione pelo menos um item"); return false; }
    if (linhas.find((l) => !l.itemId)) { setSubmitError("Selecione o produto em todas as linhas"); return false; }
    if (comodatoLinhas.some((l) => l.itemId && !(parseDecimal(l.quantidade) > 0))) {
      setSubmitError("Informe a quantidade dos itens em comodato");
      return false;
    }
    return true;
  }

  function buildPayload() {
    return {
      ...(pedido ? {} : { empresaId: empresaId || undefined }),
      ...(pedido ? {} : {
        estoqueOrigemEmpresaId: estoqueOrigemId || undefined,
        precoTransferencia: estoqueOrigemId && precoTransferencia ? parseDecimal(precoTransferencia) : undefined,
      }),
      clienteId,
      ...(pedido ? {} : { modalidade: modalidade ?? "AGENDADA" }),
      numeroOrcamento: numeroOrcamento.trim() || null,
      tabelaPrecoId: tabelaPrecoId || null,
      vendedorId: vendedorId || null,
      dataEmissao,
      dataEntrega: dataEntrega || null,
      condicaoPagamento: condicaoPagamento || null,
      // Vincula a condição estruturada (parcelas/prazo) p/ gerar o contas a
      // receber na confirmação. Casa pelo nome selecionado.
      condicaoPagamentoId: condicoes.find((c) => c.nome === condicaoPagamento)?.id ?? null,
      naturezaFinanceiraId: naturezaFinanceiraId || null,
      // Pagamento misto: formas com valores + resumo em texto (formaPagamento)
      // para as exibições/impressões. Linhas vazias são descartadas.
      pagamentos: pagamentos
        .filter((l) => l.forma && parseValorBR(l.valor) > 0)
        // Em pedido já pago, envia a conta de destino (editável) para o back
        // mover o lançamento; nos demais, pagamento é só intenção (sem conta).
        .map((l) => ({ forma: l.forma, valor: parseValorBR(l.valor), ...(pago ? { contaBancariaId: l.contaBancariaId || null } : {}) })),
      // Data do recebimento (só quando pago) — move o lançamento no caixa.
      ...(pago && pagamentoData ? { pagamentoData } : {}),
      formaPagamento: Array.from(new Set(
        pagamentos.filter((l) => l.forma && parseValorBR(l.valor) > 0).map((l) => l.forma),
      )).join(" + ") || null,
      valorDesconto: 0,
      valorFrete: freteVal,
      observacoes: observacoes || null,
      itens: linhas.map((l) => {
        // quantidadeUnitaria já está em unidade base (qty × fator)
        const qtdBase = parseDecimal(l.quantidadeUnitaria) || 0;
        const price   = parseDecimal(l.precoUnitario)      || 0;
        const pct     = parseDecimal(l.descontoPct)        || 0;
        const { valorDesconto, valorTotal } = calcLine(qtdBase, price, pct);
        return {
          itemId:        l.itemId,
          quantidade:    qtdBase,
          precoUnitario: price,
          descontoPct:   pct,
          valorDesconto: valorDesconto,
          desconto:      valorDesconto,
          valorTotal:    valorTotal,
        };
      }),
      // Comodato (saída) lançado junto com o pedido. A rota POST lê esta chave
      // separadamente; o schema do PUT ignora chaves desconhecidas (edição não usa).
      comodato: comodatoLinhas
        .filter((l) => l.itemId && (parseDecimal(l.quantidade) || 0) > 0)
        .map((l) => ({
          id:            l.id || undefined,
          itemId:        l.itemId,
          quantidade:    parseDecimal(l.quantidade) || 0,
          valorUnitario: parseDecimal(l.valorUnitario) || 0,
          documento:     l.documento.trim() || null,
        })),
    };
  }

  async function handleSubmit(status: "ORCAMENTO" | "CONFIRMADO") {
    if (!validate()) return;

    setSubmitting(status === "ORCAMENTO" ? "orcamento" : "confirmado");
    try {
      const res = await fetch("/api/pedidos-venda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
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

      confirmCreated(pedidoId);
    } catch { setSubmitError("Erro de conexão"); }
    finally { setSubmitting(null); }
  }

  async function handleUpdate() {
    if (!pedido || !validate()) return;

    setSubmitting("salvando");
    try {
      const res = await fetch(`/api/pedidos-venda/${pedido.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      if (!res.ok) {
        const json = await res.json();
        setSubmitError(json.error || "Erro ao salvar pedido");
        return;
      }

      // Volta ao detalhe na mesma aba (sem abrir uma nova).
      replaceCurrentTab(`/pedidos-venda/${pedido.id}`);
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
      {/* ── Dados do Pedido — constrained width ─────────────────────────── */}
      <div className="max-w-5xl space-y-6">
      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{submitError}</div>
      )}

      {/* ── Dados do Pedido ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-300 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-100">
          <h2 className="font-bold text-sm text-gray-800 tracking-wide uppercase">Dados do Pedido</h2>
        </div>
        <div className="p-5 space-y-5">

          {/* Empresa + Cliente lado a lado (Empresa some na edição / empresa única) */}
          <div className="grid grid-cols-2 gap-4 items-start">
          {mostrarEmpresa && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Empresa</Label>
              <select
                value={empresaId || usuarioSessao?.activeEmpresaId || ""}
                onChange={(e) => setEmpresaId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
              >
                {empresasGrupo.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400">Para qual empresa do grupo é esta venda — minutas e numeração seguirão nela.</p>
            </div>
          )}

          {/* Cliente */}
          <div className={cn("space-y-1.5", !mostrarEmpresa && "col-span-2")}>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Cliente *</Label>
              {clientes.some((c) => c.id === CONSUMIDOR_FINAL_ID) && clienteId !== CONSUMIDOR_FINAL_ID && (
                <button
                  type="button"
                  onClick={() => { setClienteId(CONSUMIDOR_FINAL_ID); setClienteOpen(false); }}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Consumidor final (sem cadastro)
                </button>
              )}
            </div>
            <div className="relative" ref={clienteRef}>
              <button
                type="button"
                onClick={() => { setClienteOpen((v) => !v); setClienteSearch(""); }}
                className={cn(
                  "w-full flex items-center justify-between h-10 px-3 rounded-lg border text-sm text-left transition-colors",
                  clienteOpen ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-300 hover:border-gray-400",
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
          </div>

          {/* Venda à ordem (triangular): estoque sai de outra empresa do grupo */}
          {mostrarEmpresa && modalidade !== "BALCAO" && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Entrega / estoque por outra empresa</Label>
                <select
                  value={estoqueOrigemId}
                  onChange={(e) => setEstoqueOrigemId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                >
                  <option value="">— Esta empresa entrega (normal) —</option>
                  {empresasGrupo
                    .filter((e) => e.id !== (empresaId || usuarioSessao?.activeEmpresaId))
                    .map((e) => (
                      <option key={e.id} value={e.id}>{e.nome} entrega e baixa do estoque</option>
                    ))}
                </select>
                <p className="text-xs text-gray-500">
                  Venda à ordem: a venda fica nesta empresa, mas outra empresa do grupo entrega e baixa o estoque.
                  Ao confirmar, um pedido de entrega é criado automaticamente nela.
                </p>
              </div>
              {estoqueOrigemId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Preço de transferência (total)</Label>
                  <Input
                    inputMode="decimal"
                    value={precoTransferencia}
                    onChange={(e) => setPrecoTransferencia(e.target.value.replace(/[^0-9.,]/g, ""))}
                    placeholder="Valor interno cobrado pela empresa que entrega"
                    className="h-10 border-gray-300"
                  />
                  <p className="text-xs text-gray-400">Valor que a empresa de origem cobra internamente. Aparece no pedido de entrega; não gera financeiro por ora.</p>
                </div>
              )}
            </div>
          )}

          {/* Vendedor + Nº do Orçamento lado a lado */}
          <div className="grid grid-cols-2 gap-4">
          {/* Vendedor */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Vendedor</Label>
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-400 transition-colors"
            >
              <option value="">— Sem vendedor —</option>
              {vendedores.filter((v) => v.ativo !== false || v.id === vendedorId).map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </div>

          {/* Nº do Orçamento (controle de pedido físico) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nº do Orçamento</Label>
            <Input
              type="text"
              value={numeroOrcamento}
              onChange={(e) => setNumeroOrcamento(e.target.value)}
              placeholder="Número no controle físico"
              className="h-10 border-gray-300"
            />
          </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Data Emissão */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Data de Emissão</Label>
              <Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className="h-10 border-gray-300" />
            </div>

            {/* Previsão de Entrega */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Previsão de Entrega</Label>
              <Input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} className="h-10 border-gray-300" />
            </div>
          </div>

          {/* Tabela de Preço */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tabela de Preço
            </Label>
            <ComboboxWithCreate
              value={tabelaPrecoId}
              onChange={setTabelaPrecoId}
              disabled={tabelaLoading}
              placeholder="— Sem tabela de preço —"
              noneLabel="Sem tabela de preço"
              triggerClassName="h-10 rounded-lg"
              options={tabelas
                .filter((t) => t.ativa !== false)
                // tabelas de preço são por empresa: na criação, só as da
                // empresa do pedido (modo grupo lista as de todas)
                .filter((t) => {
                  if (pedido || !t.empresaId) return true;
                  const alvo = empresaId || usuarioSessao?.activeEmpresaId;
                  return !alvo || t.empresaId === alvo;
                })
                .map((t) => ({
                  value: t.id,
                  label: `${t.codigo} — ${t.descricao}${t.condicaoPagamento ? ` · ${t.condicaoPagamento}` : ""}`,
                }))}
            />
            {tabelaSelecionada && (
              <p className="text-xs text-blue-600 mt-0.5">
                Preços e descontos serão preenchidos automaticamente ao selecionar produtos
              </p>
            )}
          </div>

        </div>
      </div>
      </div>{/* end max-w-5xl */}

      {/* ── Abas: Itens | Comodato ─────────────────────────────────────── */}
      <div className="flex items-center border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("itens")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "itens"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Itens do Pedido{linhas.length > 0 ? ` (${linhas.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("comodato")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "comodato"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Comodato{comodatoLinhas.length > 0 ? ` (${comodatoLinhas.length})` : ""}
          </button>
      </div>

      {/* ── Itens do Pedido — full width ────────────────────────────────── */}
      {activeTab === "itens" && (
      <div className="bg-white rounded-xl border border-gray-300 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-gray-800 tracking-wide uppercase">Itens do Pedido</h2>
          <Button type="button" size="sm" variant="outline" onClick={addLinha} className="border-gray-300 text-gray-700 hover:bg-gray-200">
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
          </Button>
        </div>

        {linhas.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-500 font-medium">Nenhum item adicionado.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em &quot;Adicionar Item&quot; para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-100 border-b border-gray-300 text-xs text-gray-700 uppercase tracking-wide">
                <tr>
                  <th className="text-center px-3 py-3 font-bold w-12">Item</th>
                  <th className="text-left px-3 py-3 font-bold">Produto</th>
                  <th className="text-center px-3 py-3 font-bold w-28">Unidade</th>
                  <th className="text-right px-3 py-3 font-bold w-24">Quantidade</th>
                  <th className="text-right px-3 py-3 font-bold w-28">
                    <span className="flex flex-col items-end leading-tight">
                      <span>Qtd.</span><span>Unitária</span>
                    </span>
                  </th>
                  <th className="text-right px-3 py-3 font-bold w-28">Preço Unit.</th>
                  <th className="text-right px-3 py-3 font-bold w-24">% Desconto</th>
                  <th className="text-right px-3 py-3 font-bold w-28">Vlr. Desconto</th>
                  <th className="text-right px-3 py-3 font-bold w-28">Valor Total</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {linhas.map((linha, idx) => (
                  <tr key={linha._key} className="hover:bg-blue-50/30 group transition-colors">

                    {/* # */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-xs font-bold font-mono text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        {idx + 1}
                      </span>
                    </td>

                    {/* Produto — search popover (portal-based) */}
                    <td className="px-3 py-2.5 min-w-[220px]">
                      <button
                        data-item-search
                        type="button"
                        onClick={(e) => openItemSearch(linha._key, e.currentTarget, linha.codigo)}
                        className={cn(
                          "w-full h-9 px-2.5 rounded-lg border text-left text-xs transition-colors",
                          linha.itemId
                            ? "border-gray-300 bg-white text-gray-800 hover:border-blue-400"
                            : "border-dashed border-gray-400 text-gray-500 hover:border-blue-400 hover:text-blue-500",
                          itemSearchRow === linha._key && "border-blue-500 ring-2 ring-blue-100"
                        )}
                      >
                        {linha.itemId ? (
                          <span>
                            <span className="font-mono text-gray-500 mr-1.5">{linha.codigo}</span>
                            <span className="font-medium text-gray-900">{linha.descricao}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-gray-500"><Search className="w-3 h-3" /> Buscar produto...</span>
                        )}
                      </button>
                    </td>

                    {/* Unidade */}
                    <td className="px-3 py-2.5 text-center">
                      {linha.itemId && linha.itemUnidades.length > 0 ? (
                        <select
                          value={linha.unidadeId}
                          onChange={(e) => changeUnidade(linha._key, e.target.value)}
                          className="h-8 rounded-md border border-gray-300 bg-white text-xs font-semibold font-mono text-gray-700 px-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 hover:border-blue-400 transition-colors cursor-pointer"
                        >
                          {linha.itemUnidades.map((iu) => (
                            <option key={iu.unidadeId} value={iu.unidadeId}>
                              {iu.unidade.sigla}{decimalToNumber(iu.fatorConversao) !== 1 ? ` (×${decimalToNumber(iu.fatorConversao)})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold text-gray-700 font-mono bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                          {linha.unidade || "—"}
                        </span>
                      )}
                    </td>

                    {/* Quantidade */}
                    <td className="px-3 py-2.5">
                      <Input
                        inputMode="decimal"
                        value={linha.quantidade}
                        onChange={(e) => updateLinha(linha._key, "quantidade", e.target.value)}
                        className="h-9 text-xs text-right border-gray-300 font-medium"
                      />
                    </td>

                    {/* Qtd. Unitária — calculada (qty × fator), editável */}
                    <td className="px-3 py-2.5">
                      {linha.fatorConversao > 1 ? (
                        <div className="relative">
                          <Input
                            inputMode="decimal"
                            value={linha.quantidadeUnitaria}
                            onChange={(e) => updateLinha(linha._key, "quantidadeUnitaria", e.target.value)}
                            className="h-9 text-xs text-right border-blue-300 bg-blue-50 font-semibold text-blue-700 focus:ring-blue-400"
                            title={`${linha.quantidade} ${linha.unidade} × ${linha.fatorConversao} = ${linha.quantidadeUnitaria} un`}
                          />
                        </div>
                      ) : (
                        <span className="block text-xs text-right text-gray-400 pr-1 font-medium">
                          {parseDecimal(linha.quantidadeUnitaria) || "—"}
                        </span>
                      )}
                    </td>

                    {/* Preço Unit. */}
                    <td className="px-3 py-2.5">
                      <Input
                        inputMode="decimal"
                        value={linha.precoUnitario}
                        onChange={(e) => updateLinha(linha._key, "precoUnitario", e.target.value)}
                        className="h-9 text-xs text-right border-gray-300 font-medium"
                      />
                    </td>

                    {/* % Desconto */}
                    <td className="px-3 py-2.5">
                      <div className="relative">
                        <Input
                          inputMode="decimal"
                          value={linha.descontoPct}
                          onChange={(e) => updateLinha(linha._key, "descontoPct", e.target.value)}
                          className="h-9 text-xs text-right pr-7 border-gray-300 font-medium"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">%</span>
                      </div>
                    </td>

                    {/* Vlr. Desconto — editable, syncs with % */}
                    <td className="px-3 py-2.5">
                      <Input
                        inputMode="decimal"
                        value={linha.valorDesconto}
                        onChange={(e) => updateLinha(linha._key, "valorDesconto", e.target.value)}
                        className="h-9 text-xs text-right border-gray-300 font-medium"
                      />
                    </td>

                    {/* Valor Total */}
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-sm font-bold text-gray-900">
                        {formatBRL(parseDecimal(linha.valorTotal) || 0)}
                      </span>
                    </td>

                    {/* Remove */}
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeLinha(linha._key)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors border border-transparent hover:border-red-200"
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

      </div>
      )}

      {/* ── Comodato (saída) ───────────────────────────────────────────── */}
      {activeTab === "comodato" && (
      <div className="bg-white rounded-xl border border-gray-300 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-gray-800 tracking-wide uppercase">Comodato — Saída</h2>
            <p className="text-xs text-gray-500 mt-0.5 normal-case font-normal">Itens (vasilhames/pallets) que o cliente está levando em comodato. Entram no total do pedido.</p>
          </div>
          <Button
            type="button" size="sm" variant="outline"
            onClick={addComodatoLinha}
            disabled={itensComodato.length === 0}
            className="border-gray-300 text-gray-700 hover:bg-gray-200"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item em Comodato
          </Button>
        </div>

        {itensComodato.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-500 font-medium">Nenhum item marcado como comodato.</p>
            <p className="text-xs text-gray-400 mt-1">Marque a opção &quot;Comodato&quot; no cadastro do item.</p>
          </div>
        ) : comodatoLinhas.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-gray-500 font-medium">Nenhum comodato adicionado.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em &quot;Adicionar Item em Comodato&quot; para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-100 border-b border-gray-300 text-xs text-gray-700 uppercase tracking-wide">
                <tr>
                  <th className="text-center px-3 py-3 font-bold w-12">Item</th>
                  <th className="text-left px-3 py-3 font-bold">Item em Comodato</th>
                  <th className="text-right px-3 py-3 font-bold w-28">Quantidade</th>
                  <th className="text-right px-3 py-3 font-bold w-32">Valor Un.</th>
                  <th className="text-left px-3 py-3 font-bold w-40">Documento</th>
                  <th className="text-right px-3 py-3 font-bold w-32">Total</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {comodatoLinhas.map((linha, idx) => {
                  const total = (parseDecimal(linha.quantidade) || 0) * (parseDecimal(linha.valorUnitario) || 0);
                  return (
                    <tr key={linha._key} className="hover:bg-blue-50/30 transition-colors">
                      {/* # */}
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs font-bold font-mono text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">{idx + 1}</span>
                      </td>
                      {/* Item em Comodato */}
                      <td className="px-3 py-2.5 min-w-[220px]">
                        <select
                          value={linha.itemId}
                          onChange={(e) => updateComodatoLinha(linha._key, "itemId", e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-300 bg-white px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 hover:border-blue-400 transition-colors"
                        >
                          <option value="">Selecione...</option>
                          {itensComodato.map((i) => (
                            <option key={i.id} value={i.id}>{i.codigo} — {i.descricao}</option>
                          ))}
                        </select>
                      </td>
                      {/* Quantidade */}
                      <td className="px-3 py-2.5">
                        <Input
                          inputMode="decimal"
                          value={linha.quantidade}
                          onChange={(e) => updateComodatoLinha(linha._key, "quantidade", e.target.value)}
                          className="h-9 text-xs text-right border-gray-300 font-medium"
                        />
                      </td>
                      {/* Valor Un. */}
                      <td className="px-3 py-2.5">
                        <Input
                          inputMode="decimal"
                          value={linha.valorUnitario}
                          onChange={(e) => updateComodatoLinha(linha._key, "valorUnitario", e.target.value)}
                          className="h-9 text-xs text-right border-gray-300 font-medium"
                        />
                      </td>
                      {/* Documento (opcional) */}
                      <td className="px-3 py-2.5">
                        <Input
                          type="text"
                          value={linha.documento}
                          onChange={(e) => updateComodatoLinha(linha._key, "documento", e.target.value)}
                          placeholder="Opcional"
                          className="h-9 text-xs border-gray-300"
                        />
                      </td>
                      {/* Total */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-sm font-bold text-gray-900">{formatBRL(total)}</span>
                      </td>
                      {/* Remove */}
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => removeComodatoLinha(linha._key)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors border border-transparent hover:border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <td className="px-3 py-3 text-right text-xs uppercase tracking-wide" colSpan={2}>Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{comodatoTotalQtd.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                  <td></td>
                  <td></td>
                  <td className="px-3 py-3 text-right text-blue-700">{formatBRL(comodatoTotalValor)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ── Rodapé sempre visível: pagamento + condição (após os itens) + totais ──── */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Forma de Pagamento</Label>
            <PagamentosInput
              linhas={pagamentos}
              setLinhas={setPagamentos}
              formas={formas}
              contas={contas}
              total={totalGeral}
              mostrarConta={pago}
            />
            {pago && (
              <>
                <p className="text-[11px] text-gray-400">Pedido já pago — você pode corrigir a conta de destino e a data do recebimento (o lançamento no caixa é movido junto).</p>
                <div className="space-y-1 max-w-[12rem]">
                  <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Data do Recebimento</Label>
                  <input
                    type="date"
                    value={pagamentoData}
                    onChange={(e) => setPagamentoData(e.target.value)}
                    className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Natureza Financeira</Label>
            <select
              value={naturezaFinanceiraId}
              onChange={(e) => setNaturezaFinanceiraId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Sem natureza —</option>
              {naturezas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Condição de Pagamento</Label>
            <div ref={condicaoRef}>
              <button
                data-condicao-dd
                ref={condicaoBtnRef}
                type="button"
                onClick={() => {
                  if (condicaoOpen) {
                    setCondicaoOpen(false);
                  } else {
                    const r = condicaoBtnRef.current!.getBoundingClientRect();
                    setCondicaoDropPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
                    setCondicaoOpen(true);
                    setCondicaoSearch("");
                    setShowNewCondicao(false);
                    setNewCondicaoName("");
                  }
                }}
                disabled={condicoesLoading}
                className={cn(
                  "w-full flex items-center justify-between h-10 px-3 rounded-lg border text-sm text-left transition-colors",
                  condicaoOpen ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-300 hover:border-gray-400",
                  condicaoPagamento ? "text-gray-900" : "text-gray-400",
                  condicoesLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="truncate">{condicaoPagamento || "— Selecionar condição —"}</span>
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-2.5 text-sm md:border-l md:border-gray-200 md:pl-6">
          <div className="flex justify-between text-gray-700 font-medium">
            <span>Subtotal</span>
            <span className="font-semibold">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-gray-700 font-medium">
            <span>Frete (R$)</span>
            <Input
              inputMode="decimal"
              value={valorFrete}
              onChange={(e) => setValorFrete(e.target.value)}
              className="h-8 w-28 text-xs text-right border-gray-300"
            />
          </div>
          {comodatoTotalValor > 0 && (
            <div className="flex justify-between text-gray-700 font-medium">
              <span>Comodato</span>
              <span className="font-semibold">{formatBRL(comodatoTotalValor)}</span>
            </div>
          )}
          <Separator className="bg-gray-300" />
          <div className="flex justify-between font-bold text-lg text-gray-900">
            <span>Total</span>
            <span className="text-blue-700">{formatBRL(totalGeral)}</span>
          </div>
        </div>
      </div>

      {/* ── Portal: item search dropdown ─────────────────────────────── */}
      {portalMounted && itemSearchRow && itemDropPos && createPortal(
        <div
          data-item-search
          className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ top: itemDropPos.top, left: itemDropPos.left, width: itemDropPos.width }}
        >
          {/* Search input */}
          <div className="relative border-b border-gray-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              ref={itemInputRef}
              data-item-search
              type="text"
              value={itemSearchQ}
              onChange={(e) => setItemSearchQ(e.target.value)}
              placeholder="Código ou descrição..."
              className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent"
            />
          </div>
          {/* Results */}
          <div className="max-h-56 overflow-y-auto">
            {itemSearching ? (
              <div className="flex items-center justify-center py-4 gap-1.5 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
              </div>
            ) : itemResults.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400 italic text-center">
                {catalogItens.length === 0
                  ? "Nenhum produto marcado como vendável. Ative o check nos produtos."
                  : "Nenhum produto encontrado"}
              </p>
            ) : itemResults.map((p) => (
              <button
                key={p.id}
                data-item-search
                type="button"
                onMouseDown={() => {
                  selectItem(itemSearchRow, p);
                  closeItemSearch();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0"
              >
                <span className="font-mono text-xs text-gray-500 shrink-0 w-20">{p.codigo}</span>
                <span className="text-sm text-gray-800 truncate flex-1">{p.descricao}</span>
                <span className="text-xs text-gray-500 shrink-0">{p.unidadeMedida}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* ── Portal: condição de pagamento dropdown ───────────────────── */}
      {portalMounted && condicaoOpen && condicaoDropPos && createPortal(
        <div
          ref={condicaoPortalRef}
          className="fixed z-[9999] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ top: condicaoDropPos.top, left: condicaoDropPos.left, width: condicaoDropPos.width }}
        >
          {/* Search */}
          <div className="relative border-b border-gray-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              autoFocus type="text"
              value={condicaoSearch}
              onChange={(e) => setCondicaoSearch(e.target.value)}
              placeholder="Buscar condição..."
              className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent"
            />
          </div>
          {/* Options */}
          <div className="max-h-44 overflow-y-auto">
            {condicoes
              .filter((c) => !condicaoSearch.trim() || c.nome.toLowerCase().includes(condicaoSearch.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id} type="button"
                  onMouseDown={() => { setCondicaoPagamento(c.nome); setCondicaoOpen(false); setCondicaoSearch(""); }}
                  className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0", condicaoPagamento === c.nome && "bg-blue-50 text-blue-700 font-semibold")}
                >
                  {c.nome}
                </button>
              ))}
            {condicoes.filter((c) => !condicaoSearch.trim() || c.nome.toLowerCase().includes(condicaoSearch.toLowerCase())).length === 0 && (
              <p className="px-4 py-3 text-xs text-gray-400 italic text-center">Nenhuma condição encontrada</p>
            )}
          </div>
          {/* Footer — add new */}
          <div className="border-t border-gray-100">
            {!showNewCondicao ? (
              <button
                type="button"
                onClick={() => { setShowNewCondicao(true); setNewCondicaoName(condicaoSearch.trim()); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar nova condição
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  autoFocus
                  type="text"
                  value={newCondicaoName}
                  onChange={(e) => setNewCondicaoName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveNovaCondicao(); if (e.key === "Escape") { setShowNewCondicao(false); setNewCondicaoName(""); } }}
                  placeholder="Nome da condição..."
                  className="flex-1 h-8 px-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={saveNovaCondicao}
                  disabled={savingCondicao || !newCondicaoName.trim()}
                  className="h-8 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors shrink-0"
                >
                  {savingCondicao ? "..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowNewCondicao(false); setNewCondicaoName(""); }}
                  className="h-8 px-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Observações + Actions — constrained width ───────────────────── */}
      <div className="max-w-5xl space-y-6">
        {/* Observações */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Observações</Label>
          <Textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            placeholder="Observações do pedido..."
            className="border-gray-300 text-gray-800 placeholder:text-gray-400 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          {isEdit ? (
            <Button
              type="button"
              onClick={handleUpdate}
              disabled={!!submitting}
              className="font-semibold"
            >
              {submitting === "salvando" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : "Salvar Alterações"}
            </Button>
          ) : (
            <>
              <Button
                type="button" variant="outline"
                onClick={() => handleSubmit("ORCAMENTO")}
                disabled={!!submitting}
                className="border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold"
              >
                {submitting === "orcamento" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : "Salvar como Orçamento"}
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit("CONFIRMADO")}
                disabled={!!submitting}
                className="font-semibold"
              >
                {submitting === "confirmado" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Confirmando...</> : "Confirmar Pedido"}
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" onClick={pedido ? () => router.back() : voltarLista} disabled={!!submitting} className="text-gray-500 hover:text-gray-700">
            Cancelar
          </Button>
        </div>
      </div>
      {createdDialog}
    </div>
  );
}
