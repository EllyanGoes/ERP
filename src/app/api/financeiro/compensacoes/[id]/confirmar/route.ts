export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { calcularAlocacao, garantirContaCompensacao, type TituloSaldo } from "@/lib/compensacao";
import { recontabilizarTituloReceber, recontabilizarTituloPagar } from "@/lib/contabilidade";

const r2 = (n: number) => Math.round(n * 100) / 100;
const saldoDe = (t: { valorOriginal: unknown; valorPago: unknown }) =>
  r2(decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago));
const novoStatus = (valorOriginal: number, valorPago: number) =>
  valorOriginal - valorPago <= 0.005 ? "PAGA" : valorPago > 0.005 ? "PARCIAL" : "ABERTA";

// Confirma uma compensação: baixa os títulos dos dois lados pela conta transitória
// (D Fornecedores / C Clientes no líquido, sem caixa) e, no modo "nova parcela",
// cria o título-resíduo. Idempotência: só roda em RASCUNHO.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const comp = await prismaSemEscopo.compensacao.findFirst({
    where: { id: params.id, empresaId },
    select: {
      id: true, numero: true, status: true, modoResiduo: true, clienteId: true, fornecedorId: true,
      itens: { select: { tipo: true, contaReceberId: true, contaPagarId: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });
  if (comp.status !== "RASCUNHO") return NextResponse.json({ error: "Compensação já confirmada ou estornada." }, { status: 409 });

  const receberIds = comp.itens.filter((i) => i.tipo === "RECEBER" && i.contaReceberId).map((i) => i.contaReceberId!) as string[];
  const pagarIds = comp.itens.filter((i) => i.tipo === "PAGAR" && i.contaPagarId).map((i) => i.contaPagarId!) as string[];

  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({ where: { id: { in: receberIds }, empresaId }, select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true } }),
    prismaSemEscopo.contaPagar.findMany({ where: { id: { in: pagarIds }, empresaId }, select: { id: true, valorOriginal: true, valorPago: true, dataVencimento: true } }),
  ]);
  const receber: TituloSaldo[] = crs.map((c) => ({ id: c.id, saldo: saldoDe(c), dataVencimento: c.dataVencimento }));
  const pagar: TituloSaldo[] = cps.map((c) => ({ id: c.id, saldo: saldoDe(c), dataVencimento: c.dataVencimento }));

  const modo = comp.modoResiduo === "NOVA_PARCELA" ? "NOVA_PARCELA" : "PARCIAL";
  const aloc = calcularAlocacao(receber, pagar, modo);
  if (!aloc) return NextResponse.json({ error: "Nada a compensar — os saldos mudaram." }, { status: 409 });

  // Conta transitória (idempotente) — a contrapartida das baixas.
  const cbComp = await garantirContaCompensacao(empresaId);

  // Título-resíduo (modo "nova parcela"): reserva número e vencimento antes da transação.
  const criarResiduo = modo === "NOVA_PARCELA" && aloc.residual > 0.005;
  const residPrefixo = aloc.maiorLado === "RECEBER" ? "CR" : "CP";
  const residNumero = criarResiduo ? generateDocNumber(residPrefixo, await proximaSequenciaDaEmpresa(empresaId, residPrefixo)) : null;
  const vencs = (aloc.maiorLado === "RECEBER" ? receber : pagar).map((t) => t.dataVencimento).filter(Boolean) as Date[];
  const residVenc = vencs.length ? new Date(Math.max(...vencs.map((d) => d.getTime()))) : new Date();

  const agora = new Date();
  const aplicMap = new Map<string, number>([...aloc.aplicR, ...aloc.aplicP].map((a) => [a.id, a.aplicado]));

  const afetadosR = new Set<string>();
  const afetadosP = new Set<string>();
  let residuoId: { tipo: "RECEBER" | "PAGAR"; id: string } | null = null;

  await prismaSemEscopo.$transaction(async (tx) => {
    // Baixa de cada título pela transitória (RECEITA p/ CR, DESPESA p/ CP).
    const itensNovos: { tipo: string; contaReceberId?: string; contaPagarId?: string; valorAplicado: number; lancamentoFinanceiroId: string }[] = [];

    for (const cr of crs) {
      const alvo = aplicMap.get(cr.id) ?? 0;
      const saldo = saldoDe(cr);
      const aplicado = r2(Math.min(alvo, saldo));
      if (aplicado <= 0.005) continue;
      const vo = decimalToNumber(cr.valorOriginal);
      const vp = r2(decimalToNumber(cr.valorPago) + aplicado);
      const lf = await tx.lancamentoFinanceiro.create({
        data: { empresaId, tipo: "RECEITA", descricao: `Compensação ${comp.numero}`, valor: aplicado, dataLancamento: agora, contaReceberId: cr.id, contaBancariaId: cbComp.id },
        select: { id: true },
      });
      const status = novoStatus(vo, vp);
      await tx.contaReceber.update({ where: { id: cr.id }, data: { valorPago: vp, status, dataPagamento: status === "PAGA" ? agora : undefined } });
      itensNovos.push({ tipo: "RECEBER", contaReceberId: cr.id, valorAplicado: aplicado, lancamentoFinanceiroId: lf.id });
      afetadosR.add(cr.id);
    }
    for (const cp of cps) {
      const alvo = aplicMap.get(cp.id) ?? 0;
      const saldo = saldoDe(cp);
      const aplicado = r2(Math.min(alvo, saldo));
      if (aplicado <= 0.005) continue;
      const vo = decimalToNumber(cp.valorOriginal);
      const vp = r2(decimalToNumber(cp.valorPago) + aplicado);
      const lf = await tx.lancamentoFinanceiro.create({
        data: { empresaId, tipo: "DESPESA", descricao: `Compensação ${comp.numero}`, valor: aplicado, dataLancamento: agora, contaPagarId: cp.id, contaBancariaId: cbComp.id },
        select: { id: true },
      });
      const status = novoStatus(vo, vp);
      await tx.contaPagar.update({ where: { id: cp.id }, data: { valorPago: vp, status, dataPagamento: status === "PAGA" ? agora : undefined } });
      itensNovos.push({ tipo: "PAGAR", contaPagarId: cp.id, valorAplicado: aplicado, lancamentoFinanceiroId: lf.id });
      afetadosP.add(cp.id);
    }

    // Título-resíduo (nova parcela): nasce ABERTA, marcado como reclass de compensação.
    if (criarResiduo && residNumero) {
      if (aloc.maiorLado === "RECEBER") {
        const nova = await tx.contaReceber.create({
          data: { empresaId, numero: residNumero, clienteId: comp.clienteId, descricao: `Resíduo compensação ${comp.numero}`, valorOriginal: aloc.residual, dataVencimento: residVenc, status: "ABERTA", compensacaoOrigemId: comp.id },
          select: { id: true },
        });
        residuoId = { tipo: "RECEBER", id: nova.id };
      } else {
        const nova = await tx.contaPagar.create({
          data: { empresaId, numero: residNumero, fornecedorId: comp.fornecedorId, descricao: `Resíduo compensação ${comp.numero}`, valorOriginal: aloc.residual, dataVencimento: residVenc, status: "ABERTA", compensacaoOrigemId: comp.id },
          select: { id: true },
        });
        residuoId = { tipo: "PAGAR", id: nova.id };
      }
    }

    // Regrava os itens com o valor realmente aplicado + a baixa vinculada.
    await tx.compensacaoItem.deleteMany({ where: { compensacaoId: comp.id } });
    if (itensNovos.length) await tx.compensacaoItem.createMany({ data: itensNovos.map((i) => ({ compensacaoId: comp.id, ...i })) });

    const nettedR = r2(itensNovos.filter((i) => i.tipo === "RECEBER").reduce((s, i) => s + i.valorAplicado, 0));
    const nettedP = r2(itensNovos.filter((i) => i.tipo === "PAGAR").reduce((s, i) => s + i.valorAplicado, 0));
    await tx.compensacao.update({
      where: { id: comp.id },
      data: { status: "CONFIRMADA", data: agora, valorCompensado: Math.min(nettedR, nettedP), contaBancariaCompensacaoId: cbComp.id },
    });
  });

  // Contabilização (pós-commit): reusa o fluxo de baixa. As baixas pela transitória
  // geram D Fornecedores / C Clientes no líquido; o resíduo é reclassificado.
  for (const id of Array.from(afetadosR)) await recontabilizarTituloReceber(id).catch(() => null);
  for (const id of Array.from(afetadosP)) await recontabilizarTituloPagar(id).catch(() => null);
  const rid = residuoId as { tipo: "RECEBER" | "PAGAR"; id: string } | null;
  if (rid) {
    if (rid.tipo === "RECEBER") await recontabilizarTituloReceber(rid.id).catch(() => null);
    else await recontabilizarTituloPagar(rid.id).catch(() => null);
  }

  return NextResponse.json({ ok: true, numero: comp.numero });
}
