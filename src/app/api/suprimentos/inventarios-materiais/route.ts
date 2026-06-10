export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const localEstoqueId = searchParams.get("localEstoqueId");
  const status         = searchParams.get("status");

  const data = await prisma.inventarioMaterial.findMany({
    where: {
      AND: [
        localEstoqueId ? { localEstoqueId } : {},
        status         ? { status: status as never } : {},
      ],
    },
    include: {
      localEstoque: { select: { id: true, nome: true } },
      colaborador:  { select: { id: true, nome: true } },
      _count:       { select: { itens: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("almoxarifado");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (!body.localEstoqueId) {
      return NextResponse.json({ error: "Almoxarifado é obrigatório" }, { status: 400 });
    }
    if (!body.data) {
      return NextResponse.json({ error: "Data do inventário é obrigatória" }, { status: 400 });
    }

    const record = await prisma.$transaction(async (tx) => {
      const seq = await tx.sequencia.upsert({
        where:  { empresaId_prefixo: { empresaId: EMPRESA_PADRAO_ID, prefixo: "INV" } },
        create: { prefixo: "INV", ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      const numero = generateSimpleDocNumber("INV", seq.ultimo);

      return tx.inventarioMaterial.create({
        data: {
          numero,
          localEstoqueId: body.localEstoqueId,
          colaboradorId:  body.colaboradorId || null,
          data:           new Date(body.data),
          tipo:           body.tipo    || "TOTAL",
          status:         "RASCUNHO",
          observacoes:    body.observacoes?.trim() || null,
        },
        include: {
          localEstoque: { select: { id: true, nome: true } },
          colaborador:  { select: { id: true, nome: true } },
        },
      });
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /inventarios-materiais]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
