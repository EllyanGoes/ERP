export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

// GET — lista os anexos da OP.
export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;
  const anexos = await prisma.ordemProducaoAnexo.findMany({
    where: { ordemProducaoId: params.id }, orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: anexos });
}

// POST — envia um arquivo (multipart/form-data, campo "file"). OP escaneada/comprovação.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const ordem = await prisma.ordemProducao.findUnique({ where: { id: params.id }, select: { numero: true } });
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Arquivo muito grande (máx. 20 MB)" }, { status: 413 });

  const blob = await put(`ordens-producao/${params.id}/${Date.now()}-${file.name}`, file, { access: "public" });

  const anexo = await prisma.ordemProducaoAnexo.create({
    data: {
      ordemProducaoId: params.id, nome: file.name, url: blob.url,
      tamanho: file.size, tipo: file.type || "application/octet-stream",
      criadoPor: auth.session.nome ?? null,
    },
  });
  return NextResponse.json({ data: anexo }, { status: 201 });
}
