"use client";

import { X, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNodeData, NodeKind, InsumoVinculo } from "@/lib/pcp/types";
import { NODE_STYLE } from "./nodes";
import ItemSearch from "@/components/pcp/ItemSearch";

interface CentroOpt { id: string; nome: string; }

interface Props {
  kind: NodeKind;
  data: FlowNodeData;
  centros: CentroOpt[];
  locais: CentroOpt[];
  onChange: (patch: Partial<FlowNodeData>) => void;
  onClose: () => void;
  onDelete: () => void;
}

const WIP_OPCOES = [
  { v: "UMIDO", l: "Úmido" },
  { v: "SECO", l: "Seco" },
  { v: "QUEIMADO", l: "Queimado" },
  { v: "ACABADO", l: "Acabado" },
];

const inputCls = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";
const labelCls = "block text-[11px] font-medium text-gray-500 mb-1";

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strv(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

export default function NodeConfigSheet({ kind, data, centros, locais, onChange, onClose, onDelete }: Props) {
  const s = NODE_STYLE[kind];
  const isOperacao = kind === "OPERACAO";
  const isTransporte = kind === "TRANSPORTE";
  const isBuffer = kind === "BUFFER_WIP";
  const isInspecao = kind === "INSPECAO";
  const isEstoque = kind === "ESTOQUE_INSUMO" || kind === "ESTOCAGEM_PA";

  const insumos: InsumoVinculo[] = data.insumos ?? [];
  function setInsumo(i: number, patch: Partial<InsumoVinculo>) {
    const next = insumos.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
    onChange({ insumos: next });
  }
  function addInsumo() { onChange({ insumos: [...insumos, { itemId: "", descricao: "", consumoPorMilheiro: null }] }); }
  function rmInsumo(i: number) { onChange({ insumos: insumos.filter((_, idx) => idx !== i) }); }

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("flex w-6 h-6 items-center justify-center rounded-md", s.chipBg, s.chipText)}>
            <s.icon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-semibold text-gray-800 truncate">{s.label}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className={labelCls}>Nome da etapa</label>
          <input className={inputCls} value={data.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="ex.: Queima" />
        </div>

        {isEstoque && (
          <>
            <div>
              <label className={labelCls}>Item / material (real)</label>
              {data.itemId ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm bg-white">
                  <span className="truncate text-gray-700">{data.itemDescricao ?? "item"}</span>
                  <button type="button" onClick={() => onChange({ itemId: null, itemDescricao: null })} title="Trocar">
                    <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 shrink-0" />
                  </button>
                </div>
              ) : (
                <ItemSearch
                  onSelect={(it) => onChange({ itemId: it.id, itemDescricao: it.descricao, label: data.label || it.descricao })}
                  placeholder="Buscar item real…"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Local de estoque</label>
              <select className={inputCls} value={data.localEstoqueId ?? ""} onChange={(e) => onChange({ localEstoqueId: e.target.value || null })}>
                <option value="">—</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          </>
        )}

        {isBuffer && (
          <div>
            <label className={labelCls}>Estado do WIP</label>
            <select className={inputCls} value={data.estadoWip ?? ""} onChange={(e) => onChange({ estadoWip: (e.target.value || null) as FlowNodeData["estadoWip"] })}>
              <option value="">—</option>
              {WIP_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        )}

        {(isOperacao || isTransporte || isInspecao) && (
          <div>
            <label className={labelCls}>Centro de trabalho</label>
            <select
              className={inputCls}
              value={data.centroTrabalhoId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const nome = centros.find((c) => c.id === id)?.nome ?? null;
                onChange({ centroTrabalhoId: id, centroTrabalhoNome: nome });
              }}
            >
              <option value="">—</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {isOperacao && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Setup (min)</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.setupMin)} onChange={(e) => onChange({ setupMin: num(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Ciclo (h)</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.tempoCicloHoras)} onChange={(e) => onChange({ tempoCicloHoras: num(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Capacidade</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.capacidade)} onChange={(e) => onChange({ capacidade: num(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Unidade</label>
                <input className={inputCls} value={data.unidadeCapacidade ?? ""} onChange={(e) => onChange({ unidadeCapacidade: e.target.value })} placeholder="milheiro/ciclo" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>Perda (%)</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.perdaPct)} onChange={(e) => onChange({ perdaPct: num(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Janela mín (h)</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.janelaMinH)} onChange={(e) => onChange({ janelaMinH: num(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Janela máx (h)</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.janelaMaxH)} onChange={(e) => onChange({ janelaMaxH: num(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Estado entrada</label>
                <select className={inputCls} value={data.estadoWip ?? ""} onChange={(e) => onChange({ estadoWip: (e.target.value || null) as FlowNodeData["estadoWip"] })}>
                  <option value="">—</option>
                  {WIP_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Lote / vagão</label>
                <input className={inputCls} inputMode="decimal" value={strv(data.loteVagao)} onChange={(e) => onChange({ loteVagao: num(e.target.value) })} />
              </div>
            </div>

            {/* Insumos vinculados (água, caco, biomassa…) */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls + " mb-0"}>Insumos por milheiro</label>
                <button onClick={addInsumo} className="inline-flex items-center gap-1 text-[11px] text-cyan-700 hover:text-cyan-900">
                  <Plus className="w-3 h-3" /> add
                </button>
              </div>
              {insumos.length === 0 && <p className="text-[11px] text-gray-400">Vincule água, caco, biomassa…</p>}
              <div className="space-y-1.5">
                {insumos.map((ins, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input className={inputCls + " flex-1"} value={ins.descricao ?? ""} onChange={(e) => setInsumo(i, { descricao: e.target.value })} placeholder="insumo" />
                    <input className={inputCls + " w-20"} inputMode="decimal" value={ins.consumoPorMilheiro == null ? "" : String(ins.consumoPorMilheiro)} onChange={(e) => setInsumo(i, { consumoPorMilheiro: num(e.target.value) })} placeholder="qtd" />
                    <button onClick={() => rmInsumo(i)} className="p-1 text-gray-300 hover:text-red-500" title="Remover"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Subproduto/resíduo gerado (ex.: caco) que retorna ao estoque como insumo */}
            <div className="pt-1">
              <label className={labelCls}>Subproduto / resíduo gerado</label>
              {data.subprodutoItemId ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm bg-white">
                  <span className="truncate text-gray-700">{data.subprodutoDescricao ?? "item"}</span>
                  <button type="button" onClick={() => onChange({ subprodutoItemId: null, subprodutoDescricao: null })}>
                    <X className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 shrink-0" />
                  </button>
                </div>
              ) : (
                <ItemSearch onSelect={(it) => onChange({ subprodutoItemId: it.id, subprodutoDescricao: it.descricao })} placeholder="Resíduo que volta ao estoque…" />
              )}
            </div>
          </>
        )}

        {isTransporte && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Lote / vagão</label>
              <input className={inputCls} inputMode="decimal" value={strv(data.loteVagao)} onChange={(e) => onChange({ loteVagao: num(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls}>Lote / vagoneta</label>
              <input className={inputCls} inputMode="decimal" value={strv(data.loteVagoneta)} onChange={(e) => onChange({ loteVagoneta: num(e.target.value) })} />
            </div>
          </div>
        )}

        {isInspecao && (
          <div>
            <label className={labelCls}>Perda esperada (%)</label>
            <input className={inputCls} inputMode="decimal" value={strv(data.perdaPct)} onChange={(e) => onChange({ perdaPct: num(e.target.value) })} />
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-100 shrink-0">
        <button onClick={onDelete} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm hover:bg-red-50">
          <Trash2 className="w-4 h-4" /> Remover etapa
        </button>
      </div>
    </div>
  );
}
