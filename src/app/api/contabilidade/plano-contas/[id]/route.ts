export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1).optional(),
  natureza: z.enum(["DEVEDORA", "CREDORA"]).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const conta = await prisma.contaContabil.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ data: conta });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const conta = await prisma.contaContabil.findUnique({
    where: { id: params.id },
    include: { _count: { select: { filhos: true } } },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  if (conta._count.filhos > 0) {
    return NextResponse.json({ error: "Não é possível excluir: a conta possui contas filhas." }, { status: 409 });
  }
  if (conta.clienteId || conta.fornecedorId) {
    return NextResponse.json({ error: "Conta gerida automaticamente (cliente/fornecedor). Inative em vez de excluir." }, { status: 409 });
  }

  await prisma.contaContabil.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
