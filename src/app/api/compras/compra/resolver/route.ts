export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Número da compra a partir de um documento (SC/CT/PC/DE). Usado para levar os
// links antigos das telas de etapa para a página única da compra.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const etapa = sp.get("etapa");
  const id = sp.get("id") ?? "";
  const select = { numeroCompra: true, empresaId: true } as const;

  const doc =
    etapa === "solicitacao" ? await prisma.necessidadeCompra.findUnique({ where: { id }, select }) :
    etapa === "cotacao"     ? await prisma.cotacaoCompra.findUnique({ where: { id }, select }) :
    etapa === "pedido"      ? await prisma.pedidoCompra.findUnique({ where: { id }, select: { ...select, intragrupo: true } }) :
    etapa === "entrada"     ? await prisma.conferenciaCompra.findUnique({ where: { id }, select }) :
    null;

  // Espelho intragrupo não é processo de compra: segue na tela própria.
  if (!doc || !doc.numeroCompra || ("intragrupo" in doc && doc.intragrupo)) {
    return NextResponse.json({ numeroCompra: null });
  }
  return NextResponse.json({ numeroCompra: doc.numeroCompra, empresaId: doc.empresaId });
}
