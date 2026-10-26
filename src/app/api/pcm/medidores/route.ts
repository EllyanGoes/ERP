export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { ritmoMedio } from "@/lib/manutencao/gatilho";

// GET — medidores ativos da empresa com as últimas leituras (leituras[0] = a mais recente),
// o ritmo médio de uso (unidades/dia, p/ prever quando o marco chega) e o próximo marco de plano.
export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const ativos = await prisma.manutAtivo.findMany({ where: { ativo: true, medidores: { some: { ativo: true } } }, select: { id: true } });
  const data = await prismaSemEscopo.manutMedidor.findMany({
    where: { ativo: true, ativoId: { in: ativos.map((a) => a.id) } },
    include: {
      ativoRef: { select: { id: true, tag: true, nome: true } },
      leituras: { orderBy: { data: "desc" }, take: 12 },
      planos: { where: { ativo: true }, select: { proximaMedida: true, plano: { select: { nome: true } } }, orderBy: { proximaMedida: "asc" } },
    },
    orderBy: { ativoRef: { tag: "asc" } },
  });
  return NextResponse.json({ data: data.map((m) => ({ ...m, ritmoDia: ritmoMedio(m.leituras) })) });
}

// POST { acao: "criar", ativoId, nome, unidade } | { acao: "leitura", medidorId, valor, data?, trocaMedidor? }
// Leitura menor que o acumulado é bloqueada, salvo troca de medidor (zera e recomeça).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  if (b.acao === "criar") {
    const ativo = await prisma.manutAtivo.findUnique({ where: { id: b.ativoId ?? "" }, select: { id: true } });
    if (!ativo) return NextResponse.json({ error: "Ativo não encontrado." }, { status: 404 });
    const nome = String(b.nome ?? "").trim() || "Horímetro";
    const m = await prismaSemEscopo.manutMedidor.create({ data: { ativoId: ativo.id, nome, unidade: String(b.unidade ?? "h").trim() || "h", acumulado: Number(b.acumulado) || 0 } });
    return NextResponse.json({ data: m }, { status: 201 });
  }
  if (b.acao === "leitura") {
    const med = await prismaSemEscopo.manutMedidor.findUnique({ where: { id: b.medidorId ?? "" }, include: { ativoRef: { select: { id: true } } } });
    const visivel = med ? await prisma.manutAtivo.findUnique({ where: { id: med.ativoId }, select: { id: true } }) : null;
    if (!med || !visivel) return NextResponse.json({ error: "Medidor não encontrado." }, { status: 404 });
    const valor = Number(b.valor);
    if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: "Leitura inválida." }, { status: 400 });
    if (valor < Number(med.acumulado) && !b.trocaMedidor) {
      return NextResponse.json({ error: `Leitura menor que a atual (${Number(med.acumulado)} ${med.unidade}). Se o medidor foi trocado, marque "troca de medidor".` }, { status: 422 });
    }
    const data = b.data ? new Date(b.data) : new Date();
    const primeira = (await prismaSemEscopo.manutLeitura.count({ where: { medidorId: med.id } })) === 0;
    // Planos por medidor deste medidor: a próxima revisão precisa acompanhar a régua
    // do medidor, senão a 1ª leitura real (ex.: 8.000 h sobre um alvo de 250 h
    // contado do zero) faz todos os planos vencerem de uma vez.
    //  • 1ª leitura: o plano passa a contar a partir dela (próxima = leitura + intervalo).
    //  • troca de medidor: mantém o que faltava (próxima = leitura + (próxima antiga − acumulado antigo)).
    const planos = primeira || b.trocaMedidor
      ? await prismaSemEscopo.manutPlanoAtivo.findMany({ where: { medidorId: med.id, intervaloMedida: { not: null } }, select: { id: true, intervaloMedida: true, proximaMedida: true } })
      : [];
    const acumAntigo = Number(med.acumulado);
    await prismaSemEscopo.$transaction([
      prismaSemEscopo.manutLeitura.create({ data: { medidorId: med.id, data, valor, origem: b.trocaMedidor ? "troca de medidor" : "manual", criadoPor: auth.session.nome } }),
      prismaSemEscopo.manutMedidor.update({ where: { id: med.id }, data: { acumulado: valor } }),
      ...planos.map((pa) => {
        const falta = !primeira && pa.proximaMedida != null ? Math.max(0, Number(pa.proximaMedida) - acumAntigo) : Number(pa.intervaloMedida);
        return prismaSemEscopo.manutPlanoAtivo.update({
          where: { id: pa.id },
          data: { proximaMedida: valor + falta, ...(primeira ? { ultimaMedida: valor } : {}) },
        });
      }),
    ]);
    return NextResponse.json({ ok: true, planosRecalculados: planos.length });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
