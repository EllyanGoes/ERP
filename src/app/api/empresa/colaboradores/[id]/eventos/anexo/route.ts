export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarArquivoDocumento } from "@/lib/documentos";

const MAX_MB = 25;

// POST multipart { file, titulo } — documento do histórico funcional (atestado,
// aviso prévio, termo de rescisão…) no GED, confidencial, ligado ao colaborador.
// → { data: { documentoId } }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModuloAny(["empresa", "rh"]);
  if (!auth.ok) return auth.response;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const titulo = String(form.get("titulo") ?? "").trim() || file?.name || "Histórico funcional";
  if (!file) return NextResponse.json({ error: "Anexe o arquivo." }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Máx. ${MAX_MB} MB.` }, { status: 400 });
  const categoria = await prismaSemEscopo.documentoCategoria.upsert({
    where: { slug: "rh-historico" },
    create: { nome: "RH — Histórico funcional", slug: "rh-historico", exigeValidade: false, diasAlerta: 30, ordem: 90 },
    update: {},
  });
  const documento = await prisma.documento.create({
    data: { empresaId: auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID, categoriaId: categoria.id, titulo, confidencial: true, colaboradorId: params.id, tags: ["rh", "historico"] },
    select: { id: true, empresaId: true },
  });
  try {
    const arquivo = await salvarArquivoDocumento({
      empresaId: documento.empresaId, categoriaSlug: categoria.slug, categoriaNome: categoria.nome,
      nomeArquivo: `${titulo} — v1${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ""}`,
      mime: file.type, conteudo: Buffer.from(await file.arrayBuffer()),
    });
    const versao = await prismaSemEscopo.documentoVersao.create({
      data: { documentoId: documento.id, versao: 1, provider: arquivo.provider, driveFileId: arquivo.driveFileId, url: arquivo.url, nome: file.name, mime: file.type || "application/octet-stream", tamanho: file.size, criadoPor: auth.session.nome },
    });
    await prismaSemEscopo.documento.update({ where: { id: documento.id }, data: { versaoVigenteId: versao.id } });
  } catch (e) {
    await prismaSemEscopo.documento.delete({ where: { id: documento.id } }).catch(() => {});
    console.error("[colaborador/eventos/anexo] upload falhou:", e);
    return NextResponse.json({ error: "Falha ao gravar o arquivo." }, { status: 502 });
  }
  return NextResponse.json({ data: { documentoId: documento.id } }, { status: 201 });
}
