export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  grupoCentroCustoId: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  // Legado: aceito só para centro SEM grupo — com grupo, o fabril é HERDADO
  // (GrupoCentroCusto.fabril é a fonte da verdade).
  fabril: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const grupoId = searchParams.get("grupoId") ?? "";
  const ativo = searchParams.get("ativo");

  const centros = await prisma.centroCusto.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { codigo: { contains: search, mode: "insensitive" } },
                { nome:   { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        grupoId ? { grupoCentroCustoId: grupoId } : {},
        ativo !== null && ativo !== ""
          ? { ativo: ativo === "true" }
          : {},
      ],
    },
    orderBy: { codigo: "asc" },
    include: { grupoCentroCusto: { select: { id: true, nome: true, fabril: true, descricaoCusteio: true } } },
  });

  return NextResponse.json(centros);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  try {
    // Fabril HERDADO do grupo (fonte da verdade); sem grupo, usa o enviado.
    const grupoId = body.data.grupoCentroCustoId ?? null;
    const grupo = grupoId
      ? await prisma.grupoCentroCusto.findUnique({ where: { id: grupoId }, select: { fabril: true } })
      : null;
    const centro = await prisma.centroCusto.create({
      data: {
        codigo:             body.data.codigo.trim(),
        nome:               body.data.nome.trim(),
        grupoCentroCustoId: grupoId,
        ativo:              body.data.ativo ?? true,
        fabril:             grupo ? grupo.fabril : (body.data.fabril ?? false),
      },
      include: { grupoCentroCusto: { select: { id: true, nome: true, fabril: true } } },
    });
    return NextResponse.json(centro, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
  }
}
