export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// GET /api/pcm/planos-cadastro — planos da empresa com as aplicações (ativo × gatilho × próximo vencimento).
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const data = await prisma.manutPlano.findMany({
    orderBy: [{ ativo: "desc" }, { codigo: "asc" }],
    include: {
      tipo: { select: { sigla: true, nome: true } },
      equipe: { select: { nome: true } },
      _count: { select: { tarefas: true, materiais: true } },
      ativos: {
        include: { ativoRef: { select: { id: true, tag: true, nome: true } }, medidor: { select: { nome: true, unidade: true, acumulado: true } } },
        orderBy: { proximoVencimento: "asc" },
      },
    },
  });
  return NextResponse.json({ data });
}

// POST { codigo?, nome, tipoId, equipeId?, horasEstimadas?, exigeParada?, antecedenciaDias?, toleranciaPct?, baseNaConclusao?, observacoes? }
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Informe o nome do plano." }, { status: 400 });
  if (!b.tipoId) return NextResponse.json({ error: "Escolha o tipo de manutenção." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  let codigo = String(b.codigo ?? "").trim();
  if (!codigo) {
    const n = await prisma.manutPlano.count();
    codigo = String(n + 1).padStart(3, "0");
    while (await prisma.manutPlano.findFirst({ where: { codigo }, select: { id: true } })) codigo = String(Number(codigo) + 1).padStart(3, "0");
  }
  try {
    const p = await prisma.manutPlano.create({
      data: {
        empresaId, codigo, nome, tipoId: b.tipoId, equipeId: b.equipeId || null,
        horasEstimadas: b.horasEstimadas ? Number(b.horasEstimadas) : null, exigeParada: !!b.exigeParada,
        antecedenciaDias: b.antecedenciaDias != null && b.antecedenciaDias !== "" ? Number(b.antecedenciaDias) : 3,
        toleranciaPct: b.toleranciaPct != null && b.toleranciaPct !== "" ? Number(b.toleranciaPct) : 10,
        baseNaConclusao: b.baseNaConclusao !== false, observacoes: b.observacoes?.trim() || null,
      },
    });
    return NextResponse.json({ data: p }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe plano com esse código." }, { status: 409 });
    throw e;
  }
}
