export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { calcularAlocacao, soDigitos, STATUS_ABERTOS, type TituloSaldo } from "@/lib/compensacao";
import { z } from "zod";

const schema = z.object({
  cpfCnpj: z.string().min(11),
  clienteId: z.string().min(1),
  fornecedorId: z.string().min(1),
  receberIds: z.array(z.string()).min(1),
  pagarIds: z.array(z.string()).min(1),
  modoResiduo: z.enum(["PARCIAL", "NOVA_PARCELA"]).default("PARCIAL"),
  observacoes: z.string().optional(),
});

// Lista as compensações da empresa ativa.
export async function GET() {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const rows = await prismaSemEscopo.compensacao.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, numero: true, cpfCnpj: true, data: true, valorCompensado: true, modoResiduo: true, status: true,
      cliente: { select: { razaoSocial: true } }, fornecedor: { select: { razaoSocial: true } },
      _count: { select: { itens: true } },
    },
  });
  const data = rows.map((r) => ({
    id: r.id, numero: r.numero, cpfCnpj: r.cpfCnpj, data: r.data,
    valorCompensado: decimalToNumber(r.valorCompensado), modoResiduo: r.modoResiduo, status: r.status,
    parceiro: r.cliente?.razaoSocial ?? r.fornecedor?.razaoSocial ?? r.cpfCnpj,
    qtdItens: r._count.itens,
  }));
  return NextResponse.json({ data });
}

// Cria uma compensação em RASCUNHO com os títulos selecionados. A contabilização
// só acontece na confirmação.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  const f = parsed.data;
  const dig = soDigitos(f.cpfCnpj);

  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({
      where: { empresaId, id: { in: f.receberIds }, status: { in: [...STATUS_ABERTOS] }, intragrupo: false },
      select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true, cliente: { select: { cpfCnpj: true } } },
    }),
    prismaSemEscopo.contaPagar.findMany({
      where: { empresaId, id: { in: f.pagarIds }, status: { in: [...STATUS_ABERTOS] }, intragrupo: false },
      select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true, fornecedor: { select: { cpfCnpj: true } } },
    }),
  ]);

  // Todos os títulos devem ser do mesmo parceiro (mesmo CNPJ por dígitos).
  const mesmoParceiro =
    crs.every((c) => soDigitos(c.cliente?.cpfCnpj) === dig) &&
    cps.every((c) => soDigitos(c.fornecedor?.cpfCnpj) === dig);
  if (!crs.length || !cps.length || !mesmoParceiro) {
    return NextResponse.json({ error: "Selecione títulos a receber e a pagar em aberto do mesmo parceiro." }, { status: 400 });
  }

  const saldo = (t: { valorOriginal: unknown; valorPago: unknown }) =>
    Math.round((decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago)) * 100) / 100;
  const receber: TituloSaldo[] = crs.map((c) => ({ id: c.id, saldo: saldo(c), dataVencimento: c.dataVencimento }));
  const pagar: TituloSaldo[] = cps.map((c) => ({ id: c.id, saldo: saldo(c), dataVencimento: c.dataVencimento }));

  const aloc = calcularAlocacao(receber, pagar, f.modoResiduo);
  if (!aloc) return NextResponse.json({ error: "Nada a compensar (saldo mínimo zero)." }, { status: 400 });

  const numero = generateDocNumber("EC", await proximaSequenciaDaEmpresa(empresaId, "EC"));
  const criado = await prismaSemEscopo.compensacao.create({
    data: {
      empresaId, numero, cpfCnpj: dig, clienteId: f.clienteId, fornecedorId: f.fornecedorId,
      valorCompensado: aloc.min, modoResiduo: f.modoResiduo, status: "RASCUNHO",
      observacoes: f.observacoes ?? null, criadoPor: auth.session.nome ?? null,
      itens: {
        create: [
          ...aloc.aplicR.map((a) => ({ tipo: "RECEBER", contaReceberId: a.id, valorAplicado: a.aplicado })),
          ...aloc.aplicP.map((a) => ({ tipo: "PAGAR", contaPagarId: a.id, valorAplicado: a.aplicado })),
        ],
      },
    },
    select: { id: true, numero: true },
  });

  return NextResponse.json({ data: criado });
}
