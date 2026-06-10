export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  razaoSocial:  z.string().min(1).optional(),
  nomeFantasia: z.string().optional(),
  cnpj:         z.string().optional().nullable(),
  ie:           z.string().optional(),
  email:        z.string().optional(),
  telefone:     z.string().optional(),
  celular:      z.string().optional(),
  cep:          z.string().optional(),
  logradouro:   z.string().optional(),
  numero:       z.string().optional(),
  complemento:  z.string().optional(),
  bairro:       z.string().optional(),
  cidade:       z.string().optional(),
  estado:       z.string().optional(),
  ativo:        z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const record = await prisma.filial.findUnique({
    where: { id: params.id },
    include: {
      locaisEstoque: { select: { id: true, nome: true, ativo: true } },
      _count: { select: { locaisEstoque: true, necessidadesCompra: true } },
    },
  });
  if (!record) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const alvo = await prisma.filial.findUnique({ where: { id: params.id }, select: { matriz: true } });
  if (alvo?.matriz) {
    return NextResponse.json(
      { error: "A matriz é o espelho do cadastro da empresa — edite em Configurações → Empresas do Grupo." },
      { status: 422 }
    );
  }

  try {
    const data = {
      ...body.data,
      ...(body.data.cnpj !== undefined ? { cnpj: body.data.cnpj?.trim() || null } : {}),
    };
    const record = await prisma.filial.update({ where: { id: params.id }, data });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "CNPJ já cadastrado por outra filial" }, { status: 409 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const alvo = await prisma.filial.findUnique({ where: { id: params.id }, select: { matriz: true } });
  if (alvo?.matriz) {
    return NextResponse.json(
      { error: "A matriz não pode ser excluída — ela é o espelho do cadastro da empresa." },
      { status: 422 }
    );
  }

  const count = await prisma.localEstoque.count({ where: { filialId: params.id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Não é possível excluir: filial possui ${count} local(is) de estoque vinculado(s).` },
      { status: 409 }
    );
  }
  await prisma.filial.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
