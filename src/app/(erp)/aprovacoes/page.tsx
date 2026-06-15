"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, Loader2, ChevronRight,
  AlertTriangle, ClipboardList, CheckSquare, Square, MinusSquare,
} from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";

// ── Types ──────────────────────────────────────────────────────────────────────

type SCItem = {
  quantidade: unknown;
  unidade: string | null;
  item: { descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
};

type SC = {
  id: string; numero: string; status: string; prioridade: number;
  justificativa: string | null; motivo: string | null; solicitante: string | null; createdAt: string;
  filial: { id: string; nomeFantasia: string | null; razaoSocial: string } | null;
  itens: SCItem[];
};

type Cotacao = {
  id: string; numero: string; nome: string | null; createdAt: string;
  necessidade: { numero: string } | null;
  fornecedores: { totalCalculado: string | number | null; fornecedor: { razaoSocial: string; nomeFantasia: string | null } }[];
};

type Aprovacao = {
  id: string; etapaOrdem: number; etapaNome: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  observacao: string | null; respondidoEm: string | null;
  createdAt: string; waMsgId: string | null;
  necessidade: SC | null;
  cotacao: Cotacao | null;
};

const PRIORIDADE: Record<number, { label: string; cls: string }> = {
  1: { label: "Muito Baixa", cls: "text-gray-400" },
  2: { label: "Baixa",       cls: "text-blue-500" },
  3: { label: "Média",       cls: "text-amber-500" },
  4: { label: "Alta",        cls: "text-orange-500" },
  5: { label: "Crítica",     cls: "text-red-600 font-semibold" },
};

// ── Card ───────────────────────────────────────────────────────────────────────

function AprovacaoCard({
  item, selected, onToggle, onRefresh, bulkActive,
}: {
  item: Aprovacao;
  selected: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  bulkActive: boolean;     // true when at least 1 item is selected globally
}) {
  const [obs, setObs]         = useState("");
  const [showObs, setShowObs] = useState(false);
  const [loading, setLoading] = useState<"APROVAR" | "REPROVAR" | null>(null);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState<"APROVADO" | "REPROVADO" | null>(null);

  const sc        = item.necessidade;
  const prio      = sc ? (PRIORIDADE[sc.prioridade] ?? { label: String(sc.prioridade), cls: "text-gray-500" }) : null;
  const filialNome = sc?.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
  const isPendente = item.status === "PENDENTE" && !done;

  async function responder(acao: "APROVAR" | "REPROVAR") {
    if (acao === "REPROVAR" && !showObs) { setShowObs(true); return; }
    setLoading(acao); setError("");
    try {
      const res = await fetch(`/api/aprovacoes/${item.id}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, observacao: obs || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erro ao responder"); setLoading(null); return; }
      setDone(acao === "APROVAR" ? "APROVADO" : "REPROVADO");
      setTimeout(onRefresh, 600);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }

  const effectiveStatus = done ?? item.status;

  // ── Aprovação de COTAÇÃO (gera o Pedido de Compras) ───────────────────────
  const cot = item.cotacao;
  if (!sc && cot) {
    const vencedor = cot.fornecedores[0];
    const venceNome = vencedor ? (vencedor.fornecedor.nomeFantasia || vencedor.fornecedor.razaoSocial) : null;
    const venceTotal = vencedor?.totalCalculado != null ? Number(vencedor.totalCalculado) : null;
    return (
      <div
        className={cn(
          "bg-white rounded-xl border shadow-sm overflow-hidden transition-all p-4",
          effectiveStatus === "APROVADO" ? "border-emerald-200 bg-emerald-50/30" :
          effectiveStatus === "REPROVADO" ? "border-red-200 bg-red-50/30" :
          "border-gray-200 hover:border-gray-300"
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/suprimentos/cotacoes/${cot.id}`} className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm">
            {cot.nome || cot.numero}
          </Link>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-100">Cotação · Pedido de Compras</span>
          {cot.necessidade && <span className="text-xs text-gray-400">SC {cot.necessidade.numero}</span>}
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {venceNome ? (
            <>Fornecedor proposto: <span className="font-medium text-gray-800">{venceNome}</span>
              {venceTotal != null && <> · <span className="tabular-nums">{venceTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></>}
            </>
          ) : "Aprovar gera o Pedido de Compras a partir do fornecedor vencedor."}
        </div>

        {showObs && isPendente && (
          <textarea
            value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Motivo da reprovação (opcional)"
            className="mt-3 w-full h-16 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {isPendente ? (
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => responder("APROVAR")} disabled={!!loading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
              {loading === "APROVAR" ? "Aprovando..." : "Aprovar e gerar pedido"}
            </button>
            <button onClick={() => responder("REPROVAR")} disabled={!!loading}
              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-60">
              {loading === "REPROVAR" ? "Reprovando..." : showObs ? "Confirmar reprovação" : "Reprovar"}
            </button>
          </div>
        ) : (
          <div className="mt-3 text-xs font-medium text-gray-500">
            {effectiveStatus === "APROVADO" ? "✅ Aprovada — pedido de compras gerado" : "❌ Reprovada"}
          </div>
        )}
      </div>
    );
  }

  if (!sc) return null;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border shadow-sm overflow-hidden transition-all",
        selected          ? "border-blue-400 ring-2 ring-blue-100" :
        done === "APROVADO"  || item.status === "APROVADO"  ? "border-emerald-200 bg-emerald-50/30" :
        done === "REPROVADO" || item.status === "REPROVADO" ? "border-red-200 bg-red-50/30" :
        "border-gray-200 hover:border-gray-300"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Checkbox — só na aba pendente */}
        {isPendente && (
          <button
            onClick={onToggle}
            className="mt-0.5 shrink-0 text-gray-300 hover:text-blue-500 transition-colors"
            title={selected ? "Desmarcar" : "Selecionar"}
          >
            {selected
              ? <CheckSquare className="w-4 h-4 text-blue-500" />
              : <Square className="w-4 h-4" />
            }
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/compras/necessidades/${sc.id}`}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm"
            >
              {sc.numero}
            </Link>
            {item.etapaNome && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                {item.etapaNome}
              </span>
            )}
            {prio && <span className={cn("text-xs font-medium", prio.cls)}>{prio.label}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            {filialNome !== "—" && <span>{filialNome}</span>}
            {sc.solicitante && <span>Por: {sc.solicitante}</span>}
            <span>{new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {effectiveStatus === "APROVADO"  && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3 h-3" /> Aprovado</span>}
          {effectiveStatus === "REPROVADO" && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full"><XCircle className="w-3 h-3" /> Reprovado</span>}
          {isPendente                      && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full"><Clock className="w-3 h-3" /> Pendente</span>}
        </div>
      </div>

      {/* Motivo da solicitação */}
      {sc.motivo && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium text-gray-500">Motivo:</span> {sc.motivo}
          </p>
        </div>
      )}

      {/* Descrição / justificativa */}
      {sc.justificativa && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-500">Descrição:</span> {sc.justificativa}
          </p>
        </div>
      )}

      {/* Itens */}
      {sc.itens.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {sc.itens.map((it, i) => {
            const qtd = parseFloat(String(it.quantidade ?? 0));
            const un  = it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
            return (
              <span key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700">
                {it.item.descricao}
                <span className="text-gray-400 ml-1">{qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {un}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Motivo reprovação (histórico) */}
      {item.status === "REPROVADO" && item.observacao && (
        <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
          <span className="font-medium">Motivo:</span> {item.observacao}
        </div>
      )}

      {/* Ações individuais — ocultas quando há seleção em lote ativa */}
      {isPendente && !bulkActive && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
          {showObs && (
            <div className="mb-3">
              <Textarea
                placeholder="Motivo da reprovação (opcional)..."
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                className="text-sm resize-none border-red-200 focus:border-red-400"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => responder("APROVAR")} disabled={!!loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              {loading === "APROVAR" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Aprovar
            </Button>
            <Button size="sm" variant="outline" disabled={!!loading}
              onClick={() => showObs ? responder("REPROVAR") : setShowObs(true)}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5">
              {loading === "REPROVAR" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              {showObs ? "Confirmar Reprovação" : "Reprovar"}
            </Button>
            {showObs && (
              <Button size="sm" variant="ghost" onClick={() => { setShowObs(false); setObs(""); }} className="text-gray-400">
                Cancelar
              </Button>
            )}
            <Link href={`/compras/necessidades/${sc.id}`}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors">
              Ver SC <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Clique na área quando em modo seleção + footer p/ não-pendentes */}
      {isPendente && bulkActive && (
        <div
          className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/40 flex items-center justify-between cursor-pointer"
          onClick={onToggle}
        >
          <span className="text-xs text-gray-400">
            {selected ? "Clique para desmarcar" : "Clique para selecionar"}
          </span>
          <Link href={`/compras/necessidades/${sc.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors">
            Ver SC <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {!isPendente && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <Link href={`/compras/necessidades/${sc.id}`}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors">
            Ver SC <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Barra de ação em lote ──────────────────────────────────────────────────────

function BulkBar({
  count, onAprovar, onReprovar, onClear, loading,
}: {
  count: number;
  onAprovar: () => void;
  onReprovar: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  const [showObs, setShowObs]   = useState(false);
  const [obs, setObs]           = useState("");

  function handleReprovar() {
    if (!showObs) { setShowObs(true); return; }
    onReprovar();          // obs is lifted via closure below
  }

  // Expose obs to parent through a ref-like pattern: we store it in the component
  // and call onReprovar which reads it — so pass obs up via a wrapper
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
        {/* Observação para reprovação */}
        {showObs && (
          <div className="px-4 pt-3 pb-2 border-b border-gray-700">
            <p className="text-xs text-gray-400 mb-1.5">Motivo da reprovação (aplicado a todas):</p>
            <Textarea
              placeholder="Opcional — deixe em branco para reprovar sem motivo"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className="text-sm resize-none bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 focus:border-red-400"
            />
          </div>
        )}

        {/* Barra principal */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Contagem + limpar */}
          <div className="flex items-center gap-2 flex-1">
            <button onClick={onClear} className="text-gray-400 hover:text-white transition-colors">
              <MinusSquare className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">
              {count} {count === 1 ? "selecionada" : "selecionadas"}
            </span>
          </div>

          {showObs && (
            <Button size="sm" variant="ghost"
              onClick={() => { setShowObs(false); setObs(""); }}
              className="text-gray-400 hover:text-white hover:bg-gray-700 text-xs">
              Cancelar
            </Button>
          )}

          <Button
            size="sm"
            disabled={loading}
            onClick={() => {
              if (showObs) {
                // pass obs externally — see wrapper below
                (window as unknown as Record<string, string>)["__bulkObs"] = obs;
                onReprovar();
                setShowObs(false);
                setObs("");
              } else {
                setShowObs(true);
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5 text-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            {showObs ? "Confirmar Reprovação" : "Reprovar"}
          </Button>

          <Button
            size="sm"
            disabled={loading}
            onClick={() => { setShowObs(false); setObs(""); onAprovar(); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Aprovar tudo
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "PENDENTE" | "APROVADO" | "REPROVADO";

export default function AprovacoesPage() {
  useTabTitle("Aprovações");

  const [tab, setTab]               = useState<Tab>("PENDENTE");
  const [items, setItems]           = useState<Aprovacao[]>([]);
  const [total, setTotal]           = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // Seleção
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError]   = useState("");

  const pendentIds = items.filter((i) => i.status === "PENDENTE").map((i) => i.id);
  const allSelected = pendentIds.length > 0 && pendentIds.every((id) => selected.has(id));
  const someSelected = pendentIds.some((id) => selected.has(id));

  const load = useCallback(async (t: Tab) => {
    setLoading(true); setError(""); setSelected(new Set());
    try {
      const res = await fetch(`/api/aprovacoes?status=${t}&limit=50`);
      if (!res.ok) { setError("Erro ao carregar aprovações"); return; }
      const json = await res.json();
      setItems(json.data ?? []);
      setTotal(json.total ?? 0);
      setPendingCount(json.pendingCount ?? 0);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  function handleTabChange(t: Tab) { setTab(t); setItems([]); setSelected(new Set()); }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pendentIds));
  }

  async function bulkResponder(acao: "APROVAR" | "REPROVAR") {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const observacao = acao === "REPROVAR"
      ? ((window as unknown as Record<string, string>)["__bulkObs"] ?? "") || undefined
      : undefined;

    setBulkLoading(true); setBulkError("");
    try {
      const res = await fetch("/api/aprovacoes/bulk-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao, observacao }),
      });
      const json = await res.json();
      if (!res.ok) { setBulkError(json.error || "Erro na operação em lote"); return; }
      if (json.erros > 0) setBulkError(`${json.ok} processadas, ${json.erros} com erro.`);
      setSelected(new Set());
      await load(tab);
    } catch {
      setBulkError("Erro de conexão");
    } finally {
      setBulkLoading(false);
      (window as unknown as Record<string, string>)["__bulkObs"] = "";
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "PENDENTE",  label: "Pendentes",  icon: <Clock className="w-3.5 h-3.5" /> },
    { id: "APROVADO",  label: "Aprovadas",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { id: "REPROVADO", label: "Reprovadas", icon: <XCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="px-8 py-8 max-w-3xl pb-32">
      <PageHeader
        title="Aprovações"
        subtitle="Solicitações de compra aguardando sua decisão"
        actions={
          <Button variant="outline" size="sm" onClick={() => load(tab)} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}>
            {t.icon}
            {t.label}
            {t.id === "PENDENTE" && pendingCount > 0 && (
              <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Selecionar todos — aba pendente com itens */}
      {tab === "PENDENTE" && pendentIds.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <button onClick={toggleAll}
            className={cn("flex items-center gap-2 text-sm transition-colors",
              allSelected ? "text-blue-600" : someSelected ? "text-blue-500" : "text-gray-400 hover:text-gray-600")}>
            {allSelected
              ? <CheckSquare className="w-4 h-4" />
              : someSelected
              ? <MinusSquare className="w-4 h-4 text-blue-400" />
              : <Square className="w-4 h-4" />}
            {allSelected ? "Desmarcar todos" : `Selecionar todos (${pendentIds.length})`}
          </button>
          {someSelected && !allSelected && (
            <span className="text-xs text-gray-400">{selected.size} selecionadas</span>
          )}
        </div>
      )}

      {/* Erros */}
      {(error || bulkError) && (
        <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error || bulkError}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
          <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {tab === "PENDENTE" ? "Nenhuma aprovação pendente" :
             tab === "APROVADO" ? "Nenhuma aprovação registrada" :
             "Nenhuma reprovação registrada"}
          </p>
          {tab === "PENDENTE" && (
            <p className="text-xs mt-1 text-gray-300">Quando uma SC for encaminhada para você, ela aparecerá aqui.</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <AprovacaoCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggleOne(item.id)}
            onRefresh={() => load(tab)}
            bulkActive={someSelected}
          />
        ))}
      </div>

      {!loading && total > items.length && (
        <p className="text-center text-xs text-gray-400 mt-6">
          Mostrando {items.length} de {total}
        </p>
      )}

      {/* Barra de ação em lote */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          loading={bulkLoading}
          onAprovar={() => bulkResponder("APROVAR")}
          onReprovar={() => bulkResponder("REPROVAR")}
          onClear={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
