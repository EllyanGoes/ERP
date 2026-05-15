export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  nome:         z.string().min(1),
  cpf:          z.string().optional().nullable(),
  rg:           z.string().optional().nullable(),
  email:        z.string().optional().nullable(),
  telefone:     z.string().optional().nullable(),
  cargo:        z.string().optional().nullable(),
  departamento: z.string().optional().nullable(),
  dataAdmissao: z.string().optional().nullable(),
  dataDemissao: z.string().optional().nullable(),
  filialId:     z.string().optional().nullable(),
  usuarioId:    z.string().optional().nullable(),
  ativo:        z.boolean().optional(),
  observacoes:  z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search   = searchParams.get("search")?.trim() ?? "";
  const filialId = searchParams.get("filialId");
  const ativo    = searchParams.get("ativo");

  const colaboradores = await prisma.colaborador.findMany({
    where: {
      AND: [
        search ? {
          OR: [
            { nome:         { contains: search, mode: "insensitive" } },
            { cpf:          { contains: search, mode: "insensitive" } },
            { cargo:        { contains: search, mode: "insensitive" } },
            { departamento: { contains: search, mode: "insensitive" } },
            { email:        { contains: search, mode: "insensitive" } },
          ],
        } : {},
        filialId ? { filialId } : {},
        ativo !== null && ativo !== "" ? { ativo: ativo === "true" } : {},
      ],
    },
    include: {
      filial:  true,
      usuario: { select: { id: true, nome: true, email: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(colaboradores);
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  try {
    const { dataAdmissao, dataDemissao, ...rest } = body.data;
    const colaborador = await prisma.colaborador.create({
      data: {
        ...rest,
        cpf:          rest.cpf?.trim() || null,
        dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
        dataDemissao: dataDemissao ? new Date(dataDemissao) : null,
      },
      include: {
        filial:  true,
        usuario: { select: { id: true, nome: true, email: true } },
      },
    });
    return NextResponse.json(colaborador, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "CPF já cadastrado" }, { status: 409 });
    }
    console.error("[POST /api/empresa/colaboradores]", err);
    return NextResponse.json({ error: "Erro ao criar colaborador" }, { status: 500 });
  }
}
