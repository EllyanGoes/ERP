"use client";

// Peças comuns do módulo de Processos externos (docs/processos-prd.md).
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SITUACOES } from "@/lib/processos-tipos";

export { TIPOS_PROCESSO, SITUACOES, TIPOS_ANDAMENTO, PAPEIS_PARTE, ESFERAS, RISCOS } from "@/lib/processos-tipos";

export type Pendencia = { tipo: string; severidade: "ALTA" | "MEDIA"; titulo: string; vence?: string };
export type LinhaProcesso = {
  id: string; codigo: string; titulo: string; tipo: string; orgao: string; numero: string | null; situacao: string; fase: string | null;
  interessadoTipo: string; interessadoNome: string | null; confidencial: boolean; tags: string[]; createdAt: string;
  responsavel: { id: string; nome: string } | null; pendencias: Pendencia[];
  proximoPrazo: { descricao: string; vence: string; avisoDias: number } | null;
  ultimoAndamento: { data: string; tipo: string; descricao: string } | null;
};
export type Lookups = { usuarios: { id: string; nome: string }[]; documentos: { id: string; titulo: string; categoria: { nome: string } }[] };

// Datas do processo são dias (meia-noite UTC): formata em UTC.
export const fmtData = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const fmtBRL = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const diaUtc = (iso: string) => { const d = new Date(iso); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const hoje = () => { const h = new Date(); return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()); };
export const diasAte = (iso: string) => Math.round((diaUtc(iso) - hoje()) / 86_400_000);
export const diasDesde = (iso: string) => -diasAte(iso);

const COR_SITUACAO: Record<string, string> = {
  EM_ANDAMENTO: "bg-info/10 text-info border-info/30",
  AGUARDANDO_ORGAO: "bg-muted text-muted-foreground border-border",
  AGUARDANDO_EMPRESA: "bg-warning/10 text-warning border-warning/30",
  SUSPENSO: "bg-muted text-muted-foreground border-border",
  ENCERRADO_FAVORAVEL: "bg-success/10 text-success border-success/30",
  ENCERRADO_DESFAVORAVEL: "bg-danger/10 text-danger border-danger/30",
  ARQUIVADO: "bg-muted text-muted-foreground border-border",
};
export function SituacaoBadge({ s }: { s: string }) {
  return <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap", COR_SITUACAO[s] ?? COR_SITUACAO.EM_ANDAMENTO)}>{SITUACOES[s]?.label ?? s}</span>;
}

/** Prazo com cor pela distância: vencido (vermelho), ≤ aviso (amarelo), longe (cinza). */
export function PrazoChip({ vence, avisoDias = 5, status = "PENDENTE" }: { vence: string; avisoDias?: number; status?: string }) {
  if (status !== "PENDENTE") return <span className="text-xs text-muted-foreground line-through">{fmtData(vence)}</span>;
  const d = diasAte(vence);
  const cls = d < 0 ? "text-danger font-semibold" : d <= avisoDias ? "text-warning font-semibold" : "text-muted-foreground";
  const txt = d < 0 ? `vencido há ${-d}d` : d === 0 ? "hoje" : `em ${d}d`;
  return <span className={cn("text-xs whitespace-nowrap", cls)}>{fmtData(vence)} · {txt}</span>;
}

export function useLookups() {
  const [lk, setLk] = useState<Lookups>({ usuarios: [], documentos: [] });
  useEffect(() => { fetch("/api/processos/lookups").then((r) => r.json()).then((j) => j.data && setLk(j.data)).catch(() => {}); }, []);
  return lk;
}

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) return { ok: false, error: j?.error || "Erro de comunicação." };
  return { ok: true, data: j?.data };
}
