export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID, proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber, decimalToNumber } from "@/lib/utils";
import { calcularNetting, garantirContaCompensacao, type TituloSaldo } from "@/lib/compensacao";
import { recontabilizarTituloReceber, recontabilizarTituloPagar, contabilizarAjusteCompensacaoItem } from "@/lib/contabilidade";

const r2 = (n: number) => Math.round(n * 100) / 100;
const saldoDe = (t: { valorOriginal: unknown; valorPago: unknown }) =>
  r2(decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago));
const novoStatus = (valorOriginal: number, valorPago: number) =>
  valorOriginal - valorPago <= 0.005 ? "PAGA" : valorPago > 0.005 ? "PARCIAL" : "ABERTA";

type Aj = { juros: number; multa: number; desconto: number; acrescimo: number };
const efetivoDe = (saldo: number, a: Aj) => r2(saldo + a.juros + a.multa + a.acrescimo - a.desconto);
const temAjuste = (a: Aj) => a.juros + a.multa + a.desconto + a.acrescimo > 0.005;

// Confirma uma compensação: baixa o PRINCIPAL dos títulos pela conta transitória
// (D Fornecedores / C Clientes no líquido) e, havendo ajustes (juros/multa/desconto/
// acréscimo), lança a parte de ajuste contra o resultado financeiro — também pela
// transitória, de modo que ela feche no valor EFETIVO. Seleção livre (partes
// diferentes). Ajustes forçam o resíduo a ficar aberto (modo PARCIAL). Só em RASCUNHO.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const comp = await prismaSemEscopo.compensacao.findFirst({
    where: { id: params.id, empresaId },
    select: {
      id: true, numero: true, status: true, modoResiduo: true,
      itens: { select: { tipo: true, contaReceberId: true, contaPagarId: true, juros: true, multa: true, desconto: true, acrescimo: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });
  if (comp.status !== "RASCUNHO") return NextResponse.json({ error: "Compensação já confirmada ou estornada." }, { status: 409 });

  // Ajustes por título (guardados no rascunho).
  const ajById = new Map<string, Aj>();
  for (const i of comp.itens) {
    const key = (i.contaReceberId ?? i.contaPagarId)!;
    ajById.set(key, { juros: decimalToNumber(i.juros), multa: decimalToNumber(i.multa), desconto: decimalToNumber(i.desconto), acrescimo: decimalToNumber(i.acrescimo) });
  }
  const zero: Aj = { juros: 0, multa: 0, desconto: 0, acrescimo: 0 };
  const aj = (id: string) => ajById.get(id) ?? zero;

  const receberIds = comp.itens.filter((i) => i.tipo === "RECEBER" && i.contaReceberId).map((i) => i.contaReceberId!) as string[];
  const pagarIds = comp.itens.filter((i) => i.tipo === "PAGAR" && i.contaPagarId).map((i) => i.contaPagarId!) as string[];

  const [crs, cps] = await Promise.all([
    prismaSemEscopo.contaReceber.findMany({ where: { id: { in: receberIds }, empresaId }, select: { id: true, clienteId: true, valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true, dataVencimento: true } }),
    prismaSemEscopo.contaPagar.findMany({ where: { id: { in: pagarIds }, empresaId }, select: { id: true, fornecedorId: true, valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true, dataVencimento: true } }),
  ]);

  const receber: TituloSaldo[] = crs.map((c) => ({ id: c.id, saldo: efetivoDe(saldoDe(c), aj(c.id)), dataVencimento: c.dataVencimento }));
  const pagar: TituloSaldo[] = cps.map((c) => ({ id: c.id, saldo: efetivoDe(saldoDe(c), aj(c.id)), dataVencimento: c.dataVencimento }));
  const net = calcularNetting(receber, pagar);
  if (!net) return NextResponse.json({ error: "Nada a compensar — os saldos mudaram." }, { status: 409 });
  const nettedMap = new Map<string, number>([...net.nettedR, ...net.nettedP].map((a) => [a.id, a.netted]));

  // Com ajustes o resíduo fica em aberto (modo PARCIAL) — evita título-resíduo com
  // valor de juros. Sem ajustes, respeita a escolha (parcial/nova parcela).
  const houveAjuste = comp.itens.some((i) => temAjuste({ juros: decimalToNumber(i.juros), multa: decimalToNumber(i.multa), desconto: decimalToNumber(i.desconto), acrescimo: decimalToNumber(i.acrescimo) }));
  const modo = houveAjuste ? "PARCIAL" : (comp.modoResiduo === "NOVA_PARCELA" ? "NOVA_PARCELA" : "PARCIAL");

  // Aplicação por título: fração consumida do efetivo → principal e ajustes
  // proporcionais. No NOVA_PARCELA (sem ajuste) o principal é quitado 100% e o
  // resíduo vira título novo.
  type Aplic = { principal: number; aj: Aj };
  type Residuo = { tipo: "RECEBER" | "PAGAR"; clienteId: string | null; fornecedorId: string | null; venc: Date; valor: number; numero: string };
  const aplicMap = new Map<string, Aplic>();
  const residuos: Omit<Residuo, "numero">[] = [];

  const calcLado = (
    titulos: typeof crs | typeof cps,
    tipo: "RECEBER" | "PAGAR",
  ) => {
    for (const t of titulos) {
      const saldo = saldoDe(t);
      const a = aj(t.id);
      const efetivo = efetivoDe(saldo, a);
      const nettedEf = nettedMap.get(t.id) ?? 0;
      const fracao = efetivo > 0 ? nettedEf / efetivo : 0;
      if (modo === "NOVA_PARCELA") {
        aplicMap.set(t.id, { principal: saldo, aj: zero });
        const resid = r2(saldo - nettedEf);
        if (resid > 0.005) {
          const clienteId = tipo === "RECEBER" ? (t as (typeof crs)[number]).clienteId : null;
          const fornecedorId = tipo === "PAGAR" ? (t as (typeof cps)[number]).fornecedorId : null;
          residuos.push({ tipo, clienteId, fornecedorId, venc: t.dataVencimento ?? new Date(), valor: resid });
        }
      } else {
        aplicMap.set(t.id, {
          principal: r2(saldo * fracao),
          aj: { juros: r2(a.juros * fracao), multa: r2(a.multa * fracao), desconto: r2(a.desconto * fracao), acrescimo: r2(a.acrescimo * fracao) },
        });
      }
    }
  };
  calcLado(crs, "RECEBER");
  calcLado(cps, "PAGAR");

  // Conta transitória (idempotente).
  const cbComp = await garantirContaCompensacao(empresaId);

  // Reserva números dos títulos-resíduo.
  const residuosComNumero: Residuo[] = [];
  for (const r of residuos) {
    const prefixo = r.tipo === "RECEBER" ? "CR" : "CP";
    residuosComNumero.push({ ...r, numero: generateDocNumber(prefixo, await proximaSequenciaDaEmpresa(empresaId, prefixo)) });
  }

  const agora = new Date();
  const afetadosR = new Set<string>();
  const afetadosP = new Set<string>();
  const residuoIds: { tipo: "RECEBER" | "PAGAR"; id: string }[] = [];
  const itensComAjuste: string[] = []; // ids de CompensacaoItem p/ contabilizar o ajuste

  await prismaSemEscopo.$transaction(async (tx) => {
    // Baixa do PRINCIPAL de cada título pela transitória + item com o valor/ajuste aplicado.
    await tx.compensacaoItem.deleteMany({ where: { compensacaoId: comp.id } });

    const baixar = async (
      t: { id: string; valorOriginal: unknown; valorPago: unknown; valorJuros: unknown; valorMulta: unknown },
      tipo: "RECEBER" | "PAGAR",
    ) => {
      const ap = aplicMap.get(t.id);
      if (!ap || ap.principal <= 0.005) return;
      const vp = r2(decimalToNumber(t.valorPago) + ap.principal);
      const lf = await tx.lancamentoFinanceiro.create({
        data: {
          empresaId, tipo: tipo === "RECEBER" ? "RECEITA" : "DESPESA", descricao: `Compensação ${comp.numero}`,
          valor: ap.principal, dataLancamento: agora,
          ...(tipo === "RECEBER" ? { contaReceberId: t.id } : { contaPagarId: t.id }), contaBancariaId: cbComp.id,
        },
        select: { id: true },
      });
      const status = novoStatus(decimalToNumber(t.valorOriginal), vp);
      const dataPag = status === "PAGA" ? agora : undefined;
      const jurosNovo = r2(decimalToNumber(t.valorJuros) + ap.aj.juros);
      const multaNova = r2(decimalToNumber(t.valorMulta) + ap.aj.multa);
      if (tipo === "RECEBER") await tx.contaReceber.update({ where: { id: t.id }, data: { valorPago: vp, valorJuros: jurosNovo, valorMulta: multaNova, status, dataPagamento: dataPag } });
      else await tx.contaPagar.update({ where: { id: t.id }, data: { valorPago: vp, valorJuros: jurosNovo, valorMulta: multaNova, status, dataPagamento: dataPag } });

      const item = await tx.compensacaoItem.create({
        data: {
          compensacaoId: comp.id, tipo, valorAplicado: ap.principal, lancamentoFinanceiroId: lf.id,
          juros: ap.aj.juros, multa: ap.aj.multa, desconto: ap.aj.desconto, acrescimo: ap.aj.acrescimo,
          ...(tipo === "RECEBER" ? { contaReceberId: t.id } : { contaPagarId: t.id }),
        },
        select: { id: true },
      });
      if (temAjuste(ap.aj)) itensComAjuste.push(item.id);
      if (tipo === "RECEBER") afetadosR.add(t.id); else afetadosP.add(t.id);
    };

    for (const cr of crs) await baixar(cr, "RECEBER");
    for (const cp of cps) await baixar(cp, "PAGAR");

    // Títulos-resíduo (nova parcela, sem ajuste): um por título com sobra.
    for (const r of residuosComNumero) {
      if (r.tipo === "RECEBER") {
        const nova = await tx.contaReceber.create({ data: { empresaId, numero: r.numero, clienteId: r.clienteId, descricao: `Resíduo compensação ${comp.numero}`, valorOriginal: r.valor, dataVencimento: r.venc, status: "ABERTA", compensacaoOrigemId: comp.id }, select: { id: true } });
        residuoIds.push({ tipo: "RECEBER", id: nova.id });
      } else {
        const nova = await tx.contaPagar.create({ data: { empresaId, numero: r.numero, fornecedorId: r.fornecedorId, descricao: `Resíduo compensação ${comp.numero}`, valorOriginal: r.valor, dataVencimento: r.venc, status: "ABERTA", compensacaoOrigemId: comp.id }, select: { id: true } });
        residuoIds.push({ tipo: "PAGAR", id: nova.id });
      }
    }

    await tx.compensacao.update({
      where: { id: comp.id },
      data: { status: "CONFIRMADA", data: agora, valorCompensado: net.min, contaBancariaCompensacaoId: cbComp.id },
    });
  });

  // Contabilização (pós-commit): principal via baixa reusada; ajuste dedicado; resíduo reclass.
  for (const id of Array.from(afetadosR)) await recontabilizarTituloReceber(id).catch(() => null);
  for (const id of Array.from(afetadosP)) await recontabilizarTituloPagar(id).catch(() => null);
  for (const itemId of itensComAjuste) await contabilizarAjusteCompensacaoItem(itemId).catch(() => null);
  for (const r of residuoIds) {
    if (r.tipo === "RECEBER") await recontabilizarTituloReceber(r.id).catch(() => null);
    else await recontabilizarTituloPagar(r.id).catch(() => null);
  }

  return NextResponse.json({ ok: true, numero: comp.numero });
}
