export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { streamBlob } from "@/lib/blob";

// GET /api/arquivos/<pathname> — proxy autenticado dos anexos no Blob privado
// (títulos, tarefas, OPs, cotações, suporte). Documentos do GED e arquivos do
// RH têm regra própria de acesso e são servidos pelas rotas deles.
const PREFIXOS_RESERVADOS = ["documentos/", "rh/"];

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const pathname = params.path.map(decodeURIComponent).join("/");
  if (PREFIXOS_RESERVADOS.some((p) => pathname.startsWith(p))) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  }
  const arq = await streamBlob(pathname);
  if (!arq) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const nome = pathname.slice(pathname.lastIndexOf("/") + 1);
  const download = new URL(req.url).searchParams.get("download");
  return new NextResponse(arq.stream, {
    headers: {
      "Content-Type": arq.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(nome)}"`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
