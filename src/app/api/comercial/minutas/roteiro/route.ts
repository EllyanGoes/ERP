export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── PATCH /api/comercial/minutas/roteiro ──────────────────────────────────────
// Atualização em lote da logística do roteiro: motorista, data prevista e ordem
// da parada. NÃO mexe em estoque (diferente de /minutas/[id], que tem as baixas
// embutidas no fluxo de status). Usado pela tela Agenda de Entregas ao arrastar
// cards entre motoristas/dias e ao reordenar paradas.
type RoteiroUpdate = {
  id: string;
  motoristaId?: string | null;
  dataEntrega?: string | null;
  ordemEntrega?: number | null;
};

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const updates = body?.updates as RoteiroUpdate[] | undefined;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "Informe ao menos uma atualização" }, { status: 400 });
    }
    if (updates.some((u) => !u.id)) {
      return NextResponse.json({ error: "Cada atualização precisa de um id" }, { status: 400 });
    }

    const ids = updates.map((u) => u.id);
    const existentes = await prisma.minuta.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });

    const statusById = new Map(existentes.map((m) => [m.id, m.status]));
    const faltando = ids.filter((id) => !statusById.has(id));
    if (faltando.length > 0) {
      return NextResponse.json({ error: `Minuta(s) não encontrada(s): ${faltando.join(", ")}` }, { status: 404 });
    }
    const canceladas = ids.filter((id) => statusById.get(id) === "CANCELADA");
    if (canceladas.length > 0) {
      return NextResponse.json(
        { error: "Não é possível alterar o roteiro de minutas canceladas" },
        { status: 409 }
      );
    }

    await prisma.$transaction(
      updates.map((u) => {
        const data: Record<string, unknown> = {};
        if (u.motoristaId !== undefined) data.motoristaId = u.motoristaId || null;
        if (u.dataEntrega !== undefined) data.dataEntrega = u.dataEntrega ? new Date(u.dataEntrega) : null;
        if (u.ordemEntrega !== undefined) data.ordemEntrega = u.ordemEntrega ?? null;
        return prisma.minuta.update({ where: { id: u.id }, data });
      })
    );

    return NextResponse.json({ ok: true, count: updates.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[PATCH /api/comercial/minutas/roteiro]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
