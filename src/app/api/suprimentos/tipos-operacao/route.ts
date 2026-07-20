export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// TES (Tipo de Entrada e Saída): preset de COMPORTAMENTO operacional. NÃO tem
// campo de conta contábil de destino nem de CIF/Despesa/Imobilizado — o destino é
// decidido pela precedência do material lendo o centro (e o bem). Ver o modelo.
const schema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  sentido: z.enum(["ENTRADA", "SAIDA"]).default("ENTRADA"),
  estocavel: z.boolean().default(true),
  almoxarifadoDefaultId: z.string().optional().nullable(),
  compoeCusto: z.boolean().default(false),
  permiteCapitalizar: z.boolean().default(false),
  geraFinanceiro: z.boolean().default(true),
  geraFiscal: z.boolean().default(true),
  cfop: z.string().optional().nullable(),
  naturezaFiscal: z.string().optional().nullable(),
  centroCustoSugeridoId: z.string().optional().nullable(),
  // Natureza financeira sugerida (default do título gerado pelo DE, não trava).
  naturezaSugeridaId: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
});

export async function GET() {
  const data = await prisma.tipoOperacao.findMany({
    orderBy: [{ sentido: "asc" }, { nome: "asc" }],
    include: {
      almoxarifadoDefault: { select: { id: true, nome: true } },
      centroCustoSugerido: { select: { id: true, codigo: true, nome: true } },
      naturezaSugerida: { select: { id: true, codigo: true, nome: true } },
    },
  });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const d = body.data;
  const record = await prisma.tipoOperacao.create({
    data: {
      ...d,
      almoxarifadoDefaultId: d.almoxarifadoDefaultId || null,
      centroCustoSugeridoId: d.centroCustoSugeridoId || null,
      naturezaSugeridaId: d.naturezaSugeridaId || null,
      cfop: d.cfop || null,
      naturezaFiscal: d.naturezaFiscal || null,
    },
  });
  return NextResponse.json(record, { status: 201 });
}
