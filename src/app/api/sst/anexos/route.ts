export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarArquivoDocumento } from "@/lib/documentos";

const MAX_MB = 25;
// Categorias do GED usadas pelo SST (criadas sob demanda).
const CATEGORIAS: Record<string, { nome: string; slug: string; exigeValidade: boolean }> = {
  "termo-epi": { nome: "SST — Termo de EPI", slug: "sst-termo-epi", exigeValidade: false },
  "aso":       { nome: "SST — ASO", slug: "sst-aso", exigeValidade: true },
  "exame":     { nome: "SST — Exames complementares", slug: "sst-exame", exigeValidade: false },
  "outro":     { nome: "SST — Outros", slug: "sst-outros", exigeValidade: false },
};

// POST multipart { file, tipo: termo-epi|aso|exame|outro, titulo, colaboradorId?, validade?, confidencial? }
// → { data: { documentoId } }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const tipo = String(form.get("tipo") ?? "outro");
  const titulo = String(form.get("titulo") ?? "").trim() || file?.name || "Anexo SST";
  if (!file) return NextResponse.json({ error: "Anexe o arquivo." }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Máx. ${MAX_MB} MB.` }, { status: 400 });
  const def = CATEGORIAS[tipo] ?? CATEGORIAS.outro;
  const categoria = await prismaSemEscopo.documentoCategoria.upsert({
    where: { slug: def.slug },
    create: { nome: def.nome, slug: def.slug, exigeValidade: false, diasAlerta: 30, ordem: 90 },
    update: {},
  });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const validade = form.get("validade") ? new Date(String(form.get("validade"))) : null;
  const colaboradorId = form.get("colaboradorId") ? String(form.get("colaboradorId")) : null;
  const documento = await prisma.documento.create({
    data: {
      empresaId, categoriaId: categoria.id, titulo, validade,
      // ASO/exames são dado de saúde: confidencial por padrão (LGPD).
      confidencial: tipo === "aso" || tipo === "exame" || form.get("confidencial") === "true",
      colaboradorId, tags: ["sst", tipo],
    },
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
    console.error("[sst/anexos] upload falhou:", e);
    return NextResponse.json({ error: "Falha ao gravar o arquivo." }, { status: 502 });
  }
  return NextResponse.json({ data: { documentoId: documento.id } }, { status: 201 });
}
