export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { sincronizarContaContabilBanco } from "@/lib/conta-contabil";
import { saldosTodasContas } from "@/lib/financeiro";

// Administradoras de cartão (adquirentes). Cada uma nasce com uma ContaBancaria
// tipo CARTAO ("banco" da administradora), cujo razão vive sob 1.1.8 "Cartões a
// Receber" — a venda no cartão credita essa conta e o repasse a zera.

const criarSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  cnpj: z.string().trim().optional().nullable(),
});

export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const [admins, saldos] = await Promise.all([
    prisma.administradoraCartao.findMany({
      include: { _count: { select: { maquinetas: true } } },
      orderBy: { nome: "asc" },
    }),
    saldosTodasContas(),
  ]);
  // AdministradoraCartao guarda só o id da conta (sem relation) — resolve à parte.
  const contas = await prisma.contaBancaria.findMany({
    where: { id: { in: admins.map((a) => a.contaBancariaId) } },
    select: { id: true, nome: true, contasContabeis: { select: { id: true, codigo: true }, take: 1 } },
  });
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const data = admins.map((a) => ({
    ...a,
    contaBancaria: contaPorId.get(a.contaBancariaId) ?? null,
    saldoAtual: saldos.get(a.contaBancariaId) ?? 0,
  }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  const nome = parsed.data.nome;

  const dup = await prisma.administradoraCartao.findFirst({ where: { nome }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "Já existe uma administradora com esse nome." }, { status: 422 });

  // Conta CARTAO + administradora na MESMA transação (o prisma escopado carimba
  // a empresa da sessão nas duas). A conta contábil (analítica 1.1.8.x) é criada
  // pós-commit — best-effort, idempotente.
  const admin = await prisma.$transaction(async (tx) => {
    const conta = await tx.contaBancaria.create({
      data: { nome, tipo: "CARTAO", saldoInicial: 0 },
      select: { id: true },
    });
    return tx.administradoraCartao.create({
      data: { nome, cnpj: parsed.data.cnpj?.trim() || null, contaBancariaId: conta.id },
    });
  });
  await sincronizarContaContabilBanco(admin.contaBancariaId)
    .catch((e) => console.error("[cartoes/administradoras] conta contábil:", e));

  return NextResponse.json({ data: admin }, { status: 201 });
}
