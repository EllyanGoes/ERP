import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import ContasReceberTable from "@/components/financeiro/ContasReceberTable";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import { formatBRL, decimalToNumber, isVencida } from "@/lib/utils";

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

  // Conta de contrapartida: onde o título caiu (lançamentos) ou, sem baixa, a
  // conta designada do título. Distinta — um título com pagamento misto pode ter
  // mais de uma conta.
  const contas = contasRaw.map((c) => {
    const lancContas = c.lancamentos.map((l) => l.contaBancaria).filter((x): x is { id: string; nome: string } => !!x);
    const base = lancContas.length > 0 ? lancContas : (c.contaBancaria ? [c.contaBancaria] : []);
    const distinta = Array.from(new Map(base.map((x) => [x.id, x])).values());
    return { ...c, contasContrapartida: distinta };
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

  return (
    <div>
      <PageHeader
        title="Contas a Receber"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas a Receber" }]}
        action={
          <NovaContaButton tipo="receber" />
        }
      />
      <div className="px-8 pb-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-info/10 rounded-xl p-4">
            <p className="text-sm font-medium text-info">Em Aberto</p>
            <p className="text-2xl font-bold text-info mt-1">{formatBRL(emAberto)}</p>
          </div>
          <div className="bg-danger/10 rounded-xl p-4">
            <p className="text-sm font-medium text-danger">Vencido</p>
            <p className="text-2xl font-bold text-danger mt-1">{formatBRL(vencido)}</p>
          </div>
          <div className="bg-success/10 rounded-xl p-4">
            <p className="text-sm font-medium text-success">Recebido no Mês</p>
            <p className="text-2xl font-bold text-success mt-1">{formatBRL(recebidoMes)}</p>
          </div>
        </div>
        <ContasReceberTable contas={contas as any} />
      </div>
    </div>
  );
}
