export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaBancariaSchema } from "@/lib/validations/financeiro";
import { saldosTodasContas } from "@/lib/financeiro";

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const [contas, saldos] = await Promise.all([
    prisma.contaBancaria.findMany({
      include: { banco: { select: { id: true, nome: true } } },
      orderBy: { nome: "asc" },
    }),
    saldosTodasContas(),
  ]);
  const data = contas.map((c) => ({ ...c, saldoAtual: saldos.get(c.id) ?? Number(c.saldoInicial) }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const parsed = contaBancariaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const conta = await prisma.contaBancaria.create({
    data: {
      nome: parsed.data.nome,
      bancoId: parsed.data.bancoId || null,
      agencia: parsed.data.agencia || null,
      numero: parsed.data.numero || null,
      tipo: parsed.data.tipo,
      saldoInicial: parsed.data.saldoInicial,
      ativo: parsed.data.ativo,
    },
  });
  return NextResponse.json({ data: conta }, { status: 201 });
}
