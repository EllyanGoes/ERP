export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { indicadoresAno, conformidadeEmpresa, gravarSnapshot } from "@/lib/sst";

// GET /api/sst/indicadores?ano= — TF/TG por mês + histórico de conformidade (90 dias).
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const ano = parseInt(new URL(req.url).searchParams.get("ano") ?? "") || new Date().getFullYear();
  const [ind, historico] = await Promise.all([
    indicadoresAno(empresaId, ano),
    prismaSemEscopo.sstConformidadeSnapshot.findMany({ where: { empresaId, data: { gte: new Date(Date.now() - 90 * 86_400_000) } }, orderBy: { data: "asc" }, select: { data: true, totais: true } }),
  ]);
  return NextResponse.json({ data: { ...ind, historico } });
}

// PUT { ano, mes, horas, empregados?, observacoes? } — lança/edita horas do mês.
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const ano = Number(b.ano), mes = Number(b.mes), horas = Number(b.horas);
  if (!ano || !mes || mes < 1 || mes > 12 || !(horas >= 0)) return NextResponse.json({ error: "Informe ano, mês e horas." }, { status: 400 });
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const r = await prismaSemEscopo.sstHorasMes.upsert({
    where: { empresaId_ano_mes: { empresaId, ano, mes } },
    create: { empresaId, ano, mes, horas, empregados: b.empregados ? Number(b.empregados) : null, observacoes: b.observacoes?.trim() || null, criadoPor: auth.session.nome },
    update: { horas, empregados: b.empregados ? Number(b.empregados) : null, observacoes: b.observacoes?.trim() || null, atualizadoPor: auth.session.nome },
  });
  return NextResponse.json({ data: r });
}

// POST — grava o snapshot de hoje agora (botão "registrar foto de hoje").
export async function POST() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const c = await conformidadeEmpresa(empresaId);
  await gravarSnapshot(empresaId, c);
  return NextResponse.json({ ok: true });
}
