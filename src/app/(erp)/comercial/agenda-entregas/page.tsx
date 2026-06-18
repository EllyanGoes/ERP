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
  Search, X, Loader2, Truck, MapPin, GripVertical, CalendarDays, CalendarRange,
  ChevronLeft, ChevronRight, Route, PackageCheck, Send, UserX, ClipboardList,
  Plus, Boxes, PackageOpen,
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
  pedidoVenda: { id: string; numero: string; numeroOrcamento: string | null; cliente: Cliente };
  localEstoque: { id: string; nome: string } | null;
  itens: { id: string }[];
};

type Motorista = { id: string; nome: string; ativo: boolean };

type SaldoCliente = {
  id: string;
  nome: string;
  pedidos: { id: string; numero: string; itensPendentes: number; totalPendente: number }[];
};

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
function addMonthsISO(s: string, n: number): string {
  const d = parseISODate(s);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISODate(d);
}
/** 42 dias (6 semanas, iniciando na segunda) cobrindo o mês de `s`. */
function monthGridDaysISO(s: string): string[] {
  const d = parseISODate(s);
  const firstISO = toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const dow = parseISODate(firstISO).getUTCDay();
  const deltaToMonday = dow === 0 ? -6 : 1 - dow;
  const start = addDaysISO(firstISO, deltaToMonday);
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}
function monthLabel(s: string): string {
  const d = parseISODate(s);
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
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
        "bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group select-none",
        isDragging && "opacity-40 scale-95",
        finalizado && "opacity-75",
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="flex items-center justify-center w-5 h-5 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-bold">
          {ordem}
        </span>
        <span className="font-mono text-xs font-bold text-foreground">{m.numero}</span>
        <span className="font-mono text-xs text-muted-foreground ml-auto">{m.pedidoVenda.numero}</span>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <p className="text-xs text-foreground font-medium leading-snug line-clamp-2">
        {clienteNome(cliente)}
      </p>
      {m.pedidoVenda.numeroOrcamento && (
        <p className="text-[11px] text-muted-foreground mt-0.5">Orç. {m.pedidoVenda.numeroOrcamento}</p>
      )}
      {local && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{local}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <StatusBadge status={m.status} label={statusMinutaLabel(m.status, m.tipo)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {TIPO_MINUTA_LABEL[m.tipo] ?? "Entrega"}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {m.itens.length} item{m.itens.length !== 1 ? "s" : ""}
        </span>
      </div>

      {m.placa && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
          <Truck className="w-3 h-3 shrink-0" />
          <span>{m.placa}</span>
        </div>
      )}

      {/* Ações de status */}
      {(m.status === "PENDENTE" || m.status === "SAIU_PARA_ENTREGA") && (
        <div className="mt-2 pt-2 border-t border-border">
          {m.status === "PENDENTE" ? (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onStatus("SAIU_PARA_ENTREGA"); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md bg-info/10 text-info text-xs font-medium hover:bg-info/15 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3 h-3" /> {confirmacaoMinutaLabel(m.tipo) === "Confirmar Retirada" ? "Aguardar retirada" : "Marcar saída"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onStatus("ENTREGUE"); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/15 disabled:opacity-50 transition-colors"
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

  const [view, setView] = useState<"dia" | "semana" | "mes">("semana");
  const [day, setDay] = useState<string>(() => toISODate(new Date()));
  const [search, setSearch] = useState("");

  const [minutas, setMinutas] = useState<Minuta[]>([]);
  const [pendentes, setPendentes] = useState<Minuta[]>([]);
  const [saldo, setSaldo] = useState<SaldoCliente[]>([]);
  const [railTab, setRailTab] = useState<"pendentes" | "saldo">("pendentes");
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
    const days = view === "semana" ? weekDaysISO(day) : monthGridDaysISO(day);
    return { from: `${days[0]}T00:00:00.000Z`, to: `${days[days.length - 1]}T23:59:59.999Z` };
  }, [view, day]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [minRes, pendRes, motRes, saldoRes] = await Promise.all([
        fetch(`/api/comercial/minutas?dataFrom=${range.from}&dataTo=${range.to}`),
        fetch("/api/comercial/minutas?status=PENDENTE"),
        fetch("/api/comercial/motoristas?ativo=true"),
        fetch("/api/comercial/saldo-entregar"),
      ]);
      const minJson = await minRes.json();
      const pendJson = await pendRes.json();
      const motJson = await motRes.json();
      const saldoJson = await saldoRes.json();
      setMinutas((minJson.data ?? []) as Minuta[]);
      // Pendentes de agendamento = minutas no status PENDENTE (a API já filtra por status).
      setPendentes((pendJson.data ?? []) as Minuta[]);
      setMotoristas(Array.isArray(motJson) ? motJson : (motJson.data ?? []));
      setSaldo((saldoJson.data ?? []) as SaldoCliente[]);
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

  // Filtra o "Saldo a entregar" pelo mesmo termo de busca: por nome do cliente
  // (mantém todos os pedidos do cliente) ou por nº do pedido (mantém só os que casam).
  const filteredSaldo = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return saldo;
    return saldo
      .map((cli) => {
        if (cli.nome.toLowerCase().includes(q)) return cli;
        const pedidos = cli.pedidos.filter((p) => p.numero.toLowerCase().includes(q));
        return pedidos.length > 0 ? { ...cli, pedidos } : null;
      })
      .filter((cli): cli is SaldoCliente => cli !== null);
  }, [saldo, search]);

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

    // Minuta pendente (sem data) arrastada do painel → agenda no dia atual.
    if (pendentes.some((m) => m.id === dragId)) {
      await scheduleFromPending(dragId, { dayISO: day, motoristaId: targetLaneId === NONE ? null : targetLaneId });
      return;
    }

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

    // Minuta pendente (sem data) arrastada do painel → agenda no dia/motorista alvo.
    if (pendentes.some((m) => m.id === dragId)) {
      await scheduleFromPending(dragId, { dayISO, motoristaId: targetLaneId === NONE ? null : targetLaneId });
      return;
    }

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

  // Agenda uma minuta pendente (sem data) num dia/motorista; depois recarrega.
  async function scheduleFromPending(id: string, { dayISO, motoristaId }: { dayISO: string; motoristaId?: string | null }) {
    const cellCount = boardMinutas.filter(
      (m) => (m.motorista?.id ?? null) === (motoristaId ?? null) && entregaDay(m.dataEntrega) === dayISO
    ).length;
    try {
      const res = await fetch("/api/comercial/minutas/roteiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{
            id,
            dataEntrega: `${dayISO}T00:00:00.000Z`,
            ...(motoristaId !== undefined ? { motoristaId } : {}),
            ordemEntrega: cellCount + 1,
          }],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showError(j.error ?? "Erro ao agendar a minuta");
        return;
      }
      await load();
    } catch {
      showError("Erro de conexão ao agendar a minuta");
    }
  }

  // ── Drop handler (Mês) — agenda no dia (mantém motorista atual) ───────────────
  async function handleMonthDrop(dayISO: string) {
    const dragId = draggingId;
    setDraggingId(null);
    setDragOver(null);
    if (!dragId) return;

    if (pendentes.some((m) => m.id === dragId)) {
      await scheduleFromPending(dragId, { dayISO });
      return;
    }
    const dragged = boardMinutas.find((m) => m.id === dragId);
    if (!dragged || entregaDay(dragged.dataEntrega) === dayISO) return;
    await commitUpdates([{ id: dragId, dataEntrega: `${dayISO}T00:00:00.000Z` }]);
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
  // Retiradas não precisam de motorista (o cliente retira), então não contam como "sem motorista".
  const semMotorista = boardMinutas.filter((m) => !m.motorista && m.tipo !== "RETIRADA").length;
  const retiradas = boardMinutas.filter((m) => m.tipo === "RETIRADA").length;

  const weekDays = useMemo(() => weekDaysISO(day), [day]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agenda de Entregas"
        breadcrumbs={[{ label: "Faturamento" }, { label: "Agenda de Entregas" }]}
      />

      {/* Toolbar */}
      <div className="px-8 pb-4 flex items-center gap-3 flex-wrap">
        {/* Navegação de data */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDay((d) => view === "dia" ? addDaysISO(d, -1) : view === "semana" ? addDaysISO(d, -7) : addMonthsISO(d, -1))}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
            title={view === "dia" ? "Dia anterior" : view === "semana" ? "Semana anterior" : "Mês anterior"}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="h-8 w-40 border-border text-sm"
          />
          <button
            onClick={() => setDay((d) => view === "dia" ? addDaysISO(d, 1) : view === "semana" ? addDaysISO(d, 7) : addMonthsISO(d, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted"
            title={view === "dia" ? "Próximo dia" : view === "semana" ? "Próxima semana" : "Próximo mês"}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDay(toISODate(new Date()))}
            className="h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-muted ml-1"
          >
            Hoje
          </button>
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Cliente, cidade, minuta, pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              onClick={() => setSearch("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Contadores */}
        <span className="text-xs text-muted-foreground">
          {loading ? "…" : `${total} entrega${total !== 1 ? "s" : ""}`}
        </span>
        {!loading && semMotorista > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-warning">
            <UserX className="w-3.5 h-3.5" /> {semMotorista} sem motorista
          </span>
        )}
        {!loading && retiradas > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
            <PackageCheck className="w-3.5 h-3.5" /> {retiradas} retirada{retiradas !== 1 ? "s" : ""}
          </span>
        )}

        {/* Agendar saldo a entregar */}
        <button
          onClick={() => setRailTab("saldo")}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
          title="Criar minuta e agendar o saldo a entregar dos clientes"
        >
          <Plus className="w-3.5 h-3.5" /> Agendar saldo a entregar
        </button>

        {/* Toggle Dia | Semana | Mês */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-card">
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "dia" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setView("dia")}
          >
            <Route className="w-3.5 h-3.5" /> Dia
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "semana" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setView("semana")}
          >
            <CalendarDays className="w-3.5 h-3.5" /> Semana
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "mes" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setView("mes")}
          >
            <CalendarRange className="w-3.5 h-3.5" /> Mês
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-8 mb-3 flex items-center gap-2 px-4 py-2.5 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger font-medium">
          <X className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando agenda…</span>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 flex flex-col">
            {view === "dia" ? (
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
            ) : view === "semana" ? (
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
            ) : (
              <MonthGrid
                monthDays={monthGridDaysISO(day)}
                refMonth={day}
                boardMinutas={boardMinutas}
                matchesSearch={matchesSearch}
                draggingId={draggingId}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDragStartCard={(id) => setDraggingId(id)}
                onDrop={handleMonthDrop}
                onOpenDay={(d) => { setDay(d); setView("dia"); }}
                onOpen={(id) => router.push(`/comercial/minutas/${id}`)}
              />
            )}
          </div>

          <RightRail
            tab={railTab}
            setTab={setRailTab}
            pendentes={pendentes.filter(matchesSearch)}
            saldo={filteredSaldo}
            draggingId={draggingId}
            onDragStartCard={(id) => setDraggingId(id)}
            onOpen={(id) => router.push(`/comercial/minutas/${id}`)}
            onAgendar={(pedidoId) => router.push(`/comercial/minutas/nova?pedidoVendaId=${pedidoId}`)}
          />
        </div>
      )}
    </div>
  );
}

// ── Painel lateral com abas: Pendentes (minutas sem data) | Saldo a entregar ────
function RightRail({
  tab, setTab, pendentes, saldo, draggingId, onDragStartCard, onOpen, onAgendar,
}: {
  tab: "pendentes" | "saldo";
  setTab: (t: "pendentes" | "saldo") => void;
  pendentes: Minuta[];
  saldo: SaldoCliente[];
  draggingId: string | null;
  onDragStartCard: (id: string) => void;
  onOpen: (id: string) => void;
  onAgendar: (pedidoId: string) => void;
}) {
  const totalSaldoPedidos = saldo.reduce((s, c) => s + c.pedidos.length, 0);

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-muted flex flex-col">
      {/* Abas */}
      <div className="flex border-b border-border bg-card">
        <button
          onClick={() => setTab("pendentes")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors",
            tab === "pendentes" ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Pendentes
          {pendentes.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-semibold">{pendentes.length}</span>}
        </button>
        <button
          onClick={() => setTab("saldo")}
          className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors",
            tab === "saldo" ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          <Boxes className="w-3.5 h-3.5" /> Saldo a entregar
          {totalSaldoPedidos > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/15 text-info font-semibold">{totalSaldoPedidos}</span>}
        </button>
      </div>

      {tab === "pendentes" ? (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          <p className="text-[11px] text-muted-foreground px-1 pb-1">Minutas sem data — arraste para um dia/motorista na agenda.</p>
          {pendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <PackageCheck className="w-6 h-6 mb-2 text-muted-foreground/60" />
              Nenhuma minuta pendente de agendamento.
            </div>
          ) : (
            pendentes.map((m) => {
              const cliente = m.pedidoVenda.cliente;
              const local = clienteLocal(cliente);
              const isRetirada = m.tipo === "RETIRADA";
              return (
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
                    "bg-card border border-border rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow transition-all select-none border-l-4",
                    isRetirada ? "border-l-violet-400" : "border-l-amber-400",
                    m.id === draggingId && "opacity-40",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                    <span className="font-mono text-xs font-bold text-foreground">{m.numero}</span>
                    {isRetirada && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300">
                        <PackageOpen className="w-3 h-3" /> Retirada
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground ml-auto">{m.pedidoVenda.numero}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{clienteNome(cliente)}</p>
                  {m.pedidoVenda.numeroOrcamento && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">Orç. {m.pedidoVenda.numeroOrcamento}</p>
                  )}
                  {local && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{local}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          <p className="text-[11px] text-muted-foreground px-1 pb-1">Pedidos confirmados com saldo a entregar. Crie a minuta para agendar.</p>
          {saldo.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <Boxes className="w-6 h-6 mb-2 text-muted-foreground/60" />
              Nenhum saldo a entregar.
            </div>
          ) : (
            saldo.map((cli) => (
              <div key={cli.id} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted border-b border-border">
                  <p className="text-xs font-semibold text-foreground truncate">{cli.nome}</p>
                </div>
                <div className="divide-y divide-border">
                  {cli.pedidos.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-bold text-foreground">{p.numero}</p>
                        <p className="text-[11px] text-muted-foreground">{p.itensPendentes} item{p.itensPendentes !== 1 ? "s" : ""} pendente{p.itensPendentes !== 1 ? "s" : ""}</p>
                      </div>
                      <button
                        onClick={() => onAgendar(p.id)}
                        className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-info/10 text-info text-xs font-medium hover:bg-info/15 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Agendar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
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
      <p className="text-xs text-muted-foreground mb-3">Roteiro de {dayLabel}</p>
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
                isNone ? "bg-warning/10 border-warning/30" : "bg-muted border-border",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  {isNone
                    ? <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    : <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className={cn("text-xs font-semibold truncate", isNone ? "text-warning" : "text-foreground")}>
                    {lane.nome}
                  </span>
                </div>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-full border",
                  isNone ? "bg-warning/10 text-warning border-warning/30" : "bg-card text-muted-foreground border-border",
                )}>
                  {stops.length}
                </span>
              </div>

              <div
                className={cn(
                  "rounded-b-xl border min-h-[120px] p-2 space-y-2 transition-colors",
                  isNone ? "border-warning/30 bg-warning/10" : "border-border bg-muted/60",
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
                    draggingId ? "text-blue-400" : "text-muted-foreground/60",
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
      <div className="rounded-xl border border-border shadow-sm bg-card">
      <table className="w-full border-separate border-spacing-0 min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-muted text-left text-xs font-bold uppercase tracking-wide text-muted-foreground px-3 py-2.5 w-44 border-b-2 border-border">
              Motorista
            </th>
            {weekDays.map((d, i) => (
              <th key={d} className={cn(
                "border-b-2 border-l border-border px-2 py-2.5",
                d === todayISO ? "bg-info/15" : "bg-muted",
              )}>
                <button
                  onClick={() => onOpenDay(d)}
                  className="w-full flex flex-col items-center rounded-md py-1 hover:bg-card/60 transition-colors"
                  title="Ver roteiro deste dia"
                >
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">{WEEKDAYS[i]}</span>
                  <span className={cn("text-xs font-medium", d === todayISO ? "text-info font-bold" : "text-muted-foreground")}>
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
              <tr key={lane.id} className="group/row">
                <td className={cn(
                  "sticky left-0 z-10 px-3 py-2 border-b border-border align-top w-44",
                  isNone ? "bg-warning/10" : "bg-muted group-hover/row:bg-muted",
                )}>
                  <div className="flex items-center gap-1.5">
                    {isNone
                      ? <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      : <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className={cn("text-xs font-semibold truncate", isNone ? "text-warning" : "text-foreground")}>{lane.nome}</span>
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
                  const isToday = d === todayISO;
                  return (
                    <td
                      key={d}
                      className={cn(
                        "border-b border-l border-border p-1.5 align-top min-w-[110px] transition-colors",
                        isOver ? "bg-info/10 ring-2 ring-inset ring-blue-300"
                          : draggingId ? "bg-muted/60"
                          : isToday ? "bg-info/10" : "bg-card",
                      )}
                      onDragOver={(e) => {
                        if (draggingId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver({ laneId: key, index: 0 }); }
                      }}
                      onDrop={(e) => { e.preventDefault(); onDrop(lane.id, d); }}
                    >
                      <div className="space-y-1">
                        {cellMinutas.map((m) => {
                          const isRetirada = m.tipo === "RETIRADA";
                          return (
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
                                "flex items-center gap-1.5 rounded-md border border-border border-l-[3px] bg-card px-1.5 py-1 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 text-[11px] transition-colors",
                                isRetirada ? "border-l-violet-400" : "border-l-blue-400",
                                m.id === draggingId && "opacity-40",
                                !matchesSearch(m) && "opacity-30",
                              )}
                              title={`${m.numero} · ${clienteNome(m.pedidoVenda.cliente)}${m.pedidoVenda.numeroOrcamento ? ` · Orç. ${m.pedidoVenda.numeroOrcamento}` : ""}${isRetirada ? " · Retirada" : ""}`}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[m.status])} />
                              <span className="truncate text-foreground">{clienteNome(m.pedidoVenda.cliente)}</span>
                              {isRetirada && <PackageOpen className="w-3 h-3 text-violet-500 shrink-0 ml-auto" />}
                            </div>
                          );
                        })}
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
    </div>
  );
}

// ── MonthGrid (visão mensal, agregada por dia) ──────────────────────────────────
function MonthGrid({
  monthDays, refMonth, boardMinutas, matchesSearch, draggingId, dragOver, setDragOver,
  onDragStartCard, onDrop, onOpenDay, onOpen,
}: {
  monthDays: string[];
  refMonth: string;
  boardMinutas: Minuta[];
  matchesSearch: (m: Minuta) => boolean;
  draggingId: string | null;
  dragOver: { laneId: string; index: number } | null;
  setDragOver: (v: { laneId: string; index: number } | null) => void;
  onDragStartCard: (id: string) => void;
  onDrop: (dayISO: string) => void;
  onOpenDay: (dayISO: string) => void;
  onOpen: (id: string) => void;
}) {
  const todayISO = toISODate(new Date());
  const refMes = parseISODate(refMonth).getUTCMonth();
  const weeks: string[][] = Array.from({ length: 6 }, (_, w) => monthDays.slice(w * 7, w * 7 + 7));

  return (
    <div className="px-8 pb-8 flex-1 overflow-auto">
      <p className="text-xs font-semibold text-muted-foreground mb-3 capitalize">{monthLabel(refMonth)}</p>
      <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-card">
        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 bg-muted border-b-2 border-border">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase text-muted-foreground border-l first:border-l-0 border-border">
              {w}
            </div>
          ))}
        </div>
        {/* Semanas */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((d) => {
              const foraDoMes = parseISODate(d).getUTCMonth() !== refMes;
              const isToday = d === todayISO;
              const dayMinutas = sortStops(boardMinutas.filter((m) => entregaDay(m.dataEntrega) === d));
              const isOver = dragOver?.laneId === d;
              const [, , dd] = d.split("-");
              return (
                <div
                  key={d}
                  className={cn(
                    "border-l first:border-l-0 border-border min-h-[104px] p-1.5 flex flex-col gap-1 transition-colors",
                    isOver ? "bg-info/10 ring-2 ring-inset ring-blue-300"
                      : draggingId ? "bg-muted/50"
                      : foraDoMes ? "bg-muted/70"
                      : isToday ? "bg-info/10" : "bg-card",
                  )}
                  onDragOver={(e) => {
                    if (draggingId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver({ laneId: d, index: 0 }); }
                  }}
                  onDrop={(e) => { e.preventDefault(); onDrop(d); }}
                >
                  <button
                    onClick={() => onOpenDay(d)}
                    className={cn(
                      "self-end text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full hover:bg-info/15 transition-colors",
                      isToday ? "bg-blue-600 text-white hover:bg-blue-600" : foraDoMes ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                    title="Ver roteiro deste dia"
                  >
                    {Number(dd)}
                  </button>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayMinutas.slice(0, 4).map((m) => {
                      const isRetirada = m.tipo === "RETIRADA";
                      return (
                        <div
                          key={m.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", m.id);
                            onDragStartCard(m.id);
                          }}
                          onClick={(e) => { e.stopPropagation(); if (!draggingId) onOpen(m.id); }}
                          className={cn(
                            "flex items-center gap-1 rounded border border-border border-l-[3px] bg-card px-1 py-0.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 text-[10px] transition-colors",
                            isRetirada ? "border-l-violet-400" : "border-l-blue-400",
                            m.id === draggingId && "opacity-40",
                            !matchesSearch(m) && "opacity-30",
                          )}
                          title={`${m.numero} · ${clienteNome(m.pedidoVenda.cliente)}${m.pedidoVenda.numeroOrcamento ? ` · Orç. ${m.pedidoVenda.numeroOrcamento}` : ""}${m.motorista ? ` · ${m.motorista.nome}` : ""}${isRetirada ? " · Retirada" : ""}`}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[m.status])} />
                          <span className="truncate text-foreground">{clienteNome(m.pedidoVenda.cliente)}</span>
                          {isRetirada && <PackageOpen className="w-2.5 h-2.5 text-violet-500 shrink-0 ml-auto" />}
                        </div>
                      );
                    })}
                    {dayMinutas.length > 4 && (
                      <button onClick={() => onOpenDay(d)} className="text-[10px] text-info hover:underline text-left pl-1">
                        +{dayMinutas.length - 4} mais
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
