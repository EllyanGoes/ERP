export const dynamic = "force-dynamic";
// ENDPOINT TEMPORÁRIO — preview do PDF de resumo da cotação no Telegram.
// Usa as libs reais (buildCotacaoPDF + sendTelegramDocument). Guardado por uma
// chave aleatória de uso único. REMOVER após o teste.
import { NextRequest, NextResponse } from "next/server";
import { buildCotacaoPDF } from "@/lib/pdf-cotacao";
import { sendTelegramDocument } from "@/lib/telegram";

const KEY = "e113af35bb3bc7beb7640493ded2fa86";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== KEY) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const pdf = await buildCotacaoPDF(id);
  if (!pdf) return NextResponse.json({ error: "Cotação não encontrada" }, { status: 404 });

  const r = await sendTelegramDocument({
    filename: pdf.filename,
    buffer: pdf.buffer,
    caption: "🧪 TESTE — preview do resumo da cotação \\(aprovação CT→PC\\)\\. Sem botões\\.",
  });
  return NextResponse.json({ ok: r.ok, bytes: pdf.buffer.length, filename: pdf.filename, error: r.error });
}
