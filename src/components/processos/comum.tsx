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

/** Economia do desconto antecipado (valor cheio − com desconto) ou null. */
export const economia = (p: { valorPagar?: string | number | null; valorComDesconto?: string | number | null }) => {
  if (p.valorPagar == null || p.valorComDesconto == null) return null;
  const e = Math.round((Number(p.valorPagar) - Number(p.valorComDesconto)) * 100) / 100;
  return e > 0 ? e : null;
};

type PrazoPagamento = {
  status: string; valorPagar: string | null; descontoAte: string | null; valorComDesconto: string | null; cumpridoPorPagamento?: boolean;
  contaPagar: { id: string; numero: string; status: string; valorOriginal: string; valorPago: string } | null;
};
const STATUS_CP: Record<string, string> = { ABERTA: "em aberto", PARCIAL: "pago em parte", PAGA: "quitado", CANCELADA: "cancelado" };

/**
 * Linha de pagamento do prazo (§8.3): valor, "pague até DD/MM e economize R$ X" e o título ligado
 * (com o valor com desconto como SUGESTÃO — o título nunca é alterado automaticamente).
 */
export function PagamentoPrazo({ pr }: { pr: PrazoPagamento }) {
  if (pr.valorPagar == null && !pr.descontoAte && !pr.contaPagar) return null;
  const eco = economia(pr);
  const descontoVigente = pr.status === "PENDENTE" && pr.descontoAte && diasAte(pr.descontoAte) >= 0;
  const cp = pr.contaPagar;
  const sugerir = descontoVigente && cp && cp.status !== "PAGA" && pr.valorComDesconto != null && Math.abs(Number(cp.valorOriginal) - Number(pr.valorComDesconto)) > 0.005;
  return (
    <div className="mt-1 space-y-0.5 text-[11px]">
      {pr.valorPagar != null && <div className="text-muted-foreground">Valor a pagar: <span className="tabular-nums text-foreground">{fmtBRL(pr.valorPagar)}</span></div>}
      {descontoVigente && (
        <div className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", diasAte(pr.descontoAte!) <= 2 ? "border-warning/40 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success")}>
          Pague até {fmtData(pr.descontoAte)}{pr.valorComDesconto != null && <> por {fmtBRL(pr.valorComDesconto)}</>}{eco && <> e economize {fmtBRL(eco)}</>}
        </div>
      )}
      {pr.status !== "PENDENTE" && pr.descontoAte && <div className="text-muted-foreground">Desconto até {fmtData(pr.descontoAte)}{eco && ` (economia de ${fmtBRL(eco)})`}</div>}
      {cp && (
        <div className="text-muted-foreground">
          Título <a href={`/contas-pagar?abrir=${cp.id}`} className="font-mono text-info hover:underline">{cp.numero}</a> · {STATUS_CP[cp.status] ?? cp.status} · {fmtBRL(cp.valorOriginal)}
          {pr.cumpridoPorPagamento && pr.status === "CUMPRIDO" && " · prazo cumprido pela quitação"}
          {sugerir && <div className="text-warning">Sugestão: pagar {fmtBRL(pr.valorComDesconto)} até {fmtData(pr.descontoAte)} — ajuste o valor na baixa (desconto); o título não é alterado automaticamente.</div>}
        </div>
      )}
    </div>
  );
}
