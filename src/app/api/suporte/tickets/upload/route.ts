export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "Arquivo muito grande (máx. 10 MB)" }, { status: 413 });

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Apenas imagens são permitidas (JPEG, PNG, GIF, WebP)" }, { status: 400 });

  const blob = await put(
    `suporte/${session.sub}/${Date.now()}-${file.name}`,
    file,
    { access: "public" }
  );

  return NextResponse.json({ url: blob.url, nome: file.name });
}
