export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Lista as folhas de diárias (mais recentes primeiro) com contagem e total.
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const folhas = await prisma.diariaFolha.findMany({
    orderBy: { data: "desc" },
    include: { grupos: { select: { _count: { select: { itens: true } } } } },
  });
  const data = folhas.map((f) => {
    const qtde = f.grupos.reduce((s, g) => s + g._count.itens, 0);
    const { grupos: _g, ...rest } = f;
    return { ...rest, qtdePessoas: qtde, qtdeBlocos: f.grupos.length };
  });
  return NextResponse.json({ data });
}

// Cria uma folha de diárias para uma data. Se vierem colaboradorIds
// (pré-seleção do popup), já monta os blocos POR SETOR do cadastro, com um
// item (valor 0) por colaborador — os valores/serviços são editados em seguida.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => ({}));
  if (!b.data) return NextResponse.json({ error: "Informe a data da folha." }, { status: 400 });
  const ids: string[] = Array.isArray(b.colaboradorIds) ? b.colaboradorIds.filter((x: unknown) => typeof x === "string") : [];
  const turno = b.turno === "NOITE" ? "NOITE" : "DIA";

  const folha = await prisma.$transaction(async (tx) => {
    const f = await tx.diariaFolha.create({
      data: {
        data: new Date(`${String(b.data).slice(0, 10)}T12:00:00`),
        turno,
        observacoes: b.observacoes?.trim() || null,
        criadoPor: auth.session.nome ?? null,
      },
    });
    if (ids.length) {
      const colabs = await tx.colaborador.findMany({
        where: { id: { in: ids } },
        select: { id: true, valorDiaria: true, setor: { select: { nome: true } } },
        orderBy: { nome: "asc" },
      });
      type C = (typeof colabs)[number];
      const porSetor = new Map<string, C[]>();
      for (const c of colabs) {
        const s = c.setor?.nome ?? "";
        porSetor.set(s, [...(porSetor.get(s) ?? []), c]);
      }
      let go = 0;
      for (const [setor, lista] of Array.from(porSetor.entries()).sort((a, z) => a[0].localeCompare(z[0]))) {
        const grupo = await tx.diariaGrupo.create({ data: { folhaId: f.id, setor: setor || null, turno, ordem: go++ } });
        await tx.diariaItem.createMany({
          data: lista.map((c, i) => ({
            grupoId: grupo.id, colaboradorId: c.id, ordem: i,
            // Valor base da diária do cadastro + escala padrão já preenchida.
            valor: c.valorDiaria ?? 0,
            manha: turno === "DIA" ? "08:00 - 12:00" : null,
            tarde: turno === "DIA" ? "13:00 - 17:00" : null,
          })),
        });
      }
    }
    return f;
  });
  return NextResponse.json({ data: folha }, { status: 201 });
}
