export const dynamic = "force-dynamic";
// Anexos do título a PAGAR (fatura, boleto, comprovante…) — arquivos no Vercel
// Blob, mesmo padrão dos anexos de cotação/OP.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

/** GET — lista os anexos do título. */
export async function GET(_: NextRequest, { params }: Params) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const anexos = await prisma.anexoTitulo.findMany({
    where: { contaPagarId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: anexos });
}

/** POST — sobe um arquivo (multipart/form-data, campo "file"). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const conta = await prisma.contaPagar.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!conta) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: "Arquivo muito grande (máx. 20 MB)" }, { status: 413 });

  const blob = await put(`titulos/pagar/${params.id}/${Date.now()}-${file.name}`, file, { access: "public" });

  const anexo = await prisma.anexoTitulo.create({
    data: {
      contaPagarId: params.id,
      nome: file.name,
      url: blob.url,
      tamanho: file.size,
      tipo: file.type || "application/octet-stream",
    },
  });
  return NextResponse.json({ data: anexo }, { status: 201 });
}
