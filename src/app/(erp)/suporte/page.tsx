"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Plus, Search, X, Loader2, Bug, Lightbulb, HelpCircle,
  ChevronRight, ImageIcon, Trash2, Save, CheckCircle2,
  Clock, AlertTriangle, MessageSquare, User, Calendar,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TipoTicket     = "MELHORIA" | "BUG" | "DUVIDA";
type StatusTicket   = "ABERTO" | "EM_ANALISE" | "RESOLVIDO" | "FECHADO";
type PrioridadeTicket = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

type Ticket = {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  tipo: TipoTicket;
  status: StatusTicket;
  prioridade: PrioridadeTicket;
  imagemUrl: string | null;
  imagemNome: string | null;
  resposta: string | null;
  usuarioId: string;
  createdAt: string;
  updatedAt: string;
  usuario: { id: string; nome: string; email: string };
  respondidoPor: { id: string; nome: string } | null;
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusTicket }) {
  const map: Record<StatusTicket, { label: string; cls: string; icon: React.ReactNode }> = {
    ABERTO:     { label: "Aberto",     cls: "bg-info/15 text-info border-info/30",     icon: <Clock className="w-3 h-3" /> },
    EM_ANALISE: { label: "Em análise", cls: "bg-warning/15 text-warning border-warning/30",  icon: <RefreshCw className="w-3 h-3" /> },
    RESOLVIDO:  { label: "Resolvido",  cls: "bg-success/15 text-success border-success/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    FECHADO:    { label: "Fechado",    cls: "bg-muted text-muted-foreground border-border",     icon: <X className="w-3 h-3" /> },
  };
  const { label, cls, icon } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", cls)}>
      {icon}{label}
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: TipoTicket }) {
  const map: Record<TipoTicket, { label: string; cls: string; icon: React.ReactNode }> = {
    MELHORIA: { label: "Melhoria", cls: "bg-purple-100 text-purple-700 border-purple-200", icon: <Lightbulb className="w-3 h-3" /> },
    BUG:      { label: "Bug",      cls: "bg-danger/15 text-danger border-danger/30",          icon: <Bug className="w-3 h-3" /> },
    DUVIDA:   { label: "Dúvida",   cls: "bg-sky-100 text-sky-700 border-sky-200",          icon: <HelpCircle className="w-3 h-3" /> },
  };
  const { label, cls, icon } = map[tipo];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", cls)}>
      {icon}{label}
    </span>
  );
}

function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeTicket }) {
  const map: Record<PrioridadeTicket, { label: string; cls: string }> = {
    BAIXA:   { label: "Baixa",    cls: "bg-muted text-muted-foreground border-border" },
    MEDIA:   { label: "Média",    cls: "bg-info/15 text-info border-info/30" },
    ALTA:    { label: "Alta",     cls: "bg-warning/15 text-orange-600 border-orange-200" },
    CRITICA: { label: "Crítica",  cls: "bg-danger/15 text-danger border-danger/30" },
  };
  const { label, cls } = map[prioridade];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", cls)}>
      {label}
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Image Upload Zone ─────────────────────────────────────────────────────────

function ImageUploadZone({
  value, nome, onChange, onClear,
}: {
  value: string | null;
  nome: string | null;
  onChange: (url: string, nome: string) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/suporte/tickets/upload", { method: "POST", body: fd });
      const j   = await res.json();
      if (!res.ok) { setError(j.error || "Erro ao enviar"); return; }
      onChange(j.url, j.nome);
    } catch { setError("Erro de conexão"); }
    finally { setUploading(false); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  if (value) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt={nome ?? "imagem"} className="w-full max-h-64 object-contain bg-muted" />
        <div className="flex items-center justify-between px-3 py-2 bg-card border-t border-border">
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{nome}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition-colors ml-2">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border hover:border-blue-300 rounded-xl p-6 text-center cursor-pointer transition-colors group"
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
            <p className="text-sm text-muted-foreground">Enviando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-muted group-hover:bg-info/10 flex items-center justify-center transition-colors">
              <ImageIcon className="w-5 h-5 text-muted-foreground group-hover:text-blue-500" />
            </div>
            <p className="text-sm text-muted-foreground">Arraste ou <span className="text-info font-medium">clique para selecionar</span></p>
            <p className="text-xs text-muted-foreground">PNG, JPG, GIF, WebP — máx. 10 MB</p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuportePage() {
  const { user } = useSession();
  const isAdmin  = user?.perfil === "ADMIN";

  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusTicket | "todos">("todos");
  const [filterTipo,   setFilterTipo]   = useState<TipoTicket | "todos">("todos");

  // ── Create modal state ──────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [fTitulo,    setFTitulo]    = useState("");
  const [fDescricao, setFDescricao] = useState("");
  const [fTipo,      setFTipo]      = useState<TipoTicket>("MELHORIA");
  const [fPrior,     setFPrior]     = useState<PrioridadeTicket>("MEDIA");
  const [fImgUrl,    setFImgUrl]    = useState<string | null>(null);
  const [fImgNome,   setFImgNome]   = useState<string | null>(null);
  const [fError,     setFError]     = useState("");
  const [fSaving,    setFSaving]    = useState(false);
  const [created,    setCreated]    = useState<string | null>(null); // numero do ticket criado

  // ── Detail panel state ──────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState<Ticket | null>(null);
  const [adminStatus,   setAdminStatus]   = useState<StatusTicket>("ABERTO");
  const [adminResposta, setAdminResposta] = useState("");
  const [adminSaving,   setAdminSaving]   = useState(false);
  const [adminError,    setAdminError]    = useState("");

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/suporte/tickets");
      const j   = await res.json();
      setTickets(j.data ?? []);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create submit ────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitulo.trim()) { setFError("Título é obrigatório"); return; }
    if (!fDescricao.trim()) { setFError("Descrição é obrigatória"); return; }
    setFSaving(true); setFError("");
    try {
      const res = await fetch("/api/suporte/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: fTitulo, descricao: fDescricao, tipo: fTipo, prioridade: fPrior, imagemUrl: fImgUrl, imagemNome: fImgNome }),
      });
      const j = await res.json();
      if (!res.ok) { setFError(j.error || "Erro ao criar"); return; }
      setCreated(j.data.numero);
      await load();
    } catch { setFError("Erro de conexão"); }
    finally { setFSaving(false); }
  }

  function resetCreate() {
    setFTitulo(""); setFDescricao(""); setFTipo("MELHORIA"); setFPrior("MEDIA");
    setFImgUrl(null); setFImgNome(null); setFError(""); setCreated(null);
  }

  // ── Admin respond ────────────────────────────────────────────────────────────
  async function handleAdminSave() {
    if (!selected) return;
    setAdminSaving(true); setAdminError("");
    try {
      const res = await fetch(`/api/suporte/tickets/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: adminStatus, resposta: adminResposta || null }),
      });
      const j = await res.json();
      if (!res.ok) { setAdminError(j.error || "Erro ao salvar"); return; }
      setSelected(j.data);
      await load();
    } catch { setAdminError("Erro de conexão"); }
    finally { setAdminSaving(false); }
  }

  function openDetail(t: Ticket) {
    setSelected(t);
    setAdminStatus(t.status);
    setAdminResposta(t.resposta ?? "");
    setAdminError("");
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = tickets.filter((t) => {
    if (filterStatus !== "todos" && t.status !== filterStatus) return false;
    if (filterTipo   !== "todos" && t.tipo   !== filterTipo)   return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!t.numero.toLowerCase().includes(q) && !t.titulo.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Summary counts
  const countAberto    = tickets.filter((t) => t.status === "ABERTO").length;
  const countAnalise   = tickets.filter((t) => t.status === "EM_ANALISE").length;
  const countResolvido = tickets.filter((t) => t.status === "RESOLVIDO").length;

  const STATUS_OPTIONS: { key: StatusTicket | "todos"; label: string }[] = [
    { key: "todos",     label: "Todos" },
    { key: "ABERTO",    label: "Aberto" },
    { key: "EM_ANALISE",label: "Em análise" },
    { key: "RESOLVIDO", label: "Resolvido" },
    { key: "FECHADO",   label: "Fechado" },
  ];

  const TIPO_OPTIONS: { key: TipoTicket | "todos"; label: string }[] = [
    { key: "todos",    label: "Todos os tipos" },
    { key: "MELHORIA", label: "Melhoria" },
    { key: "BUG",      label: "Bug" },
    { key: "DUVIDA",   label: "Dúvida" },
  ];

  return (
    <div>
      <PageHeader
        title="Suporte"
        breadcrumbs={[{ label: "Suporte" }]}
        action={
          <Button onClick={() => { resetCreate(); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Ticket
          </Button>
        }
      />

      <div className="px-8 pb-8 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          <div className="rounded-xl p-3 bg-info/10 text-info text-center cursor-pointer hover:bg-info/15 transition-colors"
            onClick={() => setFilterStatus(filterStatus === "ABERTO" ? "todos" : "ABERTO")}>
            <p className="text-xs font-medium opacity-75">Abertos</p>
            <p className="text-2xl font-bold mt-0.5">{countAberto}</p>
          </div>
          <div className="rounded-xl p-3 bg-warning/10 text-warning text-center cursor-pointer hover:bg-warning/15 transition-colors"
            onClick={() => setFilterStatus(filterStatus === "EM_ANALISE" ? "todos" : "EM_ANALISE")}>
            <p className="text-xs font-medium opacity-75">Em análise</p>
            <p className="text-2xl font-bold mt-0.5">{countAnalise}</p>
          </div>
          <div className="rounded-xl p-3 bg-success/10 text-success text-center cursor-pointer hover:bg-success/15 transition-colors"
            onClick={() => setFilterStatus(filterStatus === "RESOLVIDO" ? "todos" : "RESOLVIDO")}>
            <p className="text-xs font-medium opacity-75">Resolvidos</p>
            <p className="text-2xl font-bold mt-0.5">{countResolvido}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número ou título..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button key={opt.key} onClick={() => setFilterStatus(opt.key as StatusTicket | "todos")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  filterStatus === opt.key
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-card text-muted-foreground border-border hover:border-border"
                )}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tipo filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {TIPO_OPTIONS.map((opt) => (
              <button key={opt.key} onClick={() => setFilterTipo(opt.key as TipoTicket | "todos")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  filterTipo === opt.key
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-card text-muted-foreground border-border hover:border-border"
                )}>
                {opt.label}
              </button>
            ))}
          </div>

          {(search || filterStatus !== "todos" || filterTipo !== "todos") && (
            <button onClick={() => { setSearch(""); setFilterStatus("todos"); setFilterTipo("todos"); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{tickets.length === 0 ? "Nenhum ticket aberto ainda" : "Nenhum ticket encontrado"}</p>
            {tickets.length === 0 && (
              <p className="text-sm mt-1">Clique em &ldquo;Novo Ticket&rdquo; para reportar uma melhoria ou bug.</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  <th className="text-left px-4 py-3">Nº</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Título</th>
                  <th className="text-left px-4 py-3">Prioridade</th>
                  <th className="text-left px-4 py-3">Status</th>
                  {isAdmin && <th className="text-left px-4 py-3">Solicitante</th>}
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => (
                  <tr key={t.id}
                    onClick={() => openDetail(t)}
                    className="hover:bg-info/10 cursor-pointer transition-colors group">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-semibold text-info">{t.numero}</span>
                    </td>
                    <td className="px-4 py-3.5"><TipoBadge tipo={t.tipo} /></td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-foreground truncate max-w-[260px]">{t.titulo}</p>
                      {t.resposta && (
                        <p className="text-xs text-success mt-0.5 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Respondido
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5"><PrioridadeBadge prioridade={t.prioridade} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={t.status} /></td>
                    {isAdmin && (
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{t.usuario.nome}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </td>
                    <td className="px-3 py-3.5">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-muted border-t border-border text-xs text-muted-foreground font-medium">
              {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE MODAL ──────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <div>
                <h2 className="font-semibold text-foreground">Novo Ticket</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Descreva sua solicitação de melhoria ou reporte um bug</p>
              </div>
              <button onClick={() => { setShowCreate(false); resetCreate(); }} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success state */}
            {created ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Ticket criado!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Seu ticket <strong className="text-foreground font-mono">{created}</strong> foi registrado com sucesso.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Nossa equipe irá analisá-lo em breve.</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button onClick={() => { resetCreate(); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Abrir outro
                  </Button>
                  <Button variant="outline" onClick={() => { setShowCreate(false); resetCreate(); }}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                  {/* Tipo */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Tipo <span className="text-red-500">*</span></Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: "MELHORIA", label: "Melhoria", icon: <Lightbulb className="w-4 h-4" />, cls: "text-purple-600 bg-purple-50 border-purple-200" },
                        { key: "BUG",      label: "Bug",      icon: <Bug className="w-4 h-4" />,       cls: "text-danger bg-danger/10 border-danger/30" },
                        { key: "DUVIDA",   label: "Dúvida",   icon: <HelpCircle className="w-4 h-4" />,cls: "text-sky-600 bg-sky-50 border-sky-200" },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" onClick={() => setFTipo(opt.key)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                            fTipo === opt.key ? opt.cls + " border-current" : "border-border text-muted-foreground hover:border-border"
                          )}>
                          {opt.icon}{opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prioridade */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Prioridade</Label>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { key: "BAIXA",   label: "Baixa",   cls: "text-muted-foreground bg-muted border-border" },
                        { key: "MEDIA",   label: "Média",   cls: "text-info bg-info/10 border-blue-300" },
                        { key: "ALTA",    label: "Alta",    cls: "text-orange-600 bg-warning/10 border-orange-300" },
                        { key: "CRITICA", label: "Crítica", cls: "text-danger bg-danger/10 border-red-300" },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" onClick={() => setFPrior(opt.key)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all",
                            fPrior === opt.key ? opt.cls + " border-current" : "border-border text-muted-foreground hover:border-border"
                          )}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Título */}
                  <div className="space-y-1.5">
                    <Label>Título <span className="text-red-500">*</span></Label>
                    <Input
                      value={fTitulo}
                      onChange={(e) => setFTitulo(e.target.value)}
                      placeholder="Resumo claro do problema ou melhoria"
                      autoFocus
                    />
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1.5">
                    <Label>Descrição <span className="text-red-500">*</span></Label>
                    <textarea
                      value={fDescricao}
                      onChange={(e) => setFDescricao(e.target.value)}
                      rows={5}
                      placeholder={
                        fTipo === "BUG"
                          ? "Descreva o bug: o que aconteceu, como reproduzir, qual era o comportamento esperado..."
                          : fTipo === "MELHORIA"
                          ? "Descreva a melhoria: qual funcionalidade, como funcionaria, qual o benefício..."
                          : "Descreva sua dúvida com o máximo de detalhes..."
                      }
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder:text-muted-foreground"
                    />
                  </div>

                  {/* Imagem */}
                  <div className="space-y-1.5">
                    <Label>Imagem <span className="text-xs text-muted-foreground font-normal">(opcional — screenshot, foto)</span></Label>
                    <ImageUploadZone
                      value={fImgUrl}
                      nome={fImgNome}
                      onChange={(url, nome) => { setFImgUrl(url); setFImgNome(nome); }}
                      onClear={() => { setFImgUrl(null); setFImgNome(null); }}
                    />
                  </div>

                  {fError && (
                    <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{fError}</p>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex gap-2 justify-end shrink-0">
                  <Button type="button" variant="outline" onClick={() => { setShowCreate(false); resetCreate(); }}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={fSaving}>
                    {fSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    Enviar Ticket
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL PANEL ──────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="w-full max-w-lg bg-card shadow-2xl flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-info">{selected.numero}</span>
                  <TipoBadge tipo={selected.tipo} />
                  <PrioridadeBadge prioridade={selected.prioridade} />
                </div>
                <h2 className="font-semibold text-foreground text-base leading-snug">{selected.titulo}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-muted-foreground ml-4 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Meta info */}
              <div className="px-6 py-4 bg-muted border-b border-border space-y-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {selected.usuario.nome}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(selected.createdAt)}
                  </span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* Description */}
              <div className="px-6 py-4 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selected.descricao}</p>
              </div>

              {/* Image */}
              {selected.imagemUrl && (
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Imagem Anexada</p>
                  <a href={selected.imagemUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.imagemUrl}
                      alt={selected.imagemNome ?? "imagem"}
                      className="rounded-xl border border-border max-h-72 w-full object-contain bg-muted hover:opacity-90 transition-opacity cursor-zoom-in"
                    />
                  </a>
                  <p className="text-xs text-muted-foreground mt-1">{selected.imagemNome}</p>
                </div>
              )}

              {/* Existing response (non-admin view) */}
              {!isAdmin && selected.resposta && (
                <div className="px-6 py-4 border-b border-border">
                  <p className="text-xs font-semibold text-success uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Resposta da Equipe
                  </p>
                  <div className="bg-success/10 border border-success/30 rounded-xl px-4 py-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selected.resposta}</p>
                    {selected.respondidoPor && (
                      <p className="text-xs text-muted-foreground mt-2">— {selected.respondidoPor.nome}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Admin panel */}
              {isAdmin && (
                <div className="px-6 py-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Gerenciar Ticket
                  </p>

                  {/* Status change */}
                  <div className="space-y-2">
                    <Label className="text-xs">Status</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: "ABERTO",     label: "Aberto",     cls: "text-info bg-info/10 border-blue-300" },
                        { key: "EM_ANALISE", label: "Em análise", cls: "text-warning bg-warning/10 border-amber-300" },
                        { key: "RESOLVIDO",  label: "Resolvido",  cls: "text-success bg-success/10 border-emerald-300" },
                        { key: "FECHADO",    label: "Fechado",    cls: "text-muted-foreground bg-muted border-border" },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" onClick={() => setAdminStatus(opt.key)}
                          className={cn(
                            "py-2 rounded-lg text-xs font-semibold border-2 transition-all",
                            adminStatus === opt.key ? opt.cls + " border-current" : "border-border text-muted-foreground hover:border-border"
                          )}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Response */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Resposta ao usuário <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <textarea
                      value={adminResposta}
                      onChange={(e) => setAdminResposta(e.target.value)}
                      rows={4}
                      placeholder="Digite sua resposta para o solicitante..."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder:text-muted-foreground"
                    />
                  </div>

                  {adminError && (
                    <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{adminError}</p>
                  )}

                  <Button onClick={handleAdminSave} disabled={adminSaving} className="w-full">
                    {adminSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Salvar Alterações
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
