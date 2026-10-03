"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FilePlus, FileSearch,
  Loader2, PackageCheck, RefreshCw, Search, X,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmpresaTag from "@/components/shared/EmpresaTag";
import SelectMenu from "@/components/shared/SelectMenu";
import { Input } from "@/components/ui/input";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import { cn, formatBRL, formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type Etapa = "solicitacao" | "cotacao" | "pedido" | "entrada";

type Cartao = {
  id: string;
  etapa: Etapa;
  numero: string;
  empresaId: string;
  status: string;
  href: string;
  titulo: string;
  resumo: string | null;
  valor: number | null;
  desde: string;
  prazo: string | null;
  prazoLabel: string | null;
  atrasado: boolean;
  concluido: boolean;
  prioridade: number | null;
  origens: { numero: string; href: string }[];
  busca: string;
};

type Resposta = { cartoes: Cartao[]; concluidosDias: number; geradoEm: string };

// ── Colunas (uma por processo do fluxo) ────────────────────────────────────────
const COLUNAS: { etapa: Etapa; label: string; icon: typeof ClipboardList; vazio: string; cor: string }[] = [
  { etapa: "solicitacao", label: "Solicitação",          icon: ClipboardList, vazio: "Nenhuma solicitação aguardando cotação ou pedido", cor: "bg-amber-500" },
  { etapa: "cotacao",     label: "Cotação",              icon: FileSearch,    vazio: "Nenhuma cotação em andamento",                     cor: "bg-blue-500" },
  { etapa: "pedido",      label: "Pedido de Compras",    icon: FilePlus,      vazio: "Nenhum pedido aguardando entrada",                 cor: "bg-indigo-500" },
  { etapa: "entrada",     label: "Documento de Entrada", icon: PackageCheck,  vazio: "Nenhuma entrada pendente",                         cor: "bg-emerald-500" },
];

const OPCOES_CONCLUIDOS = [
  { value: "0",  label: "Ocultar concluídos" },
  { value: "7",  label: "Concluídos: 7 dias" },
  { value: "15", label: "Concluídos: 15 dias" },
  { value: "30", label: "Concluídos: 30 dias" },
];

// Parado há mais que isto na mesma etapa → contador em destaque.
const DIAS_ALERTA = 7;

function diasDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ── Cartão ─────────────────────────────────────────────────────────────────────
function CartaoDocumento({ c }: { c: Cartao }) {
  const router = useRouter();
  const dias = diasDesde(c.desde);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(c.href)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(c.href); }}
      className={cn(
        "bg-card rounded-lg border p-3 space-y-2 cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        c.atrasado ? "border-red-300 dark:border-red-500/40" : "border-border",
        c.concluido && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{c.numero}</span>
          <EmpresaTag empresaId={c.empresaId} />
          {c.prioridade != null && c.prioridade >= 4 && (
            <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
              {c.prioridade >= 5 ? "Crítica" : "Alta"}
            </span>
          )}
        </div>
        {c.concluido ? (
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        ) : (
          <span
            title={`Nesta etapa desde ${formatDate(c.desde)}`}
            className={cn(
              "text-[11px] font-medium whitespace-nowrap shrink-0",
              dias >= DIAS_ALERTA ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {dias === 0 ? "hoje" : `${dias} d`}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm text-foreground truncate" title={c.titulo}>{c.titulo}</p>
        {c.resumo && <p className="text-xs text-muted-foreground truncate" title={c.resumo}>{c.resumo}</p>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={c.status} />
        {c.valor != null && c.valor > 0 && (
          <span className="text-xs font-semibold text-foreground whitespace-nowrap">{formatBRL(c.valor)}</span>
        )}
      </div>

      {(c.prazo || c.origens.length > 0) && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-1 min-w-0">
            {c.origens.map((o) => (
              <button
                key={o.href}
                type="button"
                title={`Abrir ${o.numero}`}
                onClick={(e) => { e.stopPropagation(); router.push(o.href); }}
                className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                {o.numero}
              </button>
            ))}
          </div>
          {c.prazo && (
            <span
              className={cn(
                "flex items-center gap-1 text-[11px] whitespace-nowrap shrink-0",
                c.atrasado ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground",
              )}
              title={c.prazoLabel ?? undefined}
            >
              {c.atrasado ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
              {formatDate(c.prazo)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AcompanhamentoComprasPage() {
  const [busca, setBusca] = useSessionState<string>("compras:acompanhamento:busca", "");
  const [soAtrasados, setSoAtrasados] = usePersistedState<boolean>("compras:acompanhamento:so-atrasados", false);
  const [concluidosDias, setConcluidosDias] = usePersistedState<string>("compras:acompanhamento:concluidos-dias", "7");

  const [data, setData] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetch(`/api/compras/acompanhamento?concluidosDias=${concluidosDias}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Erro ao carregar o acompanhamento");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [concluidosDias]);

  useEffect(() => { load(); }, [load]);

  const termo = normalizar(busca.trim());
  const porEtapa = useMemo(() => {
    const mapa: Record<Etapa, Cartao[]> = { solicitacao: [], cotacao: [], pedido: [], entrada: [] };
    for (const c of data?.cartoes ?? []) {
      if (soAtrasados && !c.atrasado) continue;
      if (termo) {
        const alvo = normalizar(
          [c.numero, c.titulo, c.resumo, c.busca, ...c.origens.map((o) => o.numero)].filter(Boolean).join(" "),
        );
        if (!alvo.includes(termo)) continue;
      }
      mapa[c.etapa].push(c);
    }
    // Atrasados no topo, depois os mais antigos na etapa; concluídos por último.
    for (const etapa of Object.keys(mapa) as Etapa[]) {
      mapa[etapa].sort((a, b) =>
        Number(a.concluido) - Number(b.concluido) ||
        Number(b.atrasado) - Number(a.atrasado) ||
        a.desde.localeCompare(b.desde),
      );
    }
    return mapa;
  }, [data, soAtrasados, termo]);

  const totalAtrasados = (data?.cartoes ?? []).filter((c) => c.atrasado).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader
          title="Acompanhamento de Compras"
          subtitle="Onde cada compra está parada: da solicitação ao documento de entrada"
          breadcrumbs={[{ label: "Compras" }, { label: "Acompanhamento" }]}
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar número, fornecedor, item..."
              className="pl-9 pr-8 h-9 text-sm"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSoAtrasados((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors",
              soAtrasados
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
            title="Mostrar só os documentos com prazo vencido"
          >
            <AlertTriangle className="w-4 h-4" />
            Atrasados{totalAtrasados > 0 ? ` (${totalAtrasados})` : ""}
          </button>
          <SelectMenu
            value={concluidosDias}
            options={OPCOES_CONCLUIDOS}
            onChange={setConcluidosDias}
            triggerClassName="h-9 text-sm"
            title="Documentos de entrada concluídos exibidos no quadro"
          />
          <button
            onClick={load}
            className="flex items-center justify-center h-9 w-9 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {erro ? (
        <div className="bg-card rounded-xl border border-border flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <p className="text-sm text-muted-foreground">{erro}</p>
        </div>
      ) : loading && !data ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-4 gap-4 min-w-[1040px]">
            {COLUNAS.map((col) => {
              const cartoes = porEtapa[col.etapa];
              const abertos = cartoes.filter((c) => !c.concluido);
              const atrasados = abertos.filter((c) => c.atrasado).length;
              const valor = abertos.reduce((s, c) => s + (c.valor ?? 0), 0);
              const Icon = col.icon;
              return (
                <div key={col.etapa} className="flex flex-col bg-muted/50 rounded-xl border border-border min-w-0">
                  <div className="px-3 py-3 border-b border-border space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", col.cor)} />
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate">{col.label}</span>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-card border border-border text-xs font-semibold text-foreground">
                        {abertos.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground h-4">
                      <span>{valor > 0 ? formatBRL(valor) : ""}</span>
                      {atrasados > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {atrasados} atrasado{atrasados > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)] min-h-[160px]">
                    {cartoes.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 text-center py-8 px-3">
                        {termo || soAtrasados ? "Nada encontrado com os filtros atuais" : col.vazio}
                      </p>
                    ) : (
                      cartoes.map((c) => <CartaoDocumento key={`${c.etapa}:${c.id}`} c={c} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
