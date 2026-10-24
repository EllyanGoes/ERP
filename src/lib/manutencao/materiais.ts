import { prismaSemEscopo as db } from "@/lib/prisma";
import { recalcularCustoOrdem } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// De-para dos materiais que vieram do Engeman → produtos (Item) do estoque do ERP.
// A Manutenção usa SÓ o estoque do ERP: o histórico de material das OS, os kits
// dos planos e os sobressalentes passam a apontar para o Item. A leitura do
// Engeman já foi feita (24/10/2026, 513 materiais em ManutMaterialLegado); aqui
// fica só a ligação: sugestões por similaridade (mesma 1ª palavra + medidas
// compatíveis) e a propagação quando alguém confirma.
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
