"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes, NODE_STYLE } from "@/components/pcp/editor/nodes";
import ItemSearch from "@/components/pcp/ItemSearch";
import { RefreshCw, X, PlayCircle, Loader2, CalendarDays, Boxes, Layers, PackageCheck } from "lucide-react";
import type { FlowGraph, FlowNode, NodeKind } from "@/lib/pcp/types";

type SaldoLinha = { itemId: string; codigo: string | null; descricao: string; quantidade: number; unidade: string | null };
type Saldo = { total: number; itens: SaldoLinha[] };
type PlanoLinha = { itemId: string; quantidade: number; origem: "MANUAL" | "MPS"; codigo: string | null; descricao: string };
type ChaoData = {
  fluxo: { fluxoId: string; nome: string; versao: number; grafo: FlowGraph };
  saldos: Record<string, Saldo>;
  plano: PlanoLinha[];
  data: string;
};

const fmtQty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const hoje = () => new Date().toISOString().slice(0, 10);
const ESTOQUE_KINDS = new Set<NodeKind>(["ESTOQUE_INSUMO", "BUFFER_WIP", "ESTOCAGEM_PA"]);

export default function ChaoView() {
  const [dia, setDia] = useState(hoje());
  const [chao, setChao] = useState<ChaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // estado do painel "gerar OP"
  const [opItem, setOpItem] = useState<{ id: string; descricao: string } | null>(null);
  const [opQtd, setOpQtd] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const j = await fetch(`/api/pcp/chao?data=${dia}`).then((r) => r.json());
      if (!j.data) { setChao(null); setErro(j.error ?? "Nenhum fluxo publicado."); return; }
      setChao(j.data);
    } catch { setErro("Erro ao carregar."); }
    finally { setLoading(false); }
  }, [dia]);
  useEffect(() => { load(); }, [load]);

  const selNode: FlowNode | null = useMemo(
    () => chao?.fluxo.grafo.nodes.find((n) => n.id === selId) ?? null,
    [chao, selId],
  );

  const rfNodes: Node[] = useMemo(() => (chao?.fluxo.grafo.nodes ?? []).map((n) => {
    const saldo = chao?.saldos[n.id];
    // Badge do saldo na fase, com a unidade quando todos os itens compartilham a mesma.
    let saldoBadge: string | undefined;
    if (saldo) {
      const uns = Array.from(new Set(saldo.itens.map((i) => i.unidade).filter(Boolean)));
      const un = uns.length === 1 ? ` ${uns[0]}` : "";
      saldoBadge = `${fmtQty(saldo.total)}${un}`;
    }
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      draggable: false,
      data: { ...n.data, saldoBadge },
    } as Node;
  }), [chao]);
  const rfEdges: Edge[] = useMemo(() => (chao?.fluxo.grafo.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target })), [chao]);

  async function rotinaDiaria() {
    if (!confirm(`Gerar todas as OPs planejadas para ${dia}?`)) return;
    setBusy(true); setAviso(null);
    try {
      const j = await fetch("/api/pcp/chao/rotina-diaria", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: dia }),
      }).then((r) => r.json());
      const c = j.data?.criadas?.length ?? 0;
      const p = j.data?.puladas?.length ?? 0;
      setAviso(`Rotina: ${c} OP(s) geradas${p ? `, ${p} puladas` : ""}.`);
      await load();
    } finally { setBusy(false); }
  }

  async function gerarOP() {
    if (!opItem || !(Number(opQtd) > 0)) return;
    setBusy(true); setAviso(null);
    try {
      const j = await fetch("/api/pcp/chao/op", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapaNodeId: selId, itens: [{ itemId: opItem.id, quantidade: Number(opQtd) }] }),
      }).then((r) => r.json());
      if (j.data?.criadas?.length) {
        setAviso(`OP ${j.data.criadas[0].numero} gerada.`);
        setOpItem(null); setOpQtd(""); setSelId(null);
        await load();
      } else {
        setAviso(j.data?.puladas?.[0]?.motivo ?? j.error ?? "Não foi possível gerar a OP.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Fluxo de Trabalho</h1>
          <p className="text-xs text-muted-foreground">{chao ? `${chao.fluxo.nome} · v${chao.fluxo.versao}` : "Fluxo de processo compartilhado"}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-9 rounded-lg border border-border px-2 text-sm" />
        </div>
        {chao && (
          <span className="text-xs text-muted-foreground">
            Planejado do dia: <b>{chao.plano.length}</b> produto(s)
            {chao.plano.some((p) => p.origem === "MPS") && <span className="text-warning"> (derivado do MPS)</span>}
          </span>
        )}
        <div className="flex-1" />
        {aviso && <span className="text-xs text-success">{aviso}</span>}
        <button onClick={load} className="p-2 rounded-lg text-muted-foreground hover:bg-muted" title="Recarregar"><RefreshCw className="w-4 h-4" /></button>
        <button
          onClick={rotinaDiaria}
          disabled={busy || !chao}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Rotina diária
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : !chao ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Layers className="w-8 h-8 text-muted-foreground/60" />
            <p className="text-sm">{erro ?? "Nenhum fluxo de processo publicado."}</p>
            <p className="text-xs">Publique uma versão de um fluxo em PCP → Fluxos.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => { setSelId(n.id); setOpItem(null); setOpQtd(""); }}
            onPaneClick={() => setSelId(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        )}

        {/* Painel lateral por nó */}
        {selNode && chao && (
          <NodePanel
            node={selNode}
            saldo={chao.saldos[selNode.id]}
            onClose={() => setSelId(null)}
            opItem={opItem} setOpItem={setOpItem} opQtd={opQtd} setOpQtd={setOpQtd}
            onGerarOP={gerarOP} busy={busy}
          />
        )}
      </div>
    </div>
  );
}

function NodePanel({
  node, saldo, onClose, opItem, setOpItem, opQtd, setOpQtd, onGerarOP, busy,
}: {
  node: FlowNode;
  saldo?: Saldo;
  onClose: () => void;
  opItem: { id: string; descricao: string } | null;
  setOpItem: (v: { id: string; descricao: string } | null) => void;
  opQtd: string;
  setOpQtd: (v: string) => void;
  onGerarOP: () => void;
  busy: boolean;
}) {
  const kind = node.type as NodeKind;
  const s = NODE_STYLE[kind];
  const isEstoque = ESTOQUE_KINDS.has(kind);
  const isOperacao = kind === "OPERACAO";
  const Icon = kind === "ESTOCAGEM_PA" ? PackageCheck : kind === "BUFFER_WIP" ? Layers : Boxes;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex w-6 h-6 items-center justify-center rounded-md ${s.chipBg} ${s.chipText}`}><s.icon className="w-3.5 h-3.5" /></span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{s.label}</p>
            <p className="text-sm font-semibold text-foreground truncate">{node.data.label || "Sem nome"}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isEstoque && (
          <>
            <div className="flex items-center gap-2 text-foreground">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Saldo nesta fase</span>
              <span className="ml-auto text-sm font-bold">{saldo ? fmtQty(saldo.total) : "0"}</span>
            </div>
            {!node.data.localEstoqueId ? (
              <p className="text-xs text-warning">Nó sem local de estoque configurado (defina no editor do fluxo).</p>
            ) : !saldo || saldo.itens.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem produtos nesta fase.</p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-gray-50">
                {saldo.itens.map((i) => (
                  <div key={i.itemId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="min-w-0">
                      {i.codigo && <span className="font-mono text-xs text-muted-foreground mr-1">{i.codigo}</span>}
                      <span className="text-foreground">{i.descricao}</span>
                    </span>
                    <span className="font-medium text-foreground shrink-0">{fmtQty(i.quantidade)} <span className="text-xs text-muted-foreground">{i.unidade ?? ""}</span></span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {isOperacao && (
          <>
            <p className="text-sm font-medium text-foreground">Gerar Ordem de Produção</p>
            <p className="text-xs text-muted-foreground">Escolha o produto e a quantidade. A OP usa o fluxo do produto (engenharia).</p>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Produto</label>
              {opItem ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-sm">
                  <span className="truncate text-foreground">{opItem.descricao}</span>
                  <button onClick={() => setOpItem(null)}><X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground" /></button>
                </div>
              ) : (
                <ItemSearch onSelect={(it) => setOpItem({ id: it.id, descricao: it.descricao })} placeholder="Buscar produto…" />
              )}
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Quantidade planejada</label>
              <input value={opQtd} onChange={(e) => setOpQtd(e.target.value)} inputMode="decimal" placeholder="ex.: 10"
                className="w-full h-9 rounded-lg border border-border px-2.5 text-sm" />
            </div>
            <button
              onClick={onGerarOP}
              disabled={busy || !opItem || !(Number(opQtd) > 0)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-white px-3 py-2 text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Gerar OP
            </button>
          </>
        )}

        {!isEstoque && !isOperacao && (
          <p className="text-xs text-muted-foreground">Etapa de {s.label.toLowerCase()} — sem saldo nem geração de OP.</p>
        )}
      </div>
    </div>
  );
}
