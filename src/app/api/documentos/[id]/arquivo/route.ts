export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { podeVerDocumento, registrarLogDocumento } from "@/lib/documentos";
import { baixarArquivo } from "@/lib/drive";
import { streamBlob } from "@/lib/blob";

// GET /api/documentos/[id]/arquivo?versao=N&download=1 — stream do arquivo
// (proxy autenticado; Drive nunca é linkado direto).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;

  const doc = await prismaSemEscopo.documento.findUnique({
    where: { id: params.id },
    include: { versaoVigente: true, versoes: true, acessos: { select: { usuarioId: true } } },
  });
  if (!doc || !podeVerDocumento(auth.session, doc)) {
    return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  }

  const sp = new URL(req.url).searchParams;
  const nVersao = sp.get("versao") ? parseInt(sp.get("versao")!) : null;
  const versao = nVersao ? doc.versoes.find((v) => v.versao === nVersao) : doc.versaoVigente;
  if (!versao) return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });

  await registrarLogDocumento(doc.id, auth.session.sub, "BAIXOU");
  const disposition = `${sp.get("download") ? "attachment" : "inline"}; filename="${encodeURIComponent(versao.nome)}"`;

  if (versao.provider === "DRIVE" && versao.driveFileId) {
    try {
      const drive = await baixarArquivo(versao.driveFileId);
      return new NextResponse(drive.body, {
        headers: {
          "Content-Type": versao.mime,
          "Content-Disposition": disposition,
          ...(drive.headers.get("content-length") ? { "Content-Length": drive.headers.get("content-length")! } : {}),
        },
      });
    } catch (e) {
      console.error("[documentos] stream do Drive falhou:", e);
      return NextResponse.json({ error: "Arquivo indisponível no Drive no momento." }, { status: 502 });
    }
  }
  if (versao.url) {
    // Blob privado: stream pelo proxy (URL pública direta só em registros legados).
    if (versao.url.startsWith("/api/arquivos/") || versao.url.includes(".blob.vercel-storage.com")) {
      const arq = await streamBlob(versao.url);
      if (!arq) return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
      return new NextResponse(arq.stream, {
        headers: { "Content-Type": versao.mime || arq.contentType, "Content-Disposition": disposition, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" },
      });
    }
    return NextResponse.redirect(versao.url);
  }
  return NextResponse.json({ error: "Arquivo sem localização registrada." }, { status: 500 });
}
