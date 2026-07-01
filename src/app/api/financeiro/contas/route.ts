export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { contaBancariaSchema } from "@/lib/validations/financeiro";
import { saldosTodasContas } from "@/lib/financeiro";
import { garantirContaContabilBanco } from "@/lib/conta-contabil";

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const [contas, saldos] = await Promise.all([
    prisma.contaBancaria.findMany({
      // A transitória de compensação (Encontro de Contas) aparece na lista, mas
      // sinalizada e protegida (não é banco de verdade); vai por último.
      include: {
        banco: { select: { id: true, nome: true } },
        contasContabeis: { select: { id: true, codigo: true, nome: true }, take: 1 },
      },
      orderBy: [{ compensacao: "asc" }, { nome: "asc" }],
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
      ehTerceiro: parsed.data.ehTerceiro,
      terceiroNome: parsed.data.ehTerceiro ? (parsed.data.terceiroNome?.trim() || null) : null,
    },
  });
  // Vincula a conta ao plano de contas: empresa → Disponibilidades (1.1.1);
  // terceiros → "Contas de Terceiros" (1.1.6).
  await garantirContaContabilBanco(conta.id).catch(() => {});

  return NextResponse.json({ data: conta }, { status: 201 });
}
