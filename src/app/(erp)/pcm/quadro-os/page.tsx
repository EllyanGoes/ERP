"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn, formatDate } from "@/lib/utils";
import { RefreshCw, AlertTriangle, Users, CalendarClock } from "lucide-react";
import type { QuadroOsResponse, CardOS } from "@/app/api/pcm/quadro-os/route";

const STATUS_META: Record<string, { label: string; chip: string }> = {
  A: { label: "Aberta",    chip: "bg-blue-50 text-blue-700" },
  E: { label: "Espera",    chip: "bg-amber-50 text-amber-700" },
  P: { label: "Progresso", chip: "bg-violet-50 text-violet-700" },
};

export default function QuadroOsPage() {
  useTabTitle("Quadro de O.S.");

  const [data, setData] = useState<QuadroOsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
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

  const colunas = useMemo(() => {
    let lista = data?.setores ?? [];
    if (soAtrasadas) {
      lista = lista
        .map((s) => ({ ...s, os: s.os.filter((o) => o.atrasada) }))
        .filter((s) => s.os.length > 0);
    }
    return lista;
  }, [data, soAtrasadas]);

  const t = data?.totais;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Quadro de O.S. por Setor"
        subtitle="O.S. não finalizadas — cada coluna é um setor executante."
        breadcrumbs={[{ label: "PCM" }, { label: "Quadro de O.S." }]}
      />

      <div className="px-8 pb-3 flex flex-wrap items-center gap-2">
        {t && (
          <>
            <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium text-xs">{t.os} O.S. ativas</span>
            <span className={cn("px-2.5 py-1 rounded-full font-medium text-xs", t.atrasadas > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
              {t.atrasadas} atrasada(s)
            </span>
          </>
        )}
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
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      {/* ── Board ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-8 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados do Engeman…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : colunas.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">Nenhuma O.S. ativa com esses filtros. 🎉</p>
        ) : (
          <div className="flex gap-3 h-full overflow-x-auto items-start pb-2">
            {colunas.map((s) => (
              <div key={s.setor} className="w-[272px] shrink-0 bg-gray-100/80 rounded-xl flex flex-col max-h-full">
                {/* cabeçalho da coluna */}
                <div className="px-3 py-2.5 flex items-center justify-between shrink-0">
                  <h2 className="text-[13px] font-semibold text-gray-700 truncate" title={s.setor}>{s.setor}</h2>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.atrasadas > 0 && !soAtrasadas && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold" title="Atrasadas">
                        {s.atrasadas}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-semibold">{s.os.length}</span>
                  </div>
                </div>
                {/* cards */}
                <div className="px-2 pb-2 space-y-1.5 overflow-y-auto">
                  {s.os.map((o) => <Card key={o.codOrd} os={o} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ os }: { os: CardOS }) {
  const meta = STATUS_META[os.status] ?? STATUS_META.A;
  const tooltip = [
    `O.S. ${os.numero} — ${meta.label}`,
    os.descricao,
    os.ativo ? `Ativo: ${os.ativo}` : null,
    os.tipo ? `Tipo: ${os.tipo}` : null,
    os.dataProgramada ? `Programada: ${formatDate(os.dataProgramada)}` : null,
    os.dataEntrada ? `Aberta em: ${formatDate(os.dataEntrada)}` : null,
    os.responsaveis.length ? `Responsáveis: ${os.responsaveis.join(", ")}` : "Sem responsável apontado",
  ].filter(Boolean).join("\n");

  return (
    <div
      className={cn(
        "rounded-lg bg-white shadow-sm border px-2.5 py-2 space-y-1 cursor-default hover:shadow transition-shadow",
        os.atrasada ? "border-red-300" : "border-gray-200"
      )}
      title={tooltip}
    >
      <p className="text-xs text-gray-800 leading-snug line-clamp-2">{os.descricao}</p>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="font-mono text-[10px] font-bold text-gray-500">{os.numero}</span>
        {os.atrasada && (
          <span className="px-1 py-px rounded bg-red-50 text-red-700 text-[9px] font-semibold uppercase">Atrasada</span>
        )}
        {os.status !== "A" && (
          <span className={cn("px-1 py-px rounded text-[9px] font-semibold uppercase", meta.chip)}>{meta.label}</span>
        )}
        {os.dataProgramada && (
          <span className={cn("inline-flex items-center gap-0.5 text-[10px] ml-auto", os.atrasada ? "text-red-600 font-medium" : "text-gray-400")}>
            <CalendarClock className="w-2.5 h-2.5" />
            {formatDate(os.dataProgramada)}
          </span>
        )}
      </div>

      {os.ativo && <p className="text-[10px] text-gray-400 truncate">{os.ativo}</p>}

      {os.responsaveis.length > 0 && (
        <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
          <Users className="w-2.5 h-2.5 shrink-0" />
          {os.responsaveis.join(", ")}
        </p>
      )}
    </div>
  );
}
