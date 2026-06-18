"use client";

import { useMemo, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn, formatDate } from "@/lib/utils";
import { useRelatorioCache } from "@/lib/use-relatorio-cache";
import { RefreshCw, AlertTriangle, Users, CalendarClock, Search, X, Wrench } from "lucide-react";
import type { QuadroOsResponse, CardOS } from "@/app/api/pcm/quadro-os/route";

const STATUS_META: Record<string, { label: string; chip: string }> = {
  A: { label: "Aberta",    chip: "bg-info/10 text-info" },
  E: { label: "Espera",    chip: "bg-warning/10 text-warning" },
  P: { label: "Progresso", chip: "bg-violet-50 text-violet-700" },
};

export default function QuadroOsPage() {
  useTabTitle("Quadro de O.S.");

  const { data, loading, refreshing, erro, recarregar } = useRelatorioCache<QuadroOsResponse>("/api/pcm/quadro-os");

  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [detalhe, setDetalhe] = useState<CardOS | null>(null);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const s of data?.setores ?? []) for (const o of s.os) if (o.tipo) set.add(o.tipo);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data]);

  const colunas = useMemo(() => {
    let lista = data?.setores ?? [];
    if (setorFiltro) lista = lista.filter((s) => s.setor === setorFiltro);
    const q = busca.toLowerCase().trim();
    return lista
      .map((s) => ({
        ...s,
        os: s.os.filter((o) => {
          if (soAtrasadas && !o.atrasada) return false;
          if (tipoFiltro && o.tipo !== tipoFiltro) return false;
          if (q && !`${o.numero} ${o.descricao} ${o.ativo ?? ""} ${o.responsaveis.join(" ")}`.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((s) => s.os.length > 0);
  }, [data, setorFiltro, tipoFiltro, busca, soAtrasadas]);

  const t = data?.totais;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Quadro de O.S. por Setor"
        subtitle="O.S. não finalizadas — cada coluna é um setor executante. Clique num card para ver os detalhes."
        breadcrumbs={[{ label: "PCM" }, { label: "Quadro de O.S." }]}
      />

      {/* Filtros */}
      <div className="px-8 pb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar O.S., ativo, responsável…"
            className="pl-8 pr-3 py-1.5 w-64 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <ComboboxWithCreate
          value={setorFiltro}
          onChange={(v) => setSetorFiltro(v)}
          noneLabel="Todos os setores"
          triggerClassName="h-9 rounded-lg max-w-[200px]"
          options={(data?.setores ?? []).map((s) => ({ value: s.setor, label: `${s.setor} (${s.total})` }))}
        />
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
        >
          <option value="">Todos os tipos</option>
          {tipos.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        <button
          onClick={() => setSoAtrasadas((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            soAtrasadas ? "bg-red-600 text-white border-red-600" : "bg-card text-muted-foreground border-border hover:bg-muted"
          )}
        >
          <AlertTriangle className="w-3 h-3" /> Só atrasadas
        </button>
        {t && (
          <span className={cn("px-2.5 py-1 rounded-full font-medium text-xs", t.atrasadas > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}>
            {t.atrasadas} atrasada(s) de {t.os}
          </span>
        )}
        <button
          onClick={recarregar}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (loading || refreshing) && "animate-spin")} />
          {refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 px-8 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados do Engeman…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="text-sm text-muted-foreground">{erro}</p>
          </div>
        ) : colunas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Nenhuma O.S. com esses filtros. 🎉</p>
        ) : (
          <div className="flex gap-3 h-full overflow-x-auto items-start pb-2">
            {colunas.map((s) => (
              <div key={s.setor} className="w-[272px] shrink-0 bg-muted/80 rounded-xl flex flex-col max-h-full">
                <div className="px-3 py-2.5 flex items-center justify-between shrink-0">
                  <h2 className="text-[13px] font-semibold text-foreground truncate" title={s.setor}>{s.setor}</h2>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.atrasadas > 0 && !soAtrasadas && (
                      <span className="px-1.5 py-0.5 rounded-full bg-danger/15 text-danger text-[10px] font-semibold" title="Atrasadas">
                        {s.atrasadas}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{s.os.length}</span>
                  </div>
                </div>
                <div className="px-2 pb-2 space-y-1.5 overflow-y-auto">
                  {s.os.map((o) => <Card key={o.codOrd} os={o} onClick={() => setDetalhe(o)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Popup de detalhe da O.S. ─────────────────────────────────────────── */}
      {detalhe && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetalhe(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm font-bold text-foreground">O.S. {detalhe.numero}</span>
                {detalhe.atrasada && (
                  <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger text-[10px] font-semibold uppercase">Atrasada</span>
                )}
                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase", (STATUS_META[detalhe.status] ?? STATUS_META.A).chip)}>
                  {(STATUS_META[detalhe.status] ?? STATUS_META.A).label}
                </span>
              </div>
              <button onClick={() => setDetalhe(null)} className="text-muted-foreground hover:text-muted-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
              <p className="text-foreground leading-relaxed">{detalhe.descricao}</p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <Info rotulo="Setor executante" valor={detalhe.setor} icone={<Wrench className="w-3 h-3" />} />
                <Info rotulo="Ativo" valor={detalhe.ativo ?? "—"} />
                <Info rotulo="Tipo de manutenção" valor={detalhe.tipo ?? "—"} />
                <Info rotulo="Aberta em" valor={detalhe.dataEntrada ? formatDate(detalhe.dataEntrada) : "—"} />
                <Info
                  rotulo="Programada para"
                  valor={detalhe.dataProgramada ? formatDate(detalhe.dataProgramada) : "—"}
                  destaque={detalhe.atrasada}
                  icone={<CalendarClock className="w-3 h-3" />}
                />
                <Info
                  rotulo="Responsáveis"
                  valor={detalhe.responsaveis.length ? detalhe.responsaveis.join(", ") : "sem responsável apontado"}
                  icone={<Users className="w-3 h-3" />}
                />
              </div>

              {(detalhe.ocorrencias.length > 0 || detalhe.causas.length > 0 || detalhe.servicos.length > 0) && (
                <div className="border-t border-border pt-3 space-y-2 text-xs">
                  {detalhe.ocorrencias.length > 0 && <Info rotulo="Ocorrência" valor={detalhe.ocorrencias.join("; ")} />}
                  {detalhe.causas.length > 0 && <Info rotulo="Causa" valor={detalhe.causas.join("; ")} />}
                  {detalhe.servicos.length > 0 && <Info rotulo="Serviço executado" valor={detalhe.servicos.join("; ")} />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ rotulo, valor, destaque, icone }: { rotulo: string; valor: string; destaque?: boolean; icone?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("flex items-center gap-1", destaque ? "text-danger font-medium" : "text-foreground")}>
        {icone}
        {valor}
      </p>
    </div>
  );
}

function Card({ os, onClick }: { os: CardOS; onClick: () => void }) {
  const meta = STATUS_META[os.status] ?? STATUS_META.A;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg bg-card shadow-sm border px-2.5 py-2 space-y-1 hover:shadow hover:border-blue-300 transition-all",
        os.atrasada ? "border-red-300" : "border-border"
      )}
    >
      <p className="text-xs text-foreground leading-snug line-clamp-2">{os.descricao}</p>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="font-mono text-[10px] font-bold text-muted-foreground">{os.numero}</span>
        {os.atrasada && (
          <span className="px-1 py-px rounded bg-danger/10 text-danger text-[9px] font-semibold uppercase">Atrasada</span>
        )}
        {os.status !== "A" && (
          <span className={cn("px-1 py-px rounded text-[9px] font-semibold uppercase", meta.chip)}>{meta.label}</span>
        )}
        {os.dataProgramada && (
          <span className={cn("inline-flex items-center gap-0.5 text-[10px] ml-auto", os.atrasada ? "text-danger font-medium" : "text-muted-foreground")}>
            <CalendarClock className="w-2.5 h-2.5" />
            {formatDate(os.dataProgramada)}
          </span>
        )}
      </div>

      {os.ativo && <p className="text-[10px] text-muted-foreground truncate">{os.ativo}</p>}

      {os.responsaveis.length > 0 && (
        <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
          <Users className="w-2.5 h-2.5 shrink-0" />
          {os.responsaveis.join(", ")}
        </p>
      )}
    </button>
  );
}
