export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";
import { generateDocNumber, generateSimpleDocNumber, decimalToNumber } from "@/lib/utils";
import { calcularNetting, garantirContaCompensacao, type TituloSaldo } from "@/lib/compensacao";
import { recontabilizarTituloReceber, recontabilizarTituloPagar, contabilizarAjusteCompensacaoItem } from "@/lib/contabilidade";

const r2 = (n: number) => Math.round(n * 100) / 100;
const saldoDe = (t: { valorOriginal: unknown; valorPago: unknown }) =>
  r2(decimalToNumber(t.valorOriginal) - decimalToNumber(t.valorPago));
const novoStatus = (valorOriginal: number, valorPago: number): "PAGA" | "PARCIAL" | "ABERTA" =>
  valorOriginal - valorPago <= 0.005 ? "PAGA" : valorPago > 0.005 ? "PARCIAL" : "ABERTA";

type Aj = { juros: number; multa: number; desconto: number; acrescimo: number };
const efetivoDe = (saldo: number, a: Aj) => r2(saldo + a.juros + a.multa + a.acrescimo - a.desconto);
const temAjuste = (a: Aj) => a.juros + a.multa + a.desconto + a.acrescimo > 0.005;

// Erros de negócio disparados de dentro da transação (viram 409 pós-rollback).
class ConfirmarError extends Error {
  constructor(msg: string, public status: number) { super(msg); }
}

// Confirma uma compensação: baixa o PRINCIPAL dos títulos pela conta transitória
// (D Fornecedores / C Clientes no líquido) e, havendo ajustes (juros/multa/desconto/
// acréscimo), lança a parte de ajuste contra o resultado financeiro — também pela
// transitória, de modo que ela feche no valor EFETIVO. Seleção livre (partes
// diferentes). Ajustes forçam o resíduo a ficar aberto (modo PARCIAL). Só em RASCUNHO.
//
// Concorrência: o 1º statement da transação é o CLAIM (RASCUNHO → CONFIRMADA via
// updateMany) — a requisição que perder a corrida cai no count === 0 e aborta.
// Os saldos dos títulos são lidos DENTRO da transação e os updates de valorPago
// têm guard otimista (condicionado ao valor lido).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const comp = await prismaSemEscopo.compensacao.findFirst({
    where: { id: params.id, empresaId },
    select: {
      id: true, numero: true, status: true, modoResiduo: true, motivo: true,
      itens: { select: { tipo: true, contaReceberId: true, contaPagarId: true, juros: true, multa: true, desconto: true, acrescimo: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Compensação não encontrada" }, { status: 404 });
  if (comp.status !== "RASCUNHO") return NextResponse.json({ error: "Compensação já confirmada ou estornada." }, { status: 409 });
  // Rótulo do motivo — conta a história certa no razão/extratos.
  const rotulo = comp.motivo === "PERMUTA" ? "Permuta" : "Compensação";

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

  // Com ajustes o resíduo fica em aberto (modo PARCIAL) — evita título-resíduo com
  // valor de juros. Sem ajustes, respeita a escolha (parcial/nova parcela).
  const houveAjuste = comp.itens.some((i) => temAjuste({ juros: decimalToNumber(i.juros), multa: decimalToNumber(i.multa), desconto: decimalToNumber(i.desconto), acrescimo: decimalToNumber(i.acrescimo) }));
  const modo = houveAjuste ? "PARCIAL" : (comp.modoResiduo === "NOVA_PARCELA" ? "NOVA_PARCELA" : "PARCIAL");

  // Conta transitória (idempotente, fora da transação).
  const cbComp = await garantirContaCompensacao(empresaId);

  const agora = new Date();
  const afetadosR = new Set<string>();
  const afetadosP = new Set<string>();
  const residuoIds: { tipo: "RECEBER" | "PAGAR"; id: string }[] = [];
  const itensComAjuste: string[] = []; // ids de CompensacaoItem p/ contabilizar o ajuste

  try {
    await prismaSemEscopo.$transaction(async (tx) => {
      // CLAIM atômico: quem perder a corrida cai no count === 0 e aborta antes de
      // qualquer outra escrita.
      const claim = await tx.compensacao.updateMany({
        where: { id: comp.id, status: "RASCUNHO" },
        data: { status: "CONFIRMADA" },
      });
      if (claim.count === 0) throw new ConfirmarError("Compensação já confirmada ou estornada.", 409);

      // Saldos lidos DENTRO da transação (após o claim).
      const [crs, cps] = await Promise.all([
        tx.contaReceber.findMany({ where: { id: { in: receberIds }, empresaId }, select: { id: true, clienteId: true, valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true, dataVencimento: true } }),
        tx.contaPagar.findMany({ where: { id: { in: pagarIds }, empresaId }, select: { id: true, fornecedorId: true, valorOriginal: true, valorPago: true, valorJuros: true, valorMulta: true, dataVencimento: true } }),
      ]);

      const receber: TituloSaldo[] = crs.map((c) => ({ id: c.id, saldo: efetivoDe(saldoDe(c), aj(c.id)), dataVencimento: c.dataVencimento }));
      const pagar: TituloSaldo[] = cps.map((c) => ({ id: c.id, saldo: efetivoDe(saldoDe(c), aj(c.id)), dataVencimento: c.dataVencimento }));
      const net = calcularNetting(receber, pagar);
      if (!net) throw new ConfirmarError("Nada a compensar — os saldos mudaram.", 409);
      const nettedMap = new Map<string, number>([...net.nettedR, ...net.nettedP].map((a) => [a.id, a.netted]));

      // Aplicação por título: fração consumida do efetivo → principal e ajustes
      // proporcionais. No NOVA_PARCELA (sem ajuste) o principal é quitado 100% e o
      // resíduo vira título novo.
      type Aplic = { principal: number; aj: Aj };
      type Residuo = { tipo: "RECEBER" | "PAGAR"; clienteId: string | null; fornecedorId: string | null; venc: Date; valor: number };
      const aplicMap = new Map<string, Aplic>();
      const residuos: Residuo[] = [];

      const calcLado = (titulos: typeof crs | typeof cps, tipo: "RECEBER" | "PAGAR") => {
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

      // Baixa do PRINCIPAL de cada título pela transitória + item com o valor/ajuste aplicado.
      await tx.compensacaoItem.deleteMany({ where: { compensacaoId: comp.id } });

      const baixar = async (
        t: { id: string; valorOriginal: unknown; valorPago: Prisma.Decimal; valorJuros: unknown; valorMulta: unknown },
        tipo: "RECEBER" | "PAGAR",
      ) => {
        const ap = aplicMap.get(t.id);
        if (!ap || ap.principal <= 0.005) return;
        const vp = r2(decimalToNumber(t.valorPago) + ap.principal);
        const lf = await tx.lancamentoFinanceiro.create({
          data: {
            empresaId, tipo: tipo === "RECEBER" ? "RECEITA" : "DESPESA", descricao: `${rotulo} ${comp.numero}`,
            valor: ap.principal, dataLancamento: agora,
            ...(tipo === "RECEBER" ? { contaReceberId: t.id } : { contaPagarId: t.id }), contaBancariaId: cbComp.id,
          },
          select: { id: true },
        });
        const status = novoStatus(decimalToNumber(t.valorOriginal), vp);
        const dataPag = status === "PAGA" ? agora : undefined;
        const jurosNovo = r2(decimalToNumber(t.valorJuros) + ap.aj.juros);
        const multaNova = r2(decimalToNumber(t.valorMulta) + ap.aj.multa);
        // Guard otimista: só aplica se o valorPago não mudou desde a leitura acima.
        const dados = { valorPago: vp, valorJuros: jurosNovo, valorMulta: multaNova, status, dataPagamento: dataPag };
        const guard = tipo === "RECEBER"
          ? await tx.contaReceber.updateMany({ where: { id: t.id, valorPago: t.valorPago }, data: dados })
          : await tx.contaPagar.updateMany({ where: { id: t.id, valorPago: t.valorPago }, data: dados });
        if (guard.count === 0) throw new ConfirmarError("Um dos títulos foi baixado por outra operação simultânea — recarregue e confira.", 409);

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

      // Títulos-resíduo (nova parcela, sem ajuste): um por título com sobra. A
      // numeração sai da sequência da empresa DENTRO da transação.
      for (const r of residuos) {
        const prefixo = r.tipo === "RECEBER" ? "CR" : "CP";
        const seq = await tx.sequencia.upsert({
          where: { empresaId_prefixo: { empresaId, prefixo } },
          update: { ultimo: { increment: 1 } },
          create: { empresaId, prefixo, ultimo: 1 },
        });
        // CP é numerado sem o ano (CP-0110); CR mantém o formato com ano.
        const numero = (prefixo === "CP" ? generateSimpleDocNumber : generateDocNumber)(prefixo, seq.ultimo);
        if (r.tipo === "RECEBER") {
          const nova = await tx.contaReceber.create({ data: { empresaId, numero, clienteId: r.clienteId, descricao: `Resíduo ${rotulo.toLowerCase()} ${comp.numero}`, valorOriginal: r.valor, dataVencimento: r.venc, status: "ABERTA", compensacaoOrigemId: comp.id }, select: { id: true } });
          residuoIds.push({ tipo: "RECEBER", id: nova.id });
        } else {
          const nova = await tx.contaPagar.create({ data: { empresaId, numero, fornecedorId: r.fornecedorId, descricao: `Resíduo ${rotulo.toLowerCase()} ${comp.numero}`, valorOriginal: r.valor, dataVencimento: r.venc, status: "ABERTA", compensacaoOrigemId: comp.id }, select: { id: true } });
          residuoIds.push({ tipo: "PAGAR", id: nova.id });
        }
      }

      await tx.compensacao.update({
        where: { id: comp.id },
        data: { data: agora, valorCompensado: net.min, contaBancariaCompensacaoId: cbComp.id },
      });
    });
  } catch (e) {
    if (e instanceof ConfirmarError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Contabilização (pós-commit): principal via baixa reusada; ajuste dedicado; resíduo reclass.
  for (const id of Array.from(afetadosR)) await recontabilizarTituloReceber(id).catch((e) => console.error("[compensacao] recontabilizar:", e));
  for (const id of Array.from(afetadosP)) await recontabilizarTituloPagar(id).catch((e) => console.error("[compensacao] recontabilizar:", e));
  for (const itemId of itensComAjuste) await contabilizarAjusteCompensacaoItem(itemId).catch((e) => console.error("[compensacao] recontabilizar:", e));
  for (const r of residuoIds) {
    if (r.tipo === "RECEBER") await recontabilizarTituloReceber(r.id).catch((e) => console.error("[compensacao] recontabilizar:", e));
    else await recontabilizarTituloPagar(r.id).catch((e) => console.error("[compensacao] recontabilizar:", e));
  }

  return NextResponse.json({ ok: true, numero: comp.numero });
}
