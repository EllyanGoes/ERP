export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string; fornId: string } };

/** GET — list all attachments for a CotacaoFornecedor */
export async function GET(_: NextRequest, { params }: Params) {
  const anexos = await prisma.anexoCotacaoFornecedor.findMany({
    where: { cotacaoFornecedorId: params.fornId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: anexos });
}

/** POST — upload a new file (multipart/form-data, field: "file") */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  // Verify CF exists
  const cf = await prisma.cotacaoFornecedor.findUnique({ where: { id: params.fornId } });
  if (!cf) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  // 20 MB limit
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: "Arquivo muito grande (máx. 20 MB)" }, { status: 413 });

  const blob = await put(
    `cotacoes/${params.id}/propostas/${params.fornId}/${Date.now()}-${file.name}`,
    file,
    { access: "public" }
  );

  const anexo = await prisma.anexoCotacaoFornecedor.create({
    data: {
      cotacaoFornecedorId: params.fornId,
      nome:    file.name,
      url:     blob.url,
      tamanho: file.size,
      tipo:    file.type || "application/octet-stream",
    },
  });

  return NextResponse.json({ data: anexo }, { status: 201 });
}
