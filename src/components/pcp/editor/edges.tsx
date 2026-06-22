"use client";

import { useState } from "react";
import { EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";

// Edge estilo n8n: linha suave, realça no hover/seleção e mostra botão de excluir.
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const active = hover || selected;

  return (
    <>
      <path
        d={path}
        fill="none"
        markerEnd={markerEnd}
        className="transition-[stroke,stroke-width] duration-150"
        style={{ stroke: active ? "#06b6d4" : "#94a3b8", strokeWidth: active ? 2.5 : 2 }}
      />
      {/* área de hit ampla p/ facilitar o hover */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
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
    </>
  );
}

export const edgeTypes = { flow: FlowEdge };
