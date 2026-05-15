export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  razaoSocial:  z.string().min(1),
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const ativo  = searchParams.get("ativo");

  const filiais = await prisma.filial.findMany({
    where: {
      AND: [
        search ? {
          OR: [
            { razaoSocial:  { contains: search, mode: "insensitive" } },
            { nomeFantasia: { contains: search, mode: "insensitive" } },
            { cnpj:         { contains: search, mode: "insensitive" } },
          ],
        } : {},
        ativo !== null && ativo !== "" ? { ativo: ativo === "true" } : {},
      ],
    },
    orderBy: { razaoSocial: "asc" },
    include: { _count: { select: { locaisEstoque: true } } },
  });
  return NextResponse.json(filiais);
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    const data = {
      ...body.data,
      cnpj: body.data.cnpj?.trim() || null,
    };
    const filial = await prisma.filial.create({ data });
    return NextResponse.json(filial, { status: 201 });
  } catch {
    return NextResponse.json({ error: "CNPJ já cadastrado" }, { status: 409 });
  }
}
