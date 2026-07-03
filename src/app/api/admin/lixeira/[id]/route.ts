export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

/** GET /api/admin/lixeira/[id] — registro completo, com o snapshot. Só ADMIN. */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }
  const registro = await prismaSemEscopo.lixeira.findUnique({ where: { id: params.id } });
  if (!registro) return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  return NextResponse.json({ data: registro });
}
