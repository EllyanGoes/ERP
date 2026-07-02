export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { sincronizarContaContabilBanco } from "@/lib/conta-contabil";

const patchSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").optional(),
  cnpj: z.string().trim().optional().nullable(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const admin = await prisma.administradoraCartao.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, contaBancariaId: true },
  });
  if (!admin) return NextResponse.json({ error: "Administradora não encontrada" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { nome, cnpj, ativo } = parsed.data;

  if (nome && nome !== admin.nome) {
    const dup = await prisma.administradoraCartao.findFirst({ where: { nome, id: { not: admin.id } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "Já existe uma administradora com esse nome." }, { status: 422 });
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    const upd = await tx.administradoraCartao.update({
      where: { id: admin.id },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        ...(cnpj !== undefined ? { cnpj: cnpj?.trim() || null } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
    });
    // A conta CARTAO espelha o cadastro: renomeia junto e acompanha o ativo
    // (some dos dropdowns quando a administradora é desativada).
    if ((nome !== undefined && nome !== admin.nome) || ativo !== undefined) {
      await tx.contaBancaria.update({
        where: { id: admin.contaBancariaId },
        data: {
          ...(nome !== undefined ? { nome } : {}),
          ...(ativo !== undefined ? { ativo } : {}),
        },
      });
    }
    return upd;
  });
  // Re-sincroniza a analítica 1.1.8.x (nome) pós-commit — best-effort.
  if (nome !== undefined && nome !== admin.nome) {
    await sincronizarContaContabilBanco(admin.contaBancariaId)
      .catch((e) => console.error("[cartoes/administradoras] re-sync contábil:", e));
  }

  return NextResponse.json({ data: atualizado });
}
