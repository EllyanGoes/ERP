export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { uploadBlob, deleteBlob } from "@/lib/blob";
import { CHAVE_PLANTA } from "@/lib/manutencao/mapa";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

// POST /api/pcm/mapa/planta — planta baixa (imagem de fundo do mapa) da empresa
// ativa. Blob privado via lib/blob.ts; a URL do proxy fica em Configuracao
// (chave manut_planta_<empresaId>). Substituir apaga a anterior.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (!TIPOS.includes(file.type)) return NextResponse.json({ error: "Envie uma imagem (JPEG, PNG, WebP ou SVG)" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Imagem muito grande (máx. 8 MB)" }, { status: 413 });

  const chave = CHAVE_PLANTA(empresaId);
  const anterior = await prisma.configuracao.findUnique({ where: { chave }, select: { valor: true } });
  const blob = await uploadBlob(`pcm/planta/${empresaId}/${Date.now()}-${file.name}`, file, file.type);
  await prisma.configuracao.upsert({ where: { chave }, create: { chave, valor: blob.url }, update: { valor: blob.url } });
  await deleteBlob(anterior?.valor);
  return NextResponse.json({ data: { url: blob.url } }, { status: 201 });
}

// DELETE /api/pcm/mapa/planta — remove a planta baixa da empresa ativa.
export async function DELETE() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const chave = CHAVE_PLANTA(empresaId);
  const atual = await prisma.configuracao.findUnique({ where: { chave }, select: { valor: true } });
  await deleteBlob(atual?.valor);
  await prisma.configuracao.deleteMany({ where: { chave } });
  return NextResponse.json({ data: { ok: true } });
}
