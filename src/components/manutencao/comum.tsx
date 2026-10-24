"use client";

// Peças comuns das telas de Manutenção: lookups, badges de status/prioridade,
// escolha de ativo e campo data+hora (DatePicker + TimePicker).
import { useEffect, useState } from "react";
import DatePicker from "@/components/shared/DatePicker";
import TimePicker from "@/components/shared/TimePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { cn } from "@/lib/utils";

export type AtivoLookup = { id: string; codApl: number; tag: string; nome: string; paiId: string | null; tipo: string; status: string; localizacao: string | null; criticidade: string | null; caminho: string };
export type Opcao = { id: string; nome: string };
export type TipoLookup = { id: string; sigla: string; nome: string; natureza: string; contaComoFalha: boolean };
export type CatalogoLookup = { id: string; tipo: string; descricao: string };
export type ManutLookups = {
  ativos: AtivoLookup[];
  tipos: TipoLookup[];
  equipes: (Opcao & { externa: boolean; membros: { colaboradorId: string }[] })[];
  colaboradores: (Opcao & { usuarioId?: string | null })[];
  sintomas: CatalogoLookup[];
  causas: CatalogoLookup[];
  servicos: CatalogoLookup[];
};

const VAZIO: ManutLookups = { ativos: [], tipos: [], equipes: [], colaboradores: [], sintomas: [], causas: [], servicos: [] };

export function useManutLookups() {
  const [lk, setLk] = useState<ManutLookups>(VAZIO);
  useEffect(() => { fetch("/api/pcm/lookups").then((r) => r.json()).then((j) => j.data && setLk(j.data)).catch(() => {}); }, []);
  return lk;
}

export const STATUS_OS: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: "Aberta", cls: "bg-muted text-foreground border-border" },
  PLANEJADA: { label: "Planejada", cls: "bg-info/10 text-info border-info/30" },
  EM_EXECUCAO: { label: "Em execução", cls: "bg-warning/10 text-warning border-warning/30" },
  PAUSADA: { label: "Pausada", cls: "bg-muted text-muted-foreground border-border" },
  AGUARDANDO_MATERIAL: { label: "Aguard. material", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  AGUARDANDO_TERCEIRO: { label: "Aguard. terceiro", cls: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  ENCERRADA: { label: "Encerrada — validar", cls: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  CONCLUIDA: { label: "Concluída", cls: "bg-success/10 text-success border-success/30" },
  CANCELADA: { label: "Cancelada", cls: "bg-danger/10 text-danger border-danger/30" },
};

export function StatusOSBadge({ s }: { s: string }) {
  const v = STATUS_OS[s] ?? { label: s, cls: "bg-muted text-foreground border-border" };
  return <span className={cn("inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap", v.cls)}>{v.label}</span>;
}

export const PRIORIDADE: Record<string, { label: string; cls: string }> = {
  EMERGENCIA: { label: "Emergência", cls: "text-danger font-semibold" },
  ALTA: { label: "Alta", cls: "text-orange-600 font-medium" },
  MEDIA: { label: "Média", cls: "text-foreground" },
  BAIXA: { label: "Baixa", cls: "text-muted-foreground" },
};
export const OPCOES_PRIORIDADE = Object.entries(PRIORIDADE).map(([value, v]) => ({ value, label: v.label }));

export function PrioridadeTxt({ p }: { p: string | null }) {
  if (!p) return <span className="text-muted-foreground/60">—</span>;
  const v = PRIORIDADE[p] ?? { label: p, cls: "" };
  return <span className={cn("text-xs", v.cls)}>{v.label}</span>;
}

const PRIORIDADE_BADGE: Record<string, string> = {
  EMERGENCIA: "bg-danger/15 text-danger border-danger/30",
  ALTA: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  MEDIA: "bg-warning/15 text-warning border-warning/30",
  BAIXA: "bg-info/10 text-info border-info/30",
};

/** Prioridade como selo colorido (cartão do quadro e detalhe da OS). */
export function PrioridadeBadge({ p, className }: { p: string | null; className?: string }) {
  if (!p) return null;
  return (
    <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap", PRIORIDADE_BADGE[p] ?? "bg-muted text-foreground border-border", className)}>
      {PRIORIDADE[p]?.label ?? p}
    </span>
  );
}

/** Combobox de ativo: busca por tag, nome e caminho na árvore. */
export function AtivoCombobox({ ativos, value, onChange, placeholder = "Escolha o equipamento…", allowNone, disabled }: {
  ativos: AtivoLookup[]; value: string; onChange: (id: string) => void; placeholder?: string; allowNone?: boolean; disabled?: boolean;
}) {
  return (
    <ComboboxWithCreate
      options={ativos.map((a) => ({ value: a.id, label: `${a.tag} — ${a.nome}`, group: a.caminho || undefined }))}
      value={value} onChange={onChange} placeholder={placeholder} allowNone={allowNone} disabled={disabled} menuMinWidth={420}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO (ou "") → { data: "YYYY-MM-DD", hora: "HH:MM" } no fuso local. */
export function separarDataHora(iso: string | null | undefined): { data: string; hora: string } {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
export function juntarDataHora(data: string, hora: string): string {
  if (!data) return "";
  const [y, m, d] = data.split("-").map(Number);
  const [hh, mm] = (hora || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

/** Data + hora (local) com saída ISO. "" = vazio. */
export function DataHora({ value, onChange, disabled, allowClear = true }: { value: string; onChange: (iso: string) => void; disabled?: boolean; allowClear?: boolean }) {
  const { data, hora } = separarDataHora(value);
  return (
    <div className="flex gap-2">
      <DatePicker value={data} onChange={(d) => onChange(d ? juntarDataHora(d, hora || "07:00") : "")} disabled={disabled} allowClear={allowClear} className="flex-1" />
      <TimePicker value={hora} onChange={(h) => onChange(data ? juntarDataHora(data, h) : "")} disabled={disabled || !data} className="w-28" />
    </div>
  );
}

export const fmtDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtData = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
export const fmtHoras = (h: number) => (h >= 1 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h * 60)} min`);
export const brl = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) return { ok: false, error: j?.error || "Erro de comunicação." };
  return { ok: true, data: j?.data as T };
}
