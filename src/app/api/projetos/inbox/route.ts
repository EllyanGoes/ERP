export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { INBOX_SELECT } from "@/lib/projetos";

// Caixa de entrada pessoal (Projetos, estilo Things 3): itens do usuário
// logado, sem projeto. Modelo sem escopo de empresa → prismaSemEscopo.

// GET /api/projetos/inbox — itens abertos (mais antigo primeiro, como uma fila).
export async function GET() {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const itens = await prismaSemEscopo.tarefaInbox.findMany({
    where: { usuarioId: auth.session.sub, concluidaEm: null },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    select: INBOX_SELECT,
  });
  return NextResponse.json({ data: itens });
}

// POST /api/projetos/inbox — captura rápida { titulo, notas? }.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("projetos");
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const titulo = String(body.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  const ultimo = await prismaSemEscopo.tarefaInbox.findFirst({
    where: { usuarioId: auth.session.sub },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const item = await prismaSemEscopo.tarefaInbox.create({
    data: {
      usuarioId: auth.session.sub,
      titulo,
      notas: typeof body.notas === "string" && body.notas.trim() ? body.notas.trim() : null,
      ordem: (ultimo?.ordem ?? 0) + 1,
    },
    select: INBOX_SELECT,
  });
  return NextResponse.json({ data: item }, { status: 201 });
}
