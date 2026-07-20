export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { siteRastreadoSchema } from "@/lib/tracking/sites-schema";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const site = await prisma.siteRastreado.findUnique({ where: { id: params.id } });
  if (!site) return NextResponse.json({ error: "Site não encontrado" }, { status: 404 });
  return NextResponse.json({ data: site });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = siteRastreadoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existe = await prisma.siteRastreado.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Site não encontrado" }, { status: 404 });

  const site = await prisma.siteRastreado.update({
    where: { id: params.id },
    data: {
      nome: parsed.data.nome,
      dominios: parsed.data.dominios,
      ...(parsed.data.ativo !== undefined ? { ativo: parsed.data.ativo } : {}),
    },
  });
  return NextResponse.json({ data: site });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const existe = await prisma.siteRastreado.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Site não encontrado" }, { status: 404 });

  // Soft-delete: o site some da ingestão (fail-closed valida ativo=true), mas
  // o id continua reservado — eventos/sessões antigos apontam para ele.
  await prisma.siteRastreado.update({ where: { id: params.id }, data: { ativo: false } });
  return NextResponse.json({ data: { id: params.id } });
}
