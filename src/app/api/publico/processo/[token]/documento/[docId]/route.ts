export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { acessoPorToken } from "@/lib/processos-externo";
import { baixarArquivo } from "@/lib/drive";
import { streamBlob } from "@/lib/blob";

// GET /api/publico/processo/[token]/documento/[docId] — stream de um documento do GED que foi
// EXPLICITAMENTE compartilhado com este link (ou enviado por ele) e que é deste processo.
export async function GET(req: NextRequest, { params }: { params: { token: string; docId: string } }) {
  const a = await acessoPorToken(params.token);
  if (!a || !a.documentoIds.includes(params.docId)) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const doc = await prismaSemEscopo.documento.findFirst({ where: { id: params.docId, processoId: a.processoId }, include: { versaoVigente: true } });
  const v = doc?.versaoVigente;
  if (!v) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const disposition = `${req.nextUrl.searchParams.get("download") ? "attachment" : "inline"}; filename="${encodeURIComponent(v.nome)}"`;
  const base = { "Content-Type": v.mime || "application/octet-stream", "Content-Disposition": disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
  if (v.provider === "DRIVE" && v.driveFileId) {
    try {
      const drive = await baixarArquivo(v.driveFileId);
      return new NextResponse(drive.body, { headers: base });
    } catch (e) {
      console.error("[publico/processo] Drive:", e);
      return NextResponse.json({ error: "Arquivo indisponível no momento." }, { status: 502 });
    }
  }
  if (v.url && (v.url.startsWith("/api/arquivos/") || v.url.includes(".blob.vercel-storage.com"))) {
    const arq = await streamBlob(v.url);
    if (!arq) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    return new NextResponse(arq.stream, { headers: { ...base, "Content-Type": v.mime || arq.contentType } });
  }
  return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
}
