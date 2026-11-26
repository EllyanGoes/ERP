export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { requireModulo } from "@/lib/permissions";
import { recontabilizarTituloPagar } from "@/lib/contabilidade";
import { baixarTitulo } from "@/lib/baixa-titulo";
import { formaEletronicaNoCaixa } from "@/lib/roteamento-conta";
import { contaCaixaIdDaEmpresa } from "@/lib/empresa";

const r2 = (n: number) => Math.round(n * 100) / 100;

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos um título").max(200, "No máximo 200 títulos por lote"),
  dataPagamento: z.string().min(1, "Data é obrigatória"),
  forma: z.string().min(1, "Forma de pagamento é obrigatória"),
  contaBancariaId: z.string().min(1, "Conta de pagamento é obrigatória"),
});

// POST /api/contas-pagar/baixa-lote — paga vários títulos de uma vez pelo SALDO
// integral, numa forma/conta só. Cada título passa pelo mesmo núcleo da baixa
// individual (baixarTitulo), numa transação PRÓPRIA (um título com problema não
// derruba os outros): guard otimista, teto anti-overpay, trava de roteamento e
// recomputo do pedido de compra. Sem encargos, e a classificação já gravada no
// título (rateio por natureza + centro de custo) é PRESERVADA — naturezas e
// centroCustoId vão undefined (= não mexer). Títulos não pagáveis em lote são
// pulados com o motivo (a tela mostra o mesmo aviso antes de enviar).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("financeiro");
  if (!auth.ok) return auth.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { dataPagamento, forma, contaBancariaId } = parsed.data;
  const ids = Array.from(new Set(parsed.data.ids));
  const empresaAtiva = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  // ── Validações do lote (uma vez) ─────────────────────────────────────────────
  const formaInfo = await prismaSemEscopo.formaPagamento.findFirst({ where: { nome: forma }, select: { tipo: true } });
  if (formaInfo?.tipo === "PERMUTA") {
    return NextResponse.json({ error: "Permuta não é baixa unilateral — quite pelo Encontro de Contas." }, { status: 422 });
  }
  // A conta precisa ser da empresa ativa (o sentinel "caixa-geral" vira o caixa dela).
  const contaId = contaBancariaId === "caixa-geral" ? contaCaixaIdDaEmpresa(empresaAtiva) : contaBancariaId;
  const conta = await prismaSemEscopo.contaBancaria.findFirst({
    where: { id: contaId, empresaId: empresaAtiva, ativo: true },
    select: { id: true, compensacao: true },
  });
  if (!conta || conta.compensacao) {
    return NextResponse.json({ error: "Conta de pagamento inválida para a empresa ativa." }, { status: 422 });
  }
  // Trava de roteamento: forma que não é dinheiro não sai do Caixa em Dinheiro.
  const ruim = await formaEletronicaNoCaixa(prismaSemEscopo, empresaAtiva, [{ forma, contaBancariaId: conta.id }]);
  if (ruim) {
    return NextResponse.json({ error: `A forma "${forma}" não pode ser paga pelo Caixa em Dinheiro — selecione a conta bancária de origem.` }, { status: 422 });
  }

  // ── Leitura dos títulos (sem escopo: título de outra empresa vira "ignorado"
  //    com motivo, não "não encontrado") ─────────────────────────────────────
  const titulos = await prismaSemEscopo.contaPagar.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, numero: true, empresaId: true, status: true,
      valorOriginal: true, valorPago: true,
      contabilizacaoExterna: true, folhaId: true,
      naturezaFinanceiraId: true, centroCustoId: true,
      formaPagamentoPrevista: { select: { tipo: true } },
      _count: { select: { naturezas: true } },
    },
  });
  const porId = new Map(titulos.map((t) => [t.id, t]));

  const pagos: { id: string; numero: string }[] = [];
  const ignorados: { id: string; numero: string; motivo: string }[] = [];

  for (const id of ids) {
    const t = porId.get(id);
    if (!t) { ignorados.push({ id, numero: "—", motivo: "Título não encontrado" }); continue; }
    const saldo = r2(Number(t.valorOriginal) - Number(t.valorPago));
    const motivo =
      t.empresaId !== empresaAtiva ? "Título de outra empresa — troque a empresa ativa"
      : t.status === "PAGA" ? "Já está pago"
      : t.status === "CANCELADA" ? "Está cancelado"
      : t.contabilizacaoExterna ? `Pago pelo módulo de RH (${t.folhaId ? "Folha de Pagamento" : "Diárias"})`
      : t.formaPagamentoPrevista?.tipo === "PERMUTA" ? "Previsto como permuta — quite pelo Encontro de Contas"
      : (t._count.naturezas === 0 && !t.naturezaFinanceiraId) ? "Sem natureza financeira — classifique e pague individualmente"
      : !t.centroCustoId ? "Sem centro de custo — classifique e pague individualmente"
      : saldo <= 0.005 ? "Sem saldo a pagar"
      : null;
    if (motivo) { ignorados.push({ id, numero: t.numero, motivo }); continue; }

    // Transação própria por título; o baixarTitulo valida tudo antes de escrever.
    const r = await prisma.$transaction((tx) =>
      baixarTitulo(tx, {
        tipo: "PAGAR",
        tituloId: id,
        linhas: [{ forma, contaBancariaId: conta.id, valor: saldo }],
        dataPagamento,
        // naturezas/centroCustoId undefined = mantém a classificação do título.
      }),
    ).catch((e) => ({ erro: { msg: e instanceof Error ? e.message : "Erro ao pagar", status: 500 }, conta: null }));
    if (r.erro) { ignorados.push({ id, numero: t.numero, motivo: r.erro.msg }); continue; }
    pagos.push({ id, numero: t.numero });
  }

  // Contabiliza cada baixa (best-effort, pós-commit — igual ao PATCH individual).
  for (const p of pagos) {
    await recontabilizarTituloPagar(p.id).catch((e) => console.error("[contas-pagar/baixa-lote] contabilizar:", e));
  }

  return NextResponse.json({ data: { pagos, ignorados } });
}
