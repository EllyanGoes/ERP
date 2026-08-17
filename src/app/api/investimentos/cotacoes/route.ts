export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";

// POST /api/investimentos/cotacoes — atualiza o preço dos ativos que o usuário
// possui via brapi.dev (uma requisição por ticker: o plano gratuito não faz
// lote). Token opcional em BRAPI_TOKEN eleva o limite de chamadas.
export async function POST() {
  const auth = await requireModulo("investimentos");
  if (!auth.ok) return auth.response;

  const ativos = await prismaSemEscopo.investAtivo.findMany({
    where: { operacoes: { some: { usuarioId: auth.session.sub } } },
    select: { id: true, ticker: true },
  });
  if (ativos.length === 0) return NextResponse.json({ data: { atualizados: 0, falhas: [] } });

  const token = process.env.BRAPI_TOKEN;
  const falhas: string[] = [];
  let atualizados = 0;

  await Promise.all(ativos.map(async (a) => {
    try {
      const res = await fetch(
        `https://brapi.dev/api/quote/${a.ticker}${token ? `?token=${token}` : ""}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      const r = json?.results?.[0];
      const preco = Number(r?.regularMarketPrice);
      if (!res.ok || !(preco > 0)) { falhas.push(a.ticker); return; }
      await prismaSemEscopo.investAtivo.update({
        where: { id: a.id },
        data: { precoAtual: preco, precoAtualizadoEm: new Date(), nome: r.shortName || r.longName || undefined },
      });
      atualizados++;
    } catch {
      falhas.push(a.ticker);
    }
  }));

  return NextResponse.json({ data: { atualizados, falhas, semToken: !token } });
}
