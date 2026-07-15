import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContasPagarTable from "@/components/financeiro/ContasPagarTable";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import { formatBRL, decimalToNumber, isVencida } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const contasRaw = await prisma.contaPagar.findMany({
    where: { status: { notIn: ["CANCELADA"] } },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      contaBancaria: { select: { id: true, nome: true } },
      lancamentos: { select: { contaBancaria: { select: { id: true, nome: true } } } },
      naturezas: { select: { naturezaFinanceiraId: true, detalhamento: true, valor: true } },
      centroCusto: { select: { codigo: true, nome: true } },
      // DE de origem (pedido OU avulsa): número clicável + TES/centro dos itens
      // do documento — a fonte real da classificação (o pedido raramente tem).
      conferencia: { select: { id: true, numero: true,
        itens: { select: { tes: { select: { codigo: true, nome: true } }, centroCusto: { select: { codigo: true, nome: true } } } } } },
      pedidoCompra: { select: { id: true, numero: true,
        conferencia: { select: { id: true, numero: true,
          itens: { select: { tes: { select: { codigo: true, nome: true } }, centroCusto: { select: { codigo: true, nome: true } } } } } },
        itens: { select: { tes: { select: { codigo: true, nome: true } }, centroCusto: { select: { codigo: true, nome: true } } } } } },
    },
    orderBy: { dataVencimento: "asc" },
  });

  // Conta razão do fornecedor: a analítica de passivo dele (2.1.1.x) — vira o
  // link "nome do fornecedor → razão" na tabela e no detalhe.
  const fornIds = Array.from(new Set(contasRaw.map((c) => c.fornecedor?.id).filter((x): x is string => !!x)));
  const contasForn = fornIds.length
    ? await prisma.contaContabil.findMany({
        where: { fornecedorId: { in: fornIds }, codigo: { startsWith: "2." } },
        select: { id: true, fornecedorId: true },
      })
    : [];
  const contaPorFornecedor = new Map(contasForn.map((cc) => [cc.fornecedorId as string, cc.id]));

  // Conta de contrapartida: onde o título saiu (lançamentos) ou, sem baixa, a
  // conta designada do título.
  const contas = contasRaw.map((c) => {
    const lancContas = c.lancamentos.map((l) => l.contaBancaria).filter((x): x is { id: string; nome: string } => !!x);
    const base = lancContas.length > 0 ? lancContas : (c.contaBancaria ? [c.contaBancaria] : []);
    const distinta = Array.from(new Map(base.map((x) => [x.id, x])).values());
    return {
      ...c,
      contasContrapartida: distinta,
      // Normaliza o DE: vínculo direto (avulsa e novos) ou o DE do pedido (legado).
      conferencia: c.conferencia ?? c.pedidoCompra?.conferencia ?? null,
      fornecedorContaId: c.fornecedor ? (contaPorFornecedor.get(c.fornecedor.id) ?? null) : null,
    };
  });

  const emAberto = contas
    .filter((c) => c.status === "ABERTA" || c.status === "PARCIAL")
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const vencido = contas
    .filter((c) => (c.status === "ABERTA" || c.status === "PARCIAL") && c.dataVencimento != null && isVencida(c.dataVencimento))
    .reduce((s, c) => s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago), 0);

  const now = new Date();
  const pagoMes = contas
    .filter((c) => c.dataPagamento && new Date(c.dataPagamento).getMonth() === now.getMonth() && new Date(c.dataPagamento).getFullYear() === now.getFullYear())
    .reduce((s, c) => s + decimalToNumber(c.valorPago), 0);

  return (
    <div>
      <PageHeader
        title="Contas a Pagar"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas a Pagar" }]}
        action={
          <NovaContaButton tipo="pagar" />
        }
      />
      <div className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-warning/10 rounded-xl p-4">
            <p className="text-sm font-medium text-warning">A Pagar</p>
            <p className="text-2xl font-bold text-warning mt-1">{formatBRL(emAberto)}</p>
          </div>
          <div className="bg-danger/10 rounded-xl p-4">
            <p className="text-sm font-medium text-danger">Vencido</p>
            <p className="text-2xl font-bold text-danger mt-1">{formatBRL(vencido)}</p>
          </div>
          <div className="bg-muted rounded-xl p-4">
            <p className="text-sm font-medium text-muted-foreground">Pago no Mês</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatBRL(pagoMes)}</p>
          </div>
        </div>
        <ContasPagarTable contas={contas as any} />
      </div>
    </div>
  );
}
