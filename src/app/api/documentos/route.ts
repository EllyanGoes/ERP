export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import {
  DOCUMENTO_LISTA_SELECT, MAX_MB_DOCUMENTO, caminhosPastas, faltaValidade, podeVerDocumento,
  registrarLogDocumento, salvarArquivoDocumento, statusDerivado,
} from "@/lib/documentos";

// GET /api/documentos?pasta=&categoria=&status=&entidade=fornecedor:<id>&busca=&visao=recentes|estrela
// pasta (ou categoria, id ou slug): só os documentos DIRETOS da pasta.
// visao=recentes: o que o usuário abriu/enviou por último; visao=estrela: favoritos dele.
// Cada documento vem com caminho da pasta, favorito (do usuário) e faltaValidade.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const usuarioId = auth.session.sub;

  const where: Record<string, unknown> = {};
  const pastaRef = sp.get("pasta") || sp.get("categoria");
  if (pastaRef) {
    const p = await prismaSemEscopo.documentoCategoria.findFirst({ where: { OR: [{ id: pastaRef }, { slug: pastaRef }] }, select: { id: true } });
    where.categoriaId = p?.id ?? pastaRef;
  }
  if (sp.get("status")) where.status = sp.get("status");
  const entidade = sp.get("entidade"); // "fornecedor:<id>" | "cliente:" | "colaborador:" | "imobilizado:"
  if (entidade) {
    const [tipo, id] = entidade.split(":");
    const campo = { fornecedor: "fornecedorId", cliente: "clienteId", colaborador: "colaboradorId", imobilizado: "imobilizadoId", contrato: "contratoId", processo: "processoId" }[tipo];
    if (campo && id) where[campo] = id;
  }
  const busca = sp.get("busca")?.trim();
  if (busca) {
    where.OR = [
      { titulo: { contains: busca, mode: "insensitive" } },
      { numero: { contains: busca, mode: "insensitive" } },
      { emissor: { contains: busca, mode: "insensitive" } },
      { tags: { has: busca.toLowerCase() } },
    ];
  }

  const visao = sp.get("visao");
  let ultimoAcesso: Map<string, Date> | null = null;
  if (visao === "recentes") {
    // Últimos documentos que o usuário visualizou/baixou/enviou/editou.
    const logs = await prismaSemEscopo.documentoLog.groupBy({
      by: ["documentoId"],
      where: { usuarioId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 60,
    });
    ultimoAcesso = new Map(logs.map((l) => [l.documentoId, l._max.createdAt ?? new Date(0)]));
    where.id = { in: Array.from(ultimoAcesso.keys()) };
  } else if (visao === "estrela") {
    where.favoritos = { some: { usuarioId } };
  }

  // prisma (escopado): lista da empresa ativa.
  const [documentos, pastas, favoritos] = await Promise.all([
    prisma.documento.findMany({
      where,
      select: DOCUMENTO_LISTA_SELECT,
      orderBy: [{ validade: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    prismaSemEscopo.documentoCategoria.findMany({ select: { id: true, nome: true, paiId: true } }),
    prismaSemEscopo.documentoFavorito.findMany({ where: { usuarioId }, select: { documentoId: true } }),
  ]);
  const caminhos = caminhosPastas(pastas);
  const estrelas = new Set(favoritos.map((f) => f.documentoId));

  // Confidenciais fora p/ quem não pode ver + status derivado na leitura
  const visiveis = documentos
    .filter((d) => podeVerDocumento(auth.session, d))
    .map((d) => ({
      ...d,
      status: statusDerivado(d.status, d.validade, d.diasAlerta ?? d.categoria.diasAlerta),
      faltaValidade: faltaValidade(d, d.categoria.exigeValidade),
      caminho: caminhos.get(d.categoria.id) ?? d.categoria.nome,
      favorito: estrelas.has(d.id),
      ultimoAcesso: ultimoAcesso?.get(d.id) ?? null,
      acessos: undefined,
    }));
  if (ultimoAcesso) visiveis.sort((a, b) => +(b.ultimoAcesso ?? 0) - +(a.ultimoAcesso ?? 0));

  return NextResponse.json({ data: visiveis });
}

// POST /api/documentos — multipart: arquivo + metadados
export async function POST(req: NextRequest) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const titulo = String(form.get("titulo") ?? "").trim();
  const categoriaId = String(form.get("categoriaId") ?? "");
  if (!titulo) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Anexe o arquivo do documento." }, { status: 400 });
  if (file.size > MAX_MB_DOCUMENTO * 1024 * 1024) {
    return NextResponse.json({ error: `Máx. ${MAX_MB_DOCUMENTO} MB por arquivo.` }, { status: 400 });
  }

  const categoria = await prismaSemEscopo.documentoCategoria.findUnique({ where: { id: categoriaId } });
  if (!categoria) return NextResponse.json({ error: "Escolha a pasta do documento." }, { status: 400 });
  if (!categoria.ativo) return NextResponse.json({ error: `A pasta "${categoria.nome}" está inativa.` }, { status: 400 });
  const validade = form.get("validade") ? new Date(String(form.get("validade"))) : null;
  // Envio rápido (vários arquivos de uma vez): entra sem validade e fica como
  // "Falta validade" em vez de bloquear. O formulário completo continua exigindo.
  const envioRapido = form.get("rapido") === "true";
  if (categoria.exigeValidade && !validade && !envioRapido) {
    return NextResponse.json({ error: `A pasta "${categoria.nome}" exige data de validade.` }, { status: 400 });
  }

  const str = (k: string) => (form.get(k) ? String(form.get(k)).trim() || null : null);

  // 1) cria o documento (escopado — empresaId carimbado pelo proxy)
  const documento = await prisma.documento.create({
    data: {
      empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      categoriaId,
      titulo,
      descricao: str("descricao"),
      numero: str("numero"),
      emissor: str("emissor"),
      emissao: form.get("emissao") ? new Date(String(form.get("emissao"))) : null,
      validade,
      diasAlerta: form.get("diasAlerta") ? parseInt(String(form.get("diasAlerta"))) || null : null,
      confidencial: form.get("confidencial") === "true",
      responsavelId: str("responsavelId"),
      fornecedorId: str("fornecedorId"),
      clienteId: str("clienteId"),
      colaboradorId: str("colaboradorId"),
      imobilizadoId: str("imobilizadoId"),
      contratoId: str("contratoId"),
      processoId: str("processoId"),
      tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    },
    select: { id: true, empresaId: true },
  });

  // 2) sobe o arquivo (Drive ou Blob) e grava a versão 1 vigente
  try {
    const arquivo = await salvarArquivoDocumento({
      empresaId: documento.empresaId,
      categoriaSlug: categoria.slug,
      categoriaNome: categoria.nome,
      nomeArquivo: `${str("numero") ? `[${str("numero")}] ` : ""}${titulo} — v1${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ""}`,
      mime: file.type,
      conteudo: Buffer.from(await file.arrayBuffer()),
    });
    const versao = await prismaSemEscopo.documentoVersao.create({
      data: {
        documentoId: documento.id,
        versao: 1,
        provider: arquivo.provider,
        driveFileId: arquivo.driveFileId,
        url: arquivo.url,
        nome: file.name,
        mime: file.type || "application/octet-stream",
        tamanho: file.size,
        criadoPor: auth.session.nome,
      },
    });
    await prismaSemEscopo.documento.update({ where: { id: documento.id }, data: { versaoVigenteId: versao.id } });
  } catch (e) {
    // upload falhou: não deixa documento sem arquivo
    await prismaSemEscopo.documento.delete({ where: { id: documento.id } }).catch(() => {});
    console.error("[documentos] upload falhou:", e);
    return NextResponse.json({ error: "Falha ao gravar o arquivo. Tente novamente." }, { status: 502 });
  }

  // Acessos do confidencial
  const acessoIds = String(form.get("acessoIds") ?? "").split(",").filter(Boolean);
  if (acessoIds.length > 0) {
    await prismaSemEscopo.documentoAcesso.createMany({
      data: acessoIds.map((usuarioId) => ({ documentoId: documento.id, usuarioId })),
      skipDuplicates: true,
    });
  }

  await registrarLogDocumento(documento.id, auth.session.sub, "UPLOAD_VERSAO");
  return NextResponse.json({ data: { id: documento.id } }, { status: 201 });
}
