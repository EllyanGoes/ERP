export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { garantirContaContabilFornecedor } from "@/lib/conta-contabil";
import { z } from "zod";

const schema = z.object({
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]).default("JURIDICA"),
  razaoSocial: z.string().min(1),
  nomeFantasia: z.string().optional(),
  cpfCnpj: z.string().optional().nullable(),
  ie: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  contato: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  observacoes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("q") ?? "";
  const ativo = req.nextUrl.searchParams.get("ativo");

  const where: any = {};
  if (search) {
    where.OR = [
      { razaoSocial: { contains: search, mode: "insensitive" } },
      { nomeFantasia: { contains: search, mode: "insensitive" } },
      { cpfCnpj: { contains: search } },
    ];
  }
  // Aceita ativo=true|1 (ativos) e ativo=false|0 (inativos). Antes só "true"
  // batia, então chamadas com ?ativo=1 (financeiro) caíam em ativo=false e a
  // lista vinha vazia.
  if (ativo !== null) where.ativo = ativo === "true" || ativo === "1";

  const data = await prisma.fornecedor.findMany({
    where,
    orderBy: { razaoSocial: "asc" },
    include: { _count: { select: { produtos: true, pedidosCompra: true } } },
  });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("empresa");
  if (!auth.ok) return auth.response;

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  // Normalize empty/blank CNPJ: omit the field so Prisma stores NULL without type conflict
  const cpfCnpjValue = body.data.cpfCnpj?.trim() || undefined;
  const { cpfCnpj: _ignored, ...rest } = body.data;
  const data = cpfCnpjValue ? { ...rest, cpfCnpj: cpfCnpjValue } : rest;
  try {
    const record = await prisma.fornecedor.create({ data });
    // Cria (best-effort) a conta contábil analítica do fornecedor.
    await garantirContaContabilFornecedor(record.id).catch(() => null);
    return NextResponse.json(record, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "CPF/CNPJ já cadastrado por outro fornecedor" }, { status: 409 });
    }
    console.error("[POST /fornecedores]", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Erro ao salvar" }, { status: 500 });
  }
}
