"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn, formatDate } from "@/lib/utils";
import { RefreshCw, AlertTriangle, Users, CalendarClock, Wrench } from "lucide-react";
import type { QuadroOsResponse, CardOS } from "@/app/api/pcm/quadro-os/route";

const STATUS_META: Record<string, { label: string; chip: string; coluna: string }> = {
  A: { label: "Em aberto",    chip: "bg-blue-50 text-blue-700 border-blue-200",   coluna: "border-t-blue-400" },
  E: { label: "Em espera",    chip: "bg-amber-50 text-amber-700 border-amber-200", coluna: "border-t-amber-400" },
  P: { label: "Em progresso", chip: "bg-violet-50 text-violet-700 border-violet-200", coluna: "border-t-violet-400" },
};

export default function QuadroOsPage() {
  useTabTitle("Quadro de O.S.");

  const [data, setData] = useState<QuadroOsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [setorFiltro, setSetorFiltro] = useState<string>("");
  const [soAtrasadas, setSoAtrasadas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/pcm/quadro-os");
      if (!res.ok) { setErro("Não foi possível carregar (Engeman indisponível?)"); setData(null); return; }
      setData(await res.json());
    } catch {
      setErro("Erro de conexão.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setores = useMemo(() => {
    let lista = data?.setores ?? [];
    if (setorFiltro) lista = lista.filter((s) => s.setor === setorFiltro);
    if (soAtrasadas) {
      lista = lista
        .map((s) => ({ ...s, os: s.os.filter((o) => o.atrasada) }))
        .filter((s) => s.os.length > 0);
    }
    return lista;
  }, [data, setorFiltro, soAtrasadas]);

  const t = data?.totais;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Quadro de O.S. por Setor"
        subtitle="O.S. não finalizadas agrupadas por setor executante — o que está pendente e o que está em execução, com responsáveis e detalhes."
        breadcrumbs={[{ label: "PCM" }, { label: "Quadro de O.S." }]}
      />

      <div className="px-8 pb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          Setor
          <select
            value={setorFiltro}
            onChange={(e) => setSetorFiltro(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[240px]"
          >
            <option value="">Todos os setores</option>
            {(data?.setores ?? []).map((s) => (
              <option key={s.setor} value={s.setor}>{s.setor} ({s.total})</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setSoAtrasadas((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            soAtrasadas ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          )}
        >
          <AlertTriangle className="w-3 h-3" /> Só atrasadas
        </button>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados do Engeman…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : data && (
          <>
            {/* resumo */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{t!.os} O.S. ativas</span>
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{t!.emAberto} em aberto</span>
              {t!.emEspera > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">{t!.emEspera} em espera</span>}
              {t!.emProgresso > 0 && <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium">{t!.emProgresso} em progresso</span>}
              <span className={cn("px-2.5 py-1 rounded-full font-medium", t!.atrasadas > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
                {t!.atrasadas} atrasada(s)
              </span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{t!.setores} setor(es)</span>
            </div>

            {setores.length === 0 && (
              <p className="text-sm text-gray-400 py-12 text-center">Nenhuma O.S. ativa com esses filtros. 🎉</p>
            )}

            {/* um bloco por setor executante */}
            {setores.map((s) => (
              <section key={s.setor} className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-gray-400" />
                    {s.setor}
                  </h2>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{s.os.length} O.S.</span>
                    {s.atrasadas > 0 && !soAtrasadas && (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">{s.atrasadas} atrasada(s)</span>
                    )}
                  </div>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {s.os.map((o) => <Card key={o.codOrd} os={o} />)}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ os }: { os: CardOS }) {
  const meta = STATUS_META[os.status] ?? STATUS_META.A;
  return (
    <div className={cn("rounded-lg border bg-white shadow-sm border-t-4 px-3.5 py-3 space-y-2", meta.coluna, os.atrasada ? "border-red-200" : "border-gray-200")}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-bold text-gray-700">O.S. {os.numero}</span>
        <div className="flex items-center gap-1">
          {os.atrasada && (
            <span className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-medium">Atrasada</span>
          )}
          <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium", meta.chip)}>{meta.label}</span>
        </div>
      </div>

      <p className="text-sm text-gray-800 leading-snug line-clamp-3" title={os.descricao}>{os.descricao}</p>

      <div className="text-xs text-gray-500 space-y-1">
        {os.ativo && <p className="truncate" title={os.ativo}>🔧 {os.ativo}</p>}
        {os.tipo && <p className="text-gray-400">{os.tipo}</p>}
        <p className="flex items-center gap-1">
          <CalendarClock className="w-3 h-3" />
          {os.dataProgramada
            ? <>programada p/ <span className={cn(os.atrasada && "text-red-600 font-medium")}>{formatDate(os.dataProgramada)}</span></>
            : os.dataEntrada ? <>aberta em {formatDate(os.dataEntrada)}</> : "sem data"}
        </p>
      </div>

      <div className="flex items-start gap-1.5 pt-1 border-t border-gray-100 text-xs">
        <Users className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
        {os.responsaveis.length > 0 ? (
          <span className="text-gray-600">{os.responsaveis.join(", ")}</span>
        ) : (
          <span className="text-gray-300">sem responsável apontado</span>
        )}
      </div>
    </div>
  );
}
