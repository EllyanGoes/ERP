export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Tabela progressiva do INSS (empregados) guardada em Configuracao como JSON.
// Cada faixa tem o limite superior (ate) e a alíquota (%); o "ate" da última
// faixa é o teto de contribuição — salários acima contribuem só até ele.
const CHAVE = "rh.inss.tabela";

// Tabela vigente 2026 (default até o usuário configurar a dele).
const FAIXAS_PADRAO = [
  { ate: 1621.0, aliquota: 7.5 },
  { ate: 2902.84, aliquota: 9 },
  { ate: 4354.27, aliquota: 12 },
  { ate: 8475.55, aliquota: 14 },
];

export type FaixaInss = { ate: number; aliquota: number };

// GET /api/rh/inss-config — tabela salva (ou a padrão de 2026).
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const rec = await prisma.configuracao.findUnique({ where: { chave: CHAVE } });
  let faixas: FaixaInss[] = FAIXAS_PADRAO;
  if (rec?.valor) {
    try {
      const parsed = JSON.parse(rec.valor);
      if (Array.isArray(parsed?.faixas) && parsed.faixas.length) faixas = parsed.faixas;
    } catch { /* valor corrompido — volta à padrão */ }
  }
  return NextResponse.json({ data: { faixas } });
}

// PUT /api/rh/inss-config — salva a tabela (faixas ordenadas por limite).
export async function PUT(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const brutas = Array.isArray(body?.faixas) ? body.faixas : [];
  const faixas: FaixaInss[] = brutas
    .map((f: { ate: unknown; aliquota: unknown }) => ({ ate: Number(f.ate), aliquota: Number(f.aliquota) }))
    .filter((f: FaixaInss) => Number.isFinite(f.ate) && f.ate > 0 && Number.isFinite(f.aliquota) && f.aliquota >= 0 && f.aliquota <= 100)
    .sort((a: FaixaInss, b: FaixaInss) => a.ate - b.ate);
  if (!faixas.length) return NextResponse.json({ error: "Informe ao menos uma faixa válida." }, { status: 400 });

  await prisma.configuracao.upsert({
    where: { chave: CHAVE },
    update: { valor: JSON.stringify({ faixas }) },
    create: { chave: CHAVE, valor: JSON.stringify({ faixas }) },
  });
  return NextResponse.json({ data: { faixas } });
}
