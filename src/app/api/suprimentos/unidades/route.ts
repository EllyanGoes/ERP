export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ nome: z.string().min(1), sigla: z.string().min(1).max(10) });

export async function GET() {
  const data = await prisma.unidade.findMany({ orderBy: { sigla: "asc" } });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  try {
    const record = await prisma.unidade.create({ data: { ...body.data, sigla: body.data.sigla.toUpperCase() } });
    return NextResponse.json(record, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Sigla já cadastrada" }, { status: 409 });
  }
}
