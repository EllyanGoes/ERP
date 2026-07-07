export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { put, get, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

// GET /api/rh/diaristas/[id]/arquivo — serve a folha assinada (privada), autenticado.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.diariaFolha.findUnique({
    where: { id: params.id }, select: { arquivoAssinadoUrl: true, arquivoAssinadoNome: true },
  });
  if (!folha?.arquivoAssinadoUrl) return NextResponse.json({ error: "Sem arquivo" }, { status: 404 });

  const pathname = new URL(folha.arquivoAssinadoUrl).pathname.replace(/^\//, "");
  const res = await get(pathname, { access: "private" });
  if (!res) return new NextResponse("Não encontrado", { status: 404 });

  return new NextResponse(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${folha.arquivoAssinadoNome ?? "diarias-assinada"}"`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// POST /api/rh/diaristas/[id]/arquivo — sobe a folha assinada escaneada
// (PDF ou imagem). Substitui a anterior, se houver.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.diariaFolha.findUnique({
    where: { id: params.id }, select: { id: true, empresaId: true, arquivoAssinadoUrl: true },
  });
  if (!folha) return NextResponse.json({ error: "Folha não encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Envie o arquivo escaneado" }, { status: 400 });
  const ok = file.type === "application/pdf" || file.type.startsWith("image/") || /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
  if (!ok) return NextResponse.json({ error: "Envie um PDF ou imagem (PNG/JPG)" }, { status: 415 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Arquivo muito grande (máx. 25 MB)" }, { status: 413 });

  let blob: { url: string };
  try {
    blob = await put(`rh/diaristas/${folha.empresaId}/${folha.id}/${Date.now()}-${file.name}`, file, { access: "private", addRandomSuffix: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const semToken = /token|BLOB_READ_WRITE_TOKEN|store/i.test(msg);
    return NextResponse.json(
      { error: semToken ? "Armazenamento de arquivos não configurado (Vercel Blob)." : `Falha ao subir o arquivo: ${msg}` },
      { status: 500 },
    );
  }

  // Remove o anterior p/ não acumular lixo no storage (melhor esforço).
  if (folha.arquivoAssinadoUrl) await del(folha.arquivoAssinadoUrl).catch(() => {});

  await prisma.diariaFolha.update({
    where: { id: folha.id },
    data: { arquivoAssinadoUrl: blob.url, arquivoAssinadoNome: file.name },
  });
  return NextResponse.json({ data: { arquivoAssinadoNome: file.name } }, { status: 201 });
}
