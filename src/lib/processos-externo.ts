// Processos externos — fases 2 e 3 (docs/processos-prd.md): log do processo, link do
// advogado/despachante (token aleatório, só o hash no banco), feed ICS dos prazos e
// gravação de PDF no GED na pasta "Processos".
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { garantirPastaSistema, salvarArquivoDocumento } from "@/lib/documentos";
import { notificarUsuario } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

// ── Log ─────────────────────────────────────────────────────────────────────────
export type AcaoLog =
  | "CREDENCIAL_VER" | "CREDENCIAL_COPIAR_SENHA" | "CREDENCIAL_COPIAR_USUARIO" | "CREDENCIAL_CRIAR" | "CREDENCIAL_EDITAR" | "CREDENCIAL_EXCLUIR"
  | "EXTERNO_LINK_CRIAR" | "EXTERNO_LINK_REVOGAR" | "EXTERNO_ACESSO" | "EXTERNO_ANDAMENTO" | "EXTERNO_PRAZO" | "EXTERNO_DOCUMENTO";

export const ROTULO_LOG: Record<AcaoLog, string> = {
  CREDENCIAL_VER: "viu a senha", CREDENCIAL_COPIAR_SENHA: "copiou a senha", CREDENCIAL_COPIAR_USUARIO: "copiou o usuário",
  CREDENCIAL_CRIAR: "cadastrou o acesso", CREDENCIAL_EDITAR: "alterou o acesso", CREDENCIAL_EXCLUIR: "excluiu o acesso",
  EXTERNO_LINK_CRIAR: "gerou link externo", EXTERNO_LINK_REVOGAR: "revogou link externo", EXTERNO_ACESSO: "abriu o link",
  EXTERNO_ANDAMENTO: "lançou andamento pelo link", EXTERNO_PRAZO: "marcou prazo como cumprido pelo link", EXTERNO_DOCUMENTO: "enviou documento pelo link",
};

export async function registrarLog(l: { processoId: string; acao: AcaoLog; autor: string; usuarioId?: string | null; referenciaId?: string | null; detalhe?: string | null; ipHash?: string | null }) {
  await prismaSemEscopo.processoLog.create({
    data: { processoId: l.processoId, acao: l.acao, autor: l.autor, usuarioId: l.usuarioId ?? null, referenciaId: l.referenciaId ?? null, detalhe: l.detalhe ?? null, ipHash: l.ipHash ?? null },
  });
}

/** IP do requisitante como hash (nunca em claro) — mesmo padrão da SS pública da Manutenção. */
export function hashIp(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";
  const sal = (process.env.JWT_SECRET ?? "").slice(0, 16);
  return `ip:${createHash("sha256").update(`${sal}|${ip}`).digest("hex").slice(0, 24)}`;
}

// ── Link externo ────────────────────────────────────────────────────────────────
/** Token novo (32 bytes aleatórios, base64url) e o hash que vai para o banco. */
export function gerarTokenExterno(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Acesso externo válido (ativo, dentro da validade) com o processo — ou null. */
export async function acessoPorToken(token: string) {
  if (!token || token.length < 40 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const a = await prismaSemEscopo.processoAcessoExterno.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { processo: { select: { id: true, codigo: true, titulo: true, empresaId: true, responsavelId: true, confidencial: true, tipo: true, situacao: true } } },
  });
  if (!a || a.revogadoEm || (a.validoAte && a.validoAte < new Date())) return null;
  return a;
}

/** Limites de envio pelo link: por acesso (20/h) e por IP (40/h), contados no ProcessoLog. */
export async function limiteExternoExcedido(acessoId: string, ipHash: string): Promise<string | null> {
  const desde = new Date(Date.now() - 60 * 60_000);
  const acoes = ["EXTERNO_ANDAMENTO", "EXTERNO_PRAZO", "EXTERNO_DOCUMENTO"];
  const [porAcesso, porIp] = await Promise.all([
    prismaSemEscopo.processoLog.count({ where: { referenciaId: acessoId, acao: { in: acoes }, createdAt: { gte: desde } } }),
    prismaSemEscopo.processoLog.count({ where: { ipHash, acao: { in: acoes }, createdAt: { gte: desde } } }),
  ]);
  if (porAcesso >= 20) return "Muitos envios por este link na última hora. Tente de novo mais tarde.";
  if (porIp >= 40) return "Muitos envios deste aparelho na última hora. Tente de novo mais tarde.";
  return null;
}

/** Avisa o responsável (sino + Telegram) do que o externo lançou. Best-effort. */
export async function avisarResponsavelExterno(p: { id: string; codigo: string; titulo: string; responsavelId: string | null }, autor: string, oQue: string) {
  if (!p.responsavelId) return;
  const u = await prismaSemEscopo.usuario.findUnique({ where: { id: p.responsavelId }, select: { ativo: true, colaborador: { select: { telegramChatId: true } } } });
  if (!u?.ativo) return;
  const titulo = `${p.codigo}: ${autor} registrou pelo link`;
  await notificarUsuario({ usuarioId: p.responsavelId, tipo: "PROCESSOS_EXTERNO", titulo, mensagem: `${p.titulo}\n${oQue}`, link: `/processos/${p.id}` }).catch(() => {});
  if (u.colaborador?.telegramChatId) {
    await sendTelegramDM(u.colaborador.telegramChatId, { text: [`⚖️ *${escMD(titulo)}*`, escMD(p.titulo), ``, escMD(oQue)].join("\n") }).catch(() => {});
  }
}

// ── PDF no GED ──────────────────────────────────────────────────────────────────
export const MAX_PDF_BYTES = 4.5 * 1024 * 1024;

/** Grava o PDF no GED (pasta de sistema "Processos") ligado ao processo; devolve o id do documento. */
export async function salvarPdfNoProcesso(opts: {
  processo: { id: string; codigo: string; empresaId: string; confidencial: boolean; responsavelId: string | null };
  conteudo: Buffer; nomeArquivo: string; titulo: string; emissao: Date; autor: string; numero?: string | null;
}): Promise<string> {
  const { processo: p } = opts;
  const categoria = await garantirPastaSistema({ nome: "Processos", slug: "processos", ordem: 36 });
  const doc = await prismaSemEscopo.documento.create({
    data: { empresaId: p.empresaId, categoriaId: categoria.id, titulo: opts.titulo, numero: opts.numero ?? null, emissao: opts.emissao, processoId: p.id, confidencial: p.confidencial, responsavelId: p.responsavelId, tags: ["processo", p.codigo.toLowerCase()], criadoPor: opts.autor },
    select: { id: true },
  });
  try {
    const arq = await salvarArquivoDocumento({ empresaId: p.empresaId, categoriaSlug: categoria.slug, categoriaNome: categoria.nome, nomeArquivo: `${opts.titulo} — v1.pdf`, mime: "application/pdf", conteudo: opts.conteudo });
    const v = await prismaSemEscopo.documentoVersao.create({ data: { documentoId: doc.id, versao: 1, provider: arq.provider, driveFileId: arq.driveFileId, url: arq.url, nome: opts.nomeArquivo, mime: "application/pdf", tamanho: opts.conteudo.length, criadoPor: opts.autor } });
    await prismaSemEscopo.documento.update({ where: { id: doc.id }, data: { versaoVigenteId: v.id } });
  } catch (e) {
    await prismaSemEscopo.documento.delete({ where: { id: doc.id } }).catch(() => {});
    throw e;
  }
  return doc.id;
}

/** O arquivo parece mesmo um PDF (assinatura %PDF-)? */
export const ehPdf = (buf: Buffer) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

// ── Feed ICS dos prazos ─────────────────────────────────────────────────────────
/** Token do feed ICS de prazos de processos: HMAC do usuário (prefixo próprio, independente do Projetos). */
export function tokenFeedProcessos(usuarioId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado — defina a variável de ambiente.");
  return createHmac("sha256", secret).update(`processos-ics:${usuarioId}`).digest("hex");
}
export function tokenFeedProcessosValido(usuarioId: string, token: string): boolean {
  const esperado = Buffer.from(tokenFeedProcessos(usuarioId));
  const recebido = Buffer.from(token);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

// ── Dados da página pública ─────────────────────────────────────────────────────
export type DadosProcessoExterno = {
  pessoa: string; podeLancar: boolean; validoAte: string | null;
  processo: { codigo: string; titulo: string; numero: string | null; orgao: string; situacao: string; fase: string | null; tipo: string; empresa: string };
  andamentos: { id: string; data: string; tipo: string; descricao: string; resumo: string | null; autor: string | null; documentoId: string | null }[];
  prazos: { id: string; descricao: string; vence: string; status: string; cumpridoEm: string | null }[];
  documentos: { id: string; titulo: string; nome: string | null; tamanho: number | null; emissao: string | null }[];
};

/**
 * O que o advogado/despachante vê pelo link: SÓ título, número, órgão, situação, andamentos não
 * internos, prazos e os documentos explicitamente compartilhados com ESTE link. Nada de
 * credenciais, financeiro, partes, valores, responsável ou outros processos. Registra o acesso
 * (no máx. 1 log a cada 30 min por link).
 */
export async function dadosProcessoExterno(token: string): Promise<DadosProcessoExterno | null> {
  const a = await acessoPorToken(token);
  if (!a) return null;
  const p = await prismaSemEscopo.processo.findUnique({
    where: { id: a.processoId },
    select: {
      codigo: true, titulo: true, numero: true, orgao: true, situacao: true, fase: true, tipo: true,
      empresa: { select: { nomeFantasia: true, razaoSocial: true } },
      andamentos: { where: { interno: false }, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: 200, select: { id: true, data: true, tipo: true, descricao: true, resumoIa: true, usuario: true, origem: true, documentoId: true } },
      prazos: { where: { OR: [{ status: "PENDENTE" }, { status: "CUMPRIDO", cumpridoEm: { gte: new Date(Date.now() - 90 * 86_400_000) } }] }, orderBy: [{ status: "desc" }, { vence: "asc" }], select: { id: true, descricao: true, vence: true, status: true, cumpridoEm: true } },
    },
  });
  if (!p) return null;
  const docs = a.documentoIds.length
    ? await prismaSemEscopo.documento.findMany({ where: { id: { in: a.documentoIds }, processoId: a.processoId }, orderBy: { createdAt: "desc" }, select: { id: true, titulo: true, emissao: true, versaoVigente: { select: { nome: true, tamanho: true } } } })
    : [];
  const docIds = new Set(docs.map((d) => d.id));
  if (!a.ultimoAcessoEm || Date.now() - a.ultimoAcessoEm.getTime() > 30 * 60_000) {
    await prismaSemEscopo.processoAcessoExterno.update({ where: { id: a.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => {});
    await registrarLog({ processoId: a.processoId, acao: "EXTERNO_ACESSO", autor: `Externo: ${a.nome}`, referenciaId: a.id }).catch(() => {});
  }
  return {
    pessoa: a.nome, podeLancar: a.podeLancar, validoAte: a.validoAte?.toISOString() ?? null,
    processo: { codigo: p.codigo, titulo: p.titulo, numero: p.numero, orgao: p.orgao, situacao: p.situacao, fase: p.fase, tipo: p.tipo, empresa: p.empresa.nomeFantasia ?? p.empresa.razaoSocial },
    // Autor: só "Tribunal", "Externo: nome" ou o primeiro nome de quem lançou (sem dados internos).
    andamentos: p.andamentos.map((x) => ({
      id: x.id, data: x.data.toISOString(), tipo: x.tipo, descricao: x.descricao, resumo: x.resumoIa,
      autor: x.origem === "DATAJUD" ? "Tribunal (DataJud)" : x.usuario?.startsWith("Externo:") ? x.usuario : x.usuario ? x.usuario.split(" ")[0] : null,
      documentoId: x.documentoId && docIds.has(x.documentoId) ? x.documentoId : null,
    })),
    prazos: p.prazos.map((x) => ({ id: x.id, descricao: x.descricao, vence: x.vence.toISOString(), status: x.status, cumpridoEm: x.cumpridoEm?.toISOString() ?? null })),
    documentos: docs.map((d) => ({ id: d.id, titulo: d.titulo, nome: d.versaoVigente?.nome ?? null, tamanho: d.versaoVigente?.tamanho ?? null, emissao: d.emissao?.toISOString() ?? null })),
  };
}
