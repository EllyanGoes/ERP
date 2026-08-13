// GED — regras compartilhadas do módulo de Documentos (docs/documentos-prd.md).
import { put } from "@vercel/blob";
import { prismaSemEscopo } from "@/lib/prisma";
import { driveAtivo, garantirPasta, uploadArquivo } from "@/lib/drive";
import type { SessionPayload } from "@/lib/auth";
import type { StatusDocumento } from "@prisma/client";

export const MAX_MB_DOCUMENTO = 20;

/**
 * Status derivado da validade. EM_RENOVACAO e ARQUIVADO são manuais e não são
 * sobrescritos; os demais seguem a validade × dias de alerta.
 */
export function statusDerivado(
  atual: StatusDocumento,
  validade: Date | null,
  diasAlerta: number,
): StatusDocumento {
  if (atual === "EM_RENOVACAO" || atual === "ARQUIVADO") return atual;
  if (!validade) return "VIGENTE";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(validade);
  v.setHours(0, 0, 0, 0);
  if (v < hoje) return "VENCIDO";
  const limite = new Date(hoje);
  limite.setDate(hoje.getDate() + diasAlerta);
  if (v <= limite) return "VENCE_EM_BREVE";
  return "VIGENTE";
}

/** Confidencial: só ADMIN, responsável ou usuário listado em DocumentoAcesso. */
export function podeVerDocumento(
  session: Pick<SessionPayload, "sub" | "perfil">,
  doc: { confidencial: boolean; responsavelId: string | null; acessos: { usuarioId: string }[] },
): boolean {
  if (!doc.confidencial) return true;
  if (session.perfil === "ADMIN") return true;
  if (doc.responsavelId === session.sub) return true;
  return doc.acessos.some((a) => a.usuarioId === session.sub);
}

/** Auditoria (best-effort — não derruba a operação). */
export async function registrarLogDocumento(documentoId: string, usuarioId: string, acao: string): Promise<void> {
  try {
    await prismaSemEscopo.documentoLog.create({ data: { documentoId, usuarioId, acao } });
  } catch (e) {
    console.warn("[documentos] log falhou (segue):", e);
  }
}

/**
 * Grava o arquivo no provider ativo: Drive (Service Account configurada) ou
 * Vercel Blob (fallback). Retorna os campos p/ DocumentoVersao.
 */
export async function salvarArquivoDocumento(opts: {
  empresaId: string;
  categoriaSlug: string;
  categoriaNome: string;
  nomeArquivo: string;
  mime: string;
  conteudo: Buffer;
}): Promise<{ provider: "DRIVE" | "BLOB"; driveFileId: string | null; url: string | null }> {
  if (driveAtivo()) {
    const empresa = await prismaSemEscopo.empresa.findUnique({
      where: { id: opts.empresaId },
      select: { nomeFantasia: true, razaoSocial: true },
    });
    const pastaId = await garantirPasta(
      opts.empresaId,
      empresa?.nomeFantasia || empresa?.razaoSocial || opts.empresaId,
      opts.categoriaSlug,
      opts.categoriaNome,
    );
    const fileId = await uploadArquivo(pastaId, opts.nomeArquivo, opts.mime, opts.conteudo);
    return { provider: "DRIVE", driveFileId: fileId, url: null };
  }
  const blob = await put(
    `documentos/${opts.empresaId}/${opts.categoriaSlug}/${Date.now()}-${opts.nomeArquivo}`,
    opts.conteudo,
    { access: "public", contentType: opts.mime || "application/octet-stream" },
  );
  return { provider: "BLOB", driveFileId: null, url: blob.url };
}

/** Include padrão da listagem. */
export const DOCUMENTO_LISTA_SELECT = {
  id: true, empresaId: true, titulo: true, numero: true, emissor: true,
  emissao: true, validade: true, diasAlerta: true, status: true,
  confidencial: true, arquivoOk: true, tags: true, createdAt: true, responsavelId: true,
  categoria: { select: { id: true, nome: true, slug: true, diasAlerta: true } },
  responsavel: { select: { id: true, nome: true } },
  fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  colaborador: { select: { id: true, nome: true } },
  imobilizado: { select: { id: true, descricao: true } },
  versaoVigente: { select: { id: true, versao: true, nome: true, mime: true, tamanho: true, provider: true } },
  acessos: { select: { usuarioId: true } },
} as const;
