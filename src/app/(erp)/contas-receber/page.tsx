import { prisma } from "@/lib/prisma";
import ContasReceberTable from "@/components/financeiro/ContasReceberTable";
import { decimalToNumber, isVencida } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage() {
  const contasRaw = await prisma.contaReceber.findMany({
    where: { status: { notIn: ["CANCELADA"] } },
    include: {
      cliente: { select: { id: true, razaoSocial: true } },
      contaBancaria: { select: { id: true, nome: true } },
      lancamentos: { select: { contaBancaria: { select: { id: true, nome: true } } } },
      pedidoVenda: { select: { id: true, numero: true } },
      centroCusto: { select: { codigo: true, nome: true } },
    },
    orderBy: { dataVencimento: "asc" },
  });

  // Conta razão do cliente: a analítica de Clientes a Receber dele (1.1.2.x) —
  // vira o link "nome do cliente → razão" na tabela e no detalhe.
  const cliIds = Array.from(new Set(contasRaw.map((c) => c.cliente?.id).filter((x): x is string => !!x)));
  const contasCli = cliIds.length
    ? await prisma.contaContabil.findMany({
        where: { clienteId: { in: cliIds }, codigo: { startsWith: "1.1.2." } },
        select: { id: true, clienteId: true },
      })
    : [];
  const contaPorCliente = new Map(contasCli.map((cc) => [cc.clienteId as string, cc.id]));

  // Conta de contrapartida: onde o título caiu (lançamentos) ou, sem baixa, a
  // conta designada do título. Distinta — um título com pagamento misto pode ter
  // mais de uma conta.
  const contas = contasRaw.map((c) => {
    const lancContas = c.lancamentos.map((l) => l.contaBancaria).filter((x): x is { id: string; nome: string } => !!x);
    const base = lancContas.length > 0 ? lancContas : (c.contaBancaria ? [c.contaBancaria] : []);
    const distinta = Array.from(new Map(base.map((x) => [x.id, x])).values());
    return {
      ...c,
      contasContrapartida: distinta,
      clienteContaId: c.cliente ? (contaPorCliente.get(c.cliente.id) ?? null) : null,
    };
  });

  const emAberto = contas
    .filter((c) => c.status === "ABERTA" || c.status === "PARCIAL")
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const vencido = contas
    .filter((c) => (c.status === "ABERTA" || c.status === "PARCIAL") && c.dataVencimento != null && isVencida(c.dataVencimento))
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const now = new Date();
  const recebidoMes = contas
    .filter((c) => c.dataPagamento && new Date(c.dataPagamento).getMonth() === now.getMonth() && new Date(c.dataPagamento).getFullYear() === now.getFullYear())
    .reduce((s, c) => s + decimalToNumber(c.valorPago), 0);

  // Sem PageHeader (título/cards): a tabela ganha a tela inteira — o resumo e o
  // botão de novo lançamento moram na barra de filtros (mesmo modelo do Pagar).
  return (
    <div className="px-8 pt-4 pb-8 space-y-4">
      <ContasReceberTable contas={contas as any} resumo={{ emAberto, vencido, recebidoMes }} />
    </div>
  );
}
