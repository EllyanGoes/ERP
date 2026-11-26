export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { podeEditar } from "@/lib/processos";
import { extrairDocumentoProcesso, iaDisponivel } from "@/lib/processos-ia";

const MAX_BYTES = 4.5 * 1024 * 1024; // limite do corpo da requisição na Vercel

// POST multipart { file: PDF } — a IA lê o auto/notificação/intimação e devolve os campos
// SUGERIDOS. Não grava nada: a tela mostra o formulário pré-preenchido para conferência.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Envie o PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "O arquivo passa de 4,5 MB." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
  if (!iaDisponivel()) return NextResponse.json({ data: null, aviso: "Leitura automática indisponível (IA não configurada). Preencha os campos conferindo o documento." });
  const data = await extrairDocumentoProcesso(Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ data, aviso: data ? null : "Não foi possível ler o documento automaticamente. Preencha os campos conferindo o PDF." });
}
