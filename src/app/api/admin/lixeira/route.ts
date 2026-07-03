export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// GET /api/admin/lixeira?tipo=&q=&page= — lista os documentos apagados (todas as
// empresas — visão de administrador; a Lixeira existe justamente para socorrer
// exclusões erradas em qualquer empresa). Snapshot completo só no GET [id].
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") || undefined;
  const q = sp.get("q")?.trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const TAM = 50;

  const where = {
    ...(tipo ? { tipo } : {}),
    ...(q
      ? { OR: [
          { numero: { contains: q, mode: "insensitive" as const } },
          { descricao: { contains: q, mode: "insensitive" as const } },
        ] }
      : {}),
  };
  const [total, itens] = await Promise.all([
    prismaSemEscopo.lixeira.count({ where }),
    prismaSemEscopo.lixeira.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * TAM,
      take: TAM,
      select: {
        id: true, empresaId: true, tipo: true, origemId: true, numero: true, descricao: true,
        apagadoPor: true, createdAt: true, restauradoEm: true, restauradoComoId: true,
      },
    }),
  ]);
  return NextResponse.json({ data: itens, total, page, tamanhoPagina: TAM });
}
