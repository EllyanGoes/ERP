"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetalheResponse, Segmento } from "@/app/api/pcm/ativo-saude/detalhe/route";

const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const fmtH = (n: number) => `${numFmt.format(n)} h`;

function fmtDT(isoStr: string | null): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * Detalhe das OS do Engeman de um ativo no mês: linha do tempo (Online / parada
 * não planejada / planejada) + tabela das OS, para validar manualmente o que
 * entra (e o que não entra) no cálculo de MTBF/MTTR.
 */
export default function DetalheOs({
  codApl,
  ano,
  mes,
}: {
  codApl: number;
  ano: number;
  mes: number;
}) {
  const [data, setData] = useState<DetalheResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [hover, setHover] = useState<Segmento | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setErro(null);
    fetch(`/api/pcm/ativo-saude/detalhe?codApl=${codApl}&ano=${ano}&mes=${mes}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 503 ? "Engeman indisponível" : "Falha ao carregar");
        return res.json();
      })
      .then((j) => vivo && setData(j))
      .catch((e) => vivo && setErro(e.message || "Erro ao carregar detalhe"))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [codApl, ano, mes]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando detalhe do Engeman…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 py-3">
        <AlertTriangle className="w-3.5 h-3.5" /> {erro}
      </div>
    );
  }
  if (!data) return null;

  const hoverOs = hover ? data.os.find((o) => o.codord === hover.codord) ?? null : null;
  const r = data.resumo;
  const ddMM = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      {/* Resumo / reconciliação */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-2.5 py-1 font-medium">
          Parada não planejada: {fmtH(r.paradaNaoPlanejada)} · {r.nFalhas} {r.nFalhas === 1 ? "falha" : "falhas"}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-1 font-medium">
          Demais OS (não descontadas): {r.nDemais} · {fmtH(r.paradaDemais)}
        </span>
        {r.semJanela > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-medium">
            <TriangleAlert className="w-3 h-3" /> {r.semJanela} sem carimbo (estimadas via HOREXEREA)
          </span>
        )}
        <span className="text-gray-400">
          Os valores em vermelho são os que entram no fechamento deste mês.
        </span>
      </div>

      {/* Linha do tempo (estilo MaintainX) */}
      <div>
        <div className="relative">
          <div className="relative h-7 w-full rounded bg-emerald-500/80 overflow-hidden" title="Verde = Online (operando)">
            {data.segmentos.map((s, i) => (
              <div
                key={`${s.codord}-${i}`}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover((h) => (h === s ? null : h))}
                className={cn(
                  "absolute top-0 h-full cursor-pointer",
                  s.tipo === "naoPlanejada" ? "bg-red-500 hover:bg-red-600" : "bg-amber-400 hover:bg-amber-500",
                )}
                style={{ left: `${s.inicioPct}%`, width: `${Math.max(s.fimPct - s.inicioPct, 0.4)}%` }}
              />
            ))}
          </div>
          {hover && (
            <div
              className="absolute z-20 bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-gray-900 text-white text-[11px] px-2 py-1 shadow-lg pointer-events-none"
              style={{ left: `${Math.min(Math.max((hover.inicioPct + hover.fimPct) / 2, 7), 93)}%` }}
            >
              <div className="font-semibold whitespace-nowrap">
                O.S. {hoverOs?.osNumero ?? hover.codord}
                {hoverOs ? ` · ${hoverOs.tipo}` : ""} · {fmtH(hover.horas)}
              </div>
              {hoverOs?.ocorrencia && (
                <div className="text-gray-300 max-w-[260px] truncate">Ocorrência: {hoverOs.ocorrencia}</div>
              )}
              {hoverOs?.causa && (
                <div className="text-gray-300 max-w-[260px] truncate">Causa: {hoverOs.causa}</div>
              )}
              {hoverOs?.servico && (
                <div className="text-gray-300 max-w-[260px] truncate">Serviço: {hoverOs.servico}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{ddMM(data.inicioMes)}</span>
          <span>{ddMM(data.fimMes)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-gray-500">
          <Legenda cor="bg-emerald-500/80" texto="Online (operando)" />
          <Legenda cor="bg-red-500" texto="Parada não planejada (desconta)" />
          <Legenda cor="bg-amber-400" texto="Planejada (não desconta)" />
          <span className="text-gray-400">Passe o mouse nas paradas para ver a OS. A timeline usa só OS com carimbo MAQPAR→MAQFUN.</span>
        </div>
      </div>

      {/* Tabela de OS */}
      {data.os.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma OS no Engeman para este ativo no mês.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
          <table className="w-full min-w-[1280px] text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-2 py-1.5 w-24">O.S.</th>
                <th className="text-left font-medium px-2 py-1.5 w-16">Tipo</th>
                <th className="text-left font-medium px-2 py-1.5">Solicitação</th>
                <th className="text-left font-medium px-2 py-1.5">Ocorrência</th>
                <th className="text-left font-medium px-2 py-1.5">Causa</th>
                <th className="text-left font-medium px-2 py-1.5">Serviço executado</th>
                <th className="text-center font-medium px-2 py-1.5 w-32">Classificação</th>
                <th className="text-left font-medium px-2 py-1.5 w-28">Início</th>
                <th className="text-left font-medium px-2 py-1.5 w-28">Fim</th>
                <th className="text-right font-medium px-2 py-1.5 w-20">Parada</th>
                <th className="text-center font-medium px-2 py-1.5 w-20">Desconta?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.os.map((o) => (
                <tr key={o.codord} className={cn(o.contabilizada && "bg-red-50/40")}>
                  <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                    <div className="font-mono">{o.osNumero}</div>
                    <div className="text-[10px] text-gray-300 font-mono">red. {o.codord}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-semibold text-gray-700" title={o.tipo}>{o.tipoSigla}</span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {o.descricao ? (
                      <span className="truncate inline-block max-w-[180px] align-middle" title={o.descricao}>{o.descricao}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {o.ocorrencia ? (
                      <span className="truncate inline-block max-w-[150px] align-middle" title={o.ocorrencia}>{o.ocorrencia}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {o.causa ? (
                      <span className="truncate inline-block max-w-[150px] align-middle" title={o.causa}>{o.causa}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {o.servico ? (
                      <span className="truncate inline-block max-w-[180px] align-middle" title={o.servico}>{o.servico}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {o.contabilizada ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">Não planejada</span>
                    ) : o.planejada ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">Planejada</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 font-medium">Outra</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 tabular-nums whitespace-nowrap">{fmtDT(o.inicio)}</td>
                  <td className="px-2 py-1.5 text-gray-600 tabular-nums whitespace-nowrap">{fmtDT(o.fim)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {fmtH(o.horas)}
                    {!o.comJanela && o.horas > 0 && (
                      <TriangleAlert className="inline w-3 h-3 text-amber-400 ml-1 align-middle" aria-label="estimado (HOREXEREA)" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {o.contabilizada ? <span className="text-red-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block w-3 h-3 rounded-sm", cor)} />
      {texto}
    </span>
  );
}
