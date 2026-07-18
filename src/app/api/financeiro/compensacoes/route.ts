export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { calcularNetting, STATUS_ABERTOS, type TituloSaldo } from "@/lib/compensacao";
import { z } from "zod";

// Cada título selecionado pode ter ajustes (padrão TOTVS). Valores ≥ 0.
const ajuste = z.object({
  id: z.string(),
  juros: z.number().min(0).optional(),
  multa: z.number().min(0).optional(),
  desconto: z.number().min(0).optional(),
  acrescimo: z.number().min(0).optional(),
});
const schema = z.object({
  receber: z.array(ajuste).min(1),
  pagar: z.array(ajuste).min(1),
  modoResiduo: z.enum(["PARCIAL", "NOVA_PARCELA"]).default("PARCIAL"),
  // Motivo do encontro: compensação de dívidas recíprocas ou permuta (troca de
  // mercadoria/serviço). Mesmas partidas — muda a história contada no razão.
  motivo: z.enum(["COMPENSACAO", "PERMUTA"]).default("COMPENSACAO"),
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
      id: true, numero: true, data: true, valorCompensado: true, modoResiduo: true, motivo: true, status: true,
      itens: {
        select: {
          tipo: true,
          contaReceber: { select: { cliente: { select: { razaoSocial: true } } } },
          contaPagar: { select: { fornecedor: { select: { razaoSocial: true } } } },
        },
      },
    },
  });
  const data = rows.map((r) => {
    const nReceber = r.itens.filter((i) => i.tipo === "RECEBER").length;
    const nPagar = r.itens.filter((i) => i.tipo === "PAGAR").length;
    const partes = Array.from(new Set(r.itens.map((i) => i.contaReceber?.cliente?.razaoSocial ?? i.contaPagar?.fornecedor?.razaoSocial).filter(Boolean) as string[]));
    const parceiro = partes.length === 0 ? "—" : partes.length === 1 ? partes[0] : `${partes[0]} +${partes.length - 1}`;
    return {
      id: r.id, numero: r.numero, data: r.data,
      valorCompensado: decimalToNumber(r.valorCompensado), modoResiduo: r.modoResiduo, motivo: r.motivo, status: r.status,
      parceiro, nReceber, nPagar, qtdItens: r.itens.length,
    };
  });
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

  // Seleção LIVRE: os títulos NÃO precisam ser do mesmo parceiro. Só precisam
  // estar em aberto na empresa. O netting é pelo min do valor EFETIVO (saldo ± ajustes).
  const receberIds = f.receber.map((a) => a.id);
  const pagarIds = f.pagar.map((a) => a.id);
  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({
      where: { empresaId, id: { in: receberIds }, status: { in: [...STATUS_ABERTOS] }, intragrupo: false },
      select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true },
    }),
    prismaSemEscopo.contaPagar.findMany({
      where: { empresaId, id: { in: pagarIds }, status: { in: [...STATUS_ABERTOS] }, intragrupo: false },
      select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true },
    }),
  ]);
  if (!crs.length || !cps.length) {
    return NextResponse.json({ error: "Selecione títulos a receber e a pagar em aberto." }, { status: 400 });
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const saldo = (t: { valorOriginal: unknown; valorPago: unknown }) => r2(decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago));
  const ajR = new Map(f.receber.map((a) => [a.id, a]));
  const ajP = new Map(f.pagar.map((a) => [a.id, a]));
  const efetivoDe = (saldoT: number, a?: { juros?: number; multa?: number; desconto?: number; acrescimo?: number }) =>
    r2(saldoT + (a?.juros ?? 0) + (a?.multa ?? 0) + (a?.acrescimo ?? 0) - (a?.desconto ?? 0));
  // Netting opera sobre o valor EFETIVO de cada título.
  const receber: TituloSaldo[] = crs.map((c) => ({ id: c.id, saldo: efetivoDe(saldo(c), ajR.get(c.id)), dataVencimento: c.dataVencimento }));
  const pagar: TituloSaldo[] = cps.map((c) => ({ id: c.id, saldo: efetivoDe(saldo(c), ajP.get(c.id)), dataVencimento: c.dataVencimento }));

  const net = calcularNetting(receber, pagar);
  if (!net) return NextResponse.json({ error: "Nada a compensar (valor mínimo zero)." }, { status: 400 });

  const itemDe = (tipo: "RECEBER" | "PAGAR", id: string, netted: number, a?: { juros?: number; multa?: number; desconto?: number; acrescimo?: number }) => ({
    tipo, valorAplicado: netted,
    ...(tipo === "RECEBER" ? { contaReceberId: id } : { contaPagarId: id }),
    juros: a?.juros ?? 0, multa: a?.multa ?? 0, desconto: a?.desconto ?? 0, acrescimo: a?.acrescimo ?? 0,
  });

  const numero = generateDocNumber("EC", await proximaSequenciaDaEmpresa(empresaId, "EC"));
  const criado = await prismaSemEscopo.compensacao.create({
    data: {
      empresaId, numero, cpfCnpj: "", clienteId: null, fornecedorId: null,
      valorCompensado: net.min, modoResiduo: f.modoResiduo, motivo: f.motivo, status: "RASCUNHO",
      observacoes: f.observacoes ?? null, criadoPor: auth.session.nome ?? null,
      // Guarda a seleção inteira (todos os títulos) + ajustes, com a parcela compensada
      // efetiva como prévia. A confirmação recalcula o valor real e cria os resíduos.
      itens: {
        create: [
          ...net.nettedR.map((n) => itemDe("RECEBER", n.id, n.netted, ajR.get(n.id))),
          ...net.nettedP.map((n) => itemDe("PAGAR", n.id, n.netted, ajP.get(n.id))),
        ],
      },
    },
    select: { id: true, numero: true },
  });

  return NextResponse.json({ data: criado });
}
