export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function slugCodigo(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// GET — lista de estados WIP (catálogo configurável)
export async function GET() {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const data = await prisma.estadoWip.findMany({ orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }] });
  return NextResponse.json({ data, source: "db" });
}

// POST — cria um estado WIP
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcp");
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const codigo = typeof body.codigo === "string" && body.codigo.trim() ? slugCodigo(body.codigo) : slugCodigo(nome);
  if (!codigo) return NextResponse.json({ error: "Código inválido" }, { status: 400 });

  try {
    const data = await prisma.estadoWip.create({
      data: {
        codigo,
        nome,
        ordem: numOrNull(body.ordem) != null ? Math.trunc(numOrNull(body.ordem)!) : 0,
        ativo: body.ativo === undefined ? true : body.ativo !== false,
      },
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar (código já existe?)." }, { status: 400 });
  }
}
