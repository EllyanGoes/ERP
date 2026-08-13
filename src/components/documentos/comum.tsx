"use client";

// Peças compartilhadas do módulo de Documentos.
import { cn } from "@/lib/utils";
import { Lock, FileWarning } from "lucide-react";

export type DocumentoListaDTO = {
  id: string;
  empresaId: string;
  titulo: string;
  numero: string | null;
  emissor: string | null;
  emissao: string | null;
  validade: string | null;
  diasAlerta: number | null;
  status: "VIGENTE" | "VENCE_EM_BREVE" | "VENCIDO" | "EM_RENOVACAO" | "ARQUIVADO";
  confidencial: boolean;
  arquivoOk: boolean;
  tags: string[];
  createdAt: string;
  categoria: { id: string; nome: string; slug: string; diasAlerta: number };
  responsavel: { id: string; nome: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nome: string } | null;
  imobilizado: { id: string; descricao: string } | null;
  versaoVigente: { id: string; versao: number; nome: string; mime: string; tamanho: number; provider: string } | null;
};

export const STATUS_DOC: Record<string, { label: string; cls: string }> = {
  VIGENTE:        { label: "Vigente",         cls: "bg-success/15 text-success" },
  VENCE_EM_BREVE: { label: "Vence em breve",  cls: "bg-warning/15 text-warning" },
  VENCIDO:        { label: "Vencido",         cls: "bg-danger/15 text-danger" },
  EM_RENOVACAO:   { label: "Em renovação",    cls: "bg-info/15 text-info" },
  ARQUIVADO:      { label: "Arquivado",       cls: "bg-muted text-muted-foreground" },
};

export function StatusDocBadge({ status }: { status: string }) {
  const s = STATUS_DOC[status] ?? STATUS_DOC.VIGENTE;
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", s.cls)}>{s.label}</span>;
}

export function ValidadeCell({ doc }: { doc: Pick<DocumentoListaDTO, "validade" | "status"> }) {
  if (!doc.validade) return <span className="text-muted-foreground/50">—</span>;
  const v = new Date(doc.validade);
  const cls =
    doc.status === "VENCIDO" ? "text-danger font-semibold" :
    doc.status === "VENCE_EM_BREVE" ? "text-warning font-semibold" : "text-foreground";
  return <span className={cls}>{v.toLocaleDateString("pt-BR")}</span>;
}

export function IconesDoc({ doc }: { doc: Pick<DocumentoListaDTO, "confidencial" | "arquivoOk"> }) {
  return (
    <>
      {doc.confidencial && <Lock className="w-3.5 h-3.5 text-muted-foreground inline-block" aria-label="Confidencial" />}
      {!doc.arquivoOk && <FileWarning className="w-3.5 h-3.5 text-danger inline-block" aria-label="Arquivo não encontrado no Drive" />}
    </>
  );
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function entidadeVinculada(d: DocumentoListaDTO): string | null {
  if (d.fornecedor) return d.fornecedor.nomeFantasia || d.fornecedor.razaoSocial;
  if (d.cliente) return d.cliente.nomeFantasia || d.cliente.razaoSocial;
  if (d.colaborador) return d.colaborador.nome;
  if (d.imobilizado) return d.imobilizado.descricao;
  return null;
}
