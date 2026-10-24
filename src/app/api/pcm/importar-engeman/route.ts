export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prismaSemEscopo } from "@/lib/prisma";
import { importarEngeman } from "@/lib/manutencao/importar-engeman";
import { engemanErrorResponse } from "@/lib/engeman";

// GET — última importação. POST { aplicar: boolean } — prévia (contagens) ou aplicar.
// Só ADMIN. Reexecutável: cria o que faltou e fecha OS que fecharam lá.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const c = await prismaSemEscopo.configuracao.findUnique({ where: { chave: "manut_importacao_engeman" } });
  return NextResponse.json({ data: { ultimaImportacao: c?.valor ?? null } });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  try {
    const resumo = await importarEngeman({ aplicar: b.aplicar === true });
    return NextResponse.json({ data: resumo });
  } catch (e) {
    return engemanErrorResponse("PCM /api/pcm/importar-engeman", e);
  }
}
