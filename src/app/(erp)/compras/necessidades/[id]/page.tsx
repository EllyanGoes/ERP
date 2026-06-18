"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatDate, decimalToNumber, cn } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { Pencil, Trash2, Loader2, AlertTriangle, Plus, Save, X, ChevronDown, Send, CheckCircle2, XCircle, Clock, MessageCircle, Users, Search, Copy, ExternalLink } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";

// ── WA user type ──────────────────────────────────────────────────────────────
type WAUser = { id: string; nome: string; email?: string; telefone: string | null; telegramChatId?: string | null; _type?: "colaborador" | "usuario" };

// ── Types ─────────────────────────────────────────────────────────────────────

type AprovacaoSCItem = {
  id: string;
  etapaOrdem: number;
  etapaNome: string | null;
  status: "PENDENTE" | "APROVADO" | "REPROVADO";
  observacao: string | null;
  respondidoEm: string | null;
  createdAt: string;
  waMsgId: string | null;
  aprovador: { id: string; nome: string; email: string };
};

type Necessidade = {
  id: string; numero: string; status: string; prioridade: number;
  createdAt: string;
  solicitante: string | null; justificativa: string | null;
  dataNecessidade: string | null; observacoes: string | null;
  aprovadoPor: string | null; dataAprovacao: string | null;
  motivoReprovacao: string | null;
  motivoCancelamento: string | null; dataCancelamento: string | null;
  tipoCompra: string | null; motivo: string | null; categoria: string | null;
  projeto: string | null; classificacaoAuxiliar: string | null;
  filialId: string | null; localEstoqueId: string | null; centroCustoId: string | null;
  colaboradorId: string | null; setorId: string | null;
  empresa:       { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  filial:        { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  localEstoque:  { id: string; nome: string } | null;
  centroCusto:   { id: string; codigo: string; nome: string } | null;
  colaborador:   { id: string; nome: string } | null;
  setor:         { id: string; nome: string } | null;
  itens: Array<{
    id: string; quantidade: unknown; quantidadeAprovada: unknown;
    observacao: string | null; unidade: string | null;
    item: { id: string; codigo: string; descricao: string; unidadeMedida: string; unidade: { sigla: string } | null };
  }>;
  cotacoes: Array<{ id: string; numero: string; status: string }>;
  pedidosCompra?: Array<{ id: string; numero: string; status: string; conferencia: { id: string; numero: string; status: string } | null }>;
  aprovacoes?: AprovacaoSCItem[];
};

const PRIORIDADE_INFO: Record<number, { label: string; className: string }> = {
  1: { label: "1 — Muito Baixa", className: "text-muted-foreground" },
  2: { label: "2 — Baixa",       className: "text-blue-400" },
  3: { label: "3 — Média",       className: "text-amber-500" },
  4: { label: "4 — Alta",        className: "text-orange-500" },
  5: { label: "5 — Crítica",     className: "text-danger font-semibold" },
};

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function PrioridadeBadge({ prioridade }: { prioridade: number }) {
  const info = PRIORIDADE_INFO[prioridade] ?? { label: String(prioridade), className: "text-muted-foreground" };
  return <span className={cn("text-sm", info.className)}>{info.label}</span>;
}

type Filial        = { id: string; razaoSocial: string; nomeFantasia: string | null };
type LocalEstoque  = { id: string; nome: string };
type CentroCusto   = { id: string; codigo: string; nome: string };
type ItemOption    = { id: string; codigo: string; descricao: string; unidade: { sigla: string } | null; estoqueItems?: Array<{ quantidadeAtual: number | string | null }> };
type UnidadeOption = { id: string; sigla: string; nome: string; isPrincipal: boolean };
type ItemRow       = { itemId: string; quantidade: string; unidade: string; observacao: string };

const PRIORIDADES = [
  { value: 1, label: "1 - Muito Baixa" }, { value: 2, label: "2 - Baixa" },
  { value: 3, label: "3 - Média" },       { value: 4, label: "4 - Alta" },
  { value: 5, label: "5 - Crítica" },
];

// ── SelectField ───────────────────────────────────────────────────────────────

function SelectField<T extends { id: string }>({
  options, value, onChange, placeholder, getLabel, disabled,
}: { options: T[]; value: string; onChange: (v: string) => void; placeholder: string; getLabel: (item: T) => string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((p) => !p)}
        className={cn("flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border border-border bg-card text-left transition-colors",
          disabled ? "opacity-60 cursor-not-allowed bg-muted" : "hover:border-border",
          open && "border-blue-400 ring-1 ring-blue-200")}>
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>{selected ? getLabel(selected) : placeholder}</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-auto max-h-52">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted text-left">(Nenhum)</button>
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn("w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors", o.id === value && "bg-info/10 text-info font-medium")}>
                {getLabel(o)}
              </button>
            ))}
            {options.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground italic">Nenhuma opção disponível</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ── UnitSelect ────────────────────────────────────────────────────────────────

function UnitSelect({ value, options, onChange, disabled }: {
  value: string; options: UnidadeOption[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  function calcPos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      setPos({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width });
    } else {
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }

  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => { window.removeEventListener("scroll", calcPos, true); window.removeEventListener("resize", calcPos); };
  }, [open]);

  if (disabled || options.length === 0) {
    return (
      <div className="h-9 flex items-center px-3 text-sm border border-border rounded-md bg-muted font-mono text-muted-foreground">
        {value || "—"}
      </div>
    );
  }

  if (options.length === 1) {
    return (
      <div className="h-9 flex items-center px-3 text-sm border border-border rounded-md bg-muted font-mono text-foreground">
        {value || options[0].sigla}
      </div>
    );
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((p) => !p)}
        className={cn("h-9 w-full flex items-center justify-between px-2 text-sm border border-border rounded-md bg-card font-mono transition-colors hover:border-border", open && "border-blue-400 ring-1 ring-blue-200")}>
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "Un."}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && typeof window !== "undefined" && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {pos && (
            <div className="fixed z-[9999] bg-card border border-border rounded-xl shadow-lg overflow-auto"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: Math.max(pos.width, 140), maxHeight: 180 }}>
              {options.map((u) => (
                <button key={u.id} type="button" onClick={() => { onChange(u.sigla); setOpen(false); }}
                  className={cn("w-full px-3 py-2 text-sm text-left hover:bg-info/10 hover:text-info transition-colors font-mono", value === u.sigla && "bg-info/10 text-info font-medium")}>
                  <span className="font-bold">{u.sigla}</span>
                  {u.nome && <span className="text-muted-foreground ml-1.5 text-xs font-sans">{u.nome}</span>}
                  {u.isPrincipal && <span className="ml-1.5 text-[10px] text-success">principal</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── useSidebarExpanded ────────────────────────────────────────────────────────
// Returns true while the sidebar nav-panel is open (data-sidebar-expanded="1").

function useSidebarExpanded() {
  const [expanded, setExpanded] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.dataset.sidebarExpanded === "1"
      : false
  );
  useEffect(() => {
    // Read initial value (SSR-safe)
    setExpanded(document.documentElement.dataset.sidebarExpanded === "1");
    const obs = new MutationObserver(() => {
      setExpanded(document.documentElement.dataset.sidebarExpanded === "1");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar-expanded"] });
    return () => obs.disconnect();
  }, []);
  return expanded;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NecessidadeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sidebarExpanded = useSidebarExpanded();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";

  // ── View state ───────────────────────────────────────────────────────────────
  const [necessidade, setNecessidade] = useState<Necessidade | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning, setActioning]     = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState("");
  const [aprovadoPor, setAprovadoPor]           = useState("");
  const [motivoReprovacao, setMotivoReprovacao]  = useState("");
  const [showApproveForm, setShowApproveForm]   = useState(false);
  const [showRejectForm, setShowRejectForm]     = useState(false);
  const [showCancelForm, setShowCancelForm]     = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [submittingAprovacao, setSubmittingAprovacao] = useState(false);
  const [submittingAprovacaoError, setSubmittingAprovacaoError] = useState("");
  // Modal WhatsApp
  const [showWAModal,       setShowWAModal]       = useState(false);
  const [waAprovadorId,     setWAAprovadorId]     = useState("");
  const [waUserSearch,      setWAUserSearch]      = useState("");
  const [waDropdownOpen,    setWADropdownOpen]    = useState(false);
  const [waUsers,           setWAUsers]           = useState<WAUser[]>([]);
  const [waUsersLoading,    setWAUsersLoading]    = useState(false);
  const [waCopied,          setWACopied]          = useState(false);
  const [waModalLoading,    setWAModalLoading]    = useState(false);
  const [waModalError,      setWAModalError]      = useState("");
  const waDropdownRef = useRef<HTMLDivElement>(null);

  // ── Edit mode state ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editError, setEditError]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [eFilialId,              setEFilialId]              = useState("");
  const [eDescricao,             setEDescricao]             = useState("");
  const [ePrioridade,            setEPrioridade]            = useState(3);
  const [eEntregaDesejada,       setEEntregaDesejada]       = useState("");
  const [eSolicitante,           setESolicitante]           = useState("");
  const [eTipoCompra,            setETipoCompra]            = useState("");
  const [eMotivo,                setEMotivo]                = useState("");
  const [eLocalEstoqueId,        setELocalEstoqueId]        = useState("");
  const [eCentroCustoId,         setECentroCustoId]         = useState("");
  const [eCategoria,             setECategoria]             = useState("");
  const [eProjeto,               setEProjeto]               = useState("");
  const [eClassificacaoAuxiliar, setEClassificacaoAuxiliar] = useState("");
  const [eObservacoes,           setEObservacoes]           = useState("");
  const [eItens, setEItens] = useState<ItemRow[]>([]);

  const [filiais,       setFiliais]       = useState<Filial[]>([]);
  const [locaisEstoque, setLocaisEstoque] = useState<LocalEstoque[]>([]);
  const [centrosCusto,  setCentrosCusto]  = useState<CentroCusto[]>([]);
  const [itemOptions,   setItemOptions]   = useState<ItemOption[]>([]);
  const [itemUnidades,  setItemUnidades]  = useState<Map<string, UnidadeOption[]>>(new Map());

  // ── Load record ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/suprimentos/necessidades/${id}`);
      const text = await res.text();
      if (!text) { setError("Resposta vazia do servidor — reinicie o servidor de desenvolvimento."); return; }
      const json = JSON.parse(text);
      if (!res.ok) { setError(json.error || `Erro ${res.status}`); return; }
      setNecessidade(json.data);
    } catch (e) {
      console.error("[SC load]", e);
      setError("Erro ao carregar — verifique o console do servidor.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Status change ────────────────────────────────────────────────────────────
  async function changeStatus(status: string, extra?: Record<string, string>) {
    setActioning(true); setActionError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { setActionError(json.error || "Erro na operação"); return; }
      setShowApproveForm(false); setShowRejectForm(false); setShowCancelForm(false);
      await load();
    } catch { setActionError("Erro de conexão"); }
    finally   { setActioning(false); }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleteLoading(true); setDeleteError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`, { method: "DELETE" });
      if (!res.ok) { setDeleteError((await res.json()).error || "Não foi possível excluir"); setDeleteLoading(false); return; }
      router.push("/compras/necessidades");
    } catch {
      setDeleteError("Erro de conexão"); setDeleteLoading(false);
    }
  }

  // ── Cotação ──────────────────────────────────────────────────────────────────
  function gerarCotacao() {
    router.push(`/suprimentos/cotacoes/nova?necessidadeId=${id}`);
  }

  // ── Modal WhatsApp ────────────────────────────────────────────────────────────

  // Close WA approver dropdown on outside click
  useEffect(() => {
    if (!waDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (waDropdownRef.current && !waDropdownRef.current.contains(e.target as Node)) {
        setWADropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [waDropdownOpen]);

  async function openWAModal() {
    setShowWAModal(true);
    setWAAprovadorId("");
    setWAUserSearch("");
    setWADropdownOpen(false);
    setWACopied(false);
    setSubmittingAprovacaoError("");
    setWAModalError("");
    setWAModalLoading(false);
    setWAUsersLoading(true);
    try {
      const res  = await fetch("/api/empresa/aprovadores");
      const json = await res.json();
      const list: WAUser[] = (Array.isArray(json) ? json : []).map((c: WAUser) => ({
        id: c.id, nome: c.nome, email: c.email,
        telefone: c.telefone, telegramChatId: c.telegramChatId ?? null, _type: "usuario" as const,
      }));
      setWAUsers(list);
      // Auto-select first approver with Telegram configured
      const withTg = list.find((u) => u.telegramChatId);
      if (withTg) setWAAprovadorId(withTg.id);
    } catch { /* ignore */ }
    finally { setWAUsersLoading(false); }
  }

  function buildWAMessage() {
    if (!necessidade) return "";
    const prioLabel: Record<number, string> = { 1: "Muito Baixa", 2: "Baixa", 3: "Média", 4: "Alta", 5: "🔴 Crítica" };
    const itensLines = necessidade.itens.map((it, i) =>
      `  ${i + 1}. ${it.item.descricao} — ${decimalToNumber(it.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "un"}`
    );
    const approver = waUsers.find((u) => u.id === waAprovadorId);
    return [
      `🛒 Solicitação de Compras Nº ${necessidade.numero}`,
      ``,
      `• Empresa: ${necessidade.empresa?.nomeFantasia ?? necessidade.empresa?.razaoSocial ?? "—"}`,
      `• Filial: ${necessidade.filial?.nomeFantasia ?? necessidade.filial?.razaoSocial ?? "—"}`,
      `• Solicitado por: ${necessidade.solicitante ?? "—"}`,
      `• Data: ${new Date(necessidade.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      `• Prioridade: ${prioLabel[necessidade.prioridade] ?? necessidade.prioridade}`,
      `• Motivo: ${necessidade.motivo ?? "—"}`,
      `• Descrição: ${necessidade.justificativa ?? "—"}`,
      ``,
      `Itens (${necessidade.itens.length}):`,
      ...itensLines,
      ...(approver ? [``, `👤 Aprovador: ${approver.nome}`] : []),
      ``,
      `Selecione uma ação: ✅ Aprovar  ❌ Reprovar`,
    ].join("\n");
  }

  async function copyWAMessage() {
    await navigator.clipboard.writeText(buildWAMessage());
    setWACopied(true);
    setTimeout(() => setWACopied(false), 2500);
  }

  async function openWhatsApp() {
    if (!necessidade) return;
    const approver = waUsers.find((u) => u.id === waAprovadorId);
    const msg = buildWAMessage();
    const encoded = encodeURIComponent(msg);

    // Open WhatsApp immediately (don't make user wait for DB)
    if (approver?.telefone) {
      const phone = approver.telefone.replace(/\D/g, "");
      const normalized = phone.startsWith("55") ? phone : `55${phone}`;
      window.open(`https://wa.me/${normalized}?text=${encoded}`, "_blank");
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank");
    }

    // Register in DB in the background — show error if it fails
    if (waAprovadorId) {
      setWAModalLoading(true);
      setWAModalError("");
      try {
        const res = await fetch(`/api/compras/necessidades/${necessidade.id}/submeter-aprovacao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modo: "direto", aprovadorId: waAprovadorId, sendWA: false }),
        });
        const json = await res.json();
        if (!res.ok) {
          setWAModalError(json.error || "Erro ao registrar aprovação");
          setWAModalLoading(false);
          return;
        }
        setShowWAModal(false);
        setTimeout(() => load(), 800);
      } catch {
        setWAModalError("Erro de conexão ao registrar aprovação");
        setWAModalLoading(false);
      }
    } else {
      setShowWAModal(false);
    }
  }

  async function confirmarDiretamente() {
    if (!necessidade || !waAprovadorId) return;
    setWAModalLoading(true);
    setWAModalError("");
    try {
      const res = await fetch(`/api/compras/necessidades/${necessidade.id}/submeter-aprovacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "direto", aprovadorId: waAprovadorId, sendWA: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setWAModalError(json.error || "Erro ao registrar aprovação");
        return;
      }
      setShowWAModal(false);
      setTimeout(() => load(), 800);
    } catch {
      setWAModalError("Erro de conexão");
    } finally {
      setWAModalLoading(false);
    }
  }


  // ── Edit helpers ─────────────────────────────────────────────────────────────
  function enterEditMode() {
    if (!necessidade) return;
    setEFilialId(necessidade.filialId ?? "");
    setEDescricao(necessidade.justificativa ?? "");
    setEPrioridade(necessidade.prioridade ?? 3);
    setEEntregaDesejada(necessidade.dataNecessidade ? necessidade.dataNecessidade.slice(0, 10) : "");
    setESolicitante(necessidade.solicitante ?? "");
    setETipoCompra(necessidade.tipoCompra ?? "");
    setEMotivo(necessidade.motivo ?? "");
    setELocalEstoqueId(necessidade.localEstoqueId ?? "");
    setECentroCustoId(necessidade.centroCustoId ?? "");
    setECategoria(necessidade.categoria ?? "");
    setEProjeto(necessidade.projeto ?? "");
    setEClassificacaoAuxiliar(necessidade.classificacaoAuxiliar ?? "");
    setEObservacoes(necessidade.observacoes ?? "");
    setEItens(necessidade.itens.map((it) => ({
      itemId: it.item.id,
      quantidade: String(decimalToNumber(it.quantidade)),
      unidade: it.unidade ?? it.item.unidade?.sigla ?? it.item.unidadeMedida ?? "",
      observacao: it.observacao ?? "",
    })));
    // Pre-load units for existing items
    necessidade.itens.forEach((it) => fetchItemUnidades(it.item.id));
    setEditError("");
    setEditMode(true);
  }

  function exitEditMode() { setEditMode(false); setEditError(""); }

  const loadLocais = useCallback(async (fId: string) => {
    if (!fId) { setLocaisEstoque([]); return; }
    const res  = await fetch(`/api/suprimentos/locais-estoque?ativo=true&filialId=${fId}`);
    const json = await res.json();
    setLocaisEstoque(Array.isArray(json) ? json : []);
  }, []);

  // Load locais when edit mode opens or filial changes in edit
  useEffect(() => { if (editMode) loadLocais(eFilialId); }, [eFilialId, editMode]); // eslint-disable-line

  // Load static options once
  useEffect(() => {
    if (!editMode) return;
    if (filiais.length === 0)
      fetch("/api/empresa/filiais?ativo=true").then((r) => r.json()).then((j) => setFiliais(Array.isArray(j) ? j : []));
    if (centrosCusto.length === 0)
      fetch("/api/empresa/centros-custo?ativo=true").then((r) => r.json()).then((j) => setCentrosCusto(Array.isArray(j) ? j : []));
    if (itemOptions.length === 0)
      fetch("/api/suprimentos/produtos").then((r) => r.json()).then((j) => setItemOptions(Array.isArray(j) ? j : j.data ?? []));
  }, [editMode]); // eslint-disable-line

  async function fetchItemUnidades(itemId: string) {
    if (!itemId || itemUnidades.has(itemId)) return;
    const res  = await fetch(`/api/suprimentos/produtos/${itemId}/unidades`);
    const json = await res.json();
    const list: UnidadeOption[] = Array.isArray(json)
      ? json.map((u: { unidade: { id: string; sigla: string; nome: string }; isPrincipal: boolean }) => ({
          id: u.unidade.id, sigla: u.unidade.sigla, nome: u.unidade.nome, isPrincipal: u.isPrincipal,
        }))
      : [];
    setItemUnidades((prev) => new Map(prev).set(itemId, list));
    return list;
  }

  function addERow() { setEItens((p) => [...p, { itemId: "", quantidade: "1", unidade: "", observacao: "" }]); }
  function removeERow(i: number) { setEItens((p) => p.filter((_, idx) => idx !== i)); }
  function updateERow(i: number, key: keyof ItemRow, value: string) {
    setEItens((p) => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));
  }

  async function handleItemChange(i: number, itemId: string) {
    updateERow(i, "itemId", itemId);
    if (!itemId) { updateERow(i, "unidade", ""); return; }
    let units = itemUnidades.get(itemId);
    if (!units) units = await fetchItemUnidades(itemId) ?? [];
    const principal = units.find((u) => u.isPrincipal) ?? units[0];
    if (principal) updateERow(i, "unidade", principal.sigla);
    else { const item = itemOptions.find((o) => o.id === itemId); updateERow(i, "unidade", item?.unidade?.sigla ?? ""); }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!eFilialId) { setEditError("Filial é obrigatória"); return; }
    if (!eLocalEstoqueId) { setEditError("Local de Estoque é obrigatório"); return; }
    if (!eMotivo.trim()) { setEditError("Motivo de compra é obrigatório"); return; }
    const validItens = eItens.filter((r) => r.itemId && parseFloat(r.quantidade) > 0);
    if (validItens.length === 0) { setEditError("Adicione pelo menos um item com quantidade válida"); return; }
    if (!eDescricao.trim()) { setEditError("Descrição é obrigatória"); return; }
    setSaving(true); setEditError("");
    try {
      const res = await fetch(`/api/suprimentos/necessidades/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filialId: eFilialId, justificativa: eDescricao.trim(), prioridade: ePrioridade,
          dataNecessidade: eEntregaDesejada || null, solicitante: eSolicitante.trim() || null,
          tipoCompra: eTipoCompra.trim() || null, motivo: eMotivo.trim() || null,
          localEstoqueId: eLocalEstoqueId || null, centroCustoId: eCentroCustoId || null,
          categoria: eCategoria.trim() || null, projeto: eProjeto.trim() || null,
          classificacaoAuxiliar: eClassificacaoAuxiliar.trim() || null,
          observacoes: eObservacoes.trim() || null,
          itens: validItens.map((r) => ({
            itemId: r.itemId, quantidade: parseFloat(r.quantidade),
            unidade: r.unidade || null, observacao: r.observacao || null,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || "Erro ao salvar"); return; }
      setEditMode(false);
      await load();
    } catch { setEditError("Erro de conexão. Tente novamente."); }
    finally   { setSaving(false); }
  }

  useTabTitle(necessidade ? `Solicitação ${necessidade.numero}` : null);

  if (loading) return <div className="px-8 pt-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...</div>;
  if (!necessidade) return <div className="px-8 pt-8 text-red-500">{error || "Não encontrado"}</div>;

  const isRascunho = necessidade.status === "RASCUNHO";
  const isCancelada = necessidade.status === "CANCELADA";
  // Editar nunca em SC cancelada (estado final); senão admin sempre, ou estados iniciais.
  const canEdit    = !isCancelada && (isAdmin || ["RASCUNHO", "AGUARDANDO_APROVACAO", "REJEITADA"].includes(necessidade.status));
  // Cancelar (soft) disponível em todos os estados de trabalho, exceto os terminais já atendidos.
  const canCancel  = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA", "REJEITADA", "EM_COTACAO", "EM_PEDIDO"].includes(necessidade.status);

  // ── Edit mode view ───────────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div>
        <PageHeader
          title={`Editar ${necessidade.numero}`}
          breadcrumbs={[
            { label: "Compras" },
            { label: "Solicitações de Compras", href: "/compras/necessidades" },
            { label: necessidade.numero },
            { label: "Editar" },
          ]}
        />

        <form onSubmit={handleSaveEdit} className="px-8 pb-8 space-y-5 max-w-5xl">
          {editError && <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm">{editError}</div>}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1.5">
                <Label>Filial <span className="text-red-500">*</span></Label>
                <SelectField options={filiais} value={eFilialId}
                  onChange={(v) => { setEFilialId(v); setELocalEstoqueId(""); }}
                  placeholder="Selecionar filial..." getLabel={(f) => f.nomeFantasia || f.razaoSocial} />
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6 space-y-1.5">
                  <Label>Descrição <span className="text-red-500">*</span></Label>
                  <Input value={eDescricao} onChange={(e) => setEDescricao(e.target.value)} placeholder="Descreva o que está sendo solicitado..." />
                </div>
                <div className="col-span-3 space-y-1.5">
                  <Label>Prioridade <span className="text-red-500">*</span></Label>
                  <select value={ePrioridade} onChange={(e) => setEPrioridade(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400">
                    {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="col-span-3 space-y-1.5">
                  <Label>Entrega desejada</Label>
                  <Input type="date" value={eEntregaDesejada} onChange={(e) => setEEntregaDesejada(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Solicitante <span className="text-red-500">*</span></Label>
                  <Input value={eSolicitante} onChange={(e) => setESolicitante(e.target.value)} placeholder="Nome do solicitante" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de compra</Label>
                  <select value={eTipoCompra} onChange={(e) => setETipoCompra(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="">Selecione...</option>
                    <option value="SGA">SGA</option><option value="OPEX">OPEX</option>
                    <option value="CAPEX">CAPEX</option><option value="ESTOQUE">ESTOQUE</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo <span className="text-red-500">*</span></Label>
                  <Input value={eMotivo} onChange={(e) => setEMotivo(e.target.value)} placeholder="Motivo da solicitação..." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Local de Estoque <span className="text-red-500">*</span></Label>
                  <SelectField options={locaisEstoque} value={eLocalEstoqueId} onChange={setELocalEstoqueId}
                    placeholder={eFilialId ? (locaisEstoque.length === 0 ? "Nenhum local para esta filial" : "Selecionar local...") : "Selecione a filial primeiro"}
                    getLabel={(l) => l.nome} disabled={!eFilialId} />
                </div>
                <div className="space-y-1.5">
                  <Label>Centro de Custo</Label>
                  <SelectField options={centrosCusto} value={eCentroCustoId} onChange={setECentroCustoId}
                    placeholder="Selecionar centro de custo..." getLabel={(c) => `${c.codigo} - ${c.nome}`} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label>Categoria</Label><Input value={eCategoria} onChange={(e) => setECategoria(e.target.value)} placeholder="Ex: Material de escritório..." /></div>
                <div className="space-y-1.5"><Label>Projeto</Label><Input value={eProjeto} onChange={(e) => setEProjeto(e.target.value)} placeholder="Nome do projeto..." /></div>
                <div className="space-y-1.5"><Label>Classificação auxiliar</Label><Input value={eClassificacaoAuxiliar} onChange={(e) => setEClassificacaoAuxiliar(e.target.value)} placeholder="Classificação adicional..." /></div>
              </div>

              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Textarea value={eObservacoes} onChange={(e) => setEObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Itens Solicitados</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={addERow}><Plus className="w-4 h-4 mr-1" />Adicionar Item</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {eItens.map((row, i) => {
                const units = itemUnidades.get(row.itemId) ?? [];
                return (
                  <div key={i} className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-5 space-y-1.5">
                      {i === 0 && <Label>Produto</Label>}
                      <ComboboxWithCreate
                        options={itemOptions.map((opt) => {
                          const saldo = (opt.estoqueItems ?? []).reduce(
                            (sum, ei) => sum + parseFloat(String(ei.quantidadeAtual ?? 0)), 0
                          );
                          return { value: opt.id, label: `[${opt.codigo}] ${opt.descricao}`, code: opt.codigo, saldo };
                        })}
                        value={row.itemId}
                        onChange={(v) => handleItemChange(i, v)}
                        allowNone={false}
                        placeholder="Selecionar produto..."
                        createHref="/suprimentos/produtos/novo"
                        createParam="descricao"
                        createLabel="produto"
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      {i === 0 && <Label>Quantidade</Label>}
                      <Input type="number" step="0.001" min="0.001" value={row.quantidade} onChange={(e) => updateERow(i, "quantidade", e.target.value)} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      {i === 0 && <Label>Unidade</Label>}
                      <UnitSelect value={row.unidade} options={units} onChange={(v) => updateERow(i, "unidade", v)} disabled={!row.itemId} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      {i === 0 && <Label>Observação</Label>}
                      <Input value={row.observacao} onChange={(e) => updateERow(i, "observacao", e.target.value)} placeholder="Opcional..." />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {eItens.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeERow(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={exitEditMode}>
              <X className="w-4 h-4 mr-1" />Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Salvando...</> : <><Save className="w-4 h-4 mr-1" />Salvar Alterações</>}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ── Read-only view ───────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={`Solicitação ${necessidade.numero}`}
        breadcrumbs={[
          { label: "Compras" },
          { label: "Solicitações de Compras", href: "/compras/necessidades" },
          { label: necessidade.numero },
        ]}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge status={necessidade.status} />

            {/* Edit — available on RASCUNHO, AGUARDANDO_APROVACAO, REJEITADA */}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={enterEditMode}>
                <Pencil className="w-3.5 h-3.5 mr-1" />Editar
              </Button>
            )}

            {/* RASCUNHO → APROVADA direto (a aprovação agora é na cotação) */}
            {isRascunho && (
              <Button size="sm"
                onClick={() => changeStatus("APROVADA")} disabled={actioning}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {actioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Confirmar e liberar para cotação
              </Button>
            )}

            {/* Cancelar SC — soft-cancel com motivo (não exclui registros); estado final */}
            {canCancel && (
              <Button size="sm" variant="outline"
                className="border-border text-muted-foreground hover:bg-muted gap-1.5"
                onClick={() => { setShowCancelForm(true); setActionError(""); setMotivoCancelamento(""); }}
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancelar SC
              </Button>
            )}

            {/* Excluir — apenas admin, qualquer status */}
            {isAdmin && (
              <Button size="sm" variant="outline"
                className="border-danger/30 text-danger hover:bg-danger/10"
                onClick={() => { setShowDelete(true); setDeleteError(""); }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />Excluir
              </Button>
            )}

            {/* APROVADA → gerar cotação (a aprovação do fluxo é só na cotação, CT→PC) */}
            {necessidade.status === "APROVADA" && (
              <Button size="sm" onClick={gerarCotacao}>
                Gerar Cotação
              </Button>
            )}
          </div>
        }
      />

      <div className="px-8 pb-8">
        {actionError && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg text-sm mb-5">{actionError}</div>
        )}

        {/* Side-by-side quando sidebar recolhida; empilhado quando painel aberto */}
        <div className={cn("flex gap-5", sidebarExpanded ? "flex-col" : "flex-row items-start")}>

          {/* ── Coluna esquerda: Informações ─────────────────────────────── */}
          <div className="min-w-0 flex-1 space-y-5">

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
              <CardContent className="space-y-3">

                {/* Row 1: identidade */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                  <InfoField label="Número">
                    <span className="font-mono font-bold text-foreground">{necessidade.numero}</span>
                  </InfoField>
                  <InfoField label="Status">
                    <div className="mt-0.5"><StatusBadge status={necessidade.status} /></div>
                  </InfoField>
                  <InfoField label="Prioridade">
                    <PrioridadeBadge prioridade={necessidade.prioridade} />
                  </InfoField>
                  <InfoField label="Data de Criação">
                    {formatDate(necessidade.createdAt)}
                  </InfoField>
                </div>

                <div className="h-px bg-muted" />

                {/* Row 2: origem */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                  <InfoField label="Filial">
                    {necessidade.filial ? (necessidade.filial.nomeFantasia || necessidade.filial.razaoSocial) : "—"}
                  </InfoField>
                  <InfoField label="Local de Estoque">
                    {necessidade.localEstoque?.nome ?? "—"}
                  </InfoField>
                  <InfoField label="Setor">
                    {necessidade.setor?.nome ?? "—"}
                  </InfoField>
                  <InfoField label="Centro de Custo">
                    {necessidade.centroCusto ? `${necessidade.centroCusto.codigo} — ${necessidade.centroCusto.nome}` : "—"}
                  </InfoField>
                </div>

                <div className="h-px bg-muted" />

                {/* Row 3: solicitação */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                  <InfoField label="Solicitante">
                    {necessidade.colaborador?.nome ?? necessidade.solicitante ?? "—"}
                  </InfoField>
                  <InfoField label="Entrega Desejada">
                    {formatDate(necessidade.dataNecessidade)}
                  </InfoField>
                  <InfoField label="Tipo de Compra">
                    {necessidade.tipoCompra ?? "—"}
                  </InfoField>
                  <InfoField label="Motivo">
                    {necessidade.motivo ?? "—"}
                  </InfoField>
                </div>

                {/* Row 4: classificação — só mostra se algum tiver valor */}
                {(necessidade.categoria || necessidade.projeto || necessidade.classificacaoAuxiliar) && (
                  <>
                    <div className="h-px bg-muted" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                      <InfoField label="Categoria">{necessidade.categoria ?? "—"}</InfoField>
                      <InfoField label="Projeto">{necessidade.projeto ?? "—"}</InfoField>
                      <InfoField label="Classificação Auxiliar">{necessidade.classificacaoAuxiliar ?? "—"}</InfoField>
                    </div>
                  </>
                )}

                <div className="h-px bg-muted" />

                {/* Row 5: textos livres */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Descrição / Justificativa">
                    <span className="text-foreground whitespace-pre-wrap">{necessidade.justificativa || "—"}</span>
                  </InfoField>
                  <InfoField label="Observações">
                    <span className="text-foreground whitespace-pre-wrap">{necessidade.observacoes || "—"}</span>
                  </InfoField>
                </div>

              </CardContent>
            </Card>

            {/* Approval / rejection / cancellation info */}
            {(necessidade.status === "APROVADA" || necessidade.status === "REJEITADA" || isCancelada) && (
              <Card className={
                necessidade.status === "APROVADA" ? "border-success/30 bg-success/10"
                : isCancelada ? "border-border bg-muted"
                : "border-danger/30 bg-danger/10"
              }>
                <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {necessidade.status === "APROVADA" && (
                    <>
                      <div><p className="text-xs text-muted-foreground">Aprovado por</p><p className="text-sm font-medium">{necessidade.aprovadoPor || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Data de Aprovação</p><p className="text-sm font-medium">{formatDate(necessidade.dataAprovacao)}</p></div>
                    </>
                  )}
                  {necessidade.status === "REJEITADA" && (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-danger">Motivo da Rejeição</p>
                      <p className="text-sm text-danger mt-1">{necessidade.motivoReprovacao || "—"}</p>
                    </div>
                  )}
                  {isCancelada && (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-muted-foreground">Motivo do Cancelamento</p>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{necessidade.motivoCancelamento || "—"}</p>
                      {necessidade.dataCancelamento && (
                        <p className="text-xs text-muted-foreground mt-1.5">Cancelada em {formatDate(necessidade.dataCancelamento)}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Histórico de Aprovações ───────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-success" />
                  <CardTitle className="text-base">Histórico de Aprovações</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {(necessidade.aprovacoes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhuma aprovação registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {(necessidade.aprovacoes ?? []).map((apr) => (
                      <div key={apr.id} className="flex items-center gap-4 bg-muted rounded-lg px-4 py-3 text-sm">
                        <div className="shrink-0">
                          {apr.status === "APROVADO" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                          {apr.status === "REPROVADO" && <XCircle className="w-5 h-5 text-red-500" />}
                          {apr.status === "PENDENTE" && <Clock className="w-5 h-5 text-amber-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {apr.etapaNome ?? `Etapa ${apr.etapaOrdem}`}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {apr.aprovador.nome}
                            </span>
                          </p>
                          {apr.observacao && (
                            <p className="text-xs text-muted-foreground mt-0.5">{apr.observacao}</p>
                          )}
                          {!apr.waMsgId && apr.status === "PENDENTE" && (
                            <p className="text-xs text-warning mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Mensagem não enviada — configure o WhatsApp e reenvie
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={cn(
                            "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
                            apr.status === "APROVADO"  && "bg-success/10 text-success border border-success/30",
                            apr.status === "REPROVADO" && "bg-danger/10 text-danger border border-danger/30",
                            apr.status === "PENDENTE"  && "bg-warning/10 text-warning border border-warning/30",
                          )}>
                            {apr.status === "APROVADO" && "Aprovado"}
                            {apr.status === "REPROVADO" && "Reprovado"}
                            {apr.status === "PENDENTE" && "Aguardando"}
                          </span>
                          {apr.respondidoEm && (
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(apr.respondidoEm)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* ── Coluna direita: Itens + Cotações ─────────────────────────── */}
          <div className={cn("space-y-5", sidebarExpanded ? "w-full" : "w-[720px] shrink-0")}>

            <Card>
              <CardHeader><CardTitle className="text-base">Itens Solicitados</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qtd.</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-14">Un.</th>
                      {necessidade.status === "APROVADA" && (
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aprov.</th>
                      )}
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Obs.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {necessidade.itens.map((item) => (
                      <tr key={item.id} className="hover:bg-muted">
                        <td className="px-4 py-3 font-mono text-xs">{item.item.codigo}</td>
                        <td className="px-4 py-3">{item.item.descricao}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {decimalToNumber(item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {item.unidade ?? item.item.unidade?.sigla ?? item.item.unidadeMedida}
                        </td>
                        {necessidade.status === "APROVADA" && (
                          <td className="px-4 py-3 text-right text-success font-medium tabular-nums">
                            {item.quantidadeAprovada ? decimalToNumber(item.quantidadeAprovada).toLocaleString("pt-BR") : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-muted-foreground text-xs">{item.observacao || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Cotações */}
            {necessidade.cotacoes?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Cotações Geradas</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {necessidade.cotacoes.map((c) => (
                    <Link key={c.id} href={`/suprimentos/cotacoes/${c.id}`}
                      className="inline-flex items-center gap-2 text-sm border border-border hover:border-blue-300 hover:bg-info/10 rounded-lg px-3 py-1.5 transition-colors group">
                      <span className="font-mono font-medium text-foreground group-hover:text-info">{c.numero}</span>
                      <StatusBadge status={c.status} />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Pedidos de Compra */}
            {(necessidade.pedidosCompra?.length ?? 0) > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Pedidos de Compra</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {necessidade.pedidosCompra!.map((p) => (
                    <Link key={p.id} href={`/suprimentos/pedidos-compra/${p.id}`}
                      className="inline-flex items-center gap-2 text-sm border border-border hover:border-blue-300 hover:bg-info/10 rounded-lg px-3 py-1.5 transition-colors group">
                      <span className="font-mono font-medium text-foreground group-hover:text-info">{p.numero}</span>
                      <StatusBadge status={p.status} />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Documentos de Entrada */}
            {(() => {
              const conferencias = (necessidade.pedidosCompra ?? [])
                .map((p) => p.conferencia)
                .filter((c): c is NonNullable<typeof c> => c !== null);
              return conferencias.length > 0 ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Documentos de Entrada</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {conferencias.map((c) => (
                      <Link key={c.id} href={`/suprimentos/conferencias/${c.id}`}
                        className="inline-flex items-center gap-2 text-sm border border-border hover:border-blue-300 hover:bg-info/10 rounded-lg px-3 py-1.5 transition-colors group">
                        <span className="font-mono font-medium text-foreground group-hover:text-info">{c.numero}</span>
                        <StatusBadge status={c.status} />
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              ) : null;
            })()}

          </div>
        </div>
      </div>

      {/* Approve modal */}
      {showApproveForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                <span className="text-success text-lg">✓</span>
              </div>
              <div>
                <p className="font-semibold text-foreground">Aprovar solicitação</p>
                <p className="text-sm text-muted-foreground">{necessidade.numero}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Aprovado por</Label>
              <Input value={aprovadoPor} onChange={(e) => setAprovadoPor(e.target.value)} placeholder="Nome do aprovador" autoFocus />
            </div>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowApproveForm(false)} disabled={actioning}>Cancelar</Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700"
                onClick={() => changeStatus("APROVADA", { aprovadoPor })} disabled={actioning}>
                {actioning ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Aprovando...</> : "Confirmar Aprovação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <X className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Reprovar solicitação</p>
                <p className="text-sm text-muted-foreground">{necessidade.numero}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo da reprovação</Label>
              <Input value={motivoReprovacao} onChange={(e) => setMotivoReprovacao(e.target.value)} placeholder="Descreva o motivo..." autoFocus />
            </div>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowRejectForm(false)} disabled={actioning}>Cancelar</Button>
              <Button size="sm" variant="destructive"
                onClick={() => changeStatus("REJEITADA", { motivoReprovacao })} disabled={actioning}>
                {actioning ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Reprovando...</> : "Confirmar Reprovação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal — soft-cancel da SC com motivo obrigatório (estado final) */}
      {showCancelForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Cancelar solicitação</p>
                <p className="text-sm text-muted-foreground">{necessidade.numero}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              A SC será marcada como <strong>Cancelada</strong> — os registros não são excluídos. Esta ação é definitiva.
            </p>
            <div className="space-y-1.5">
              <Label>Motivo do cancelamento <span className="text-red-500">*</span></Label>
              <Textarea value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Descreva o motivo..." rows={3} autoFocus />
            </div>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowCancelForm(false)} disabled={actioning}>Voltar</Button>
              <Button size="sm" variant="destructive"
                onClick={() => changeStatus("CANCELADA", { motivoCancelamento })}
                disabled={actioning || !motivoCancelamento.trim()}>
                {actioning ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Cancelando...</> : "Confirmar Cancelamento"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Encaminhar Aprovação ──────────────────────────────────────── */}
      {showWAModal && necessidade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-info/15 flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-info" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Encaminhar para Aprovação</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{necessidade.numero}</p>
                </div>
              </div>
              <button onClick={() => setShowWAModal(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

              {/* Aprovador — combobox dropdown */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Aprovador</Label>
                {waUsersLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </div>
                ) : (
                  <div className="relative" ref={waDropdownRef}>
                    {/* Trigger */}
                    <button
                      type="button"
                      onClick={() => { setWADropdownOpen((p) => !p); setWAUserSearch(""); }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border bg-card text-left transition-colors",
                        waDropdownOpen ? "border-green-400 ring-1 ring-green-200" : "border-border hover:border-border"
                      )}
                    >
                      {waAprovadorId ? (
                        <span className="text-foreground font-medium">
                          {waUsers.find((u) => u.id === waAprovadorId)?.nome ?? "—"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecionar aprovador...</span>
                      )}
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", waDropdownOpen && "rotate-180")} />
                    </button>

                    {/* Dropdown panel */}
                    {waDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                        {/* Search input inside dropdown */}
                        <div className="relative border-b border-border">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <input
                            type="text"
                            autoFocus
                            value={waUserSearch}
                            onChange={(e) => setWAUserSearch(e.target.value)}
                            placeholder="Buscar colaborador..."
                            className="w-full pl-8 pr-3 py-2.5 text-sm focus:outline-none bg-transparent placeholder:text-muted-foreground"
                          />
                        </div>
                        {/* Results */}
                        <div className="max-h-52 overflow-y-auto">
                          {(() => {
                            const q = waUserSearch.toLowerCase();
                            const filtered = waUsers.filter((u) => !q || u.nome.toLowerCase().includes(q));
                            if (filtered.length === 0) {
                              return <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhum resultado.</p>;
                            }
                            return filtered.map((u) => (
                              <button key={u.id} type="button"
                                onClick={() => { setWAAprovadorId(u.id); setWADropdownOpen(false); setWAUserSearch(""); }}
                                className={cn(
                                  "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-gray-50 last:border-0",
                                  waAprovadorId === u.id && "bg-info/10"
                                )}
                              >
                                <span className={cn("font-medium", waAprovadorId === u.id ? "text-info" : "text-foreground")}>{u.nome}</span>
                                {u.telegramChatId
                                  ? <span className="text-xs text-blue-500 flex items-center gap-1">✈️ Telegram</span>
                                  : <span className="text-xs text-red-400">sem Telegram</span>}
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Show phone of selected approver */}
                {waAprovadorId && (() => {
                  const a = waUsers.find((u) => u.id === waAprovadorId);
                  return a ? (
                    <p className="text-xs flex items-center gap-1">
                      {a.telegramChatId
                        ? <span className="text-blue-500">✈️ Telegram configurado</span>
                        : <span className="text-red-400">⚠️ Sem Telegram cadastrado — configure em Empresa → Colaboradores</span>}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Preview da mensagem */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Mensagem</Label>
                <div className="bg-[#e9ffd9] border border-success/30 rounded-xl p-4 text-sm text-foreground font-mono leading-relaxed whitespace-pre-wrap select-all">
                  {buildWAMessage()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border shrink-0 bg-muted rounded-b-2xl">
              {waModalError && (
                <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {waModalError}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowWAModal(false)} disabled={waModalLoading}>
                  Fechar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={copyWAMessage} disabled={waModalLoading}
                  className={cn("gap-1.5", waCopied && "border-green-400 text-success bg-success/10")}>
                  <Copy className="w-3.5 h-3.5" />
                  {waCopied ? "Copiado!" : "Copiar mensagem"}
                </Button>
                <Button type="button" size="sm"
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!waAprovadorId || waModalLoading}
                  onClick={confirmarDiretamente}
                >
                  {waModalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Encaminhar pelo Telegram
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Excluir solicitação?</p>
                <p className="text-sm text-muted-foreground mt-0.5">{necessidade.numero}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {(() => {
                const nCot = necessidade.cotacoes?.length ?? 0;
                const nPed = necessidade.pedidosCompra?.length ?? 0;
                const nDE  = (necessidade.pedidosCompra ?? []).filter((p) => p.conferencia).length;
                const vinc = [
                  nCot > 0 ? `${nCot} cotação(ões)` : null,
                  nPed > 0 ? `${nPed} pedido(s) de compra` : null,
                  nDE  > 0 ? `${nDE} documento(s) de entrada` : null,
                ].filter(Boolean).join(", ");
                return vinc
                  ? <>Também serão <strong className="text-danger">excluídos: {vinc}</strong>{nDE > 0 ? " — revertendo o estoque lançado por esses documentos" : ""}. Esta ação é permanente e não pode ser desfeita.</>
                  : <>Esta ação é permanente e não pode ser desfeita.</>;
              })()}
            </p>
            {deleteError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDelete(false)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</> : <><Trash2 className="w-4 h-4 mr-1" />Excluir</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
