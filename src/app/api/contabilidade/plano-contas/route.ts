export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { proximoCodigo } from "@/lib/conta-contabil";
import { z } from "zod";

const schema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  paiId: z.string().min(1, "Conta pai é obrigatória"),
  tipo: z.enum(["SINTETICA", "ANALITICA"]),
  natureza: z.enum(["DEVEDORA", "CREDORA"]).optional(),
});

// GET → plano de contas contábil em árvore (raízes com filhos aninhados) + flat.
export async function GET() {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const todas = await prisma.contaContabil.findMany({
    orderBy: { codigo: "asc" },
  });

  type Node = (typeof todas)[number] & { filhos: Node[] };
  const byId = new Map<string, Node>();
  for (const c of todas) byId.set(c.id, { ...c, filhos: [] });
  const raizes: Node[] = [];
  for (const c of todas) {
    const node = byId.get(c.id)!;
    if (c.paiId && byId.has(c.paiId)) byId.get(c.paiId)!.filhos.push(node);
    else raizes.push(node);
  }

  return NextResponse.json({ data: raizes, flat: todas });
}

// POST → cria uma conta sob um pai. Código é gerado automaticamente; grupo é
// herdado do pai; natureza herda do pai (ou pode ser informada).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("contabilidade");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const pai = await prisma.contaContabil.findUnique({ where: { id: parsed.data.paiId } });
  if (!pai) return NextResponse.json({ error: "Conta pai não encontrada" }, { status: 400 });

  const codigo = await proximoCodigo(pai.id, pai.codigo);
  const conta = await prisma.contaContabil.create({
    data: {
      codigo,
      nome: parsed.data.nome,
      grupo: pai.grupo,
      natureza: parsed.data.natureza ?? pai.natureza,
      tipo: parsed.data.tipo,
      nivel: pai.nivel + 1,
      aceitaLancamento: parsed.data.tipo === "ANALITICA",
      paiId: pai.id,
      manual: true,
    },
  });
  return NextResponse.json({ data: conta }, { status: 201 });
}
