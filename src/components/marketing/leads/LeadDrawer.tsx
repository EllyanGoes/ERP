"use client";

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LeadTimeline, { type LeadEvento } from "@/components/marketing/leads/LeadTimeline";
import ConverterLeadDialog from "@/components/marketing/leads/ConverterLeadDialog";
import { PLATAFORMA_BADGE, PLATAFORMA_LABELS } from "@/components/marketing/CampanhaForm";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import {
  Loader2, Mail, Phone, MapPin, Megaphone, Building2, Trophy, XCircle, Trash2,
  UserCheck, StickyNote, Send, Link2,
} from "lucide-react";

type Etapa = { id: string; nome: string; ordem: number; cor: string | null; ganho: boolean };

type LeadDetalhe = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  empresaNome: string | null;
  cidade: string | null;
  estado: string | null;
  status: "ABERTO" | "GANHO" | "PERDIDO";
  valorEstimado: number | string | null;
  origemLivre?: string | null;
  motivoPerda?: string | null;
  observacoes?: string | null;
  convertidoEm: string | null;
  createdAt: string;
  etapaId: string | null;
  campanha: { id: string; nome: string; plataforma: string } | null;
  etapa: { id: string; nome: string; cor: string | null; ganho: boolean } | null;
  funil?: { id: string; nome: string } | null;
  cliente: { id: string; razaoSocial: string } | null;
  pedidoVenda?: { id: string; numero?: string } | null;
  eventos: LeadEvento[];
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ABERTO: { label: "Aberto", cls: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  GANHO: { label: "Ganho", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  PERDIDO: { label: "Perdido", cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

export default function LeadDrawer({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string | null;
  onClose: () => void;
  /** Chamado após qualquer mudança persistida — recarregue a lista/kanban. */
  onChanged: () => void;
}) {
  const open = !!leadId;
  const [lead, setLead] = useState<LeadDetalhe | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [converterOpen, setConverterOpen] = useState(false);
  const [tipoEvento, setTipoEvento] = useState<"NOTA" | "CONTATO">("NOTA");
  const [descricaoEvento, setDescricaoEvento] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!leadId) return;
    const res = await fetch(`/api/marketing/leads/${leadId}`);
    if (res.ok) {
      const json = await res.json();
      setLead(json.data);
    }
  }, [leadId]);

  useEffect(() => {
    setLead(null);
    setErro(null);
    setDescricaoEvento("");
    setTipoEvento("NOTA");
    if (leadId) carregar();
  }, [leadId, carregar]);

  useEffect(() => {
    fetch("/api/marketing/etapas-lead")
      .then((r) => r.json())
      .then((j) => setEtapas(j.data ?? []))
      .catch(() => {});
  }, []);

  async function patch(body: Record<string, unknown>) {
    if (!leadId) return false;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErro(json.error ?? "Erro ao atualizar o lead.");
        return false;
      }
      await carregar();
      onChanged();
      return true;
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function registrarEvento() {
    if (!leadId || !descricaoEvento.trim()) return;
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/eventos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoEvento, descricao: descricaoEvento.trim() }),
      });
      if (res.ok) {
        setDescricaoEvento("");
        await carregar();
      } else {
        const json = await res.json().catch(() => ({}));
        setErro(json.error ?? "Erro ao registrar o evento.");
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function marcarPerdido() {
    const motivo = window.prompt("Motivo da perda:");
    if (motivo === null) return; // cancelou
    await patch({ status: "PERDIDO", motivoPerda: motivo.trim() || null });
  }

  async function excluir() {
    if (!leadId || !lead) return;
    if (!confirm(`Excluir o lead "${lead.nome}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}`, { method: "DELETE" });
      if (res.ok) {
        onChanged();
        onClose();
      } else {
        const json = await res.json().catch(() => ({}));
        setErro(json.error ?? "Não foi possível excluir o lead.");
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const statusInfo = lead ? STATUS_BADGE[lead.status] ?? STATUS_BADGE.ABERTO : null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      )}
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }} modal={false}>
        <SheetContent
          side="right"
          className="w-full max-w-2xl flex flex-col p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-6 py-4">
            <SheetTitle>Detalhe do Lead</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 bg-muted/60">
            {!lead ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="space-y-5">
                {/* ── Cabeçalho ─────────────────────────────────────────── */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-foreground">{lead.nome}</h2>
                        {statusInfo && (
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", statusInfo.cls)}>
                            {statusInfo.label}
                          </span>
                        )}
                      </div>
                      {lead.empresaNome && (
                        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" /> {lead.empresaNome}
                        </p>
                      )}
                    </div>
                    {Number(lead.valorEstimado) > 0 && (
                      <p className="text-lg font-semibold text-foreground tabular-nums shrink-0">{formatBRL(Number(lead.valorEstimado))}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapa</span>
                    <Select
                      value={lead.etapaId ?? ""}
                      onValueChange={(v) => { if (v && v !== lead.etapaId) patch({ etapaId: v }); }}
                      disabled={busy || lead.status !== "ABERTO"}
                    >
                      <SelectTrigger className="h-9 border-border w-56"><SelectValue placeholder="Sem etapa" /></SelectTrigger>
                      <SelectContent>
                        {etapas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.cor || "#94a3b8" }} />
                              {e.nome}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {lead.status === "PERDIDO" && lead.motivoPerda && (
                    <p className="mt-3 text-sm text-danger flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 shrink-0" /> Motivo da perda: {lead.motivoPerda}
                    </p>
                  )}
                  {lead.cliente && (
                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4 shrink-0" /> Convertido no cliente <b>{lead.cliente.razaoSocial}</b>
                      {lead.convertidoEm ? ` em ${formatDateTime(lead.convertidoEm)}` : ""}
                    </p>
                  )}
                </div>

                {/* ── Contato e origem ──────────────────────────────────── */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <p className="flex items-center gap-2 text-foreground min-w-0">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{lead.email || <span className="text-muted-foreground">Sem e-mail</span>}</span>
                  </p>
                  <p className="flex items-center gap-2 text-foreground">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    {lead.telefone || <span className="text-muted-foreground">Sem telefone</span>}
                  </p>
                  <p className="flex items-center gap-2 text-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {lead.cidade ? `${lead.cidade}${lead.estado ? `/${lead.estado}` : ""}` : <span className="text-muted-foreground">Sem localização</span>}
                  </p>
                  <p className="flex items-center gap-2 text-foreground min-w-0">
                    <Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />
                    {lead.campanha ? (
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium truncate",
                        PLATAFORMA_BADGE[lead.campanha.plataforma] ?? PLATAFORMA_BADGE.OUTRO,
                      )}>
                        {lead.campanha.nome} · {PLATAFORMA_LABELS[lead.campanha.plataforma] ?? lead.campanha.plataforma}
                      </span>
                    ) : lead.origemLivre ? (
                      <span className="truncate">{lead.origemLivre}</span>
                    ) : (
                      <span className="text-muted-foreground">Origem não informada</span>
                    )}
                  </p>
                  {lead.pedidoVenda && (
                    <p className="flex items-center gap-2 text-foreground col-span-2">
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      Pedido vinculado: <b>{lead.pedidoVenda.numero ?? lead.pedidoVenda.id}</b>
                    </p>
                  )}
                  {lead.observacoes && (
                    <p className="col-span-2 text-muted-foreground whitespace-pre-wrap border-t border-border pt-3">{lead.observacoes}</p>
                  )}
                </div>

                {/* ── Ações ─────────────────────────────────────────────── */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => setTipoEvento("NOTA")}
                        className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors", tipoEvento === "NOTA" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted")}
                      >
                        <StickyNote className="h-3.5 w-3.5" /> Nota
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoEvento("CONTATO")}
                        className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors", tipoEvento === "CONTATO" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted")}
                      >
                        <Phone className="h-3.5 w-3.5" /> Contato
                      </button>
                    </div>
                    <Input
                      value={descricaoEvento}
                      onChange={(e) => setDescricaoEvento(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); registrarEvento(); } }}
                      placeholder={tipoEvento === "NOTA" ? "Adicionar nota..." : "Registrar contato (ligação, WhatsApp...)"}
                      className="h-9 border-border flex-1"
                    />
                    <Button type="button" variant="outline" onClick={registrarEvento} disabled={busy || !descricaoEvento.trim()} className="gap-2 shrink-0">
                      <Send className="h-3.5 w-3.5" /> Registrar
                    </Button>
                  </div>

                  <div className="flex gap-2 flex-wrap pt-1 border-t border-border">
                    <Button
                      type="button"
                      onClick={() => setConverterOpen(true)}
                      disabled={busy || lead.status !== "ABERTO"}
                      className="gap-2 mt-3"
                    >
                      <Trophy className="h-4 w-4" /> Converter em cliente
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={marcarPerdido}
                      disabled={busy || lead.status !== "ABERTO"}
                      className="gap-2 mt-3 text-danger border-danger/30 hover:bg-danger/10 hover:text-danger"
                    >
                      <XCircle className="h-4 w-4" /> Marcar perdido
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={excluir}
                      disabled={busy}
                      className="gap-2 mt-3 ml-auto text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </div>

                  {erro && (
                    <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{erro}</div>
                  )}
                </div>

                {/* ── Timeline ──────────────────────────────────────────── */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Histórico</h3>
                  <LeadTimeline eventos={lead.eventos ?? []} />
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {lead && (
        <ConverterLeadDialog
          lead={{ id: lead.id, nome: lead.nome, email: lead.email, telefone: lead.telefone, empresaNome: lead.empresaNome }}
          open={converterOpen}
          onOpenChange={setConverterOpen}
          onConverted={() => { carregar(); onChanged(); }}
        />
      )}
    </>
  );
}
