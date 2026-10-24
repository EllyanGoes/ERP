import sql from "mssql";
import { prismaSemEscopo as db } from "@/lib/prisma";
import { getEngemanConfig } from "@/lib/engeman";
import { recalcularCustoOrdem } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// De-para dos materiais do Engeman → produtos (Item) do estoque do ERP. A
// Manutenção usa SÓ o estoque do ERP: o histórico de material das OS, os kits dos
// planos (CHKPLANO) e os sobressalentes (APLXMAT) passam a apontar para o Item.
// Descrição idêntica (normalizada) liga sozinho; o resto recebe sugestões por
// similaridade (mesma 1ª palavra + medidas compatíveis) e alguém confirma.
// ─────────────────────────────────────────────────────────────────────────────

const PARADAS = new Set(["X", "DE", "DA", "DO", "DAS", "DOS", "C", "P", "COM", "PARA", "E", "EM", "UND", "UN", "PC", "PCS"]);

/** Tokens normalizados: sem acento, números separados das letras ("3.25MM" → "3.25","MM"), "2.50" → "2.5". */
export function tokensMaterial(s: string): string[] {
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)([A-Z])/g, "$1 $2").replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/[^A-Z0-9./ ]+/g, " ");
  return t.split(/\s+/).map((x) => x.replace(/^[./]+|[./]+$/g, ""))
    .map((x) => (/^\d+\.\d+$/.test(x) ? String(parseFloat(x)) : x))
    .filter((x) => x && !PARADAS.has(x));
}
const ehNumero = (x: string) => /\d/.test(x);
export const chaveExata = (s: string) => tokensMaterial(s).join(" ");

/** Nota 0–1 de semelhança entre a descrição do Engeman e a do produto. */
export function notaSemelhanca(a: string[], b: string[]): number {
  if (!a.length || !b.length || a[0] !== b[0]) return 0;
  const na = a.filter(ehNumero), nb = b.filter(ehNumero);
  // medidas: as do menor conjunto precisam estar no maior (6206 ≠ 6205)
  const [menor, maior] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (!menor.every((x) => maior.includes(x))) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0, peso = 0;
  for (const x of Array.from(A)) { const w = ehNumero(x) ? 2 : 1; peso += w; if (B.has(x)) inter += w; }
  let pesoB = 0;
  for (const x of Array.from(B)) pesoB += ehNumero(x) ? 2 : 1;
  return inter / Math.max(peso, pesoB);
}

type ItemBase = { id: string; codigo: string; descricao: string; tokens: string[] };

export async function itensParaDePara(): Promise<ItemBase[]> {
  const itens = await db.item.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true } });
  return itens.map((i) => ({ ...i, tokens: tokensMaterial(i.descricao) }));
}

export function sugestoes(descricao: string, itens: ItemBase[], max = 3) {
  const t = tokensMaterial(descricao);
  return itens
    .map((i) => ({ id: i.id, codigo: i.codigo, descricao: i.descricao, nota: notaSemelhanca(t, i.tokens) }))
    .filter((s) => s.nota >= 0.5)
    .sort((x, y) => y.nota - x.nota)
    .slice(0, max);
}

/**
 * Lê do Engeman os materiais usados (OS, planos, sobressalentes) e grava o de-para
 * pendente + as ligações legadas. Reexecutável. Liga sozinho o que tem descrição
 * idêntica a um produto do ERP.
 */
export async function importarMateriaisEngeman(opts: { aplicar: boolean }) {
  const pool = await sql.connect(await getEngemanConfig({ requestTimeout: 120000 }));
  let mats: { CODMAT: number; TAG: string | null; DESCRICAO: string; UN: string | null; USOS: number }[];
  let regs: { CODREGSER: number; CODMAT: number }[];
  let rxs: { CODRXMAT: number; CODMAT: number }[];
  let kits: { CODPLA: number; CODMAT: number; QTDE: number }[];
  let pecas: { CODAPL: number; CODMAT: number; QTDE: number }[];
  try {
    const q = async <T,>(s: string) => (await pool.request().query<T>(s)).recordset;
    mats = await q(`
      SELECT m.CODMAT, m.TAG, RTRIM(m.DESCRICAO) AS DESCRICAO, RTRIM(u.TAG) AS UN, ISNULL(z.USOS, 0) AS USOS
      FROM MATERIAL m
      LEFT JOIN UNIDADE u ON u.CODUNI = m.CODUNI
      JOIN (SELECT CODMAT, COUNT(*) USOS FROM (
              SELECT CODMAT FROM REGSERV WHERE CODMAT IS NOT NULL
              UNION ALL SELECT CODMAT FROM REGSERVXMAT WHERE CODMAT IS NOT NULL
              UNION ALL SELECT CODMAT FROM CHKPLANO WHERE CODMAT IS NOT NULL
              UNION ALL SELECT CODMAT FROM APLXMAT WHERE CODMAT IS NOT NULL) x GROUP BY CODMAT) z ON z.CODMAT = m.CODMAT`);
    regs = await q(`SELECT CODREGSER, CODMAT FROM REGSERV WHERE CODMAT IS NOT NULL`);
    rxs = await q(`SELECT CODRXMAT, CODMAT FROM REGSERVXMAT WHERE CODMAT IS NOT NULL`);
    kits = await q(`SELECT CODPLA, CODMAT, SUM(ISNULL(QTDE, 1)) AS QTDE FROM CHKPLANO WHERE CODMAT IS NOT NULL GROUP BY CODPLA, CODMAT`);
    pecas = await q(`SELECT CODAPL, CODMAT, SUM(ISNULL(QTDE, 1)) AS QTDE FROM APLXMAT WHERE CODMAT IS NOT NULL GROUP BY CODAPL, CODMAT`);
  } finally {
    await pool.close();
  }

  const itens = await itensParaDePara();
  const porChave = new Map<string, ItemBase[]>();
  for (const i of itens) { const k = i.tokens.join(" "); porChave.set(k, [...(porChave.get(k) ?? []), i]); }
  const existentes = new Map((await db.manutMaterialLegado.findMany({ select: { codMat: true, situacao: true } })).map((m) => [m.codMat, m.situacao]));

  let exatos = 0, sugeridos = 0, semSugestao = 0;
  const linhas = mats.map((m) => {
    const ex = porChave.get(chaveExata(m.DESCRICAO)) ?? [];
    if (ex.length === 1) { exatos++; return { m, situacao: "EXATO", itemId: ex[0].id, sug: null as null | { id: string; nota: number } }; }
    const s = sugestoes(m.DESCRICAO, itens, 1)[0];
    if (s) sugeridos++; else semSugestao++;
    return { m, situacao: s ? "SUGERIDO" : "PENDENTE", itemId: null as string | null, sug: s ? { id: s.id, nota: s.nota } : null };
  });
  const resumo = { materiais: mats.length, novos: mats.filter((m) => !existentes.has(m.CODMAT)).length, exatos, sugeridos, semSugestao, kits: kits.length, pecas: pecas.length };
  if (!opts.aplicar) return resumo;

  for (const l of linhas) {
    const atual = existentes.get(l.m.CODMAT);
    const base = { tag: l.m.TAG?.trim() || null, descricao: l.m.DESCRICAO || `Material ${l.m.CODMAT}`, unidade: l.m.UN || null, usos: l.m.USOS };
    if (!atual) {
      await db.manutMaterialLegado.create({ data: { codMat: l.m.CODMAT, ...base, situacao: l.situacao, itemId: l.itemId, sugestaoId: l.sug?.id ?? null, sugestaoNota: l.sug?.nota ?? null } });
    } else if (["PENDENTE", "SUGERIDO"].includes(atual)) {
      // não mexe no que alguém já decidiu (MANUAL / SEM_PRODUTO / EXATO)
      await db.manutMaterialLegado.update({ where: { codMat: l.m.CODMAT }, data: { ...base, situacao: l.situacao, itemId: l.itemId, sugestaoId: l.sug?.id ?? null, sugestaoNota: l.sug?.nota ?? null } });
    } else {
      await db.manutMaterialLegado.update({ where: { codMat: l.m.CODMAT }, data: base });
    }
  }
  // Ligações legadas: material das OS (por CODREGSER / CODRXMAT), kits e peças.
  const codPorLegado = new Map<string, number>([
    ...regs.map((r) => [`RS:${r.CODREGSER}`, r.CODMAT] as [string, number]),
    ...rxs.map((r) => [`RX:${r.CODRXMAT}`, r.CODMAT] as [string, number]),
  ]);
  const semCod = await db.manutOrdemMaterial.findMany({ where: { origem: "LEGADO", codMatLegado: null }, select: { id: true, legadoId: true } });
  const porCod = new Map<number, string[]>();
  for (const m of semCod) { const c = m.legadoId ? codPorLegado.get(m.legadoId) : undefined; if (c != null) porCod.set(c, [...(porCod.get(c) ?? []), m.id]); }
  for (const [codMat, ids] of Array.from(porCod.entries())) await db.manutOrdemMaterial.updateMany({ where: { id: { in: ids } }, data: { codMatLegado: codMat } });

  const conhecidos = new Set(mats.map((m) => m.CODMAT));
  const planoId = new Map((await db.manutPlano.findMany({ where: { legadoId: { not: null } }, select: { id: true, legadoId: true } })).map((p) => [p.legadoId!, p.id]));
  await db.manutPlanoKitLegado.createMany({
    data: kits.filter((k) => planoId.get(k.CODPLA) && conhecidos.has(k.CODMAT)).map((k) => ({ planoId: planoId.get(k.CODPLA)!, codMat: k.CODMAT, quantidade: k.QTDE || 1 })),
    skipDuplicates: true,
  });
  const ativoId = new Map((await db.manutAtivo.findMany({ select: { id: true, codApl: true } })).map((a) => [a.codApl, a.id]));
  await db.manutAtivoPecaLegado.createMany({
    data: pecas.filter((p) => ativoId.get(p.CODAPL) && conhecidos.has(p.CODMAT)).map((p) => ({ ativoId: ativoId.get(p.CODAPL)!, codMat: p.CODMAT, quantidade: p.QTDE || 1 })),
    skipDuplicates: true,
  });

  // Propaga os que já têm produto (exatos e decisões anteriores).
  const ligados = await db.manutMaterialLegado.findMany({ where: { itemId: { not: null } }, select: { codMat: true, itemId: true } });
  for (const l of ligados) await propagarVinculo(l.codMat, l.itemId!);
  return resumo;
}

/**
 * Aplica o produto do ERP a tudo que veio daquele material do Engeman: material
 * das OS (histórico), kit dos planos e sobressalentes dos ativos. itemId null
 * desfaz (OS voltam a só descrição; kits/peças criados pelo de-para saem).
 */
export async function propagarVinculo(codMat: number, itemId: string | null, anterior?: string | null) {
  const ordens = await db.manutOrdemMaterial.findMany({ where: { codMatLegado: codMat }, select: { ordemId: true } });
  await db.manutOrdemMaterial.updateMany({ where: { codMatLegado: codMat }, data: { itemId } });
  const kits = await db.manutPlanoKitLegado.findMany({ where: { codMat } });
  const pecas = await db.manutAtivoPecaLegado.findMany({ where: { codMat } });
  if (anterior && anterior !== itemId) {
    await db.manutPlanoMaterial.deleteMany({ where: { itemId: anterior, planoId: { in: kits.map((k) => k.planoId) } } });
    await db.manutAtivoPeca.deleteMany({ where: { itemId: anterior, ativoId: { in: pecas.map((p) => p.ativoId) } } });
  }
  if (itemId) {
    for (const k of kits) {
      await db.manutPlanoMaterial.upsert({
        where: { planoId_itemId: { planoId: k.planoId, itemId } },
        update: {}, create: { planoId: k.planoId, itemId, quantidade: k.quantidade },
      });
    }
    for (const p of pecas) {
      await db.manutAtivoPeca.upsert({
        where: { ativoId_itemId: { ativoId: p.ativoId, itemId } },
        update: {}, create: { ativoId: p.ativoId, itemId, quantidade: p.quantidade },
      });
    }
  }
  // o custo do histórico não muda (valor do Engeman), mas recalcula por consistência das OS abertas
  const abertas = await db.manutOrdem.findMany({
    where: { id: { in: Array.from(new Set(ordens.map((o) => o.ordemId))) }, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
    select: { id: true },
  });
  for (const o of abertas) await recalcularCustoOrdem(o.id);
}
