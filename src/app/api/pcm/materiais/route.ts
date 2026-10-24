export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo as db } from "@/lib/prisma";
import { importarMateriaisEngeman, itensParaDePara, propagarVinculo, sugestoes } from "@/lib/manutencao/materiais";
import { engemanErrorResponse } from "@/lib/engeman";

// De-para materiais do Engeman → produtos do estoque do ERP (cadastro do grupo).
// GET ?situacao=PENDENTES|LIGADOS|SEM_PRODUTO|TODOS — lista com até 3 sugestões nos não ligados.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const sit = req.nextUrl.searchParams.get("situacao") ?? "PENDENTES";
  const where =
    sit === "PENDENTES" ? { itemId: null, situacao: { not: "SEM_PRODUTO" } }
    : sit === "LIGADOS" ? { itemId: { not: null } }
    : sit === "SEM_PRODUTO" ? { situacao: "SEM_PRODUTO" }
    : {};
  const [lista, contagem] = await Promise.all([
    db.manutMaterialLegado.findMany({
      where, orderBy: [{ usos: "desc" }, { descricao: "asc" }],
      include: { item: { select: { id: true, codigo: true, descricao: true } }, _count: { select: { kits: true, pecas: true } } },
    }),
    db.manutMaterialLegado.groupBy({ by: ["situacao"], _count: true, _sum: { usos: true } }),
  ]);
  const itens = lista.some((m) => !m.itemId) ? await itensParaDePara() : [];
  const data = lista.map((m) => ({ ...m, sugestoes: m.itemId ? [] : sugestoes(m.descricao, itens, 3) }));
  return NextResponse.json({ data, contagem });
}

// POST { codMat, itemId }            → liga ao produto (MANUAL)
//      { codMat, semProduto: true }  → marca que não há produto equivalente
//      { codMat, desfazer: true }    → volta a pendente
//      { acao: "confirmarSugestoes", codMats: number[] } → aceita a 1ª sugestão de cada
//      { acao: "importar", aplicar }  → lê do Engeman (prévia/aplicar) — só ADMIN
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (b.acao === "importar") {
    if (auth.session.perfil !== "ADMIN") return NextResponse.json({ error: "Só administradores." }, { status: 403 });
    try {
      return NextResponse.json({ data: await importarMateriaisEngeman({ aplicar: b.aplicar === true }) });
    } catch (e) {
      return engemanErrorResponse("PCM /api/pcm/materiais", e);
    }
  }
  if (b.acao === "confirmarSugestoes") {
    const cods: number[] = Array.isArray(b.codMats) ? b.codMats.map(Number).filter(Number.isFinite) : [];
    const mats = await db.manutMaterialLegado.findMany({ where: { codMat: { in: cods }, itemId: null } });
    const itens = await itensParaDePara();
    let ligados = 0;
    for (const m of mats) {
      const s = sugestoes(m.descricao, itens, 1)[0];
      if (!s) continue;
      await db.manutMaterialLegado.update({ where: { codMat: m.codMat }, data: { itemId: s.id, situacao: "MANUAL", confirmadoPor: auth.session.nome } });
      await propagarVinculo(m.codMat, s.id);
      ligados++;
    }
    return NextResponse.json({ data: { ligados } });
  }
  const codMat = Number(b.codMat);
  const m = await db.manutMaterialLegado.findUnique({ where: { codMat } });
  if (!m) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  if (b.itemId) {
    const item = await db.item.findUnique({ where: { id: b.itemId }, select: { id: true } });
    if (!item) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    await db.manutMaterialLegado.update({ where: { codMat }, data: { itemId: item.id, situacao: "MANUAL", confirmadoPor: auth.session.nome } });
    await propagarVinculo(codMat, item.id, m.itemId);
  } else if (b.semProduto || b.desfazer) {
    await db.manutMaterialLegado.update({ where: { codMat }, data: { itemId: null, situacao: b.semProduto ? "SEM_PRODUTO" : "PENDENTE", confirmadoPor: auth.session.nome } });
    await propagarVinculo(codMat, null, m.itemId);
  } else {
    return NextResponse.json({ error: "Informe o produto." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
