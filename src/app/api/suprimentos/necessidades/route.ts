export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { getSession } from "@/lib/auth";

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

  if (!body.filialId) {
    return NextResponse.json({ error: "Filial é obrigatória" }, { status: 400 });
  }
  if (!body.localEstoqueId) {
    return NextResponse.json({ error: "Local de Estoque é obrigatório" }, { status: 400 });
  }
  if (!body.motivo?.trim()) {
    return NextResponse.json({ error: "Motivo de compra é obrigatório" }, { status: 400 });
  }
  if (!body.itens || body.itens.length === 0) {
    return NextResponse.json({ error: "Adicione pelo menos um item" }, { status: 400 });
  }

  // Multiempresa: a solicitação pode nascer para outra empresa do grupo
  // (modo compras em grupo). Valida contra as empresas da sessão; a numeração
  // sai da sequência da empresa dona do documento.
  const session = await getSession();
  const empresasPermitidas = session?.empresaIds ?? [];
  let empresaAlvo = session?.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  if (body.empresaId && body.empresaId !== empresaAlvo) {
    if (!empresasPermitidas.includes(body.empresaId)) {
      return NextResponse.json({ error: "Empresa não permitida para este usuário" }, { status: 403 });
    }
    empresaAlvo = body.empresaId;
  }
  const numero = generateSimpleDocNumber("SC", await proximaSequenciaDaEmpresa(empresaAlvo, "SC"));

  const necessidade = await prisma.$transaction(async (tx) => {
    const record = await tx.necessidadeCompra.create({
      data: {
        numero,
        empresaId:            empresaAlvo,
        status:               "RASCUNHO",
        solicitante:          body.solicitante?.trim()           || null,
        colaboradorId:        body.colaboradorId                 || null,
        setorId:              body.setorId                       || null,
        justificativa:        body.justificativa?.trim()         || null,
        dataNecessidade:      body.dataNecessidade ? new Date(body.dataNecessidade) : null,
        observacoes:          body.observacoes?.trim()           || null,
        filialId:             body.filialId                      || null,
        prioridade:           body.prioridade ? parseInt(String(body.prioridade)) : 3,
        localEstoqueId:       body.localEstoqueId                || null,
        centroCustoId:        body.centroCustoId                 || null,
        tipoCompra:           body.tipoCompra?.trim()            || null,
        motivo:               body.motivo?.trim()                || null,
        categoria:            body.categoria?.trim()             || null,
        projeto:              body.projeto?.trim()               || null,
        classificacaoAuxiliar: body.classificacaoAuxiliar?.trim() || null,
        itens: {
          create: body.itens.map((item: { itemId: string; quantidade: number; observacao?: string; unidade?: string }) => ({
            itemId:     item.itemId,
            quantidade: parseFloat(String(item.quantidade)),
            observacao: item.observacao?.trim() || null,
            unidade:    item.unidade?.trim()    || null,
          })),
        },
      },
      include: { itens: true },
    });

    return record;
  });

  return NextResponse.json({ data: necessidade }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /necessidades]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
