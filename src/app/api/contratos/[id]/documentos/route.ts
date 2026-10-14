export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { salvarArquivoDocumento } from "@/lib/documentos";
import { registrarEvento } from "@/lib/contratos";

const MAX_MB = 25;
// Categorias do GED por tipo de anexo (criadas sob demanda).
const CATEGORIAS: Record<string, { nome: string; slug: string; exigeValidade: boolean }> = {
  contrato: { nome: "Contratos", slug: "contratos", exigeValidade: false },
  aditivo:  { nome: "Contratos — Aditivos", slug: "contratos-aditivos", exigeValidade: false },
  garantia: { nome: "Contratos — Garantias e apólices", slug: "contratos-garantias", exigeValidade: true },
  outro:    { nome: "Contratos — Outros", slug: "contratos-outros", exigeValidade: false },
};

// POST multipart { file, tipo: contrato|aditivo|garantia|outro, titulo?, validade?, assinadoEm?, aditivoId? }
// tipo=contrato grava contrato.documentoId (+assinadoEm); tipo=aditivo com aditivoId grava aditivo.documentoId.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: { id: true, numero: true, titulo: true, empresaId: true, fornecedorId: true, clienteId: true, fim: true, responsavelId: true } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const tipo = String(form.get("tipo") ?? "outro");
  if (!file) return NextResponse.json({ error: "Anexe o arquivo." }, { status: 400 });
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `Máx. ${MAX_MB} MB.` }, { status: 400 });
  const def = CATEGORIAS[tipo] ?? CATEGORIAS.outro;
  const categoria = await prismaSemEscopo.documentoCategoria.upsert({ where: { slug: def.slug }, create: { nome: def.nome, slug: def.slug, exigeValidade: def.exigeValidade, diasAlerta: 60, ordem: 35 }, update: {} });
  const titulo = String(form.get("titulo") ?? "").trim() || `${c.numero} — ${tipo === "contrato" ? "Contrato" : tipo === "aditivo" ? "Aditivo" : tipo === "garantia" ? "Garantia" : "Anexo"} — ${c.titulo}`;
  const validade = form.get("validade") ? new Date(String(form.get("validade"))) : tipo === "contrato" ? c.fim : null;
  const assinadoEm = form.get("assinadoEm") ? new Date(String(form.get("assinadoEm"))) : null;
  const aditivoId = form.get("aditivoId") ? String(form.get("aditivoId")) : null;

  const documento = await prisma.documento.create({
    data: { empresaId: c.empresaId, categoriaId: categoria.id, titulo, validade, emissao: assinadoEm, contratoId: c.id, fornecedorId: c.fornecedorId, clienteId: c.clienteId, responsavelId: c.responsavelId, tags: ["contrato", c.numero.toLowerCase(), tipo] },
    select: { id: true, empresaId: true },
  });
  try {
    const arquivo = await salvarArquivoDocumento({ empresaId: documento.empresaId, categoriaSlug: categoria.slug, categoriaNome: categoria.nome, nomeArquivo: `${titulo} — v1${file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ""}`, mime: file.type, conteudo: Buffer.from(await file.arrayBuffer()) });
    const versao = await prismaSemEscopo.documentoVersao.create({ data: { documentoId: documento.id, versao: 1, provider: arquivo.provider, driveFileId: arquivo.driveFileId, url: arquivo.url, nome: file.name, mime: file.type || "application/octet-stream", tamanho: file.size, criadoPor: auth.session.nome } });
    await prismaSemEscopo.documento.update({ where: { id: documento.id }, data: { versaoVigenteId: versao.id } });
  } catch (e) {
    await prismaSemEscopo.documento.delete({ where: { id: documento.id } }).catch(() => {});
    console.error("[contratos/documentos] upload falhou:", e);
    return NextResponse.json({ error: "Falha ao gravar o arquivo." }, { status: 502 });
  }
  await prismaSemEscopo.$transaction(async (tx) => {
    if (tipo === "contrato") {
      await tx.contrato.update({ where: { id: c.id }, data: { documentoId: documento.id, ...(assinadoEm ? { assinadoEm } : {}), atualizadoPor: auth.session.nome } });
      await registrarEvento(tx, c.id, assinadoEm ? "ASSINADO" : "OBSERVACAO", assinadoEm ? `Contrato assinado anexado (assinatura em ${assinadoEm.toLocaleDateString("pt-BR")})` : "Documento do contrato anexado", auth.session.sub);
    } else if (tipo === "aditivo" && aditivoId) {
      await tx.contratoAditivo.update({ where: { id: aditivoId }, data: { documentoId: documento.id, ...(assinadoEm ? { assinadoEm } : {}) } });
    } else {
      await registrarEvento(tx, c.id, "OBSERVACAO", `Anexo (${tipo}): ${titulo}`, auth.session.sub);
    }
  });
  return NextResponse.json({ data: { documentoId: documento.id } }, { status: 201 });
}
