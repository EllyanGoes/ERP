export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clienteSchema } from "@/lib/validations/cliente";
import { garantirContaContabilCliente } from "@/lib/conta-contabil";

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
  const mapeado = searchParams.get("mapeado") || undefined; // "true" = mapeado na IC, "false" = não mapeado
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // "Mapeado" na Inteligência Comercial = existe um Concorrente vinculado a este
  // cliente (Concorrente.clienteId). Não há FK, então buscamos os ids vinculados.
  const vinc = await prisma.concorrente.findMany({ where: { clienteId: { not: null } }, select: { clienteId: true } });
  const mapeadosIds = Array.from(new Set(vinc.map((v) => v.clienteId).filter((x): x is string => !!x)));
  const mapeadosSet = new Set(mapeadosIds);

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
      mapeado === "true" ? { id: { in: mapeadosIds } } : {},
      mapeado === "false" ? { id: { notIn: mapeadosIds } } : {},
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

  const dataComMapeado = data.map((c) => ({ ...c, mapeado: mapeadosSet.has(c.id) }));
  return NextResponse.json({ data: dataComMapeado, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = { ...parsed.data, cpfCnpj: parsed.data.cpfCnpj?.trim() || null };
  try {
    const cliente = await prisma.cliente.create({ data });
    // Cria (best-effort) a conta contábil analítica do cliente. Não bloqueia o
    // cadastro se o plano de contas ainda não foi semeado.
    await garantirContaContabilCliente(cliente.id).catch(() => null);
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
