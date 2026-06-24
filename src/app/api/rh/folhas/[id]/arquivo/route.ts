export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

// GET /api/rh/folhas/[id]/arquivo — serve o PDF (privado) da folha, autenticado.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: params.id }, select: { arquivoUrl: true, arquivoNome: true },
  });
  if (!folha?.arquivoUrl) return NextResponse.json({ error: "Sem arquivo" }, { status: 404 });

  const pathname = new URL(folha.arquivoUrl).pathname.replace(/^\//, "");
  const res = await get(pathname, { access: "private" });
  if (!res) return new NextResponse("Não encontrado", { status: 404 });

  return new NextResponse(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${folha.arquivoNome ?? "folha.pdf"}"`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
