"use client";

// Peças compartilhadas do módulo de Contratos: rótulos dos enums, badges,
// lookups dos formulários e formatação.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const fmtData = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const fmtBRL = (v?: number | string | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export const TIPO_CONTRATO: Record<string, string> = {
  FORNECIMENTO: "Fornecimento", SERVICO: "Prestação de serviço", LOCACAO: "Locação", SOFTWARE_ASSINATURA: "Software / assinatura", SEGURO: "Seguro",
  PLANO_SAUDE: "Plano de saúde", TRANSPORTE: "Transporte", OBRA: "Obra", VENDA_RECORRENTE: "Venda recorrente", VENDA_A_ORDEM: "Venda à ordem", TERCEIRIZACAO: "Terceirização", OUTRO: "Outro",
};
export const LADO: Record<string, { label: string; cls: string }> = {
  DESPESA: { label: "Despesa", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  RECEITA: { label: "Receita", cls: "bg-success/15 text-success" },
};
export const STATUS_CONTRATO: Record<string, { label: string; cls: string; dot: string }> = {
  MINUTA:        { label: "Minuta",        cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  EM_APROVACAO:  { label: "Em aprovação",  cls: "bg-info/15 text-info", dot: "bg-info" },
  VIGENTE:       { label: "Vigente",       cls: "bg-success/15 text-success", dot: "bg-success" },
  EM_RENOVACAO:  { label: "Em renovação",  cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  SUSPENSO:      { label: "Suspenso",      cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  ENCERRADO:     { label: "Encerrado",     cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  RESCINDIDO:    { label: "Rescindido",    cls: "bg-danger/15 text-danger", dot: "bg-danger" },
};
export const RENOVACAO: Record<string, string> = { NENHUMA: "Sem renovação (encerra no fim)", AUTOMATICA: "Automática (renova salvo aviso prévio)", MANUAL: "Manual (decidir no fim)" };
export const MODALIDADE: Record<string, string> = { FIXO_MENSAL: "Valor fixo periódico", FIXO_UNICO: "Valor único", POR_MEDICAO: "Por medição", POR_CONSUMO: "Por consumo", ESTIMADO: "Estimado (teto)" };
export const PERIODICIDADE: Record<string, string> = { MENSAL: "Mensal", BIMESTRAL: "Bimestral", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" };
export const REAJUSTE: Record<string, string> = { NENHUM: "Sem reajuste", INDICE: "Por índice", PERCENTUAL: "Percentual fixo", NEGOCIADO: "Negociado" };
export const INDICE: Record<string, string> = { IPCA: "IPCA", IGPM: "IGP-M", INPC: "INPC", SELIC: "Selic", OUTRO: "Outro" };
export const TIPO_ADITIVO: Record<string, string> = { PRAZO: "Prazo", VALOR: "Valor", OBJETO: "Objeto", REAJUSTE: "Reajuste", OUTRO: "Outro" };
export const TIPO_EVENTO: Record<string, string> = {
  CRIADO: "Criado", APROVADO: "Aprovado", ASSINADO: "Assinado", ATIVADO: "Ativado", ADITIVO: "Aditivo", REAJUSTE_PROJETADO: "Reajuste previsto", REAJUSTE_APLICADO: "Reajuste aplicado",
  JANELA_AVISO_PREVIO: "Janela de aviso prévio", FIM_VIGENCIA: "Fim da vigência", RENOVADO: "Renovado", ENCERRADO: "Encerrado", RESCINDIDO: "Rescindido", SUSPENSO: "Suspenso", REATIVADO: "Reativado", ALERTA_ENVIADO: "Alerta enviado", OBSERVACAO: "Observação",
};
export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
export type Pendencia = { tipo: string; severidade: Severidade; titulo: string; detalhe?: string; contratoId: string; contratoNumero: string; contratoTitulo: string; vence?: string | null; link: string };
export const SEVERIDADE: Record<Severidade, { label: string; cls: string; dot: string }> = {
  CRITICA: { label: "Crítica", cls: "bg-danger/10 text-danger border-danger/30", dot: "bg-danger" },
  ALTA:    { label: "Alta",    cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-300", dot: "bg-orange-500" },
  MEDIA:   { label: "Média",   cls: "bg-warning/10 text-warning border-warning/30", dot: "bg-warning" },
  BAIXA:   { label: "Baixa",   cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};
export function SeveridadeBadge({ s }: { s: Severidade }) {
  const d = SEVERIDADE[s];
  return <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border", d.cls)}><span className={cn("w-1.5 h-1.5 rounded-full", d.dot)} />{d.label}</span>;
}
export function StatusBadge({ s }: { s: string }) {
  const m = STATUS_CONTRATO[s] ?? STATUS_CONTRATO.MINUTA;
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", m.cls)}><span className={cn("w-2 h-2 rounded-full", m.dot)} />{m.label}</span>;
}
export function Semaforo({ s, label = true }: { s: "OK" | "ATENCAO" | "CRITICO"; label?: boolean }) {
  const m = { OK: { cls: "bg-success/15 text-success", dot: "bg-success", t: "Regular" }, ATENCAO: { cls: "bg-warning/15 text-warning", dot: "bg-warning", t: "Atenção" }, CRITICO: { cls: "bg-danger/15 text-danger", dot: "bg-danger", t: "Pendente" } }[s];
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", m.cls)}><span className={cn("w-2 h-2 rounded-full", m.dot)} />{label && m.t}</span>;
}

export type Lookups = {
  fornecedores: { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null }[];
  clientes: { id: string; razaoSocial: string; nomeFantasia: string | null; cpfCnpj: string | null }[];
  usuarios: { id: string; nome: string }[];
  centros: { id: string; codigo: string; nome: string }[];
  naturezas: { id: string; codigo: string | null; nome: string; tipo: string }[];
  categorias: { id: string; nome: string; slug: string }[];
};
export function useLookups() {
  const [lk, setLk] = useState<Lookups>({ fornecedores: [], clientes: [], usuarios: [], centros: [], naturezas: [], categorias: [] });
  useEffect(() => { fetch("/api/contratos/lookups").then((r) => r.json()).then((j) => j.data && setLk(j.data)).catch(() => {}); }, []);
  return lk;
}
export const nomeParte = (p?: { razaoSocial: string; nomeFantasia: string | null } | null) => (p ? p.nomeFantasia || p.razaoSocial : "—");
