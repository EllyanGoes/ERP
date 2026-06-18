export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma, empresasDoEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";

// GET → seções (ordenadas) + contas de resultado com sua seção/ordem.
export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const [secoes, contas] = await Promise.all([
    prisma.dRESecao.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true, operacao: true, ordem: true } }),
    prisma.contaContabil.findMany({
      where: { grupo: "RESULTADO", tipo: "ANALITICA" },
      orderBy: [{ ordemDre: "asc" }, { codigo: "asc" }],
      select: { id: true, codigo: true, nome: true, dreSecaoId: true, ordemDre: true },
    }),
  ]);
  return NextResponse.json({ secoes, contas });
}

// PUT { secoes:[{id?,nome,operacao,ordem}], contas:[{id,dreSecaoId,ordemDre}] }
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as {
    secoes?: { id?: string; nome: string; operacao: "SOMA" | "SUBTRAI"; ordem: number }[];
    contas?: { id: string; dreSecaoId: string | null; ordemDre: number }[];
  } | null;
  if (!body?.secoes) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const [empresaId] = await empresasDoEscopo();

  await prisma.$transaction(async (tx) => {
    // Upsert das seções; ids temporários (começando com "novo:") viram create.
    const idMap = new Map<string, string>();
    const mantidos: string[] = [];
    for (const s of body.secoes!) {
      if (s.id && !s.id.startsWith("novo:")) {
        await tx.dRESecao.update({ where: { id: s.id }, data: { nome: s.nome, operacao: s.operacao, ordem: s.ordem } });
        mantidos.push(s.id);
      } else {
        const nova = await tx.dRESecao.create({ data: { empresaId, nome: s.nome, operacao: s.operacao, ordem: s.ordem }, select: { id: true } });
        if (s.id) idMap.set(s.id, nova.id);
        mantidos.push(nova.id);
      }
    }
    // Remove seções da empresa que não estão mais na lista (contas serão realocadas pelo payload).
    await tx.dRESecao.deleteMany({ where: { empresaId, id: { notIn: mantidos.length ? mantidos : ["—"] } } });

    // Atribuição/ordem das contas (resolve ids temporários de seção).
    for (const c of body.contas ?? []) {
      const secaoId = c.dreSecaoId && c.dreSecaoId.startsWith("novo:") ? (idMap.get(c.dreSecaoId) ?? null) : c.dreSecaoId;
      await tx.contaContabil.update({ where: { id: c.id }, data: { dreSecaoId: secaoId, ordemDre: c.ordemDre } });
    }
  });

  return NextResponse.json({ ok: true });
}
