export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const ACTIVE_SC_STATUSES = ["RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADA"] as const;
const ACTIVE_PC_STATUSES = ["RASCUNHO", "ENVIADO", "CONFIRMADO", "EM_TRANSITO"] as const;

type ConflictProcesso = {
  tipo: "SC" | "PC";
  numero: string;
  status: string;
  id: string;
};

type ConflictItem = {
  itemId: string;
  itemDescricao: string;
  itemCodigo: string;
  processos: ConflictProcesso[];
};

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { itemIds } = body as { itemIds: string[] };

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    const [scs, pcs] = await Promise.all([
      prisma.necessidadeCompra.findMany({
        where: {
          status: { in: ACTIVE_SC_STATUSES as unknown as never[] },
          itens: { some: { itemId: { in: itemIds } } },
        },
        select: {
          id: true,
          numero: true,
          status: true,
          itens: {
            where: { itemId: { in: itemIds } },
            select: {
              itemId: true,
              item: { select: { codigo: true, descricao: true } },
            },
          },
        },
      }),
      prisma.pedidoCompra.findMany({
        where: {
          status: { in: ACTIVE_PC_STATUSES as unknown as never[] },
          itens: { some: { itemId: { in: itemIds } } },
        },
        select: {
          id: true,
          numero: true,
          status: true,
          itens: {
            where: { itemId: { in: itemIds } },
            select: {
              itemId: true,
              item: { select: { codigo: true, descricao: true } },
            },
          },
        },
      }),
    ]);

    // Group conflicts by itemId
    const conflictMap = new Map<
      string,
      { itemDescricao: string; itemCodigo: string; processos: ConflictProcesso[] }
    >();

    for (const sc of scs) {
      for (const scItem of sc.itens) {
        if (!conflictMap.has(scItem.itemId)) {
          conflictMap.set(scItem.itemId, {
            itemDescricao: scItem.item.descricao,
            itemCodigo: scItem.item.codigo,
            processos: [],
          });
        }
        conflictMap.get(scItem.itemId)!.processos.push({
          tipo: "SC",
          numero: sc.numero,
          status: sc.status,
          id: sc.id,
        });
      }
    }

    for (const pc of pcs) {
      for (const pcItem of pc.itens) {
        if (!conflictMap.has(pcItem.itemId)) {
          conflictMap.set(pcItem.itemId, {
            itemDescricao: pcItem.item.descricao,
            itemCodigo: pcItem.item.codigo,
            processos: [],
          });
        }
        conflictMap.get(pcItem.itemId)!.processos.push({
          tipo: "PC",
          numero: pc.numero,
          status: pc.status,
          id: pc.id,
        });
      }
    }

    const conflicts: ConflictItem[] = Array.from(conflictMap.entries()).map(
      ([itemId, data]) => ({ itemId, ...data })
    );

    return NextResponse.json({ conflicts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /check-duplicados]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
