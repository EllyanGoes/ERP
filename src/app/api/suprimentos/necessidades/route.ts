export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { ErroCompras, dadosDaSolicitacao, empresaDoDocumento, erroDaSolicitacao } from "@/lib/compras-fluxo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filialId = searchParams.get("filialId");
  const status   = searchParams.get("status");

  const data = await prisma.necessidadeCompra.findMany({
    where: {
      AND: [
        filialId ? { filialId } : {},
        status   ? { status: status as never } : {},
      ],
    },
    include: {
      filial:       { select: { id: true, razaoSocial: true } },
      localEstoque: { select: { id: true, nome: true } },
      centroCusto:  { select: { id: true, codigo: true, nome: true } },
      setor:        { select: { id: true, nome: true } },
      _count:       { select: { itens: true } },
      cotacoes: {
        select: {
          id: true, numero: true, status: true,
          pedidos: {
            select: {
              id: true, numero: true, status: true,
              conferencia: { select: { id: true, numero: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
      pedidosCompra: {
        select: {
          id: true, numero: true, status: true,
          conferencia: { select: { id: true, numero: true, status: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
      itens: {
        include: {
          item: {
            select: {
              id: true, codigo: true, descricao: true, unidadeMedida: true,
              unidade: { select: { sigla: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
  const body = await req.json();

  const erroSolicitacao = erroDaSolicitacao(body);
  if (erroSolicitacao) return NextResponse.json({ error: erroSolicitacao }, { status: 400 });

  const empresaAlvo = await empresaDoDocumento(body.empresaId);
  const numero = generateSimpleDocNumber("SC", await proximaSequenciaDaEmpresa(empresaAlvo, "SC"));

  const necessidade = await prisma.$transaction(async (tx) => {
    const record = await tx.necessidadeCompra.create({
      data: {
        numero,
        empresaId:            empresaAlvo,
        status:               "RASCUNHO",
        ...dadosDaSolicitacao(body),
      },
      include: { itens: true },
    });

    return record;
  });

  return NextResponse.json({ data: necessidade }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErroCompras) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /necessidades]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
