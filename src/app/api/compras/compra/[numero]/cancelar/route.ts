export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cancelarCompra, ErroCancelamento } from "@/lib/cancelar-compra";

// Cancela a compra inteira (SC, cotação, pedidos e aprovações pendentes).
// Body: { empresaId, motivo }. Ver lib/cancelar-compra.ts.
export async function POST(req: NextRequest, { params }: { params: { numero: string } }) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const motivo = String(body.motivo ?? "").trim();
  const empresaId = String(body.empresaId ?? "");
  if (!motivo) return NextResponse.json({ error: "Informe o motivo do cancelamento." }, { status: 400 });
  if (!empresaId) return NextResponse.json({ error: "Empresa da compra não informada." }, { status: 400 });

  try {
    const resultado = await prisma.$transaction((tx) =>
      cancelarCompra(tx, { empresaId, numeroCompra: decodeURIComponent(params.numero), motivo }),
    );
    return NextResponse.json({ data: resultado });
  } catch (e) {
    if (e instanceof ErroCancelamento) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
