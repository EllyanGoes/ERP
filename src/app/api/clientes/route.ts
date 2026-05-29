export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clienteSchema } from "@/lib/validations/cliente";

// Mensagem amigável quando o CPF/CNPJ (campo único) já existe.
function cpfCnpjEmUso(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (err.meta?.target as string[] | undefined)?.includes("cpfCnpj") === true
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: any = {
    AND: [
      q ? {
        OR: [
          { razaoSocial: { contains: q, mode: "insensitive" } },
          { nomeFantasia: { contains: q, mode: "insensitive" } },
          { cpfCnpj: { contains: q.replace(/\D/g, "") } },
        ],
      } : {},
      status ? { status } : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      orderBy: { razaoSocial: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cliente.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = { ...parsed.data, cpfCnpj: parsed.data.cpfCnpj?.trim() || null };
  try {
    const cliente = await prisma.cliente.create({ data });
    return NextResponse.json({ data: cliente }, { status: 201 });
  } catch (err) {
    if (cpfCnpjEmUso(err)) {
      return NextResponse.json(
        { error: "Já existe um cliente cadastrado com este CPF/CNPJ." },
        { status: 409 },
      );
    }
    throw err;
  }
}
