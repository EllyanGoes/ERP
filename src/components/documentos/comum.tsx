"use client";

// Peças compartilhadas do módulo de Documentos.
import { cn } from "@/lib/utils";
import { Lock, FileWarning, FileText, FileImage, FileSpreadsheet, File as FileIcon, FileType2, FileArchive as FileZip } from "lucide-react";

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
  updatedAt?: string;
  /** Caminho da pasta ("SST › PGR (NR-01)"). */
  caminho?: string;
  /** Estrela do usuário logado. */
  favorito?: boolean;
  /** Pasta exige validade e o documento está sem (envio rápido). */
  faltaValidade?: boolean;
  ultimoAcesso?: string | null;
  categoria: { id: string; nome: string; slug: string; diasAlerta: number; exigeValidade?: boolean; paiId?: string | null };
  responsavel: { id: string; nome: string } | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  colaborador: { id: string; nome: string } | null;
  imobilizado: { id: string; descricao: string } | null;
  versaoVigente: { id: string; versao: number; nome: string; mime: string; tamanho: number; provider: string; createdAt?: string } | null;
};

/** Pasta do GED (DocumentoCategoria com hierarquia) como vem de /api/documentos/categorias. */
export type PastaDTO = {
  id: string;
  nome: string;
  slug: string;
  paiId: string | null;
  diasAlerta: number;
  exigeValidade: boolean;
  ordem: number;
  ativo: boolean;
  caminho: string;
  sistema: boolean;
  nDocumentos: number;
  nSubpastas: number;
};

/**
 * Teto por arquivo do envio pela tela: o upload passa pela função da Vercel,
 * que recusa corpo acima de ~4,5 MB. Validado no cliente com mensagem clara.
 */
export const MAX_MB_ENVIO = 4.5;
export const MAX_BYTES_ENVIO = Math.floor(MAX_MB_ENVIO * 1024 * 1024) - 64 * 1024; // folga do multipart

export function excedeEnvio(file: File): boolean {
  return file.size > MAX_BYTES_ENVIO;
}
export const MSG_EXCEDE_ENVIO = `Arquivo acima de ${MAX_MB_ENVIO.toString().replace(".", ",")} MB — o limite de envio do sistema. Comprima o PDF/imagem ou divida o arquivo.`;

// ── Tipo de arquivo (pelo mime/extensão da versão vigente) ────────────────────
export type TipoArquivo = "pdf" | "imagem" | "planilha" | "texto" | "compactado" | "outro";
export const TIPO_ARQUIVO_LABEL: Record<TipoArquivo, string> = {
  pdf: "PDF", imagem: "Imagem", planilha: "Planilha", texto: "Documento de texto", compactado: "Compactado", outro: "Outros",
};

export function tipoArquivo(mime: string | null | undefined, nome?: string | null): TipoArquivo {
  const m = (mime ?? "").toLowerCase();
  const ext = (nome ?? "").toLowerCase().split(".").pop() ?? "";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "tif", "tiff"].includes(ext)) return "imagem";
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" || ["xls", "xlsx", "csv", "ods"].includes(ext)) return "planilha";
  if (m.includes("word") || m.includes("opendocument.text") || m.startsWith("text/") || ["doc", "docx", "odt", "txt", "rtf"].includes(ext)) return "texto";
  if (m.includes("zip") || m.includes("compressed") || ["zip", "rar", "7z"].includes(ext)) return "compactado";
  return "outro";
}

const ICONE_TIPO: Record<TipoArquivo, { Icon: typeof FileText; cls: string }> = {
  pdf:        { Icon: FileType2,       cls: "text-danger" },
  imagem:     { Icon: FileImage,       cls: "text-info" },
  planilha:   { Icon: FileSpreadsheet, cls: "text-success" },
  texto:      { Icon: FileText,        cls: "text-primary" },
  compactado: { Icon: FileZip,         cls: "text-warning" },
  outro:      { Icon: FileIcon,        cls: "text-muted-foreground" },
};

export function IconeArquivo({ mime, nome, className }: { mime?: string | null; nome?: string | null; className?: string }) {
  const { Icon, cls } = ICONE_TIPO[tipoArquivo(mime, nome)];
  return <Icon className={cn("w-4 h-4 shrink-0", cls, className)} />;
}

// ── Situação (status derivado + "falta validade" + "sem validade") ────────────
export type Situacao = "VIGENTE" | "VENCE_EM_BREVE" | "VENCIDO" | "EM_RENOVACAO" | "ARQUIVADO" | "FALTA_VALIDADE" | "SEM_VALIDADE";
export const SITUACAO_LABEL: Record<Situacao, string> = {
  VIGENTE: "Vigente", VENCE_EM_BREVE: "Vence em breve", VENCIDO: "Vencido", EM_RENOVACAO: "Em renovação",
  ARQUIVADO: "Arquivado", FALTA_VALIDADE: "Falta validade", SEM_VALIDADE: "Sem validade",
};

export function situacaoDoc(d: Pick<DocumentoListaDTO, "status" | "validade" | "faltaValidade">): Situacao {
  if (d.status === "ARQUIVADO" || d.status === "EM_RENOVACAO") return d.status;
  if (d.faltaValidade) return "FALTA_VALIDADE";
  if (!d.validade) return "SEM_VALIDADE";
  return d.status;
}

export function SituacaoBadge({ situacao }: { situacao: Situacao }) {
  if (situacao === "FALTA_VALIDADE") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-warning/60 text-warning">Falta validade</span>;
  }
  if (situacao === "SEM_VALIDADE") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs whitespace-nowrap text-muted-foreground">Sem validade</span>;
  }
  return <StatusDocBadge status={situacao} />;
}

/** Envia um arquivo com progresso (XHR — fetch não expõe progresso de upload). */
export function enviarComProgresso(url: string, fd: FormData, onProgresso: (pct: number) => void): Promise<{ ok: boolean; status: number; json: { data?: { id: string }; error?: string } }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let json: { data?: { id: string }; error?: string } = {};
      try { json = JSON.parse(xhr.responseText); } catch {
        json = { error: xhr.status === 413 ? "Arquivo grande demais para o envio." : `Falha no envio (HTTP ${xhr.status}).` };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, json: { error: "Erro de conexão." } });
    xhr.send(fd);
  });
}

export function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" }).replace(".", "");
}

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
