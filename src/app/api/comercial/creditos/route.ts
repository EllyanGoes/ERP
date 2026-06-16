export const dynamic = "force-dynamic";
// Créditos (vales) de cliente: lista os ATIVO + saldo. ?clienteId= filtra um cliente.
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const clienteId = searchParams.get("clienteId") || undefined;
  const status = searchParams.get("status") ?? "ATIVO";

  const creditos = await prisma.creditoCliente.findMany({
    where: {
      ...(clienteId ? { clienteId } : {}),
      ...(status === "todos" ? {} : { status: status as "ATIVO" | "USADO" | "CANCELADO" }),
    },
    orderBy: { createdAt: "desc" },
  });

  const data = creditos.map((c) => ({
    id: c.id,
    numero: c.numero,
    clienteId: c.clienteId,
    valor: decimalToNumber(c.valor),
    valorUsado: decimalToNumber(c.valorUsado),
    saldo: decimalToNumber(c.valor) - decimalToNumber(c.valorUsado),
    status: c.status,
    observacoes: c.observacoes,
    createdAt: c.createdAt,
  }));
  const saldo = data.filter((c) => c.status === "ATIVO").reduce((s, c) => s + c.saldo, 0);

  return NextResponse.json({ data, saldo });
}
