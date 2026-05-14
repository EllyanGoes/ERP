"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { formatBRL, formatDate, decimalToNumber } from "@/lib/utils";
import {
  Loader2, CheckCircle2, Clock, BarChart3,
  ChevronDown, ChevronUp, Star, Save,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CotacaoFornecedorItem = {
  id: string;
  itemId: string;
  quantidade: unknown;
  precoUnitario: unknown;
  subtotal: unknown;
  disponivel: boolean;
  item: { id: string; codigo: string; descricao: string; unidadeMedida: string };
};

type CotacaoFornecedor = {
  id: string;
  status: "AGUARDANDO" | "RESPONDIDA" | "RECUSADA";
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
  observacao: string | null;
  totalCalculado: unknown;
  melhorOpcao: boolean;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: CotacaoFornecedorItem[];
};

type Cotacao = {
  id: string;
  numero: string;
  status: "PENDENTE" | "EM_ANALISE" | "CONCLUIDA";
  dataLimiteResposta: string | null;
  observacoes: string | null;
  dataAprovacao: string | null;
  fornecedorVencedorId: string | null;
  necessidade: { id: string; numero: string } | null;
  fornecedores: CotacaoFornecedor[];
  pedidos: Array<{ id: string; numero: string; status: string }>;
};

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  PENDENTE:   { label: "Pendente",   icon: Clock,          cls: "bg-amber-50 border-amber-200 text-amber-700" },
  EM_ANALISE: { label: "Em Análise", icon: BarChart3,       cls: "bg-blue-50 border-blue-200 text-blue-700" },
  CONCLUIDA:  { label: "Concluída",  icon: CheckCircle2,    cls: "bg-green-50 border-green-200 text-green-700" },
} as const;

const STATUS_RESP = {
  AGUARDANDO: { label: "Aguardando Proposta", cls: "bg-amber-100 text-amber-700" },
  RESPONDIDA: { label: "Proposta Registrada", cls: "bg-green-100 text-green-700" },
  RECUSADA:   { label: "Recusou",             cls: "bg-red-100 text-red-700" },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CotacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which supplier card is expanded for editing
  const [openCard, setOpenCard] = useState<string | null>(null);

  // Per-supplier form state: cfId → form
  const [forms, setForms] = useState<
    Record<string, {
      prazoEntregaDias: string;
      condicoesPagamento: string;
      observacao: string;
      itens: Record<string, { precoUnitario: string; disponivel: boolean }>;
    }>
  >({});

  const [saving, setSaving] = useState<string | null>(null); // cfId being saved
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}`);
      const json = await res.json();
      const data: Cotacao = json.data;
      setCotacao(data);

      // Init forms for each supplier
      const initialForms: typeof forms = {};
      data.fornecedores.forEach((cf) => {
        const itensForm: Record<string, { precoUnitario: string; disponivel: boolean }> = {};
        cf.itens.forEach((i) => {
          itensForm[i.id] = {
            precoUnitario: i.precoUnitario ? decimalToNumber(i.precoUnitario).toString() : "",
            disponivel: i.disponivel,
          };
        });
        initialForms[cf.id] = {
          prazoEntregaDias: cf.prazoEntregaDias?.toString() ?? "",
          condicoesPagamento: cf.condicoesPagamento ?? "",
          observacao: cf.observacao ?? "",
          itens: itensForm,
        };
      });
      setForms(initialForms);
    } catch {
      setError("Erro ao carregar cotação");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setItemField(cfId: string, itemId: string, field: "precoUnitario" | "disponivel", value: string | boolean) {
    setForms((prev) => ({
      ...prev,
      [cfId]: {
        ...prev[cfId],
        itens: {
          ...prev[cfId].itens,
          [itemId]: { ...prev[cfId].itens[itemId], [field]: value },
        },
      },
    }));
  }

  function setCfField(cfId: string, field: "prazoEntregaDias" | "condicoesPagamento" | "observacao", value: string) {
    setForms((prev) => ({ ...prev, [cfId]: { ...prev[cfId], [field]: value } }));
  }

  // ── Save proposta ─────────────────────────────────────────────────────────
  async function saveProposta(cfId: string) {
    const form = forms[cfId];
    if (!form) return;
    setSaving(cfId);
    setSaveError((prev) => ({ ...prev, [cfId]: "" }));

    try {
      const itens = Object.entries(form.itens).map(([itemId, v]) => ({
        id: itemId,
        precoUnitario: parseFloat(v.precoUnitario) || 0,
        disponivel: v.disponivel,
      }));

      const res = await fetch(`/api/suprimentos/cotacoes/${id}/fornecedores/${cfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RESPONDIDA",
          prazoEntregaDias: form.prazoEntregaDias ? parseInt(form.prazoEntregaDias) : null,
          condicoesPagamento: form.condicoesPagamento || null,
          observacao: form.observacao || null,
          itens,
        }),
      });

      if (!res.ok) {
        const j = await res.json();
        setSaveError((prev) => ({ ...prev, [cfId]: j.error || "Erro ao salvar" }));
        return;
      }

      setOpenCard(null);
      await load();
    } catch {
      setSaveError((prev) => ({ ...prev, [cfId]: "Erro de conexão" }));
    } finally {
      setSaving(null);
    }
  }

  // ── Status transitions ────────────────────────────────────────────────────
  async function changeStatus(newStatus: string) {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro na operação"); return; }
      await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  async function gerarPedido() {
    setActioning(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/cotacoes/${id}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro ao gerar pedido"); return; }
      const pedidoId = json.data?.pedidoCompra?.id;
      if (pedidoId) router.push(`/suprimentos/pedidos-compra/${pedidoId}`);
      else await load();
    } catch {
      setActionError("Erro de conexão");
    } finally {
      setActioning(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Set tab title dynamically
  useTabTitle(cotacao ? `Cotação ${cotacao.numero}` : null);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
  if (!cotacao) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const statusCfg = STATUS_CFG[cotacao.status];
  const StatusIcon = statusCfg.icon;

  // Price comparison data
  const allItems = new Map<string, { codigo: string; descricao: string }>();
  cotacao.fornecedores.forEach((cf) =>
    cf.itens.forEach((i) => allItems.set(i.item.id, { codigo: i.item.codigo, descricao: i.item.descricao }))
  );
  const respondidas = cotacao.fornecedores.filter((cf) => cf.status === "RESPONDIDA");

  const lowestPerItem = new Map<string, number>();
  allItems.forEach((_, itemId) => {
    let lowest = Infinity;
    respondidas.forEach((cf) => {
      const cfItem = cf.itens.find((i) => i.item.id === itemId);
      if (cfItem?.disponivel && cfItem.precoUnitario) {
        const p = decimalToNumber(cfItem.precoUnitario);
        if (p < lowest) lowest = p;
      }
    });
    if (lowest !== Infinity) lowestPerItem.set(itemId, lowest);
  });

  const canEdit = cotacao.status !== "CONCLUIDA";

  return (
    <div>
      <PageHeader
        title={`Cotação ${cotacao.numero}`}
        breadcrumbs={[
          { label: "Suprimentos" },
          { label: "Cotações", href: "/suprimentos/cotacoes" },
          { label: cotacao.numero },
        ]}
      />
      <div className="px-8 pb-8 space-y-6 max-w-5xl">

        {/* Status bar */}
        <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", statusCfg.cls)}>
          <StatusIcon className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold">{statusCfg.label}</span>
          {cotacao.necessidade && (
            <span className="text-xs ml-2 opacity-70">
              Necessidade:{" "}
              <Link href={`/compras/necessidades/${cotacao.necessidade.id}`} className="underline">
                {cotacao.necessidade.numero}
              </Link>
            </span>
          )}
          {cotacao.dataLimiteResposta && (
            <span className="text-xs ml-auto opacity-70">
              Prazo: {formatDate(cotacao.dataLimiteResposta)}
            </span>
          )}
        </div>

        {/* 3-step progress */}
        <div className="flex items-center gap-0">
          {(["PENDENTE", "EM_ANALISE", "CONCLUIDA"] as const).map((s, i) => {
            const steps = ["PENDENTE", "EM_ANALISE", "CONCLUIDA"];
            const currentIdx = steps.indexOf(cotacao.status);
            const stepIdx = steps.indexOf(s);
            const done = stepIdx <= currentIdx;
            const labels = { PENDENTE: "Pendente", EM_ANALISE: "Em Análise", CONCLUIDA: "Concluída" };
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={cn(
                  "flex flex-col items-center gap-1",
                  "flex-none"
                )}>
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2",
                    done
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-300 text-gray-400"
                  )}>
                    {stepIdx + 1}
                  </div>
                  <span className={cn("text-xs font-medium", done ? "text-blue-700" : "text-gray-400")}>
                    {labels[s]}
                  </span>
                </div>
                {i < 2 && (
                  <div className={cn("flex-1 h-0.5 mx-2 mb-4", done && stepIdx < currentIdx ? "bg-blue-600" : "bg-gray-200")} />
                )}
              </div>
            );
          })}
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>
        )}

        {/* ── Propostas dos Fornecedores ────────────────────────────────── */}
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Propostas dos Fornecedores
          </h2>

          {cotacao.fornecedores.length === 0 && (
            <p className="text-sm text-gray-400 italic">Nenhum fornecedor vinculado a esta cotação.</p>
          )}

          {cotacao.fornecedores.map((cf) => {
            const sc = STATUS_RESP[cf.status] ?? { label: cf.status, cls: "bg-gray-100 text-gray-600" };
            const isOpen = openCard === cf.id;
            const form = forms[cf.id];
            const isSaving = saving === cf.id;

            return (
              <div
                key={cf.id}
                className={cn(
                  "rounded-xl border overflow-hidden transition-all",
                  cf.melhorOpcao && cf.status === "RESPONDIDA"
                    ? "border-green-400"
                    : "border-gray-200"
                )}
              >
                {/* Card header */}
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
                    isOpen ? "bg-blue-50" : "bg-white hover:bg-gray-50",
                    cf.melhorOpcao && cf.status === "RESPONDIDA" && !isOpen && "bg-green-50"
                  )}
                  onClick={() => {
                    if (!canEdit && cf.status !== "RESPONDIDA") return;
                    setOpenCard(isOpen ? null : cf.id);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-gray-900">
                      {cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial}
                    </span>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", sc.cls)}>
                      {sc.label}
                    </span>
                    {cf.melhorOpcao && cf.status === "RESPONDIDA" && respondidas.length >= 2 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <Star className="w-3 h-3" /> Melhor preço
                      </span>
                    )}
                    {cf.status === "RESPONDIDA" && (
                      <span className="text-sm font-bold text-gray-900 ml-2">
                        {formatBRL(decimalToNumber(cf.totalCalculado))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && cf.status !== "RECUSADA" && (
                      <span className="text-xs text-blue-600 font-medium">
                        {isOpen ? "Fechar" : cf.status === "RESPONDIDA" ? "Editar proposta" : "Registrar proposta"}
                      </span>
                    )}
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Summary when responded and closed */}
                {cf.status === "RESPONDIDA" && !isOpen && (
                  <div className="px-4 pb-3 bg-white border-t border-gray-100">
                    <div className="flex gap-6 text-xs text-gray-500 mt-2 mb-3">
                      <span>Prazo: <b className="text-gray-800">{cf.prazoEntregaDias ? `${cf.prazoEntregaDias} dias` : "—"}</b></span>
                      <span>Cond. pagto: <b className="text-gray-800">{cf.condicoesPagamento || "—"}</b></span>
                      {cf.observacao && <span>Obs: <b className="text-gray-800">{cf.observacao}</b></span>}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase">
                          <th className="text-left py-1 font-medium">Produto</th>
                          <th className="text-right py-1 font-medium">Qtd</th>
                          <th className="text-right py-1 font-medium">Preço Unit.</th>
                          <th className="text-right py-1 font-medium">Subtotal</th>
                          <th className="text-center py-1 font-medium">Disp.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {cf.itens.map((item) => {
                          const preco = item.precoUnitario ? decimalToNumber(item.precoUnitario) : null;
                          const lowest = lowestPerItem.get(item.item.id);
                          const isBest = preco !== null && lowest !== undefined && preco === lowest && respondidas.length >= 2;
                          return (
                            <tr key={item.id}>
                              <td className="py-1.5">
                                <span className="text-gray-400 mr-1">{item.item.codigo}</span>
                                {item.item.descricao}
                              </td>
                              <td className="py-1.5 text-right">{decimalToNumber(item.quantidade).toLocaleString("pt-BR")}</td>
                              <td className={cn("py-1.5 text-right font-medium", isBest ? "text-green-700" : "text-gray-700")}>
                                {preco !== null ? formatBRL(preco) : "—"}
                              </td>
                              <td className="py-1.5 text-right">{item.subtotal ? formatBRL(decimalToNumber(item.subtotal)) : "—"}</td>
                              <td className="py-1.5 text-center">{item.disponivel ? "✓" : "✗"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Edit form */}
                {isOpen && form && canEdit && (
                  <div className="px-4 py-4 bg-white border-t border-blue-100 space-y-4">
                    {saveError[cf.id] && (
                      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError[cf.id]}</p>
                    )}

                    {/* Supplier details */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Prazo de Entrega (dias)</Label>
                        <Input
                          type="number" min={0}
                          value={form.prazoEntregaDias}
                          onChange={(e) => setCfField(cf.id, "prazoEntregaDias", e.target.value)}
                          placeholder="Ex: 15"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Condições de Pagamento</Label>
                        <Input
                          value={form.condicoesPagamento}
                          onChange={(e) => setCfField(cf.id, "condicoesPagamento", e.target.value)}
                          placeholder="Ex: 30/60 dias"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Observação</Label>
                        <Input
                          value={form.observacao}
                          onChange={(e) => setCfField(cf.id, "observacao", e.target.value)}
                          placeholder="Opcional"
                        />
                      </div>
                    </div>

                    {/* Item prices */}
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Produto</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Qtd</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600 w-40">Preço Unit. (R$)</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Disponível</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cf.itens.map((item) => {
                            const fi = form.itens[item.id];
                            if (!fi) return null;
                            return (
                              <tr key={item.id} className={cn(!fi.disponivel && "opacity-50")}>
                                <td className="px-3 py-2">
                                  <span className="font-mono text-xs text-gray-400 mr-2">{item.item.codigo}</span>
                                  {item.item.descricao}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-500">
                                  {decimalToNumber(item.quantidade).toLocaleString("pt-BR")} {item.item.unidadeMedida}
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number" step="0.01" min="0"
                                    className="w-full text-right"
                                    disabled={!fi.disponivel}
                                    value={fi.precoUnitario}
                                    onChange={(e) => setItemField(cf.id, item.id, "precoUnitario", e.target.value)}
                                    placeholder="0,00"
                                  />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={fi.disponivel}
                                    onChange={(e) => setItemField(cf.id, item.id, "disponivel", e.target.checked)}
                                    className="w-4 h-4 rounded"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveProposta(cf.id)}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Salvando...</>
                          : <><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar Proposta</>
                        }
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setOpenCard(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Price comparison table ────────────────────────────────────── */}
        {respondidas.length >= 2 && allItems.size > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Comparativo de Preços
            </h2>
            <div className="rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Produto</th>
                    {respondidas.map((cf) => (
                      <th key={cf.id} className={cn(
                        "text-right px-4 py-2 font-medium",
                        cf.melhorOpcao ? "text-green-700 bg-green-50" : "text-gray-600"
                      )}>
                        {cf.fornecedor.nomeFantasia || cf.fornecedor.razaoSocial}
                        {cf.melhorOpcao && <span className="ml-1">★</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from(allItems.entries()).map(([itemId, item]) => {
                    const lowest = lowestPerItem.get(itemId);
                    return (
                      <tr key={itemId} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <span className="text-gray-400 mr-1">{item.codigo}</span>
                          {item.descricao}
                        </td>
                        {respondidas.map((cf) => {
                          const cfItem = cf.itens.find((i) => i.item.id === itemId);
                          const preco = cfItem?.disponivel && cfItem.precoUnitario
                            ? decimalToNumber(cfItem.precoUnitario) : null;
                          const isBest = preco !== null && lowest !== undefined && preco === lowest;
                          return (
                            <td key={cf.id} className={cn(
                              "px-4 py-2 text-right font-medium",
                              isBest ? "text-green-700 bg-green-50/60" : "text-gray-700"
                            )}>
                              {preco !== null ? formatBRL(preco) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-4 py-2 text-gray-900">Total</td>
                    {respondidas.map((cf) => {
                      const total = decimalToNumber(cf.totalCalculado);
                      const lowestTotal = Math.min(...respondidas.map((c) => decimalToNumber(c.totalCalculado)));
                      return (
                        <td key={cf.id} className={cn(
                          "px-4 py-2 text-right text-sm",
                          total === lowestTotal ? "text-green-700" : "text-gray-900"
                        )}>
                          {formatBRL(total)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          {cotacao.status === "PENDENTE" && (
            <Button onClick={() => changeStatus("EM_ANALISE")} disabled={actioning}>
              {actioning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Iniciar Análise
            </Button>
          )}

          {cotacao.status === "EM_ANALISE" && (
            <>
              <Button
                onClick={gerarPedido}
                disabled={actioning || respondidas.length === 0}
                className="bg-green-600 hover:bg-green-700"
                title={respondidas.length === 0 ? "Registre ao menos uma proposta antes de concluir" : ""}
              >
                {actioning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Concluir e Gerar Pedido de Compra
              </Button>
              <Button
                variant="outline"
                onClick={() => changeStatus("PENDENTE")}
                disabled={actioning}
              >
                Voltar para Pendente
              </Button>
            </>
          )}

          {cotacao.status === "CONCLUIDA" && cotacao.pedidos && cotacao.pedidos.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Pedido gerado:{" "}
              {cotacao.pedidos.map((p) => (
                <Link
                  key={p.id}
                  href={`/suprimentos/pedidos-compra/${p.id}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {p.numero}
                </Link>
              ))}
            </div>
          )}

          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
        </div>
      </div>
    </div>
  );
}
