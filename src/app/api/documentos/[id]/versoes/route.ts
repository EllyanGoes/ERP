export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { MAX_MB_DOCUMENTO, podeVerDocumento, registrarLogDocumento, salvarArquivoDocumento } from "@/lib/documentos";

// POST /api/documentos/[id]/versoes — nova via (vira a vigente). Se o documento
// estava EM_RENOVACAO e a nova validade é futura, volta a VIGENTE (fluxo Renovar).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const doc = await prismaSemEscopo.documento.findUnique({
    where: { id: params.id },
    include: { categoria: true, acessos: { select: { usuarioId: true } }, versoes: { orderBy: { versao: "desc" }, take: 1 } },
  });
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Anexe o arquivo." }, { status: 400 });
  if (file.size > MAX_MB_DOCUMENTO * 1024 * 1024) {
    return NextResponse.json({ error: `Máx. ${MAX_MB_DOCUMENTO} MB por arquivo.` }, { status: 400 });
  }

  const numeroVersao = (doc.versoes[0]?.versao ?? 0) + 1;
  const novaValidade = form.get("validade") ? new Date(String(form.get("validade"))) : null;

  const arquivo = await salvarArquivoDocumento({
    empresaId: doc.empresaId,
    categoriaSlug: doc.categoria.slug,
    categoriaNome: doc.categoria.nome,
    nomeArquivo: `${doc.numero ? `[${doc.numero}] ` : ""}${doc.titulo} — v${numeroVersao}${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ""}`,
    mime: file.type,
    conteudo: Buffer.from(await file.arrayBuffer()),
  }).catch((e) => {
    console.error("[documentos] upload versão falhou:", e);
    return null;
  });
  if (!arquivo) return NextResponse.json({ error: "Falha ao gravar o arquivo. Tente novamente." }, { status: 502 });

  const versao = await prismaSemEscopo.documentoVersao.create({
    data: {
      documentoId: doc.id,
      versao: numeroVersao,
      provider: arquivo.provider,
      driveFileId: arquivo.driveFileId,
      url: arquivo.url,
      nome: file.name,
      mime: file.type || "application/octet-stream",
      tamanho: file.size,
      observacao: form.get("observacao") ? String(form.get("observacao")).trim() || null : null,
      criadoPor: auth.session.nome,
    },
  });

  const renovou = doc.status === "EM_RENOVACAO" && novaValidade && novaValidade > new Date();
  await prismaSemEscopo.documento.update({
    where: { id: doc.id },
    data: {
      versaoVigenteId: versao.id,
      ...(novaValidade ? { validade: novaValidade } : {}),
      ...(form.get("numero") ? { numero: String(form.get("numero")).trim() || null } : {}),
      ...(renovou ? { status: "VIGENTE" } : {}),
    },
  });

  await registrarLogDocumento(doc.id, auth.session.sub, renovou ? "RENOVOU" : "UPLOAD_VERSAO");
  return NextResponse.json({ data: { id: versao.id, versao: numeroVersao } }, { status: 201 });
}
