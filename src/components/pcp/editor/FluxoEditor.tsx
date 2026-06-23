"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  ConnectionLineType,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Rocket, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { nodeTypes, PALETTE, NODE_STYLE } from "./nodes";
import NodeModal from "./OperacaoModal";
import { edgeTypes } from "./edges";
import { validarFluxo } from "@/lib/pcp/fluxo-validate";
import { KIND_LABEL, type FlowNodeData, type NodeKind, type FlowGraph } from "@/lib/pcp/types";

export interface FluxoEditorData {
  id: string;
  nome: string;
  versaoAtual: { id: string; versao: number; status: string; grafo: FlowGraph } | null;
}
interface CentroOpt { id: string; nome: string; }

let _seq = 0;
function newId(prefix: string) {
  _seq += 1;
  return `${prefix.toLowerCase()}_${Date.now().toString(36)}_${_seq}`;
}
function defaultData(kind: NodeKind): FlowNodeData {
  return { kind, label: KIND_LABEL[kind] };
}
function cleanData(d: FlowNodeData): FlowNodeData {
  const copy = { ...d };
  delete copy.isBottleneck;
  return copy;
}

function EditorInner({ fluxo }: { fluxo: FluxoEditorData }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const initial = fluxo.versaoAtual?.grafo ?? { nodes: [], edges: [] };
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initial.nodes ?? []).map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })) as Node[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initial.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, type: "flow" })) as Edge[],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centros, setCentros] = useState<CentroOpt[]>([]);
  const [locais, setLocais] = useState<CentroOpt[]>([]);
  const [estadosWip, setEstadosWip] = useState<{ codigo: string; nome: string }[]>([]);
  const [status, setStatus] = useState<string>(fluxo.versaoAtual?.status ?? "RASCUNHO");
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [nome, setNome] = useState(fluxo.nome);
  const [editandoNome, setEditandoNome] = useState(false);

  async function salvarNome() {
    const novo = nome.trim();
    setEditandoNome(false);
    if (!novo || novo === fluxo.nome) { setNome(fluxo.nome); return; }
    try {
      const r = await fetch(`/api/pcp/fluxos/${fluxo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao renomear");
      fluxo.nome = j.data.nome;
      setNome(j.data.nome);
      setMsg({ kind: "ok", text: "Nome atualizado." });
    } catch (e) {
      setNome(fluxo.nome);
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao renomear" });
    }
  }

  useEffect(() => {
    fetch("/api/pcp/centros-trabalho").then((r) => r.json()).then((j) => setCentros(j.data ?? [])).catch(() => {});
    fetch("/api/suprimentos/locais-estoque?ativo=true").then((r) => r.json()).then((j) => setLocais(Array.isArray(j) ? j : j.data ?? [])).catch(() => {});
    fetch("/api/pcp/estados-wip").then((r) => r.json()).then((j) => setEstadosWip((j.data ?? []).filter((e: { ativo: boolean }) => e.ativo).map((e: { codigo: string; nome: string }) => ({ codigo: e.codigo, nome: e.nome })))).catch(() => {});
  }, []);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: newId("e"), type: "flow" }, eds)),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) => [...nds, { id: newId(kind), type: kind, position, data: defaultData(kind) } as Node]);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Validação ao vivo + detecção de gargalo
  const graph: FlowGraph = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? "OPERACAO", position: n.position, data: n.data as FlowNodeData })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }),
    [nodes, edges],
  );
  const validation = useMemo(() => validarFluxo(graph), [graph]);

  // Snapshot do grafo p/ detectar alterações não salvas (dirty).
  const currentSnapshot = useMemo(() => JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: cleanData(n.data as FlowNodeData) })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }), [nodes, edges]);
  useEffect(() => { if (savedSnapshot === null) setSavedSnapshot(currentSnapshot); }, [currentSnapshot, savedSnapshot]);
  const dirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot;

  const nodesView = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...(n.data as FlowNodeData), isBottleneck: n.id === validation.bottleneckNodeId },
      })),
    [nodes, validation.bottleneckNodeId],
  );

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;

  function patchSelected(patch: Partial<FlowNodeData>) {
    if (!selectedId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedId ? { ...n, data: { ...(n.data as FlowNodeData), ...patch } } : n)),
    );
  }
  function patchNode(nodeId: string, patch: Partial<FlowNodeData>) {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as FlowNodeData), ...patch } } : n)),
    );
  }
  function deleteSelected() {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }

  async function salvar(): Promise<string | null> {
    setSaving(true);
    setMsg(null);
    try {
      const grafo = {
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: cleanData(n.data as FlowNodeData) })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      };
      const r = await fetch(`/api/pcp/fluxos/${fluxo.id}/versoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grafo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar");
      setStatus(j.data.status);
      setSavedSnapshot(JSON.stringify(grafo));
      setMsg({ kind: "ok", text: "Salvo." });
      return j.data.id as string;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar" });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publicar() {
    const vId = await salvar();
    if (!vId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/pcp/fluxos/${fluxo.id}/versoes/${vId}/publicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao publicar");
      setStatus("PUBLICADA");
      setMsg({ kind: "ok", text: "Fluxo publicado ✓" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao publicar" });
    } finally {
      setSaving(false);
    }
  }

  const erros = validation.issues.filter((i) => i.level === "error").length;
  const avisos = validation.issues.filter((i) => i.level === "warning").length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
        <button onClick={() => router.push("/pcp/fluxos")} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title="Voltar">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          {editandoNome ? (
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={salvarNome}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvarNome();
                else if (e.key === "Escape") { setNome(fluxo.nome); setEditandoNome(false); }
              }}
              className="text-sm font-semibold text-foreground bg-transparent border-b border-primary outline-none w-48"
            />
          ) : (
            <button
              onClick={() => setEditandoNome(true)}
              title="Clique para renomear"
              className="text-sm font-semibold text-foreground truncate hover:text-primary text-left max-w-[12rem] truncate"
            >
              {nome}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">
            Versão {fluxo.versaoAtual?.versao ?? 1} · {status === "PUBLICADA" ? "publicada" : status === "ARQUIVADA" ? "arquivada" : "rascunho"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {erros > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-danger">
              <AlertTriangle className="w-3.5 h-3.5" /> {erros} erro(s){avisos ? `, ${avisos} aviso(s)` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="w-3.5 h-3.5" /> válido{avisos ? ` · ${avisos} aviso(s)` : ""}
            </span>
          )}
          {msg && <span className={cn("text-xs", msg.kind === "ok" ? "text-success" : "text-danger")}>{msg.text}</span>}
          <button onClick={salvar} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
          <button
            onClick={publicar}
            disabled={saving || erros > 0}
            title={erros > 0 ? "Corrija os erros para publicar" : "Validar e publicar"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" /> Publicar
          </button>
        </div>
      </div>

      {/* Paleta + canvas + config */}
      <div className="flex-1 min-h-0 flex">
        <div className="w-44 border-r border-border bg-muted/60 p-2 space-y-1.5 shrink-0 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">Arraste para o quadro</p>
          {PALETTE.map((p) => {
            const st = NODE_STYLE[p.kind];
            return (
              <div
                key={p.kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/reactflow", p.kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-cyan-300"
              >
                <span className={cn("flex w-5 h-5 items-center justify-center rounded", st.chipBg, st.chipText)}>
                  <st.icon className="w-3 h-3" />
                </span>
                <span className="text-xs text-foreground">{p.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex-1 relative" ref={wrapperRef}>
          <ReactFlow
            nodes={nodesView}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "flow", markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 } }}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {selected && (
            <NodeModal
              data={selected.data as FlowNodeData}
              graph={graph}
              nodeId={selected.id}
              kind={(selected.data as FlowNodeData).kind}
              fluxoId={fluxo.id}
              centros={centros}
              locais={locais}
              estadosWip={estadosWip}
              onChange={patchSelected}
              onPatchNode={patchNode}
              onSave={salvar}
              saving={saving}
              dirty={dirty}
              onClose={() => setSelectedId(null)}
              onDelete={deleteSelected}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function FluxoEditor({ fluxo }: { fluxo: FluxoEditorData }) {
  return (
    <ReactFlowProvider>
      <EditorInner fluxo={fluxo} />
    </ReactFlowProvider>
  );
}
