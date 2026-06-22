"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, Plus, ChevronDown, Check } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";
import type { FlowNodeData, NodeKind, InsumoVinculo } from "@/lib/pcp/types";
import { NODE_STYLE } from "./nodes";
import ItemSearch from "@/components/pcp/ItemSearch";
import { CATEGORIA_ESTOQUE_VALUES, CATEGORIA_ESTOQUE_LABELS, CATEGORIA_ESTOQUE_ICONS, CATEGORIA_ESTOQUE_CORES } from "@/lib/categoria-estoque-ui";

// Dropdown de categoria com ícone por opção (o <select> nativo não renderiza ícones).
function CategoriaEstoqueSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const SelIcon = value ? CATEGORIA_ESTOQUE_ICONS[value as keyof typeof CATEGORIA_ESTOQUE_ICONS] : null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-cyan-500"
      >
        <span className="flex items-center gap-2 min-w-0">
          {SelIcon ? (
            <>
              <SelIcon className={cn("w-4 h-4 shrink-0", CATEGORIA_ESTOQUE_CORES[value as keyof typeof CATEGORIA_ESTOQUE_CORES])} />
              <span className="truncate text-foreground">{CATEGORIA_ESTOQUE_LABELS[value as keyof typeof CATEGORIA_ESTOQUE_LABELS]}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Selecionar…</span>
          )}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1">
          {CATEGORIA_ESTOQUE_VALUES.map((c) => {
            const Icon = CATEGORIA_ESTOQUE_ICONS[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-muted"
              >
                <Icon className={cn("w-4 h-4 shrink-0", CATEGORIA_ESTOQUE_CORES[c])} />
                <span className="truncate text-foreground">{CATEGORIA_ESTOQUE_LABELS[c]}</span>
                {value === c && <Check className="w-3.5 h-3.5 ml-auto text-cyan-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Dropdown de item filtrado pela categoria (lista os itens da categoria — o
// produto aparece direto, sem precisar digitar; o combobox tem busca embutida).
function ItemCategoriaPicker({ categoria, itemId, itemDescricao, onSelect, onClear }: {
  categoria: string;
  itemId: string | null;
  itemDescricao: string | null;
  onSelect: (it: { id: string; codigo: string; descricao: string }) => void;
  onClear: () => void;
}) {
  const [items, setItems] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`/api/itens?categoria=${encodeURIComponent(categoria)}&limit=300`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        setItems((j.data ?? []).map((it: { id: string; codigo: string; descricao: string }) => ({ id: it.id, codigo: it.codigo, descricao: it.descricao })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [categoria]);

  const options = items.map((it) => ({ value: it.id, label: it.descricao, code: it.codigo }));
  // mantém o item já selecionado visível mesmo que não venha na lista atual
  if (itemId && !options.some((o) => o.value === itemId)) {
    options.unshift({ value: itemId, label: itemDescricao ?? "item", code: "" });
  }

  return (
    <ComboboxWithCreate
      value={itemId ?? ""}
      onChange={(id) => {
        if (!id) { onClear(); return; }
        const it = items.find((x) => x.id === id);
        if (it) onSelect(it);
      }}
      noneLabel="—"
      placeholder={items.length ? "Selecionar item…" : "Nenhum item nesta categoria"}
      triggerClassName="h-9 rounded-lg"
      options={options}
    />
  );
}

interface CentroOpt { id: string; nome: string; }
interface LocalOpt { id: string; nome: string; categoriasAceitas?: string[]; }

// Locais que aceitam a categoria (vazio/legado = aceita qualquer).
function locaisDaCategoria(locais: LocalOpt[], categoria: string | null | undefined): LocalOpt[] {
  if (!categoria) return locais;
  return locais.filter((l) => !l.categoriasAceitas || l.categoriasAceitas.length === 0 || l.categoriasAceitas.includes(categoria));
}

interface Props {
  kind: NodeKind;
  data: FlowNodeData;
  centros: CentroOpt[];
  locais: LocalOpt[];
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

const inputCls = "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";
const labelCls = "block text-[11px] font-medium text-muted-foreground mb-1";

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
  // Buffer de WIP é sempre da categoria Produto em Processo (WIP).
  const bufferCategoria = "WIP";
  const catKey = (data.categoriaEstoque as string) as keyof typeof CATEGORIA_ESTOQUE_ICONS | undefined;
  const HeaderIcon = isEstoque && catKey && CATEGORIA_ESTOQUE_ICONS[catKey] ? CATEGORIA_ESTOQUE_ICONS[catKey] : s.icon;

  const insumos: InsumoVinculo[] = data.insumos ?? [];
  function setInsumo(i: number, patch: Partial<InsumoVinculo>) {
    const next = insumos.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
    onChange({ insumos: next });
  }
  function addInsumo() { onChange({ insumos: [...insumos, { itemId: "", descricao: "", consumoPorMilheiro: null }] }); }
  function rmInsumo(i: number) { onChange({ insumos: insumos.filter((_, idx) => idx !== i) }); }

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("flex w-6 h-6 items-center justify-center rounded-md", s.chipBg, s.chipText)}>
            <HeaderIcon className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-semibold text-foreground truncate">{s.label}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" title="Fechar">
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
              <label className={labelCls}>Categoria de estoque</label>
              <CategoriaEstoqueSelect
                value={(data.categoriaEstoque as string) ?? ""}
                onChange={(v) => onChange({ categoriaEstoque: v || null, itemId: null, itemDescricao: null })}
              />
            </div>
            <div>
              <label className={labelCls}>Local de estoque</label>
              {!data.categoriaEstoque ? (
                <p className="text-[11px] text-muted-foreground py-1">Selecione a categoria primeiro.</p>
              ) : (
                <ComboboxWithCreate
                  value={data.localEstoqueId ?? ""}
                  onChange={(v) => onChange({ localEstoqueId: v || null })}
                  noneLabel="—"
                  triggerClassName="h-9 rounded-lg"
                  options={locaisDaCategoria(locais, data.categoriaEstoque as string).map((l) => ({ value: l.id, label: l.nome }))}
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Item / material (real)</label>
              {!data.categoriaEstoque ? (
                <p className="text-[11px] text-muted-foreground py-1">Selecione a categoria primeiro.</p>
              ) : (
                <ItemCategoriaPicker
                  categoria={data.categoriaEstoque as string}
                  itemId={data.itemId ?? null}
                  itemDescricao={data.itemDescricao ?? null}
                  onSelect={(it) => onChange({ itemId: it.id, itemDescricao: it.descricao, label: data.label || it.descricao })}
                  onClear={() => onChange({ itemId: null, itemDescricao: null })}
                />
              )}
            </div>
          </>
        )}

        {isBuffer && (
          <>
            <div>
              <label className={labelCls}>Estado do WIP</label>
              <select className={inputCls} value={data.estadoWip ?? ""} onChange={(e) => onChange({ estadoWip: (e.target.value || null) as FlowNodeData["estadoWip"] })}>
                <option value="">—</option>
                {WIP_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Local de estoque (Produto em Processo)</label>
              <ComboboxWithCreate
                value={data.localEstoqueId ?? ""}
                onChange={(v) => onChange({ localEstoqueId: v || null })}
                noneLabel="—"
                triggerClassName="h-9 rounded-lg"
                options={locaisDaCategoria(locais, bufferCategoria).map((l) => ({ value: l.id, label: l.nome }))}
              />
            </div>
            <div>
              <label className={labelCls}>Item / material (real) — Produto em Processo</label>
              <ItemCategoriaPicker
                categoria={bufferCategoria}
                itemId={data.itemId ?? null}
                itemDescricao={data.itemDescricao ?? null}
                onSelect={(it) => onChange({ itemId: it.id, itemDescricao: it.descricao, label: data.label || it.descricao })}
                onClear={() => onChange({ itemId: null, itemDescricao: null })}
              />
            </div>
          </>
        )}

        {(isOperacao || isTransporte || isInspecao) && (
          <div>
            <label className={labelCls}>Centro de trabalho</label>
            <ComboboxWithCreate
              value={data.centroTrabalhoId ?? ""}
              onChange={(v) => {
                const id = v || null;
                const nome = centros.find((c) => c.id === id)?.nome ?? null;
                onChange({ centroTrabalhoId: id, centroTrabalhoNome: nome });
              }}
              noneLabel="—"
              triggerClassName="h-9 rounded-lg"
              options={centros.map((c) => ({ value: c.id, label: c.nome }))}
            />
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
                <button onClick={addInsumo} className="inline-flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300 hover:text-cyan-900">
                  <Plus className="w-3 h-3" /> add
                </button>
              </div>
              {insumos.length === 0 && <p className="text-[11px] text-muted-foreground">Vincule água, caco, biomassa…</p>}
              <div className="space-y-1.5">
                {insumos.map((ins, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input className={inputCls + " flex-1"} value={ins.descricao ?? ""} onChange={(e) => setInsumo(i, { descricao: e.target.value })} placeholder="insumo" />
                    <input className={inputCls + " w-20"} inputMode="decimal" value={ins.consumoPorMilheiro == null ? "" : String(ins.consumoPorMilheiro)} onChange={(e) => setInsumo(i, { consumoPorMilheiro: num(e.target.value) })} placeholder="qtd" />
                    <button onClick={() => rmInsumo(i)} className="p-1 text-muted-foreground/60 hover:text-red-500" title="Remover"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Subproduto/resíduo gerado (ex.: caco) que retorna ao estoque como insumo */}
            <div className="pt-1">
              <label className={labelCls}>Subproduto / resíduo gerado</label>
              {data.subprodutoItemId ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-sm bg-card">
                  <span className="truncate text-foreground">{data.subprodutoDescricao ?? "item"}</span>
                  <button type="button" onClick={() => onChange({ subprodutoItemId: null, subprodutoDescricao: null })}>
                    <X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground shrink-0" />
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

      <div className="p-3 border-t border-border shrink-0">
        <button onClick={onDelete} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 text-danger px-3 py-2 text-sm hover:bg-danger/10">
          <Trash2 className="w-4 h-4" /> Remover etapa
        </button>
      </div>
    </div>
  );
}
