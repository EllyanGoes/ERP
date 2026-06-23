export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Relatório de preço médio de mercado por produto. Agrega os preços coletados
// dos concorrentes (ConcorrentePreco): por Item do catálogo quando vinculado,
// senão pelo nome do produto avulso. Compara com o nosso preço de venda.
export async function GET() {
  const precos = await prisma.concorrentePreco.findMany({
    select: {
      itemId: true,
      produtoNome: true,
      preco: true,
      concorrenteId: true,
      item: { select: { codigo: true, descricao: true, precoVenda: true } },
    },
  });

  type Grupo = {
    itemId: string | null;
    produtoNome: string;
    codigo: string | null;
    nossoPreco: number | null;
    precos: number[];
    concorrentes: Set<string>;
  };
  const map = new Map<string, Grupo>();

  for (const p of precos) {
    const chave = p.itemId ? `item:${p.itemId}` : `nome:${p.produtoNome.trim().toLowerCase()}`;
    let g = map.get(chave);
    if (!g) {
      g = {
        itemId: p.itemId,
        produtoNome: p.item?.descricao ?? p.produtoNome,
        codigo: p.item?.codigo ?? null,
        nossoPreco: p.item?.precoVenda != null ? Number(p.item.precoVenda) : null,
        precos: [],
        concorrentes: new Set(),
      };
      map.set(chave, g);
    }
    g.precos.push(Number(p.preco));
    g.concorrentes.add(p.concorrenteId);
  }

  const data = Array.from(map.values())
    .map((g) => {
      const n = g.precos.length;
      const soma = g.precos.reduce((s, v) => s + v, 0);
      const media = n ? soma / n : 0;
      const menor = Math.min(...g.precos);
      const maior = Math.max(...g.precos);
      const delta = g.nossoPreco != null ? g.nossoPreco - media : null;
      const deltaPct = g.nossoPreco != null && media !== 0 ? ((g.nossoPreco - media) / media) * 100 : null;
      return {
        itemId: g.itemId,
        produtoNome: g.produtoNome,
        codigo: g.codigo,
        nossoPreco: g.nossoPreco,
        mediaMercado: media,
        menor,
        maior,
        qtdCotacoes: n,
        qtdConcorrentes: g.concorrentes.size,
        delta,
        deltaPct,
      };
    })
    .sort((a, b) => a.produtoNome.localeCompare(b.produtoNome));

  return NextResponse.json({ data });
}
