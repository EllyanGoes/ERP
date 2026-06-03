"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { statusMinutaLabel, confirmacaoMinutaLabel, TIPO_MINUTA_LABEL, type TipoMinuta } from "@/lib/minuta-labels";
import {
  Search, X, Loader2, Truck, MapPin, GripVertical, CalendarDays,
  ChevronLeft, ChevronRight, Route, PackageCheck, Send, UserX,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
type StatusMinuta = "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";

type Cliente = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
  estado: string | null;
};

type Minuta = {
  id: string;
  numero: string;
  numeroFisico: string | null;
  tipo: TipoMinuta;
  status: StatusMinuta;
  dataEmissao: string;
  dataEntrega: string | null;
  ordemEntrega: number | null;
  motorista: { id: string; nome: string } | null;
  placa: string | null;
  pedidoVenda: { id: string; numero: string; cliente: Cliente };
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string }[];
};

type Motorista = { id: string; nome: string; ativo: boolean };

type RoteiroUpdate = {
  id: string;
  motoristaId?: string | null;
  dataEntrega?: string | null;
  ordemEntrega?: number | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const NONE = "__none__"; // lane das minutas sem motorista
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const STATUS_DOT: Record<StatusMinuta, string> = {
  PENDENTE: "bg-amber-400",
  SAIU_PARA_ENTREGA: "bg-blue-500",
  ENTREGUE: "bg-emerald-500",
  CANCELADA: "bg-red-400",
};

// ── Date helpers (UTC, consistentes com formatDate do projeto) ──────────────────
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}
function addDaysISO(s: string, n: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}
function dayBounds(s: string): { from: string; to: string } {
  return { from: `${s}T00:00:00.000Z`, to: `${s}T23:59:59.999Z` };
}
/** Segunda-feira da semana que contém `s`, seguida dos 7 dias. */
function weekDaysISO(s: string): string[] {
  const d = parseISODate(s);
  const dow = d.getUTCDay(); // 0=Dom .. 6=Sáb
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = addDaysISO(s, deltaToMonday);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}
/** Dia (YYYY-MM-DD) de um dataEntrega ISO, ou null. */
function entregaDay(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}
function formatDayLabel(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function clienteNome(c: Cliente): string {
  return c.nomeFantasia || c.razaoSocial;
}
function clienteLocal(c: Cliente): string {
  const parts = [c.bairro, c.cidade].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

// Ordena minutas de uma raia: por ordemEntrega (asc, nulos por último), depois número.
function sortStops(list: Minuta[]): Minuta[] {
  return [...list].sort((a, b) => {
    const oa = a.ordemEntrega ?? Number.POSITIVE_INFINITY;
    const ob = b.ordemEntrega ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return a.numero.localeCompare(b.numero);
  });
}

// ── Stop card (visão Dia) ───────────────────────────────────────────────────
function StopCard({
  m, ordem, onClick, onDragStart, onDragEnd, isDragging, onStatus, busy,
}: {
  m: Minuta;
  ordem: number;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onStatus: (next: StatusMinuta) => void;
  busy: boolean;
}) {
  const cliente = m.pedidoVenda.cliente;
  const local = clienteLocal(cliente);
  const finalizado = m.status === "ENTREGUE";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group select-none",
        isDragging && "opacity-40 scale-95",
        finalizado && "opacity-75",
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="flex items-center justify-center w-5 h-5 shrink-0 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">
          {ordem}
        </span>
        <span className="font-mono text-xs font-bold text-gray-800">{m.numero}</span>
        <span className="font-mono text-xs text-gray-400 ml-auto">{m.pedidoVenda.numero}</span>
        <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <p className="text-xs text-gray-700 font-medium leading-snug line-clamp-2">
        {clienteNome(cliente)}
      </p>
      {local && (
        <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{local}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <StatusBadge status={m.status} label={statusMinutaLabel(m.status, m.tipo)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
          {TIPO_MINUTA_LABEL[m.tipo] ?? "Entrega"}
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">
          {m.itens.length} item{m.itens.length !== 1 ? "s" : ""}
        </span>
      </div>

      {m.placa && (
        <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
          <Truck className="w-3 h-3 shrink-0" />
          <span>{m.placa}</span>
        </div>
      )}

      {/* Ações de status */}
      {(m.status === "PENDENTE" || m.status === "SAIU_PARA_ENTREGA") && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {m.status === "PENDENTE" ? (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onStatus("SAIU_PARA_ENTREGA"); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" /> {confirmacaoMinutaLabel(m.tipo) === "Confirmar Retirada" ? "Aguardar retirada" : "Marcar saída"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onStatus("ENTREGUE"); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              <PackageCheck className="w-3 h-3" /> {confirmacaoMinutaLabel(m.tipo)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgendaEntregasPage() {
  useTabTitle("Agenda de Entregas");
  const router = useRouter();

  const [view, setView] = useState<"dia" | "semana">("dia");
  const [day, setDay] = useState<string>(() => toISODate(new Date()));
  const [search, setSearch] = useState("");

  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ laneId: string; index: number } | null>(null);

  const motById = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  // ── Load ────────────────────────────────────────────────────────────────
  const range = useMemo(() => {
    if (view === "dia") return dayBounds(day);
    const days = weekDaysISO(day);
    return { from: `${days[0]}T00:00:00.000Z`, to: `${days[6]}T23:59:59.999Z` };
  }, [view, day]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [minRes, motRes] = await Promise.all([
        fetch(`/api/comercial/minutas?dataFrom=${range.from}&dataTo=${range.to}`),
        fetch("/api/comercial/motoristas?ativo=true"),
      ]);
      const minJson = await minRes.json();
      const motJson = await motRes.json();
      setMinutas((minJson.data ?? []) as Minuta[]);
      setMotoristas(Array.isArray(motJson) ? motJson : (motJson.data ?? []));
    } catch {
      showError("Erro ao carregar a agenda");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onDragEnd() { setDraggingId(null); setDragOver(null); }
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  // Minutas relevantes ao board (exclui canceladas).
  const boardMinutas = useMemo(
    () => minutas.filter((m) => m.status !== "CANCELADA"),
    [minutas]
  );

  const matchesSearch = useCallback((m: Minuta) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const c = m.pedidoVenda.cliente;
    return (
      m.numero.toLowerCase().includes(q) ||
      m.pedidoVenda.numero.toLowerCase().includes(q) ||
      (c.nomeFantasia ?? "").toLowerCase().includes(q) ||
      c.razaoSocial.toLowerCase().includes(q) ||
      (c.cidade ?? "").toLowerCase().includes(q) ||
      (c.bairro ?? "").toLowerCase().includes(q) ||
      (m.motorista?.nome ?? "").toLowerCase().includes(q)
    );
  }, [search]);

  // ── Lanes (Dia) ───────────────────────────────────────────────────────────
  // Ordena minutas de uma raia (motoristaId | null) a partir do estado atual.
  const stopsForLane = useCallback(
    (motoristaId: string | null) =>
      sortStops(boardMinutas.filter((m) => (m.motorista?.id ?? null) === motoristaId)),
    [boardMinutas]
  );

  const dayLanes = useMemo(() => {
    const ids = new Set<string>(motoristas.map((m) => m.id));
    // Inclui motoristas (mesmo inativos) que tenham parada no dia.
    for (const m of boardMinutas) if (m.motorista) ids.add(m.motorista.id);

    const lanes = motoristas
      .filter((m) => ids.has(m.id))
      .map((m) => ({ id: m.id, nome: m.nome }));
    // motoristas presentes nas minutas mas fora da lista de ativos
    for (const m of boardMinutas) {
      if (m.motorista && !lanes.some((l) => l.id === m.motorista!.id)) {
        lanes.push({ id: m.motorista.id, nome: m.motorista.nome });
      }
    }
    return [...lanes, { id: NONE, nome: "Sem motorista" }];
  }, [motoristas, boardMinutas]);

  // ── Drop handler (Dia) — atribuir motorista + reordenar paradas ──────────────
  async function handleDayDrop(targetLaneId: string, targetIndex: number) {
    const dragId = draggingId;
    setDraggingId(null);
    setDragOver(null);
    if (!dragId) return;

    const dragged = boardMinutas.find((m) => m.id === dragId);
    if (!dragged) return;

    const targetMotoristaId = targetLaneId === NONE ? null : targetLaneId;
    const sourceMotoristaId = dragged.motorista?.id ?? null;
    const sameLane = sourceMotoristaId === targetMotoristaId;

    const targetList = stopsForLane(targetMotoristaId).filter((m) => m.id !== dragId);
    const insertAt = Math.min(Math.max(targetIndex, 0), targetList.length);
    targetList.splice(insertAt, 0, dragged);

    const updates: RoteiroUpdate[] = [];
    targetList.forEach((m, i) => {
      const newOrder = i + 1;
      const motChanged = (m.motorista?.id ?? null) !== targetMotoristaId;
      if (m.ordemEntrega !== newOrder || (m.id === dragId && motChanged)) {
        updates.push({
          id: m.id,
          ordemEntrega: newOrder,
          ...(m.id === dragId ? { motoristaId: targetMotoristaId } : {}),
        });
      }
    });
    if (!sameLane) {
      stopsForLane(sourceMotoristaId)
        .filter((m) => m.id !== dragId)
        .forEach((m, i) => {
          const newOrder = i + 1;
          if (m.ordemEntrega !== newOrder) updates.push({ id: m.id, ordemEntrega: newOrder });
        });
    }
    if (updates.length === 0) return;

    await commitUpdates(updates);
  }

  // ── Drop handler (Semana) — mover para (motorista, dia) ──────────────────────
  async function handleWeekDrop(targetLaneId: string, dayISO: string) {
    const dragId = draggingId;
    setDraggingId(null);
    setDragOver(null);
    if (!dragId) return;

    const dragged = boardMinutas.find((m) => m.id === dragId);
    if (!dragged) return;

    const targetMotoristaId = targetLaneId === NONE ? null : targetLaneId;
    const sameCell =
      (dragged.motorista?.id ?? null) === targetMotoristaId &&
      entregaDay(dragged.dataEntrega) === dayISO;
    if (sameCell) return;

    // Posição: fim da célula de destino.
    const cellCount = boardMinutas.filter(
      (m) => (m.motorista?.id ?? null) === targetMotoristaId && entregaDay(m.dataEntrega) === dayISO
    ).length;

    await commitUpdates([{
      id: dragId,
      motoristaId: targetMotoristaId,
      dataEntrega: `${dayISO}T00:00:00.000Z`,
      ordemEntrega: cellCount + 1,
    }]);
  }

  // Aplica otimista + persiste no endpoint em lote; reverte em erro.
  async function commitUpdates(updates: RoteiroUpdate[]) {
    const prev = minutas;
    setMinutas((cur) =>
      cur.map((m) => {
        const u = updates.find((x) => x.id === m.id);
        if (!u) return m;
        const next: Minuta = { ...m };
        if (u.ordemEntrega !== undefined) next.ordemEntrega = u.ordemEntrega;
        if (u.motoristaId !== undefined) {
          next.motorista = u.motoristaId
            ? { id: u.motoristaId, nome: motById.get(u.motoristaId)?.nome ?? m.motorista?.nome ?? "?" }
            : null;
        }
        if (u.dataEntrega !== undefined) next.dataEntrega = u.dataEntrega;
        return next;
      })
    );

    try {
      const res = await fetch("/api/comercial/minutas/roteiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMinutas(prev);
        showError(j.error ?? "Erro ao atualizar o roteiro");
      }
    } catch {
      setMinutas(prev);
      showError("Erro de conexão ao atualizar o roteiro");
    }
  }

  // ── Status pelo card (reusa PATCH /minutas/[id]) ─────────────────────────────
  async function changeStatus(m: Minuta, next: StatusMinuta) {
    setBusyId(m.id);
    const prev = minutas;
    setMinutas((cur) => cur.map((x) => (x.id === m.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/comercial/minutas/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMinutas(prev);
        showError(j.error ?? "Não foi possível mudar o status. Abra a minuta para concluir.");
      }
    } catch {
      setMinutas(prev);
      showError("Erro de conexão ao mudar o status");
    } finally {
      setBusyId(null);
    }
  }

  // ── Totais do topo ──────────────────────────────────────────────────────────
  const total = boardMinutas.length;
  const semMotorista = boardMinutas.filter((m) => !m.motorista).length;

  const weekDays = useMemo(() => weekDaysISO(day), [day]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agenda de Entregas"
        breadcrumbs={[{ label: "Comercial" }, { label: "Agenda de Entregas" }]}
      />

      {/* Toolbar */}
      <div className="px-8 pb-4 flex items-center gap-3 flex-wrap">
        {/* Navegação de data */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDay((d) => addDaysISO(d, view === "dia" ? -1 : -7))}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            title={view === "dia" ? "Dia anterior" : "Semana anterior"}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-8 w-40 border-gray-200 text-sm"
          />
          <button
            onClick={() => setDay((d) => addDaysISO(d, view === "dia" ? 1 : 7))}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            title={view === "dia" ? "Próximo dia" : "Próxima semana"}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDay(toISODate(new Date()))}
            className="h-8 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 ml-1"
          >
            Hoje
          </button>
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Cliente, cidade, minuta, pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Contadores */}
        <span className="text-xs text-gray-400">
          {loading ? "…" : `${total} entrega${total !== 1 ? "s" : ""}`}
        </span>
        {!loading && semMotorista > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <UserX className="w-3.5 h-3.5" /> {semMotorista} sem motorista
          </span>
        )}

        {/* Toggle Dia | Semana */}
        <div className="ml-auto flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-white">
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "dia" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => setView("dia")}
          >
            <Route className="w-3.5 h-3.5" /> Dia
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "semana" ? "bg-gray-100 text-gray-800" : "text-gray-500 hover:text-gray-700")}
            onClick={() => setView("semana")}
          >
            <CalendarDays className="w-3.5 h-3.5" /> Semana
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-8 mb-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
          <X className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando agenda…</span>
        </div>
      ) : view === "dia" ? (
        <DayBoard
          lanes={dayLanes}
          stopsForLane={stopsForLane}
          matchesSearch={matchesSearch}
          draggingId={draggingId}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDragStartCard={(id) => setDraggingId(id)}
          onDrop={handleDayDrop}
          onOpen={(id) => router.push(`/comercial/minutas/${id}`)}
          onStatus={changeStatus}
          busyId={busyId}
          dayLabel={formatDayLabel(day)}
        />
      ) : (
        <WeekGrid
          weekDays={weekDays}
          lanes={dayLanes}
          boardMinutas={boardMinutas}
          matchesSearch={matchesSearch}
          draggingId={draggingId}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onDragStartCard={(id) => setDraggingId(id)}
          onDrop={handleWeekDrop}
          onOpenDay={(d) => { setDay(d); setView("dia"); }}
          onOpen={(id) => router.push(`/comercial/minutas/${id}`)}
        />
      )}
    </div>
  );
}

// ── DayBoard ─────────────────────────────────────────────────────────────────
function DayBoard({
  lanes, stopsForLane, matchesSearch, draggingId, dragOver, setDragOver,
  onDragStartCard, onDrop, onOpen, onStatus, busyId, dayLabel,
}: {
  lanes: { id: string; nome: string }[];
  stopsForLane: (motoristaId: string | null) => Minuta[];
  matchesSearch: (m: Minuta) => boolean;
  draggingId: string | null;
  dragOver: { laneId: string; index: number } | null;
  setDragOver: (v: { laneId: string; index: number } | null) => void;
  onDragStartCard: (id: string) => void;
  onDrop: (laneId: string, index: number) => void;
  onOpen: (id: string) => void;
  onStatus: (m: Minuta, next: StatusMinuta) => void;
  busyId: string | null;
  dayLabel: string;
}) {
  return (
    <div className="px-8 pb-8 flex-1 overflow-x-auto">
      <p className="text-xs text-gray-400 mb-3">Roteiro de {dayLabel}</p>
      <div className="flex gap-4 min-w-max items-start">
        {lanes.map((lane) => {
          const laneKey = lane.id;
          const motoristaId = lane.id === NONE ? null : lane.id;
          const stops = stopsForLane(motoristaId);
          const isNone = lane.id === NONE;
          const isOverLaneEnd = dragOver?.laneId === laneKey && dragOver.index >= stops.length;

          return (
            <div key={laneKey} className="w-72 flex-shrink-0">
              <div className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0",
                isNone ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  {isNone
                    ? <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    : <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <span className={cn("text-xs font-semibold truncate", isNone ? "text-amber-700" : "text-gray-700")}>
                    {lane.nome}
                  </span>
                </div>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-full border",
                  isNone ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-white text-gray-500 border-gray-200",
                )}>
                  {stops.length}
                </span>
              </div>

              <div
                className={cn(
                  "rounded-b-xl border min-h-[120px] p-2 space-y-2 transition-colors",
                  isNone ? "border-amber-200 bg-amber-50/40" : "border-gray-200 bg-gray-50/60",
                  draggingId && "border-dashed",
                  isOverLaneEnd && "ring-2 ring-inset ring-blue-300",
                )}
                onDragOver={(e) => {
                  if (draggingId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver({ laneId: laneKey, index: stops.length }); }
                }}
                onDrop={(e) => { e.preventDefault(); onDrop(laneKey, dragOver?.laneId === laneKey ? dragOver.index : stops.length); }}
              >
                {stops.length === 0 ? (
                  <div className={cn(
                    "flex items-center justify-center py-8 text-xs",
                    draggingId ? "text-blue-400" : "text-gray-300",
                  )}>
                    {draggingId ? "Solte aqui" : "Sem paradas"}
                  </div>
                ) : (
                  stops.map((m, idx) => {
                    const visible = matchesSearch(m);
                    const showInsertLine = dragOver?.laneId === laneKey && dragOver.index === idx && draggingId;
                    return (
                      <div key={m.id}>
                        {showInsertLine && <div className="h-0.5 bg-blue-400 rounded-full mb-2" />}
                        <div
                          onDragOver={(e) => {
                            if (draggingId) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOver({ laneId: laneKey, index: idx }); }
                          }}
                          className={cn(!visible && "opacity-30")}
                        >
                          <StopCard
                            m={m}
                            ordem={idx + 1}
                            isDragging={m.id === draggingId}
                            busy={busyId === m.id}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", m.id);
                              onDragStartCard(m.id);
                            }}
                            onDragEnd={() => setDragOver(null)}
                            onClick={() => { if (!draggingId) onOpen(m.id); }}
                            onStatus={(next) => onStatus(m, next)}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WeekGrid ─────────────────────────────────────────────────────────────────
function WeekGrid({
  weekDays, lanes, boardMinutas, matchesSearch, draggingId, dragOver, setDragOver,
  onDragStartCard, onDrop, onOpenDay, onOpen,
}: {
  weekDays: string[];
  lanes: { id: string; nome: string }[];
  boardMinutas: Minuta[];
  matchesSearch: (m: Minuta) => boolean;
  draggingId: string | null;
  dragOver: { laneId: string; index: number } | null;
  setDragOver: (v: { laneId: string; index: number } | null) => void;
  onDragStartCard: (id: string) => void;
  onDrop: (laneId: string, dayISO: string) => void;
  onOpenDay: (dayISO: string) => void;
  onOpen: (id: string) => void;
}) {
  const todayISO = toISODate(new Date());
  function cellKey(laneId: string, dayISO: string) { return `${laneId}|${dayISO}`; }

  return (
    <div className="px-8 pb-8 flex-1 overflow-auto">
      <table className="w-full border-separate border-spacing-0 min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left text-xs font-semibold text-gray-500 px-3 py-2 w-44 border-b border-gray-200">
              Motorista
            </th>
            {weekDays.map((d, i) => (
              <th key={d} className="border-b border-l border-gray-200 px-2 py-2">
                <button
                  onClick={() => onOpenDay(d)}
                  className={cn(
                    "w-full flex flex-col items-center rounded-md py-1 hover:bg-blue-50 transition-colors",
                    d === todayISO && "bg-blue-50",
                  )}
                  title="Ver roteiro deste dia"
                >
                  <span className="text-[11px] font-semibold text-gray-500 uppercase">{WEEKDAYS[i]}</span>
                  <span className={cn("text-xs", d === todayISO ? "text-blue-700 font-semibold" : "text-gray-400")}>
                    {formatDayLabel(d).slice(0, 5)}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane) => {
            const motoristaId = lane.id === NONE ? null : lane.id;
            const isNone = lane.id === NONE;
            return (
              <tr key={lane.id}>
                <td className={cn(
                  "sticky left-0 z-10 bg-white px-3 py-2 border-b border-gray-100 align-top w-44",
                  isNone && "text-amber-700",
                )}>
                  <div className="flex items-center gap-1.5">
                    {isNone
                      ? <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      : <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    <span className="text-xs font-medium text-gray-700 truncate">{lane.nome}</span>
                  </div>
                </td>
                {weekDays.map((d) => {
                  const cellMinutas = sortStops(
                    boardMinutas.filter(
                      (m) => (m.motorista?.id ?? null) === motoristaId && entregaDay(m.dataEntrega) === d
                    )
                  );
                  const key = cellKey(lane.id, d);
                  const isOver = dragOver?.laneId === key;
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border-b border-l border-gray-100 p-1.5 align-top min-w-[110px] transition-colors",
                        isOver && "bg-blue-50 ring-2 ring-inset ring-blue-300",
                        draggingId && !isOver && "bg-gray-50/40",
                      )}
                      onDragOver={(e) => {
                        if (draggingId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver({ laneId: key, index: 0 }); }
                      }}
                      onDrop={(e) => { e.preventDefault(); onDrop(lane.id, d); }}
                    >
                      <div className="space-y-1">
                        {cellMinutas.map((m) => (
                          <div
                            key={m.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", m.id);
                              onDragStartCard(m.id);
                            }}
                            onClick={() => { if (!draggingId) onOpen(m.id); }}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md border bg-white px-1.5 py-1 cursor-grab active:cursor-grabbing hover:border-blue-300 text-[11px] transition-colors",
                              m.id === draggingId ? "opacity-40" : "border-gray-200",
                              !matchesSearch(m) && "opacity-30",
                            )}
                            title={`${m.numero} · ${clienteNome(m.pedidoVenda.cliente)}`}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[m.status])} />
                            <span className="truncate text-gray-700">{clienteNome(m.pedidoVenda.cliente)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
