"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import CategoriaEstoqueSelect from "@/components/shared/CategoriaEstoqueSelect";
import { CentroTrabalhoQuickCreate } from "@/components/shared/QuickCreateDialogs";
import { cn } from "@/lib/utils";
import { CATEGORIA_ESTOQUE_ICONS, CATEGORIA_ESTOQUE_CORES } from "@/lib/categoria-estoque-ui";
import { nodeItens, type FlowNodeData, type NodeKind } from "@/lib/pcp/types";

type ItemRef = { itemId: string; descricao: string };

export interface CentroOpt { id: string; nome: string; }
export interface LocalOpt { id: string; nome: string; categoriasAceitas?: string[]; }

// Locais que aceitam a categoria (vazio/legado = aceita qualquer).
export function locaisDaCategoria(locais: LocalOpt[], categoria: string | null | undefined): LocalOpt[] {
  if (!categoria) return locais;
  return locais.filter((l) => !l.categoriasAceitas || l.categoriasAceitas.length === 0 || l.categoriasAceitas.includes(categoria));
}

// Opções do combobox de local com o ícone da categoria (ex.: WIP = Produto em Processo).
function localOptions(locais: LocalOpt[], categoria: string | null | undefined) {
  const Icon = categoria ? CATEGORIA_ESTOQUE_ICONS[categoria as keyof typeof CATEGORIA_ESTOQUE_ICONS] : null;
  const cor = categoria ? CATEGORIA_ESTOQUE_CORES[categoria as keyof typeof CATEGORIA_ESTOQUE_CORES] : "";
  return locaisDaCategoria(locais, categoria).map((l) => ({
    value: l.id,
    label: l.nome,
    render: Icon ? () => (
      <span className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4 shrink-0", cor)} />
        <span className="truncate">{l.nome}</span>
      </span>
    ) : undefined,
  }));
}

const inputCls = "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-cyan-500";
const labelCls = "block text-[11px] font-medium text-muted-foreground mb-1";


function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strv(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

// Multi-select de produtos filtrado pela categoria (e opcionalmente por estado WIP):
// uma etapa de estoque/WIP pode conter mais de um produto.
function ItensMultiPicker({ categoria, estadoWip, itens, onChange }: {
  categoria: string;
  estadoWip?: string | null;
  itens: ItemRef[];
  onChange: (itens: ItemRef[]) => void;
}) {
  const [items, setItems] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`/api/itens?categoria=${encodeURIComponent(categoria)}${estadoWip ? `&estadoWip=${encodeURIComponent(estadoWip)}` : ""}&limit=300`)
      .then((r) => r.json())
      .then((j) => { if (active) setItems((j.data ?? []).map((it: { id: string; codigo: string; descricao: string }) => ({ id: it.id, codigo: it.codigo, descricao: it.descricao }))); })
      .catch(() => {});
    return () => { active = false; };
  }, [categoria, estadoWip]);

  const selecionados = new Set(itens.map((i) => i.itemId));
  const options = items.filter((it) => !selecionados.has(it.id)).map((it) => ({ value: it.id, label: it.descricao, code: it.codigo }));

  return (
    <div className="space-y-1.5">
      <ComboboxWithCreate
        value=""
        onChange={(id) => { const it = items.find((x) => x.id === id); if (it) onChange([...itens, { itemId: it.id, descricao: it.descricao }]); }}
        allowNone={false}
        noneLabel="—"
        placeholder={items.length ? "Adicionar produto…" : "Nenhum item nesta categoria"}
        triggerClassName="h-9 rounded-lg"
        options={options}
      />
      {itens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {itens.map((i) => (
            <span key={i.itemId} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground">
              {i.descricao}
              <button type="button" onClick={() => onChange(itens.filter((x) => x.itemId !== i.itemId))}><X className="w-3 h-3 text-muted-foreground/60 hover:text-red-500" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface EstadoWipOpt { codigo: string; nome: string; }

interface Props {
  kind: NodeKind;
  data: FlowNodeData;
  centros: CentroOpt[];
  locais: LocalOpt[];
  estadosWip: EstadoWipOpt[];
  onChange: (patch: Partial<FlowNodeData>) => void;
}

// Campos de configuração ("Parameters") de cada tipo de nó — usados no meio do modal.
// Setup/Ciclo saíram: são calculados pelos apontamentos de produção.
export default function NodeConfigFields({ kind, data, centros, locais, estadosWip, onChange }: Props) {
  const isOperacao = kind === "OPERACAO";
  const isTransporte = kind === "TRANSPORTE";
  const isInspecao = kind === "INSPECAO";
  const isBuffer = kind === "BUFFER_WIP";
  const isEstoque = kind === "ESTOQUE_INSUMO" || kind === "ESTOCAGEM_PA";
  const bufferCategoria = "WIP";

  return (
    <div className="space-y-3">
      {isEstoque && (
        <>
          <div>
            <label className={labelCls}>Categoria de estoque</label>
            <CategoriaEstoqueSelect
              value={(data.categoriaEstoque as string) ?? ""}
              onChange={(v) => onChange({ categoriaEstoque: v || null, itens: [], itemId: null, itemDescricao: null })}
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
                options={localOptions(locais, data.categoriaEstoque as string)}
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Produtos / materiais</label>
            {!data.categoriaEstoque ? (
              <p className="text-[11px] text-muted-foreground py-1">Selecione a categoria primeiro.</p>
            ) : (
              <ItensMultiPicker
                categoria={data.categoriaEstoque as string}
                itens={nodeItens(data)}
                onChange={(itens) => onChange({ itens, itemId: itens[0]?.itemId ?? null, itemDescricao: itens[0]?.descricao ?? null, label: data.label || itens[0]?.descricao || "" })}
              />
            )}
          </div>
        </>
      )}

      {isBuffer && (
        <>
          <div>
            <label className={labelCls}>Estado do WIP</label>
            <select className={inputCls} value={data.estadoWip ?? ""} onChange={(e) => onChange({ estadoWip: (e.target.value || null) as FlowNodeData["estadoWip"], itens: [], itemId: null, itemDescricao: null })}>
              <option value="">—</option>
              {estadosWip.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Local de estoque (Produto em Processo)</label>
            <ComboboxWithCreate
              value={data.localEstoqueId ?? ""}
              onChange={(v) => onChange({ localEstoqueId: v || null })}
              noneLabel="—"
              triggerClassName="h-9 rounded-lg"
              options={localOptions(locais, bufferCategoria)}
            />
          </div>
          <div>
            <label className={labelCls}>Produtos em processo (nesta fase)</label>
            {!data.estadoWip ? (
              <p className="text-[11px] text-muted-foreground py-1">Selecione o estado do WIP primeiro.</p>
            ) : (
              <ItensMultiPicker
                categoria={bufferCategoria}
                estadoWip={data.estadoWip as string}
                itens={nodeItens(data)}
                onChange={(itens) => onChange({ itens, itemId: itens[0]?.itemId ?? null, itemDescricao: itens[0]?.descricao ?? null, label: data.label || itens[0]?.descricao || "" })}
              />
            )}
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
              const nome = id ? (centros.find((c) => c.id === id)?.nome ?? null) : null;
              onChange({ centroTrabalhoId: id, centroTrabalhoNome: nome });
            }}
            noneLabel="—"
            triggerClassName="h-9 rounded-lg"
            createLabel="centro de trabalho"
            renderCreateModal={(args) => <CentroTrabalhoQuickCreate {...args} />}
            options={centros.map((c) => ({ value: c.id, label: c.nome }))}
          />
        </div>
      )}

      {isOperacao && (
        <>
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
                {estadosWip.map((o) => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Lote / vagão</label>
              <input className={inputCls} inputMode="decimal" value={strv(data.loteVagao)} onChange={(e) => onChange({ loteVagao: num(e.target.value) })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Setup e ciclo são calculados pelos apontamentos de produção.</p>
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
  );
}
