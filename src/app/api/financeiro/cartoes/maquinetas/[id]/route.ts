export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { maquinetaPatchSchema } from "../schema";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const atual = await prisma.maquineta.findUnique({ where: { id: params.id }, select: { id: true, nome: true } });
  if (!atual) return NextResponse.json({ error: "Maquineta não encontrada" }, { status: 404 });

  const parsed = maquinetaPatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { administradoraId, nome, ativo, taxas } = parsed.data;

  if (administradoraId) {
    const admin = await prisma.administradoraCartao.findUnique({ where: { id: administradoraId }, select: { id: true } });
    if (!admin) return NextResponse.json({ error: "Administradora não encontrada" }, { status: 404 });
  }
  if (nome && nome !== atual.nome) {
    const dup = await prisma.maquineta.findFirst({ where: { nome, id: { not: atual.id } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "Já existe uma maquineta com esse nome." }, { status: 422 });
  }

  const maquineta = await prisma.$transaction(async (tx) => {
    const upd = await tx.maquineta.update({
      where: { id: atual.id },
      data: {
        ...(administradoraId !== undefined ? { administradoraId } : {}),
        ...(nome !== undefined ? { nome } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
    });
    // Taxas: substituição por tipoForma — upsert as informadas, remove as ausentes.
    if (taxas) {
      await tx.taxaMaquineta.deleteMany({
        where: { maquinetaId: atual.id, tipoForma: { notIn: taxas.map((t) => t.tipoForma) } },
      });
      for (const t of taxas) {
        await tx.taxaMaquineta.upsert({
          where: { maquinetaId_tipoForma: { maquinetaId: atual.id, tipoForma: t.tipoForma } },
          update: { taxaPct: t.taxaPct, diasCompensacao: t.diasCompensacao },
          create: { maquinetaId: atual.id, tipoForma: t.tipoForma, taxaPct: t.taxaPct, diasCompensacao: t.diasCompensacao },
        });
      }
    }
    return upd;
  });

  const comTaxas = await prisma.maquineta.findUnique({ where: { id: maquineta.id }, include: { taxas: true } });
  return NextResponse.json({ data: comTaxas ?? maquineta });
}
