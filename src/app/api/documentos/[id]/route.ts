export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { podeVerDocumento, registrarLogDocumento, statusDerivado } from "@/lib/documentos";
import { driveAtivo, moverParaLixeira } from "@/lib/drive";
import { salvarNaLixeira } from "@/lib/lixeira";

async function carregar(id: string) {
  return prismaSemEscopo.documento.findUnique({
    where: { id },
    include: {
      categoria: true,
      responsavel: { select: { id: true, nome: true } },
      fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      colaborador: { select: { id: true, nome: true } },
      imobilizado: { select: { id: true, descricao: true } },
      versaoVigente: true,
      versoes: { orderBy: { versao: "desc" } },
      acessos: { select: { usuarioId: true, usuario: { select: { id: true, nome: true } } } },
    },
  });
}

// GET — detalhe (loga VISUALIZOU)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const doc = await carregar(params.id);
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  const ehGestor = auth.session.perfil === "ADMIN" || doc.responsavelId === auth.session.sub || doc.criadoPor === auth.session.nome;
  const logs = ehGestor
    ? await prismaSemEscopo.documentoLog.findMany({
        where: { documentoId: doc.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, acao: true, createdAt: true, usuario: { select: { nome: true } } },
      })
    : [];

  await registrarLogDocumento(doc.id, auth.session.sub, "VISUALIZOU");
  return NextResponse.json({
    data: {
      ...doc,
      status: statusDerivado(doc.status, doc.validade, doc.diasAlerta ?? doc.categoria.diasAlerta),
      logs,
      ehGestor,
    },
  });
}

// PATCH — metadados / status manual / acessos
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const doc = await carregar(params.id);
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  const str = (v: unknown) => (v === undefined ? undefined : v ? String(v).trim() || null : null);

  if (body.titulo !== undefined) {
    const t = String(body.titulo).trim();
    if (!t) return NextResponse.json({ error: "Título não pode ficar vazio." }, { status: 400 });
    data.titulo = t;
  }
  for (const k of ["descricao", "numero", "emissor", "responsavelId", "fornecedorId", "clienteId", "colaboradorId", "imobilizadoId"] as const) {
    if (body[k] !== undefined) data[k] = str(body[k]);
  }
  if (body.categoriaId !== undefined) data.categoriaId = body.categoriaId;
  if (body.emissao !== undefined) data.emissao = body.emissao ? new Date(body.emissao) : null;
  if (body.validade !== undefined) data.validade = body.validade ? new Date(body.validade) : null;
  if (body.diasAlerta !== undefined) data.diasAlerta = body.diasAlerta ? parseInt(String(body.diasAlerta)) || null : null;
  if (body.confidencial !== undefined) data.confidencial = !!body.confidencial;
  if (body.tags !== undefined && Array.isArray(body.tags)) {
    data.tags = body.tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean);
  }
  if (body.status !== undefined && ["EM_RENOVACAO", "ARQUIVADO", "VIGENTE"].includes(body.status)) {
    data.status = body.status; // manuais; derivados recomputam na leitura/cron
  }

  if (Object.keys(data).length > 0) {
    await prisma.documento.update({ where: { id: params.id }, data });
  }
  if (Array.isArray(body.acessoIds)) {
    await prismaSemEscopo.documentoAcesso.deleteMany({ where: { documentoId: params.id } });
    if (body.acessoIds.length > 0) {
      await prismaSemEscopo.documentoAcesso.createMany({
        data: body.acessoIds.map((usuarioId: string) => ({ documentoId: params.id, usuarioId })),
        skipDuplicates: true,
      });
    }
  }

  await registrarLogDocumento(params.id, auth.session.sub, "EDITOU");
  return NextResponse.json({ ok: true });
}

// DELETE — snapshot na Lixeira; arquivos do Drive vão p/ _lixeira/
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const doc = await carregar(params.id);
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  await prismaSemEscopo.$transaction(async (tx) => {
    await salvarNaLixeira(tx, {
      empresaId: doc.empresaId ?? auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID,
      tipo: "DOCUMENTO",
      origemId: doc.id,
      numero: doc.numero,
      descricao: `Documento: ${doc.titulo}`,
      snapshot: doc,
      apagadoPor: auth.session.nome,
    });
    await tx.documento.delete({ where: { id: params.id } });
  });

  // Fora da tx (best-effort): arquiva os binários do Drive
  if (driveAtivo()) {
    for (const v of doc.versoes) {
      if (v.provider === "DRIVE" && v.driveFileId) await moverParaLixeira(v.driveFileId).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
