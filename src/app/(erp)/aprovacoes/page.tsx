"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, RefreshCw, Loader2, ChevronRight, AlertTriangle, ClipboardList } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";

// ── Types ──────────────────────────────────────────────────────────────────────

type SCItem = {
  quantidade: unknown;
  unidade: string | null;
  item: { descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
};

type SC = {
  id: string;
  numero: string;
  status: string;
  prioridade: number;
  justificativa: string | null;
  solicitante: string | null;
  createdAt: string;
  filial: { id: string; nomeFantasia: string | null; razaoSocial: string } | null;
  itens: SCItem[];
};

type Aprovacao = {
  id: string;
  etapaOrdem: number;
  etapaNome: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  observacao: string | null;
  respondidoEm: string | null;
  createdAt: string;
  waMsgId: string | null;
  necessidade: SC;
};

const PRIORIDADE: Record<number, { label: string; cls: string }> = {
  1: { label: "Muito Baixa", cls: "text-gray-400" },
  2: { label: "Baixa",       cls: "text-blue-500" },
  3: { label: "Média",       cls: "text-amber-500" },
  4: { label: "Alta",        cls: "text-orange-500" },
  5: { label: "Crítica",     cls: "text-red-600 font-semibold" },
};

// ── Card de aprovação ──────────────────────────────────────────────────────────

function AprovacaoCard({
  item,
  onRefresh,
}: {
  item: Aprovacao;
  onRefresh: () => void;
}) {
  const [obs, setObs]           = useState("");
  const [showObs, setShowObs]   = useState(false);
  const [loading, setLoading]   = useState<"APROVAR" | "REPROVAR" | null>(null);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState<"APROVADO" | "REPROVADO" | null>(null);

  const sc = item.necessidade;
  const prio = PRIORIDADE[sc.prioridade] ?? { label: String(sc.prioridade), cls: "text-gray-500" };
  const filialNome = sc.filial ? sc.filial.nomeFantasia ?? sc.filial.razaoSocial : "—";
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
      setTimeout(onRefresh, 800);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={cn(
      "bg-white rounded-xl border shadow-sm overflow-hidden transition-all",
      done === "APROVADO" ? "border-emerald-200 bg-emerald-50/40" :
      done === "REPROVADO" ? "border-red-200 bg-red-50/40" :
      item.status === "APROVADO" ? "border-emerald-200 bg-emerald-50/30 opacity-75" :
      item.status === "REPROVADO" ? "border-red-200 bg-red-50/30 opacity-75" :
      "border-gray-200 hover:border-gray-300"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
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
            <span className={cn("text-xs font-medium", prio.cls)}>
              {prio.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
            {filialNome !== "—" && <span>{filialNome}</span>}
            {sc.solicitante && <span>Por: {sc.solicitante}</span>}
            <span>{new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {(done ?? item.status) === "APROVADO" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Aprovado
            </span>
          )}
          {(done ?? item.status) === "REPROVADO" && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
              <XCircle className="w-3 h-3" /> Reprovado
            </span>
          )}
          {isPendente && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" /> Pendente
            </span>
          )}
        </div>
      </div>

      {/* Descrição */}
      {sc.justificativa && (
        <div className="px-5 pb-2">
          <p className="text-sm text-gray-600 line-clamp-2">{sc.justificativa}</p>
        </div>
      )}

      {/* Itens */}
      {sc.itens.length > 0 && (
        <div className="px-5 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {sc.itens.map((it, i) => {
              const qtd = parseFloat(String(it.quantidade ?? 0));
              const un  = it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un";
              return (
                <span key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700">
                  {it.item.descricao}
                  <span className="text-gray-400 ml-1">
                    {qtd.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {un}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Observação da reprovação (histórico) */}
      {item.status === "REPROVADO" && item.observacao && (
        <div className="mx-5 mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
          <span className="font-medium">Motivo:</span> {item.observacao}
        </div>
      )}

      {/* Ações (apenas para pendentes) */}
      {isPendente && (
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/60">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {/* Campo de observação para reprovação */}
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
            <Button
              size="sm"
              onClick={() => responder("APROVAR")}
              disabled={!!loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {loading === "APROVAR" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Aprovar
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => showObs ? responder("REPROVAR") : setShowObs(true)}
              disabled={!!loading}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5"
            >
              {loading === "REPROVAR" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              {showObs ? "Confirmar Reprovação" : "Reprovar"}
            </Button>

            {showObs && (
              <Button size="sm" variant="ghost" onClick={() => { setShowObs(false); setObs(""); }} className="text-gray-400">
                Cancelar
              </Button>
            )}

            <Link
              href={`/compras/necessidades/${sc.id}`}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              Ver SC <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Link para ver SC (respondidas) */}
      {!isPendente && (
        <div className="border-t border-gray-100 px-5 py-2 flex justify-end">
          <Link
            href={`/compras/necessidades/${sc.id}`}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            Ver SC <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "PENDENTE" | "APROVADO" | "REPROVADO";

export default function AprovacoesPage() {
  useTabTitle("Aprovações");

  const [tab, setTab]             = useState<Tab>("PENDENTE");
  const [items, setItems]         = useState<Aprovacao[]>([]);
  const [total, setTotal]         = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  const load = useCallback(async (t: Tab) => {
    setLoading(true); setError("");
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

  function handleTabChange(t: Tab) {
    setTab(t);
    setItems([]);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "PENDENTE",  label: "Pendentes",  icon: <Clock className="w-3.5 h-3.5" /> },
    { id: "APROVADO",  label: "Aprovadas",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { id: "REPROVADO", label: "Reprovadas", icon: <XCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="px-8 py-8 max-w-3xl">
      <PageHeader
        title="Aprovações"
        subtitle="Solicitações de compra aguardando sua decisão"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(tab)}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
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

      {/* Content */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
          <AlertTriangle className="w-4 h-4" /> {error}
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
          <p className="text-xs mt-1 text-gray-300">
            {tab === "PENDENTE" ? "Quando uma SC for encaminhada para você, ela aparecerá aqui." : ""}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <AprovacaoCard
            key={item.id}
            item={item}
            onRefresh={() => load(tab)}
          />
        ))}
      </div>

      {!loading && total > items.length && (
        <p className="text-center text-xs text-gray-400 mt-6">
          Mostrando {items.length} de {total}
        </p>
      )}
    </div>
  );
}
