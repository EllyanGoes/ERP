"use client";

import { useState } from "react";
import { EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FunilEdgeData } from "./types";

const fmtNum = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

function fmtTaxa(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

// Par de mini-cartões no meio da aresta, estilo Funnelytics: "Taxa" (%, em
// laranja — editável no modo forecast) e "Pessoas" (fluxo que passa pela
// aresta). No modo análise mostra a taxa aproximada real e as pessoas reais.
//
// Taxa default no forecast: aresta sem data.taxa herda 100% quando o source
// tem uma única saída; com múltiplas saídas fica indefinida ("definir %", em
// âmbar) até o usuário distribuir os percentuais — vide forecast.ts.
function ParLabel({ id, d }: { id: string; d: FunilEdgeData }) {
  const { updateEdgeData } = useReactFlow();
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState("");

  const forecast = d._modoForecast === true;
  const semTaxa = forecast && d._semTaxa === true;
  const taxa = forecast ? d._taxaEfetiva : d._taxa;
  const explicita = d.taxa != null;

  function commit() {
    setEditando(false);
    const t = txt.replace(",", ".").trim();
    if (t === "") {
      updateEdgeData(id, { taxa: null });
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    updateEdgeData(id, { taxa: Math.min(100, Math.max(0, n)) });
  }

  const boxCls = "flex flex-col items-center justify-center rounded-md border bg-card px-1.5 py-0.5 min-w-[48px] shadow-sm";
  const labelCls = "text-[8px] uppercase tracking-wide leading-none text-muted-foreground mb-0.5";

  return (
    <div className="flex items-stretch gap-1">
      <div className={cn(boxCls, semTaxa ? "border-amber-400 dark:border-amber-500/60" : "border-border")}>
        <span className={labelCls}>Taxa</span>
        {forecast ? (
          editando ? (
            <input
              autoFocus
              value={txt}
              onChange={(e) => setTxt(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                else if (e.key === "Escape") setEditando(false);
              }}
              inputMode="decimal"
              placeholder="%"
              className="w-10 rounded border border-violet-400 bg-card px-0.5 text-[10px] text-center text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTxt(d.taxa != null ? String(d.taxa) : "");
                setEditando(true);
              }}
              title={
                semTaxa
                  ? "Origem com múltiplas saídas: defina o % que segue por esta conexão"
                  : explicita
                    ? "Taxa de passagem — clique para editar"
                    : "Padrão: saída única passa 100% — clique para ajustar"
              }
              className={cn(
                "text-[10px] font-semibold leading-tight hover:underline",
                semTaxa ? "text-amber-600 dark:text-amber-400" : "text-orange-600 dark:text-orange-400",
              )}
            >
              {semTaxa ? "definir %" : `${fmtTaxa(taxa ?? 0)}%`}
            </button>
          )
        ) : (
          <span className="text-[10px] font-semibold leading-tight text-orange-600 dark:text-orange-400">≈ {Math.round(taxa ?? 0)}%</span>
        )}
      </div>
      <div className={cn(boxCls, "border-border")}>
        <span className={labelCls}>Pessoas</span>
        <span className="text-[10px] font-semibold leading-tight text-foreground">
          {d._pessoas == null ? "—" : fmtNum.format(d._pessoas)}
        </span>
      </div>
    </div>
  );
}

// Aresta do funil, estilo Funnelytics: curva bezier fininha com fluxo de
// bolinhas animadas (violeta no desenho/análise; no forecast a cor gradua
// pela taxa — verde ≥50%, âmbar <50%, cinza sem taxa). Arestas que fecham
// ciclo aparecem tracejadas em âmbar e não animam (ignoradas no cálculo).
// Os keyframes "mkt-funil-flow" são injetados uma vez pelo FunilCanvas.
export function FunilEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const d = (data ?? {}) as FunilEdgeData;
  const readonly = d._readonly === true;
  const forecast = d._modoForecast === true;
  const analiseLabel = !forecast && d._taxa != null;
  const ignorada = forecast && d._ignorada === true;
  const active = hover || selected;

  let corBolinhas = "#8b5cf6"; // violeta (desenho/análise)
  if (forecast) {
    if (d._semTaxa) corBolinhas = "#94a3b8";
    else corBolinhas = (d._taxaEfetiva ?? 0) >= 50 ? "#10b981" : "#f59e0b";
  }

  return (
    <>
      <path
        d={path}
        fill="none"
        className="transition-[stroke,stroke-width] duration-150"
        style={{
          stroke: ignorada ? "#f59e0b" : active && !readonly ? "#8b5cf6" : "#94a3b8",
          strokeWidth: active && !readonly ? 2 : 1.5,
          strokeOpacity: 0.6,
          ...(ignorada ? { strokeDasharray: "6 4", strokeOpacity: 1 } : {}),
        }}
      />
      {/* fluxo de bolinhas animadas ao longo do caminho */}
      {!ignorada && (
        <path
          d={path}
          fill="none"
          stroke={corBolinhas}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray="0.1 8"
          style={{ animation: "mkt-funil-flow 0.9s linear infinite" }}
        />
      )}
      {/* área de hit ampla p/ facilitar o hover */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: readonly ? "default" : "pointer" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      {ignorada && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="nodrag nopan pointer-events-none"
          >
            <span
              className="rounded-full border border-amber-400 dark:border-amber-500/60 bg-card px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 shadow-sm"
              title="Esta conexão fecha um ciclo e é ignorada na projeção"
            >
              ciclo ignorado
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
      {!ignorada && (forecast || analiseLabel) && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan"
          >
            <ParLabel id={id} d={d} />
          </div>
        </EdgeLabelRenderer>
      )}
      {!readonly && (
        <EdgeLabelRenderer>
          <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className={`nodrag nopan transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
          >
            <button
              onClick={() => setEdges((es) => es.filter((e) => e.id !== id))}
              title="Remover conexão"
              className="flex w-5 h-5 items-center justify-center rounded-full bg-card border border-border shadow-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/15"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { funil: FunilEdge };
