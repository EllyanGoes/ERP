"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2, ChevronDown, ChevronRight, BarChart3, Sparkles, Search, Download } from "lucide-react";

// Types
type CotacaoFornecedorItem = {
  id: string; itemId: string; quantidade: unknown; precoUnitario: unknown; subtotal: unknown;
  situacao: string | null;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
};
type CotacaoFornecedor = {
  id: string;
  status: "AGUARDANDO" | "RESPONDIDA" | "RECUSADA";
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
  totalCalculado: unknown;
  frete: unknown;
  desconto: unknown;
  vrDesconto: unknown;
  despesas: unknown;
  seguro: unknown;
  melhorOpcao: boolean;
  updatedAt: string;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null; cidade?: string | null; estado?: string | null };
  itens: CotacaoFornecedorItem[];
  historico: Array<{ versao: number; createdAt: string }>;
};
type Cotacao = {
  id: string; numero: string; nome: string | null;
  status: "PENDENTE" | "EM_ANALISE" | "CONCLUIDA";
  fornecedores: CotacaoFornecedor[];
};

type ItemAnalysis = {
  itemId: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  quantidade: number;
  suppliers: Array<{
    cfId: string;
    fornecedorNome: string;
    fornecedorCodigo: string;
    prazoEntregaDias: number | null;
    frete: number;
    desconto: number;
    vrDesconto: number;
    precoUnitario: number;
    subtotal: number;
    isBestPrice: boolean;
  }>;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AnaliseCotacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"proposta" | "item">("proposta");
  const [sortBy, setSortBy] = useState("melhor_preco");
  const [mapaOpen, setMapaOpen] = useState(false);
  const [selectedCfId, setSelectedCfId] = useState<string | null>(null);
  const [selectedByItem, setSelectedByItem] = useState<Map<string, string>>(new Map());
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/cotacoes/${id}`);
    const json = await res.json();
    const data: Cotacao = json.data;
    setCotacao(data);

    // Auto-select for "Por Proposta" tab
    const respondidas = (data?.fornecedores ?? []).filter((f: CotacaoFornecedor) => f.status === "RESPONDIDA");
    const preSelected = respondidas.find((f: CotacaoFornecedor) => f.melhorOpcao);
    if (preSelected) {
      setSelectedCfId(preSelected.id);
    } else if (respondidas.length > 0) {
      const sorted = [...respondidas].sort((a: CotacaoFornecedor, b: CotacaoFornecedor) => decimalToNumber(a.totalCalculado) - decimalToNumber(b.totalCalculado));
      setSelectedCfId(sorted[0].id);
    }

    // Auto-select best price per item for "Por Item" tab
    const itemsMap = buildItemsMap(data?.fornecedores ?? []);
    const autoSelected = new Map<string, string>();
    itemsMap.forEach((itemAnalysis) => {
      const best = itemAnalysis.suppliers.find(s => s.isBestPrice);
      if (best) autoSelected.set(itemAnalysis.itemId, best.cfId);
    });
    setSelectedByItem(autoSelected);

    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function buildItemsMap(fornecedores: CotacaoFornecedor[]): Map<string, ItemAnalysis> {
    const respondidas = fornecedores.filter(f => f.status === "RESPONDIDA");
    const map = new Map<string, ItemAnalysis>();

    respondidas.forEach(cf => {
      cf.itens.forEach(cfItem => {
        const existing = map.get(cfItem.itemId);
        const subtotal = decimalToNumber(cfItem.subtotal);
        const supplierEntry = {
          cfId: cf.id,
          fornecedorNome: cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial,
          fornecedorCodigo: cf.id.slice(-8).toUpperCase(),
          prazoEntregaDias: cf.prazoEntregaDias,
          frete: decimalToNumber(cf.frete),
          desconto: decimalToNumber(cf.desconto),
          vrDesconto: decimalToNumber(cf.vrDesconto),
          precoUnitario: decimalToNumber(cfItem.precoUnitario),
          subtotal,
          isBestPrice: false, // computed after
        };

        if (!existing) {
          map.set(cfItem.itemId, {
            itemId: cfItem.itemId,
            codigo: cfItem.item.codigo,
            descricao: cfItem.item.descricao,
            unidadeMedida: cfItem.item.unidadeMedida,
            quantidade: decimalToNumber(cfItem.quantidade),
            suppliers: [supplierEntry],
          });
        } else {
          existing.suppliers.push(supplierEntry);
        }
      });
    });

    // Mark best price per item
    map.forEach(itemAnalysis => {
      const validSuppliers = itemAnalysis.suppliers.filter(s => s.subtotal > 0);
      if (validSuppliers.length > 0) {
        const minSubtotal = Math.min(...validSuppliers.map(s => s.subtotal));
        itemAnalysis.suppliers.forEach(s => {
          s.isBestPrice = s.subtotal === minSubtotal && s.subtotal > 0;
        });
      }
    });

    return map;
  }

  const itemsMap = useMemo(() => {
    if (!cotacao) return new Map<string, ItemAnalysis>();
    return buildItemsMap(cotacao.fornecedores);
  }, [cotacao]);

  const filteredItems = useMemo(() => {
    const entries = Array.from(itemsMap.values());
    if (!itemSearch.trim()) return entries;
    const term = itemSearch.toLowerCase();
    return entries.filter(
      item => item.codigo.toLowerCase().includes(term) || item.descricao.toLowerCase().includes(term)
    );
  }, [itemsMap, itemSearch]);

  const summary = useMemo(() => {
    let totalItens = 0, totalFrete = 0, totalDesconto = 0;
    selectedByItem.forEach((cfId, itemId) => {
      const cf = cotacao?.fornecedores.find(f => f.id === cfId);
      if (!cf) return;
      const item = cf.itens.find(i => i.itemId === itemId);
      if (item) totalItens += decimalToNumber(item.subtotal);
      const itemCount = cf.itens.length || 1;
      totalFrete += decimalToNumber(cf.frete) / itemCount;
      totalDesconto += decimalToNumber(cf.vrDesconto) / itemCount;
    });
    return { totalItens, totalFrete, totalDesconto, valorPagar: totalItens + totalFrete - totalDesconto };
  }, [selectedByItem, cotacao]);

  const respondidas = (cotacao?.fornecedores ?? []).filter(f => f.status === "RESPONDIDA");

  // Sort respondidas
  const sorted = [...respondidas].sort((a, b) => {
    if (sortBy === "melhor_preco") return decimalToNumber(a.totalCalculado) - decimalToNumber(b.totalCalculado);
    if (sortBy === "pior_preco") return decimalToNumber(b.totalCalculado) - decimalToNumber(a.totalCalculado);
    if (sortBy === "prazo") return (a.prazoEntregaDias ?? 999) - (b.prazoEntregaDias ?? 999);
    return 0;
  });

  const bestTotal = sorted.length > 0 ? decimalToNumber(sorted[0].totalCalculado) : 0;

  async function handleGerar() {
    if (!selectedCfId) return;
    setGenerating(true);
    setGenError("");
    try {
      await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores/${selectedCfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ melhorOpcao: true }),
      });
      router.push(`/suprimentos/cotacoes/${id}/formalizacao?cfId=${selectedCfId}`);
    } catch {
      setGenError("Erro ao processar. Tente novamente.");
      setGenerating(false);
    }
  }

  async function generateMapaPDF(cotacaoData: Cotacao) {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const respondidosFornecedores = cotacaoData.fornecedores.filter(f => f.status === "RESPONDIDA");

    // Build items map (same logic as buildItemsMap)
    const itemsMapLocal = buildItemsMap(cotacaoData.fornecedores);
    const itemsList = Array.from(itemsMapLocal.values());

    // Header
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const titulo = "MAPA DA COTAÇÃO";
    const subtitulo = `Cotação ${cotacaoData.numero}${cotacaoData.nome ? " — " + cotacaoData.nome : ""}   |   Data: ${dateStr}`;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(titulo, 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitulo, 14, 25);

    // Build table head
    // Fixed columns: #, Código, Descrição, U.M., Qtd
    // Per supplier: Preço Unit., Total
    const fixedHead = ["#", "Código", "Descrição", "U.M.", "Qtd"];
    const supplierHeadPairs = respondidosFornecedores.flatMap(cf => {
      const nome = cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial;
      // truncate long names
      const shortNome = nome.length > 20 ? nome.slice(0, 18) + "…" : nome;
      return [`${shortNome}\nPreço Unit.`, `${shortNome}\nTotal`];
    });
    const headRow = [...fixedHead, ...supplierHeadPairs];

    // Build body rows
    type PdfCell = string | { content: string; styles?: Record<string, unknown> };
    const bodyRows: PdfCell[][] = itemsList.map((itemAnalysis, idx) => {
      const fixedCols: PdfCell[] = [
        String(idx + 1),
        itemAnalysis.codigo,
        itemAnalysis.descricao,
        itemAnalysis.unidadeMedida,
        String(itemAnalysis.quantidade),
      ];

      // Find min subtotal > 0 across all suppliers for this item
      const allSubtotals = respondidosFornecedores.map(cf => {
        const cfItem = cf.itens.find(i => i.itemId === itemAnalysis.itemId);
        return cfItem ? decimalToNumber(cfItem.subtotal) : 0;
      });
      const validSubtotals = allSubtotals.filter(v => v > 0);
      const minSubtotal = validSubtotals.length > 0 ? Math.min(...validSubtotals) : -1;

      const supplierCols: PdfCell[] = respondidosFornecedores.flatMap((cf, cfIdx) => {
        const cfItem = cf.itens.find(i => i.itemId === itemAnalysis.itemId);
        if (!cfItem || decimalToNumber(cfItem.precoUnitario) === 0) {
          return ["-", "-"] as PdfCell[];
        }
        const precoUnit = decimalToNumber(cfItem.precoUnitario);
        const subtotal = allSubtotals[cfIdx];
        const isBest = subtotal > 0 && subtotal === minSubtotal;
        const cellStyles = isBest ? { fillColor: [200, 240, 200] } : {};
        return [
          { content: formatBRL(precoUnit), styles: cellStyles },
          { content: formatBRL(subtotal), styles: cellStyles },
        ] as PdfCell[];
      });

      return [...fixedCols, ...supplierCols];
    });

    // Summary rows
    const totalRow: PdfCell[] = [
      "", "", "TOTAL", "", "",
      ...respondidosFornecedores.flatMap(cf => {
        const total = cf.itens.reduce((acc, i) => acc + decimalToNumber(i.subtotal), 0);
        return ["", { content: formatBRL(total), styles: { fontStyle: "bold" } }] as PdfCell[];
      }),
    ];

    const freteRow: PdfCell[] = [
      "", "", "Frete", "", "",
      ...respondidosFornecedores.flatMap(cf => ["", formatBRL(decimalToNumber(cf.frete))] as PdfCell[]),
    ];

    const descontoPercRow: PdfCell[] = [
      "", "", "Desconto (%)", "", "",
      ...respondidosFornecedores.flatMap(cf => ["", `${decimalToNumber(cf.desconto).toFixed(2)}%`] as PdfCell[]),
    ];

    const descontoRsRow: PdfCell[] = [
      "", "", "Desconto (R$)", "", "",
      ...respondidosFornecedores.flatMap(cf => ["", formatBRL(decimalToNumber(cf.vrDesconto))] as PdfCell[]),
    ];

    const despesasRow: PdfCell[] = [
      "", "", "Despesas", "", "",
      ...respondidosFornecedores.flatMap(cf => ["", formatBRL(decimalToNumber(cf.despesas))] as PdfCell[]),
    ];

    const seguroRow: PdfCell[] = [
      "", "", "Seguro", "", "",
      ...respondidosFornecedores.flatMap(cf => ["", formatBRL(decimalToNumber(cf.seguro))] as PdfCell[]),
    ];

    const totalGeralRow: PdfCell[] = [
      "", "", "TOTAL GERAL", "", "",
      ...respondidosFornecedores.flatMap(cf => {
        const tg = decimalToNumber(cf.totalCalculado);
        return ["", { content: formatBRL(tg), styles: { fontStyle: "bold", fillColor: [220, 230, 255] } }] as PdfCell[];
      }),
    ];

    bodyRows.push(totalRow, freteRow, descontoPercRow, descontoRsRow, despesasRow, seguroRow, totalGeralRow);

    autoTable(doc, {
      head: [headRow],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: bodyRows as any,
      startY: 30,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 18 },
        2: { cellWidth: 50 },
        3: { cellWidth: 12, halign: "center" },
        4: { cellWidth: 12, halign: "right" },
      },
      didParseCell: (data) => {
        // Right-align supplier price columns
        if (data.section === "body" && data.column.index >= 5) {
          data.cell.styles.halign = "right";
        }
      },
    });

    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageCount = (doc as any).internal.getNumberOfPages() as number;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      doc.text(
        `Gerado em ${dateStr} ${timeStr}`,
        14,
        doc.internal.pageSize.getHeight() - 5
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 5,
        { align: "right" }
      );
    }

    doc.save(`Mapa-Cotacao-${cotacaoData.numero}.pdf`);
  }

  async function handleDownloadPdf() {
    if (!cotacao) return;
    setDownloadingPdf(true);
    try {
      await generateMapaPDF(cotacao);
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!cotacao) return <div className="p-8 text-danger">Cotação não encontrada.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
        <Link href="/suprimentos/cotacoes" className="hover:text-foreground">Cotações</Link>
        <span>›</span>
        <Link href={`/suprimentos/cotacoes/${id}`} className="hover:text-foreground">{cotacao.numero}</Link>
        <span>›</span>
        <span className="text-foreground">Análise</span>
      </nav>

      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Análise da Cotação</h1>
        <button
          disabled
          title="Em breve"
          className="inline-flex items-center gap-2 border border-purple-200 text-purple-600 rounded-lg px-3 py-1.5 text-sm font-medium opacity-50 cursor-not-allowed"
        >
          <Sparkles className="h-4 w-4" />
          Análise por IA
          <span className="ml-1 inline-block bg-purple-100 text-purple-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
            Em breve
          </span>
        </button>
      </div>

      {/* Mapa da cotação collapsible */}
      <div className="border rounded-xl mb-6 bg-muted border-border shadow-sm">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
          onClick={() => setMapaOpen(!mapaOpen)}
        >
          <span>Mapa da cotação</span>
          {mapaOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {mapaOpen && (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            <p className="text-muted-foreground italic">Mapa de comparação de itens por fornecedor.</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b mb-6">
        {[{ key: "proposta", label: "Por Proposta Completa" }, { key: "item", label: "Por Item" }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as "proposta" | "item")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key ? "border-red-600 text-danger" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-foreground">Ordenar por:</span>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-card border-border"
        >
          <option value="melhor_preco">Melhor preço sem impostos</option>
          <option value="pior_preco">Maior preço</option>
          <option value="prazo">Menor prazo</option>
        </select>
      </div>

      <p className="text-sm font-medium text-foreground mb-4">Informações</p>

      {/* No respondidas */}
      {respondidas.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma proposta respondida para analisar.</p>
        </div>
      )}

      {/* TAB: Por Proposta */}
      {tab === "proposta" && respondidas.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {sorted.map(cf => {
              const nome = cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial;
              const total = decimalToNumber(cf.totalCalculado);
              const frete = decimalToNumber(cf.frete);
              const despesas = decimalToNumber(cf.despesas);
              const seguro = decimalToNumber(cf.seguro);
              const vrDesconto = decimalToNumber(cf.vrDesconto);
              const extrasTotal = frete + despesas + seguro - vrDesconto;
              const isBest = total === bestTotal && bestTotal > 0;
              const isSelected = selectedCfId === cf.id;
              const latestHistorico = cf.historico?.[0] ?? null;
              const updatedLabel = latestHistorico
                ? `Atualizado em ${formatDate(latestHistorico.createdAt)}`
                : cf.updatedAt
                ? `Atualizado em ${formatDate(cf.updatedAt)}`
                : null;

              return (
                <div
                  key={cf.id}
                  onClick={() => setSelectedCfId(cf.id)}
                  className={cn(
                    "border rounded-xl p-4 cursor-pointer transition-all shadow-sm",
                    isSelected
                      ? "border-blue-500 ring-1 ring-blue-100 bg-info/10"
                      : "border-border bg-card hover:border-border"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {isBest && (
                          <span className="inline-block bg-success/10 text-success border border-success/30 text-xs font-semibold px-2 py-0.5 rounded-full">
                            Melhor preço
                          </span>
                        )}
                        {latestHistorico && (
                          <span className="inline-block bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                            Proposta v{latestHistorico.versao} · {formatDate(latestHistorico.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-foreground text-sm leading-tight truncate">{nome}</p>
                      {cf.fornecedor.cpfCnpj && <p className="text-xs text-muted-foreground mt-0.5">{cf.fornecedor.cpfCnpj}</p>}
                    </div>
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedCfId(cf.id)}
                      className="mt-1 ml-2 accent-blue-600 flex-shrink-0"
                    />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-3 pt-3 border-t border-border">
                    <div>
                      <p className="text-muted-foreground">Total da proposta</p>
                      <p className="font-semibold text-foreground">{formatBRL(total)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Frete</p>
                      <p className="font-semibold text-foreground">{frete > 0 ? formatBRL(frete) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Desconto / Extras</p>
                      <p className="font-semibold text-foreground">{extrasTotal !== 0 ? formatBRL(extrasTotal) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Prazo mín.</p>
                      <p className="font-semibold text-foreground">{cf.prazoEntregaDias != null ? `${cf.prazoEntregaDias} Dias` : "—"}</p>
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="mt-3 pt-2 border-t border-border flex items-center justify-between">
                    <Link
                      href={`/suprimentos/cotacoes/${id}/proposta/${cf.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-danger hover:underline"
                    >
                      Detalhes
                    </Link>
                    {updatedLabel && (
                      <span className="text-[11px] text-muted-foreground">{updatedLabel}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {respondidas.length > 6 && (
            <div className="flex justify-center mb-8">
              <Button variant="outline" size="sm">Carregar mais resultados</Button>
            </div>
          )}
        </>
      )}

      {/* TAB: Por Item */}
      {tab === "item" && respondidas.length > 0 && (
        <div className="mb-8">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Buscar por código ou descrição..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
            />
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum item encontrado.</p>
            </div>
          )}

          {filteredItems.map(itemAnalysis => (
            <div key={itemAnalysis.itemId} className="bg-card rounded-xl border border-border mb-4 overflow-hidden">
              {/* Item header */}
              <div className="bg-muted px-4 py-3 grid grid-cols-4 text-sm border-b border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Código do produto</p>
                  <p className="font-semibold text-foreground">{itemAnalysis.codigo}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Descrição do produto</p>
                  <p className="font-semibold text-foreground">{itemAnalysis.descricao}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">U.M.</p>
                    <p className="font-semibold text-foreground">{itemAnalysis.unidadeMedida}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Quantidade</p>
                    <p className="font-semibold text-foreground">{itemAnalysis.quantidade}</p>
                  </div>
                </div>
              </div>

              {/* Suppliers table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-xs font-medium text-muted-foreground">
                      <th className="w-8 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Cód. Fornecedor</th>
                      <th className="px-3 py-2 text-left">Fornecedor</th>
                      <th className="px-3 py-2 text-right">Prazo entrega</th>
                      <th className="px-3 py-2 text-right">Total Frete</th>
                      <th className="px-3 py-2 text-right">Desconto</th>
                      <th className="px-3 py-2 text-right">Total Item</th>
                      <th className="px-3 py-2 text-right">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemAnalysis.suppliers.map(supplier => {
                      const isSelectedForItem = selectedByItem.get(itemAnalysis.itemId) === supplier.cfId;
                      const descontoPercent = supplier.subtotal > 0
                        ? ((supplier.vrDesconto / supplier.subtotal) * 100).toFixed(0)
                        : "0";
                      // Approximate "valor total" as subtotal + frete - vrDesconto (per-item portion)
                      const fretePerItem = supplier.frete;
                      const vrDescontoPerItem = supplier.vrDesconto;
                      const valorTotal = supplier.subtotal + fretePerItem - vrDescontoPerItem;

                      return (
                        <tr
                          key={supplier.cfId}
                          onClick={() => setSelectedByItem(prev => new Map(prev).set(itemAnalysis.itemId, supplier.cfId))}
                          className={cn(
                            "border-t border-border cursor-pointer transition-colors",
                            isSelectedForItem
                              ? "bg-info/10"
                              : supplier.isBestPrice
                              ? "bg-success/10 hover:bg-success/15"
                              : "hover:bg-muted"
                          )}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="radio"
                              checked={isSelectedForItem}
                              onChange={() => setSelectedByItem(prev => new Map(prev).set(itemAnalysis.itemId, supplier.cfId))}
                              onClick={e => e.stopPropagation()}
                              className="accent-blue-600"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            {supplier.isBestPrice && (
                              <span className="bg-success/15 text-success text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                                Melhor preço
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{supplier.fornecedorCodigo}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground max-w-[200px] truncate">{supplier.fornecedorNome}</td>
                          <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">
                            {supplier.prazoEntregaDias != null ? `${supplier.prazoEntregaDias}d` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-foreground">{formatBRL(fretePerItem)}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{descontoPercent}%</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatBRL(supplier.subtotal)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatBRL(valorTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Summary bar */}
          <div className="bg-card border-t-2 border-border px-6 py-4 flex flex-wrap gap-8 text-sm rounded-xl mt-6 shadow-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Total Itens</p>
              <p className="font-bold text-foreground">{formatBRL(summary.totalItens)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Total Frete</p>
              <p className="font-bold text-foreground">{formatBRL(summary.totalFrete)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Descontos</p>
              <p className="font-bold text-foreground">{formatBRL(summary.totalDesconto)}</p>
            </div>
            <div className="ml-auto">
              <p className="text-xs text-muted-foreground mb-0.5">Valor a pagar</p>
              <p className="font-bold text-lg text-foreground">{formatBRL(summary.valorPagar)}</p>
            </div>
          </div>
        </div>
      )}

      {genError && <p className="text-danger text-sm mb-4">{genError}</p>}

      {/* Footer actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => router.push(`/suprimentos/cotacoes/${id}`)}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={downloadingPdf || !cotacao}
          className="border-border text-foreground hover:bg-muted"
        >
          {downloadingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Baixar Mapa
        </Button>
        {tab === "item" ? (
          <Button
            className="bg-red-600 hover:bg-red-700 text-white opacity-50 cursor-not-allowed"
            disabled
            title="Selecione a análise Por Proposta Completa para gerar"
          >
            Gerar
          </Button>
        ) : (
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => setShowConfirm(true)}
            disabled={!selectedCfId || generating}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Gerar
          </Button>
        )}
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Formalizar a cotação</h2>
            <p className="text-muted-foreground mb-6">
              Deseja confirmar a análise e gerar documentos com os vencedores selecionados?
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancelar</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => { setShowConfirm(false); handleGerar(); }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
