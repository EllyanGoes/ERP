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
      id: true, numero: true, data: true, valorCompensado: true, modoResiduo: true, motivo: true, status: true,
      observacoes: true, criadoPor: true, atualizadoPor: true, createdAt: true,
      itens: {
        select: {
          id: true, tipo: true, valorAplicado: true, juros: true, multa: true, desconto: true, acrescimo: true,
          contaReceber: { select: { numero: true, descricao: true, cliente: { select: { razaoSocial: true } } } },
          contaPagar: { select: { numero: true, descricao: true, fornecedor: { select: { razaoSocial: true } } } },
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
  const partes = Array.from(new Set(c.itens.map((i) => i.contaReceber?.cliente?.razaoSocial ?? i.contaPagar?.fornecedor?.razaoSocial).filter(Boolean) as string[]));

  return NextResponse.json({
    data: {
      id: c.id, numero: c.numero, data: c.data, status: c.status, modoResiduo: c.modoResiduo, motivo: c.motivo,
      valorCompensado: decimalToNumber(c.valorCompensado), observacoes: c.observacoes, criadoPor: c.criadoPor, atualizadoPor: c.atualizadoPor, createdAt: c.createdAt,
      parceiro: partes.length === 0 ? "—" : partes.length === 1 ? partes[0] : `${partes[0]} +${partes.length - 1}`,
      itens: c.itens.map((i) => ({
        id: i.id, tipo: i.tipo, valorAplicado: decimalToNumber(i.valorAplicado),
        juros: decimalToNumber(i.juros), multa: decimalToNumber(i.multa), desconto: decimalToNumber(i.desconto), acrescimo: decimalToNumber(i.acrescimo),
        numero: i.contaReceber?.numero ?? i.contaPagar?.numero ?? "",
        descricao: i.contaReceber?.descricao ?? i.contaPagar?.descricao ?? "",
        parte: i.contaReceber?.cliente?.razaoSocial ?? i.contaPagar?.fornecedor?.razaoSocial ?? "—",
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
