"use client";

import { X, Trash2, Plus, ArrowRight, Save, RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import ItemSearch from "@/components/pcp/ItemSearch";
import NovaEngenhariaDialog from "@/components/pcp/NovaEngenhariaDialog";
import { NODE_STYLE } from "./nodes";
import NodeConfigFields, { type CentroOpt, type LocalOpt, type EstadoWipOpt } from "./NodeConfigFields";
import type { FlowNodeData, NodeKind, InsumoVinculo, FlowGraph } from "@/lib/pcp/types";
import { SOURCE_KINDS, SINK_KINDS, nodeItens } from "@/lib/pcp/types";

interface Props {
  data: FlowNodeData;
  graph: FlowGraph;
  nodeId: string;
  kind: NodeKind;
  fluxoId: string;
  centros: CentroOpt[];
  locais: LocalOpt[];
  estadosWip: EstadoWipOpt[];
  onChange: (patch: Partial<FlowNodeData>) => void;
  onPatchNode: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  onSave: () => Promise<string | null>;
  saving: boolean;
  dirty: boolean;
  onClose: () => void;
  onDelete: () => void;
}

interface ProdutoEng { itemId: string; codigo?: string; descricao: string; insumoItemIds: string[]; }

const inputCls = "w-full rounded-lg border border-border px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-cyan-500";
const labelCls = "block text-[11px] font-medium text-muted-foreground mb-1";

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Cartão de um nó conectado (entrada/saída).
function NodeChip({ kind, label, sub }: { kind: NodeKind; label: string; sub?: string | null }) {
  const s = NODE_STYLE[kind];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
      <span className={`flex w-7 h-7 shrink-0 items-center justify-center rounded-md ${s.chipBg} ${s.chipText}`}>
        <s.icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">{s.label}</p>
        <p className="text-sm font-medium text-foreground truncate leading-tight">{label || "Sem nome"}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function NodeModal({ data, graph, nodeId, kind, fluxoId, centros, locais, estadosWip, onChange, onPatchNode, onSave, saving, dirty, onClose, onDelete }: Props) {
  const [mounted, setMounted] = useState(false);
  const [engProdutos, setEngProdutos] = useState<ProdutoEng[]>([]);
  const [novoEngOpen, setNovoEngOpen] = useState(false);
  const isOperacao = kind === "OPERACAO";

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Produtos possíveis (só na operação) = itens com engenharia neste fluxo.
  useEffect(() => {
    if (!isOperacao) return;
    let active = true;
    fetch("/api/pcp/engenharia")
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const lista = (j.data ?? [])
          .filter((e: { fluxo?: { id: string }; ativo: boolean }) => e.ativo && e.fluxo?.id === fluxoId)
          .map((e: { item: { id: string; codigo: string; descricao: string }; insumoItemIds?: string[] }) => ({ itemId: e.item.id, codigo: e.item.codigo, descricao: e.item.descricao, insumoItemIds: e.insumoItemIds ?? [] }));
        setEngProdutos(lista);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [fluxoId, isOperacao]);

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const entradas = graph.edges.filter((e) => e.target === nodeId).map((e) => nodeById.get(e.source)).filter(Boolean) as FlowGraph["nodes"];
  const saidas = graph.edges.filter((e) => e.source === nodeId).map((e) => nodeById.get(e.target)).filter(Boolean) as FlowGraph["nodes"];

  const insumos: InsumoVinculo[] = data.insumos ?? [];
  function setInsumo(i: number, patch: Partial<InsumoVinculo>) { onChange({ insumos: insumos.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }); }
  function addInsumo() { onChange({ insumos: [...insumos, { itemId: "", descricao: "", consumoPorMilheiro: null }] }); }
  function rmInsumo(i: number) { onChange({ insumos: insumos.filter((_, idx) => idx !== i) }); }

  // Itens reais que entram nesta etapa (produtos/insumos dos nós a montante).
  const entradaItemIds = new Set<string>(entradas.flatMap((n) => nodeItens(n.data).map((i) => i.itemId)).filter(Boolean));
  // Só dá para filtrar pela BOM se as entradas têm itens reais vinculados.
  const podeFiltrarPorEntradas = entradaItemIds.size > 0;
  // Produto aparece se (entradas sem item vinculado → mostra todos) OU todos os insumos da
  // engenharia dele estão entre as entradas (BOM vazia passa por vacuidade).
  const produtosPossiveisVisiveis = engProdutos.filter(
    (p) => !podeFiltrarPorEntradas || p.insumoItemIds.every((id) => entradaItemIds.has(id)),
  );
  // Estado WIP de saída (do buffer a jusante), p/ a tag informativa.
  const estadoSaidaCodigo = (saidas.find((n) => n.data.kind === "BUFFER_WIP")?.data.estadoWip as string | undefined) ?? null;
  const estadoSaidaNome = estadoSaidaCodigo ? (estadosWip.find((e) => e.codigo === estadoSaidaCodigo)?.nome ?? estadoSaidaCodigo) : null;

  const produtos = data.produtosPossiveis ?? [];
  function toggleProduto(p: ProdutoEng) {
    const exists = produtos.some((x) => x.itemId === p.itemId);
    onChange({ produtosPossiveis: exists ? produtos.filter((x) => x.itemId !== p.itemId) : [...produtos, { itemId: p.itemId, codigo: p.codigo, descricao: p.descricao }] });
    // A saída da etapa vai para o estoque seguinte (que aceita vários produtos).
    const estoqueSaidas = saidas.filter((n) => n.data.kind === "BUFFER_WIP" || n.data.kind === "ESTOCAGEM_PA");
    for (const n of estoqueSaidas) {
      const atuais = nodeItens(n.data);
      const novos = exists ? atuais.filter((x) => x.itemId !== p.itemId) : (atuais.some((x) => x.itemId === p.itemId) ? atuais : [...atuais, { itemId: p.itemId, descricao: p.descricao }]);
      onPatchNode(n.id, { itens: novos, itemId: novos[0]?.itemId ?? null, itemDescricao: novos[0]?.descricao ?? null });
    }
  }

  // Início = sem entrada (fonte); Fim = sem saída (sink). Layout adapta o nº de painéis.
  const hasInput = !SOURCE_KINDS.includes(kind);
  const hasOutput = !SINK_KINDS.includes(kind);
  const cols = hasInput && hasOutput ? "1fr 1.25fr 1fr" : hasOutput ? "1.25fr 1fr" : "1fr 1.25fr";

  const s = NODE_STYLE[kind];

  if (!mounted) return null;

  const painelEntradas = (
    <div className="border-r border-border bg-muted/30 overflow-y-auto p-3 space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <ArrowRight className="w-3.5 h-3.5" /> Entradas
      </p>
      <div className="space-y-1.5">
        {entradas.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma etapa conectada à entrada.</p>}
        {entradas.map((n) => (<NodeChip key={n.id} kind={n.data.kind} label={n.data.label} sub={nodeItens(n.data).map((i) => i.descricao).join(", ") || null} />))}
      </div>
      {isOperacao && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className={labelCls + " mb-0"}>Insumos por milheiro</p>
            <button onClick={addInsumo} className="inline-flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300 hover:text-cyan-900"><Plus className="w-3 h-3" /> add</button>
          </div>
          {insumos.length === 0 && <p className="text-[11px] text-muted-foreground">Vincule água, caco, biomassa…</p>}
          <div className="space-y-1.5">
            {insumos.map((ins, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={inputCls + " flex-1"} value={ins.descricao ?? ""} onChange={(e) => setInsumo(i, { descricao: e.target.value })} placeholder="insumo" />
                <input className={inputCls + " w-16"} inputMode="decimal" value={ins.consumoPorMilheiro == null ? "" : String(ins.consumoPorMilheiro)} onChange={(e) => setInsumo(i, { consumoPorMilheiro: num(e.target.value) })} placeholder="qtd" />
                <button onClick={() => rmInsumo(i)} className="p-1 text-muted-foreground/60 hover:text-red-500" title="Remover"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const painelSaidas = (
    <div className={`bg-muted/30 overflow-y-auto p-3 space-y-4 ${hasInput ? "" : "border-l border-border"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center justify-end gap-1.5">
        Saídas <ArrowRight className="w-3.5 h-3.5" />
      </p>
      {isOperacao && estadoSaidaNome && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 dark:bg-cyan-500/15 border border-cyan-200 dark:border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
            Saída em WIP: {estadoSaidaNome}
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {saidas.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma etapa conectada à saída.</p>}
        {saidas.map((n) => (<NodeChip key={n.id} kind={n.data.kind} label={n.data.label} sub={nodeItens(n.data).map((i) => i.descricao).join(", ") || null} />))}
      </div>
      {isOperacao && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + " mb-0"}>Produtos possíveis (engenharia do produto)</label>
              <button onClick={() => setNovoEngOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300 hover:text-cyan-900">
                <Plus className="w-3 h-3" /> novo
              </button>
            </div>
            <NovaEngenhariaDialog
              open={novoEngOpen}
              onOpenChange={setNovoEngOpen}
              fluxoId={fluxoId}
              permitirNovoProduto
              onCreated={({ item }) => {
                setEngProdutos((prev) => prev.some((p) => p.itemId === item.id) ? prev : [...prev, { itemId: item.id, codigo: item.codigo, descricao: item.descricao, insumoItemIds: [] }]);
                if (!produtos.some((x) => x.itemId === item.id)) {
                  onChange({ produtosPossiveis: [...produtos, { itemId: item.id, codigo: item.codigo, descricao: item.descricao }] });
                }
              }}
            />
            {produtosPossiveisVisiveis.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{engProdutos.length === 0 ? "Nenhum produto com engenharia neste fluxo. Use “+ novo” ou cadastre na Engenharia do Produto." : "Nenhum produto fazível com as entradas. Vincule os itens reais nos nós de entrada e cadastre a BOM (Engenharia do Produto)."}</p>
            ) : (
              <div className="space-y-1">
                {produtosPossiveisVisiveis.map((p) => {
                  const checked = produtos.some((x) => x.itemId === p.itemId);
                  return (
                    <button key={p.itemId} type="button" onClick={() => toggleProduto(p)} className={`w-full flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${checked ? "border-cyan-400 bg-cyan-50 dark:bg-cyan-500/15" : "border-border bg-card hover:bg-muted"}`}>
                      <span className={`flex w-4 h-4 shrink-0 items-center justify-center rounded border ${checked ? "bg-cyan-500 border-cyan-500" : "border-border"}`}>
                        {checked && (<svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>)}
                      </span>
                      {p.codigo && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.codigo}</span>}
                      <span className="truncate text-foreground">{p.descricao}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Subproduto / resíduo gerado</label>
            {data.subprodutoItemId ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-sm bg-card">
                <span className="truncate text-foreground">{data.subprodutoDescricao ?? "item"}</span>
                <button type="button" onClick={() => onChange({ subprodutoItemId: null, subprodutoDescricao: null })}><X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground shrink-0" /></button>
              </div>
            ) : (
              <ItemSearch onSelect={(it) => onChange({ subprodutoItemId: it.id, subprodutoDescricao: it.descricao })} placeholder="Resíduo que volta ao estoque…" />
            )}
          </div>
        </>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex w-6 h-6 items-center justify-center rounded-md ${s.chipBg} ${s.chipText}`}>
              <s.icon className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">{s.label}</span>
            <input
              value={data.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Nome da etapa"
              className="text-sm font-semibold text-foreground bg-transparent outline-none border-b border-transparent focus:border-cyan-500 min-w-0"
            />
          </div>
          <div className="flex items-center gap-2">
            {(dirty || saving) && (
              <button onClick={() => onSave()} disabled={saving} title="Salvar fluxo" className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </button>
            )}
            <button onClick={onDelete} title="Remover etapa" className="p-1.5 rounded-lg text-danger hover:bg-danger/10"><Trash2 className="w-4 h-4" /></button>
            <button onClick={onClose} title="Fechar" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Painéis: Entradas · Configuração · Saídas (início/fim = 2 painéis) */}
        <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: cols }}>
          {hasInput && painelEntradas}
          <div className={`overflow-y-auto p-4 space-y-3 ${hasOutput ? "border-r border-border" : ""}`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Configuração da etapa</p>
            <NodeConfigFields kind={kind} data={data} centros={centros} locais={locais} estadosWip={estadosWip} onChange={onChange} />
          </div>
          {hasOutput && painelSaidas}
        </div>
      </div>
    </div>,
    document.body,
  );
}
