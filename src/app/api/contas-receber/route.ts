export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contaReceberSchema } from "@/lib/validations/financeiro";
import { generateDocNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || "";

  const where: any = {
    AND: [
      status ? { status } : {},
      q ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }, { cliente: { razaoSocial: { contains: q, mode: "insensitive" } } }] } : {},
    ],
  };

  const data = await prisma.contaReceber.findMany({
    where,
    include: { cliente: { select: { id: true, razaoSocial: true } } },
    orderBy: { dataVencimento: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = contaReceberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const seq = await prisma.sequencia.upsert({
    where: { prefixo: "CR" },
    update: { ultimo: { increment: 1 } },
    create: { prefixo: "CR", ultimo: 1 },
  });

  const conta = await prisma.contaReceber.create({
    data: {
      ...parsed.data,
      numero: generateDocNumber("CR", seq.ultimo),
      dataVencimento: new Date(parsed.data.dataVencimento),
      pedidoVendaId: (body.pedidoVendaId as string) ?? null,
    },
  });

  return NextResponse.json({ data: conta }, { status: 201 });
}
