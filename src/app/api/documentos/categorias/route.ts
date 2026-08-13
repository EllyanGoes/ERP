export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// GET — categorias ativas (todas p/ ADMIN)
export async function GET() {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const categorias = await prismaSemEscopo.documentoCategoria.findMany({
    where: auth.session.perfil === "ADMIN" ? {} : { ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json({ data: categorias });
}

// POST — nova categoria (ADMIN)
export async function POST(req: NextRequest) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const body = await req.json();
  const nome = String(body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const existente = await prismaSemEscopo.documentoCategoria.findUnique({ where: { slug } });
  if (existente) return NextResponse.json({ error: "Já existe categoria com esse nome." }, { status: 400 });

  const ultima = await prismaSemEscopo.documentoCategoria.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
  const categoria = await prismaSemEscopo.documentoCategoria.create({
    data: {
      nome, slug,
      diasAlerta: parseInt(String(body.diasAlerta)) || 30,
      exigeValidade: !!body.exigeValidade,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  });
  return NextResponse.json({ data: categoria }, { status: 201 });
}
