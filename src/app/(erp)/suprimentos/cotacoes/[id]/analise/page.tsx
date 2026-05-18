"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, decimalToNumber } from "@/lib/utils";
import { Loader2, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";

// Types - same as cotação detail page
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
  despesas: unknown;
  seguro: unknown;
  melhorOpcao: boolean;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null; cidade?: string | null; estado?: string | null };
  itens: CotacaoFornecedorItem[];
};
type Cotacao = {
  id: string; numero: string; nome: string | null;
  status: "PENDENTE" | "EM_ANALISE" | "CONCLUIDA";
  fornecedores: CotacaoFornecedor[];
};

export default function AnaliseCotacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"proposta" | "item">("proposta");
  const [sortBy, setSortBy] = useState("melhor_preco");
  const [mapaOpen, setMapaOpen] = useState(false);
  const [selectedCfId, setSelectedCfId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/suprimentos/cotacoes/${id}`);
    const json = await res.json();
    setCotacao(json.data);
    // Auto-select melhorOpcao or lowest total respondida
    const respondidas = (json.data?.fornecedores ?? []).filter((f: CotacaoFornecedor) => f.status === "RESPONDIDA");
    const preSelected = respondidas.find((f: CotacaoFornecedor) => f.melhorOpcao);
    if (preSelected) {
      setSelectedCfId(preSelected.id);
    } else if (respondidas.length > 0) {
      // pick lowest total
      const sorted = [...respondidas].sort((a: CotacaoFornecedor, b: CotacaoFornecedor) => decimalToNumber(a.totalCalculado) - decimalToNumber(b.totalCalculado));
      setSelectedCfId(sorted[0].id);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
      // Set melhorOpcao on selected cf
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!cotacao) return <div className="p-8 text-red-600">Cotação não encontrada.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/suprimentos/cotacoes" className="hover:text-gray-700">Cotações</Link>
        <span>›</span>
        <Link href={`/suprimentos/cotacoes/${id}`} className="hover:text-gray-700">Análise da cotação</Link>
      </nav>

      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Análise da cotação - {cotacao.numero}
      </h1>

      {/* Mapa da cotação collapsible */}
      <div className="border rounded-lg mb-6 bg-red-50 border-red-100">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
          onClick={() => setMapaOpen(!mapaOpen)}
        >
          <span>Mapa da cotação</span>
          {mapaOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {mapaOpen && (
          <div className="px-4 pb-4 text-sm text-gray-600">
            {/* Mapa grid - items vs fornecedores */}
            <p className="text-gray-400 italic">Mapa de comparação de itens por fornecedor.</p>
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
              tab === t.key ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sort by */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-gray-700">Ordenar por:</span>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="melhor_preco">Melhor preço sem impostos</option>
          <option value="pior_preco">Maior preço</option>
          <option value="prazo">Menor prazo</option>
        </select>
      </div>

      {/* Informações label */}
      <p className="text-sm font-medium text-gray-700 mb-4">Informações</p>

      {/* No respondidas */}
      {respondidas.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma proposta respondida para analisar.</p>
        </div>
      )}

      {/* Supplier cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {sorted.map(cf => {
          const nome = cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial;
          const total = decimalToNumber(cf.totalCalculado);
          const frete = decimalToNumber(cf.frete);
          const isBest = total === bestTotal && bestTotal > 0;
          const isSelected = selectedCfId === cf.id;

          return (
            <div
              key={cf.id}
              onClick={() => setSelectedCfId(cf.id)}
              className={cn(
                "border rounded-lg p-4 cursor-pointer transition-all",
                isSelected ? "border-blue-500 bg-blue-50 shadow-md" : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  {isBest && (
                    <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-1">
                      Melhor preço
                    </span>
                  )}
                  <p className="font-bold text-gray-800 text-sm leading-tight">{nome}</p>
                  {cf.fornecedor.cpfCnpj && <p className="text-xs text-gray-500 mt-0.5">{cf.fornecedor.cpfCnpj}</p>}
                </div>
                <input
                  type="radio"
                  checked={isSelected}
                  onChange={() => setSelectedCfId(cf.id)}
                  className="mt-1 accent-blue-600"
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-3 pt-3 border-t">
                <div>
                  <p className="text-gray-400">Total sem impostos</p>
                  <p className="font-semibold text-gray-800">{formatBRL(total)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total Frete</p>
                  <p className="font-semibold text-gray-800">{formatBRL(frete)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total com impostos</p>
                  <p className="font-semibold text-gray-800">{formatBRL(total)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Prazo mín.</p>
                  <p className="font-semibold text-gray-800">{cf.prazoEntregaDias != null ? `${cf.prazoEntregaDias} Dias` : "—"}</p>
                </div>
              </div>

              {/* Detalhes link */}
              <div className="mt-3 pt-2 border-t">
                <Link
                  href={`/suprimentos/cotacoes/${id}/proposta/${cf.id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-red-600 hover:underline"
                >
                  Detalhes
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {respondidas.length > 6 && (
        <div className="flex justify-center mb-8">
          <Button variant="outline" size="sm">Carregar mais resultados</Button>
        </div>
      )}

      {genError && <p className="text-red-600 text-sm mb-4">{genError}</p>}

      {/* Footer actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => router.push(`/suprimentos/cotacoes/${id}`)}>
          Cancelar
        </Button>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white"
          onClick={() => setShowConfirm(true)}
          disabled={!selectedCfId || generating}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Gerar
        </Button>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Formalizar a cotação</h2>
            <p className="text-gray-600 mb-6">
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
