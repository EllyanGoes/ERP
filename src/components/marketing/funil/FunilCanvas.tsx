"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  ConnectionLineType,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePersistedState } from "@/lib/use-persisted-state";
import DatePicker from "@/components/shared/DatePicker";
import type { TipoFunilNo } from "@/lib/validations/marketing-funil";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import Toolbar, { type StatusFunil } from "./Toolbar";
import NoConfigSheet from "./NoConfigSheet";
import LancamentoManualDrawer from "./LancamentoManualDrawer";
import {
  metricaBase,
  TIPO_FUNIL_LABEL,
  type CampanhaOpt,
  type EtapaLeadOpt,
  type FunilDetalhe,
  type FunilEdgeData,
  type FunilFlowEdge,
  type FunilFlowNode,
  type FunilNodeData,
  type MetricasFunil,
  type ModoCanvas,
  type NoMetricas,
} from "./types";

function novoId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function isoDiasAtras(dias: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - dias);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${m}-${d}`;
}

// Remove do data tudo que é volátil ("_...") e normaliza campos antes de
// persistir — o snapshot salvo tem que ser estável p/ o dirty-check funcionar.
function cleanData(data: FunilNodeData): FunilNodeData {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;
    limpo[k] = v;
  }
  const d = limpo as FunilNodeData;
  if (!d.rotulo?.trim()) d.rotulo = TIPO_FUNIL_LABEL[d.tipo];
  if (d.urlPatterns) {
    const padroes = d.urlPatterns.map((p) => p.trim()).filter(Boolean);
    d.urlPatterns = padroes;
  }
  return d;
}

function buildCanvas(nodes: FunilFlowNode[], edges: FunilFlowEdge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? (n.data.tipo as string),
      position: { x: n.position.x, y: n.position.y },
      data: cleanData(n.data),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: "funil",
      ...(e.data?.taxa != null ? { data: { taxa: e.data.taxa } } : {}),
    })),
  };
}

function CanvasInner({ funil }: { funil: FunilDetalhe }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const initial = funil.canvas ?? { nodes: [], edges: [] };
  const [nodes, setNodes, onNodesChange] = useNodesState<FunilFlowNode>(
    (initial.nodes ?? []).map((n) => ({ id: n.id, type: n.type ?? n.data.tipo, position: n.position, data: n.data })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<FunilFlowEdge>(
    (initial.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "right",
      targetHandle: e.targetHandle ?? "left",
      type: "funil",
      ...(e.data?.taxa != null ? { data: { taxa: e.data.taxa } } : {}),
    })),
  );

  const [modo, setModo] = useState<ModoCanvas>("desenho");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lancandoNoId, setLancandoNoId] = useState<string | null>(null);
  const [nome, setNome] = useState(funil.nome);
  const [status, setStatus] = useState<StatusFunil>(funil.status);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [campanhas, setCampanhas] = useState<CampanhaOpt[]>([]);
  const [etapas, setEtapas] = useState<EtapaLeadOpt[]>([]);

  const [periodo, setPeriodo] = usePersistedState<{ de: string; ate: string }>(
    "mkt-funil-analise-periodo",
    () => ({ de: isoDiasAtras(30), ate: isoDiasAtras(0) }),
  );
  const [metricas, setMetricas] = useState<MetricasFunil | null>(null);
  const [carregandoMetricas, setCarregandoMetricas] = useState(false);

  useEffect(() => {
    fetch("/api/marketing/campanhas?limit=200")
      .then((r) => r.json())
      .then((j) => setCampanhas(j.data ?? []))
      .catch(() => {});
    fetch("/api/marketing/etapas-lead")
      .then((r) => r.json())
      .then((j) => setEtapas(j.data ?? []))
      .catch(() => {});
  }, []);

  // ── Persistência do canvas (auto-save com debounce + salvar explícito) ──
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const currentSnapshot = useMemo(() => JSON.stringify(buildCanvas(nodes, edges)), [nodes, edges]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(buildCanvas(nodesRef.current, edgesRef.current)));
  const dirty = currentSnapshot !== savedSnapshot;

  const salvarCanvas = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    const canvas = buildCanvas(nodesRef.current, edgesRef.current);
    const snap = JSON.stringify(canvas);
    savingRef.current = true;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/marketing/funis/${funil.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvas }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar");
      setSavedSnapshot(snap);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar" });
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        void salvarCanvas();
      }
    }
  }, [funil.id]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void salvarCanvas(), 2000);
    return () => clearTimeout(t);
  }, [currentSnapshot, dirty, salvarCanvas]);

  async function salvarMeta(patch: { nome?: string; status?: StatusFunil }) {
    const anterior = { nome, status };
    if (patch.nome) setNome(patch.nome);
    if (patch.status) setStatus(patch.status);
    try {
      const r = await fetch(`/api/marketing/funis/${funil.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao atualizar o funil");
    } catch (e) {
      setNome(anterior.nome);
      setStatus(anterior.status);
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao atualizar o funil" });
    }
  }

  // ── Métricas (modo análise) ──
  const carregarMetricas = useCallback(async () => {
    setCarregandoMetricas(true);
    try {
      const params = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
      const r = await fetch(`/api/marketing/funis/${funil.id}/metricas?${params.toString()}`);
      const j = await r.json();
      setMetricas(j.data ?? null);
    } catch {
      setMetricas(null);
    } finally {
      setCarregandoMetricas(false);
    }
  }, [funil.id, periodo.de, periodo.ate]);

  useEffect(() => {
    if (modo === "analise") void carregarMetricas();
  }, [modo, carregarMetricas]);

  const analise = modo === "analise";

  const campanhaNomePorId = useMemo(() => new Map(campanhas.map((c) => [c.id, c.nome])), [campanhas]);
  const etapaNomePorId = useMemo(() => new Map(etapas.map((e) => [e.id, e.nome])), [etapas]);

  // Métricas do nó: agregado da API; nó de etapa sem agregado cai no
  // contador de leads por etapa (leadsPorEtapa).
  const metricasDoNo = useCallback(
    (n: FunilFlowNode): NoMetricas | null => {
      if (!metricas) return null;
      const m = metricas.nos?.[n.id];
      if (m) return m;
      if (n.data.tipo === "ETAPA_OFFLINE" && n.data.etapaLeadId) {
        const leads = metricas.leadsPorEtapa?.[n.data.etapaLeadId] ?? 0;
        if (leads > 0) return { visitantes: 0, leads, conversoes: 0, receita: 0 };
      }
      return null;
    },
    [metricas],
  );

  const nodesView = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _analise: analise,
          _metricas: analise ? metricasDoNo(n) : null,
          _campanhaNome: n.data.campanhaId ? campanhaNomePorId.get(n.data.campanhaId) ?? null : null,
          _etapaNome: n.data.etapaLeadId ? etapaNomePorId.get(n.data.etapaLeadId) ?? null : null,
        },
      })),
    [nodes, analise, metricasDoNo, campanhaNomePorId, etapaNomePorId],
  );

  const edgesView = useMemo(() => {
    const basePorNo = new Map(nodesView.map((n) => [n.id, metricaBase(n.data._metricas)]));
    return edges.map((e) => {
      let taxa: number | null = null;
      if (analise) {
        const deBase = basePorNo.get(e.source) ?? 0;
        const paraBase = basePorNo.get(e.target) ?? 0;
        if (deBase > 0 && paraBase > 0) taxa = (paraBase / deBase) * 100;
      }
      const data: FunilEdgeData = { ...e.data, _taxa: taxa, _readonly: analise };
      return { ...e, data };
    });
  }, [edges, nodesView, analise]);

  // ── Edição ──
  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge<FunilFlowEdge>({ ...c, id: novoId("e"), type: "funil" }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (tipo: TipoFunilNo) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const centro = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      // jitter p/ nós adicionados em sequência não empilharem exatamente
      const jitter = () => Math.round((Math.random() - 0.5) * 60);
      const id = `no_${crypto.randomUUID().slice(0, 8)}`;
      const data: FunilNodeData = { tipo, rotulo: TIPO_FUNIL_LABEL[tipo], ...(tipo === "PAGINA" ? { urlPatterns: [] } : {}) };
      setNodes((nds) => [...nds, { id, type: tipo, position: { x: centro.x - 90 + jitter(), y: centro.y - 40 + jitter() }, data }]);
      setSelectedId(id);
    },
    [screenToFlowPosition, setNodes],
  );

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const lancandoNo = lancandoNoId ? nodes.find((n) => n.id === lancandoNoId) ?? null : null;

  function patchSelected(patch: Partial<FunilNodeData>) {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    const id = selectedId;
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    if (lancandoNoId === id) setLancandoNoId(null);
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        nome={nome}
        status={status}
        modo={modo}
        dirty={dirty}
        saving={saving}
        carregandoMetricas={carregandoMetricas}
        msg={msg}
        onRenomear={(novo) => void salvarMeta({ nome: novo })}
        onStatus={(s) => void salvarMeta({ status: s })}
        onModo={(m) => {
          setModo(m);
          if (m === "analise") setSelectedId(null);
          else setLancandoNoId(null);
        }}
        onAtualizarMetricas={() => void carregarMetricas()}
        onAddNode={addNode}
        onSalvar={() => void salvarCanvas()}
        periodoSlot={
          <div className="flex items-center gap-1.5">
            <DatePicker
              value={periodo.de}
              onChange={(iso) => iso && setPeriodo((p) => ({ ...p, de: iso }))}
              allowClear={false}
              max={periodo.ate || undefined}
              triggerClassName="h-8"
              className="w-32"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePicker
              value={periodo.ate}
              onChange={(iso) => iso && setPeriodo((p) => ({ ...p, ate: iso }))}
              allowClear={false}
              min={periodo.de || undefined}
              triggerClassName="h-8"
              className="w-32"
            />
          </div>
        }
      />

      <div className="flex-1 min-h-0 relative" ref={wrapperRef}>
        <ReactFlow
          nodes={nodesView}
          edges={edgesView}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => {
            if (analise) setLancandoNoId(n.id);
            else setSelectedId(n.id);
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setLancandoNoId(null);
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "funil", markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 } }}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionRadius={36}
          nodesDraggable={!analise}
          nodesConnectable={!analise}
          deleteKeyCode={analise ? null : ["Backspace", "Delete"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-muted-foreground bg-card/80 rounded-lg border border-border px-4 py-2">
              Adicione fontes, páginas e ações pela barra acima para desenhar o funil.
            </p>
          </div>
        )}

        {selected && !analise && (
          <NoConfigSheet
            tipo={selected.data.tipo}
            data={selected.data}
            campanhas={campanhas}
            etapas={etapas}
            onChange={patchSelected}
            onLancarMetricas={() => setLancandoNoId(selected.id)}
            onClose={() => setSelectedId(null)}
            onDelete={deleteSelected}
          />
        )}

        {lancandoNo && (
          <LancamentoManualDrawer
            funilId={funil.id}
            noId={lancandoNo.id}
            noRotulo={lancandoNo.data.rotulo || TIPO_FUNIL_LABEL[lancandoNo.data.tipo]}
            onClose={() => setLancandoNoId(null)}
            onChanged={() => {
              if (analise) void carregarMetricas();
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function FunilCanvas({ funil }: { funil: FunilDetalhe }) {
  return (
    <ReactFlowProvider>
      <CanvasInner funil={funil} />
    </ReactFlowProvider>
  );
}
