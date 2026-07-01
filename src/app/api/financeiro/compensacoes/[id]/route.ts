export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { decimalToNumber } from "@/lib/utils";

// Detalhe de uma compensação (itens + resíduo).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const c = await prismaSemEscopo.compensacao.findFirst({
    where: { id: params.id, empresaId },
    select: {
      id: true, numero: true, cpfCnpj: true, data: true, valorCompensado: true, modoResiduo: true, status: true,
      observacoes: true, criadoPor: true, createdAt: true,
      cliente: { select: { razaoSocial: true } }, fornecedor: { select: { razaoSocial: true } },
      itens: {
        select: {
          id: true, tipo: true, valorAplicado: true,
          contaReceber: { select: { numero: true, descricao: true } },
          contaPagar: { select: { numero: true, descricao: true } },
        },
      },
      residuosReceber: { select: { numero: true, valorOriginal: true, status: true } },
      residuosPagar: { select: { numero: true, valorOriginal: true, status: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });

  const residuos = [
    ...c.residuosReceber.map((r) => ({ tipo: "RECEBER" as const, numero: r.numero, valor: decimalToNumber(r.valorOriginal), status: r.status })),
    ...c.residuosPagar.map((r) => ({ tipo: "PAGAR" as const, numero: r.numero, valor: decimalToNumber(r.valorOriginal), status: r.status })),
  ];

  return NextResponse.json({
    data: {
      id: c.id, numero: c.numero, cpfCnpj: c.cpfCnpj, data: c.data, status: c.status, modoResiduo: c.modoResiduo,
      valorCompensado: decimalToNumber(c.valorCompensado), observacoes: c.observacoes, criadoPor: c.criadoPor, createdAt: c.createdAt,
      parceiro: c.cliente?.razaoSocial ?? c.fornecedor?.razaoSocial ?? c.cpfCnpj,
      itens: c.itens.map((i) => ({
        id: i.id, tipo: i.tipo, valorAplicado: decimalToNumber(i.valorAplicado),
        numero: i.contaReceber?.numero ?? i.contaPagar?.numero ?? "",
        descricao: i.contaReceber?.descricao ?? i.contaPagar?.descricao ?? "",
      })),
      residuos,
    },
  });
}

// Exclui uma compensação em RASCUNHO (ainda não contabilizada).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const c = await prismaSemEscopo.compensacao.findFirst({ where: { id: params.id, empresaId }, select: { status: true } });
  if (!c) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });
  if (c.status !== "RASCUNHO") return NextResponse.json({ error: "Só é possível excluir um rascunho." }, { status: 409 });
  await prismaSemEscopo.compensacao.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
