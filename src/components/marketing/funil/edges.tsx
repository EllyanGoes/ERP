"use client";

import { useState } from "react";
import { EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import type { FunilEdgeData } from "./types";

// Aresta do funil: linha suave com botão de excluir no hover (modo desenho)
// e taxa aproximada de passagem no centro (modo análise).
// data.taxa fica reservado p/ o forecast (Fase 2).
export function FunilEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const d = (data ?? {}) as FunilEdgeData;
  const readonly = d._readonly === true;
  const taxa = d._taxa;
  const active = hover || selected;

  return (
    <>
      <path
        d={path}
        fill="none"
        markerEnd={markerEnd}
        className="transition-[stroke,stroke-width] duration-150"
        style={{ stroke: active && !readonly ? "#8b5cf6" : "#94a3b8", strokeWidth: active && !readonly ? 2.5 : 2 }}
      />
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
      {taxa != null && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="nodrag nopan pointer-events-none"
          >
            <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
              ≈ {Math.round(taxa)}%
            </span>
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
