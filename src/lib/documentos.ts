// GED — regras compartilhadas do módulo de Documentos (docs/documentos-prd.md).
import { uploadBlob } from "@/lib/blob";
import { prismaSemEscopo } from "@/lib/prisma";
import { driveAtivo, garantirPasta, uploadArquivo } from "@/lib/drive";
import type { SessionPayload } from "@/lib/auth";
import type { StatusDocumento } from "@prisma/client";

export const MAX_MB_DOCUMENTO = 20;

// ── Pastas (DocumentoCategoria com paiId) ─────────────────────────────────────

/** Slugs de pasta que outros módulos procuram/criam pelo código (SST, Contratos, RH). */
export const SLUGS_PASTA_SISTEMA = [
  "sst", "rh", "contratos",
  "sst-termo-epi", "sst-aso", "sst-exame", "sst-outros",
  "contratos-aditivos", "contratos-garantias", "contratos-outros",
  "rh-historico",
] as const;

/**
 * Pasta de sistema: id fixo de seed/migration (cat_*, doccat_*) ou slug usado
 * pelo código. Pode renomear; não pode excluir nem mover para dentro de outra.
 */
export function ehPastaSistema(p: { id: string; slug: string }): boolean {
  return p.id.startsWith("cat_") || p.id.startsWith("doccat_") || (SLUGS_PASTA_SISTEMA as readonly string[]).includes(p.slug);
}

/** Caminho "SST › PGR (NR-01)" de cada pasta (id → caminho). */
export function caminhosPastas(pastas: { id: string; nome: string; paiId: string | null }[]): Map<string, string> {
  const porId = new Map(pastas.map((p) => [p.id, p]));
  const memo = new Map<string, string>();
  const resolver = (id: string, guarda = 0): string => {
    const cache = memo.get(id);
    if (cache) return cache;
    const p = porId.get(id);
    if (!p) return "";
    const pai = p.paiId && guarda < 20 ? resolver(p.paiId, guarda + 1) : "";
    const c = pai ? `${pai} › ${p.nome}` : p.nome;
    memo.set(id, c);
    return c;
  };
  for (const p of pastas) resolver(p.id);
  return memo;
}

/** Todas as pastas com o caminho (para selects de outros módulos). */
export async function listarPastasComCaminho(opts: { apenasAtivas?: boolean } = {}) {
  const pastas = await prismaSemEscopo.documentoCategoria.findMany({
    where: opts.apenasAtivas ? { ativo: true } : {},
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  const caminhos = caminhosPastas(pastas);
  return pastas
    .map((p) => ({ ...p, caminho: caminhos.get(p.id) ?? p.nome }))
    .sort((a, b) => a.caminho.localeCompare(b.caminho, "pt-BR"));
}

export function slugPasta(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pasta";
}

/**
 * Garante a pasta usada por um módulo (busca pelo slug; cria se faltar, já
 * dentro da pasta-pai, também achada/criada pelo slug). Nunca renomeia.
 */
export async function garantirPastaSistema(
  def: { slug: string; nome: string; exigeValidade?: boolean; diasAlerta?: number; ordem?: number },
  pai?: { slug: string; nome: string; ordem?: number },
) {
  let paiId: string | null = null;
  if (pai) {
    const p = await prismaSemEscopo.documentoCategoria.upsert({
      where: { slug: pai.slug },
      create: { nome: pai.nome, slug: pai.slug, ordem: pai.ordem ?? 50 },
      update: {},
      select: { id: true },
    });
    paiId = p.id;
  }
  return prismaSemEscopo.documentoCategoria.upsert({
    where: { slug: def.slug },
    create: {
      nome: def.nome, slug: def.slug, paiId,
      exigeValidade: def.exigeValidade ?? false,
      diasAlerta: def.diasAlerta ?? 30,
      ordem: def.ordem ?? 90,
    },
    update: {},
  });
}

/**
 * "Falta validade": a pasta exige validade e o documento entrou sem ela (envio
 * rápido). Não bloqueia nada — é situação de pendência para completar depois.
 */
export function faltaValidade(doc: { validade: Date | string | null; status: StatusDocumento }, exigeValidade: boolean): boolean {
  return exigeValidade && !doc.validade && doc.status !== "ARQUIVADO";
}

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
  const blob = await uploadBlob(
    `documentos/${opts.empresaId}/${opts.categoriaSlug}/${Date.now()}-${opts.nomeArquivo}`,
    opts.conteudo,
    opts.mime || "application/octet-stream",
  );
  return { provider: "BLOB", driveFileId: null, url: blob.url };
}

/** Include padrão da listagem. */
export const DOCUMENTO_LISTA_SELECT = {
  id: true, empresaId: true, titulo: true, numero: true, emissor: true,
  emissao: true, validade: true, diasAlerta: true, status: true,
  confidencial: true, arquivoOk: true, tags: true, createdAt: true, updatedAt: true, responsavelId: true,
  categoria: { select: { id: true, nome: true, slug: true, diasAlerta: true, exigeValidade: true, paiId: true } },
  responsavel: { select: { id: true, nome: true } },
  fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
  colaborador: { select: { id: true, nome: true } },
  imobilizado: { select: { id: true, descricao: true } },
  versaoVigente: { select: { id: true, versao: true, nome: true, mime: true, tamanho: true, provider: true, createdAt: true } },
  acessos: { select: { usuarioId: true } },
} as const;
