export const dynamic = "force-dynamic";
// Grupo de centro de custo: PATCH (nome/ativo/fabril/descricaoCusteio) e DELETE
// protegido — grupo com centros não é excluído (422). Mudar o `fabril` do grupo
// SINCRONIZA os centros dele (o grupo é a fonte da verdade do CIF×Despesa;
// CentroCusto.fabril é coluna espelhada p/ as consultas do motor).
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
  fabril: z.boolean().optional(),
  descricaoCusteio: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const grupo = await prisma.grupoCentroCusto.update({ where: { id: params.id }, data: body.data });
    // Grupos são COMPARTILHADOS entre empresas; sincroniza os centros de todas
    // (prismaSemEscopo — o escopo da sessão só enxerga a empresa ativa).
    if (body.data.fabril !== undefined) {
      await prismaSemEscopo.centroCusto.updateMany({
        where: { grupoCentroCustoId: grupo.id },
        data: { fabril: grupo.fabril },
      });
    }
    return NextResponse.json(grupo);
  } catch {
    return NextResponse.json({ error: "Nome já cadastrado" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const centros = await prismaSemEscopo.centroCusto.count({ where: { grupoCentroCustoId: params.id } });
  if (centros > 0) {
    return NextResponse.json({ error: `O grupo tem ${centros} centro(s) de custo — mova-os antes de excluir (ou inative o grupo).` }, { status: 422 });
  }
  await prisma.grupoCentroCusto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
