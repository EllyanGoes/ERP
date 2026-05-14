export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contaPagarSchema } from "@/lib/validations/financeiro";
import { generateDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || "";

  const where: any = {
    AND: [
      status ? { status } : {},
      q ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }] } : {},
    ],
  };

  const data = await prisma.contaPagar.findMany({
    where,
    include: { fornecedor: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = contaPagarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const seq = await prisma.sequencia.upsert({
    where: { prefixo: "CP" },
    update: { ultimo: { increment: 1 } },
    create: { prefixo: "CP", ultimo: 1 },
  });

  const conta = await prisma.contaPagar.create({
    data: {
      ...parsed.data,
      numero: generateDocNumber("CP", seq.ultimo),
      dataVencimento: new Date(parsed.data.dataVencimento),
    },
  });

  return NextResponse.json({ data: conta }, { status: 201 });
}
