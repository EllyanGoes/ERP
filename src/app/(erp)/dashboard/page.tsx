import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, decimalToNumber, isVencida } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  Eye,
} from "lucide-react";
import DashboardCharts from "@/components/dashboard/DashboardCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    pedidosAbertos,
    receitaMes,
    contasVencidas,
    contasPagarHoje,
    pedidosRecentes,
    itensBaixoEstoque,
    receitaUltimos12Meses,
  ] = await Promise.all([
    // Pedidos em aberto (não entregues nem cancelados)
    prisma.pedidoVenda.count({
      where: { status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    }),

    // Receita do mês (contas recebidas no mês atual)
    prisma.contaReceber.aggregate({
      where: {
        dataPagamento: { gte: startOfMonth },
        status: "PAGA",
      },
      _sum: { valorPago: true },
    }),

    // Contas a receber vencidas
    prisma.contaReceber.count({
      where: {
        status: { in: ["ABERTA", "PARCIAL"] },
        dataVencimento: { lt: now },
      },
    }),

    // Contas a pagar vencendo hoje ou vencidas
    prisma.contaPagar.count({
      where: {
        status: { in: ["ABERTA", "PARCIAL"] },
        dataVencimento: { lte: now },
      },
    }),

    // 10 pedidos mais recentes
    prisma.pedidoVenda.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { cliente: { select: { razaoSocial: true } } },
    }),

    // Itens com estoque abaixo do mínimo
    prisma.estoqueItem.findMany({
      where: {
        quantidadeMin: { gt: 0 },
      },
      include: { item: { select: { codigo: true, descricao: true } } },
    }),

    // Receita mês a mês nos últimos 12 meses
    prisma.contaReceber.findMany({
      where: {
        dataPagamento: { gte: new Date(now.getFullYear() - 1, now.getMonth() + 1, 1) },
        status: "PAGA",
      },
      select: { dataPagamento: true, valorPago: true },
    }),
  ]);

  // Filter itens with baixo estoque
  const itensCriticos = itensBaixoEstoque.filter(
    (e) => decimalToNumber(e.quantidadeAtual) <= decimalToNumber(e.quantidadeMin)
  );

  // Build monthly chart data
  const monthlyMap = new Map<string, number>();
  for (const c of receitaUltimos12Meses) {
    if (!c.dataPagamento) continue;
    const key = `${c.dataPagamento.getFullYear()}-${String(c.dataPagamento.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + decimalToNumber(c.valorPago));
  }
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return { mes: meses[d.getMonth()], receita: monthlyMap.get(key) ?? 0, key };
  });

  const receitaMesValue = decimalToNumber(receitaMes._sum.valorPago ?? 0);

  const kpis = [
    {
      title: "Receita do Mês",
      value: formatBRL(receitaMesValue),
      icon: TrendingUp,
      color: "text-success",
      bg: "bg-success/10",
      sub: "Recebimentos no mês atual",
    },
    {
      title: "Pedidos em Aberto",
      value: pedidosAbertos.toString(),
      icon: ShoppingCart,
      color: "text-info",
      bg: "bg-info/10",
      sub: "Aguardando entrega",
    },
    {
      title: "CR Vencidas",
      value: contasVencidas.toString(),
      icon: TrendingDown,
      color: contasVencidas > 0 ? "text-danger" : "text-muted-foreground",
      bg: contasVencidas > 0 ? "bg-danger/10" : "bg-muted",
      sub: "Contas a receber em atraso",
    },
    {
      title: "CP Pendentes",
      value: contasPagarHoje.toString(),
      icon: AlertTriangle,
      color: contasPagarHoje > 0 ? "text-warning" : "text-muted-foreground",
      bg: contasPagarHoje > 0 ? "bg-warning/10" : "bg-muted",
      sub: "Contas a pagar vencendo",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: "Menu" }, { label: "Dashboard" }]}
      />
      <div className="px-8 pb-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title} className="border-border">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {kpi.title}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart */}
        <DashboardCharts data={chartData} />

        {/* Bottom row */}
        <div className="grid grid-cols-3 gap-6">
          {/* Recent orders */}
          <Card className="col-span-2 border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">Pedidos Recentes</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/pedidos-venda" className="text-xs text-info">Ver todos</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left pb-2">Nº</th>
                    <th className="text-left pb-2">Cliente</th>
                    <th className="text-left pb-2">Status</th>
                    <th className="text-right pb-2">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pedidosRecentes.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-muted">
                      <td className="py-2.5 font-mono text-xs">{p.numero}</td>
                      <td className="py-2.5 truncate max-w-[140px]">{p.cliente.razaoSocial}</td>
                      <td className="py-2.5"><StatusBadge status={p.status} /></td>
                      <td className="py-2.5 text-right font-medium">{formatBRL(decimalToNumber(p.valorTotal))}</td>
                      <td className="py-2.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link href={`/pedidos-venda/${p.id}`}><Eye className="w-3.5 h-3.5" /></Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pedidosRecentes.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">Nenhum pedido cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Low stock alerts */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">
                Estoque Crítico
                {itensCriticos.length > 0 && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-danger/15 text-danger">
                    {itensCriticos.length}
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/estoque" className="text-xs text-info">Ver estoque</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {itensCriticos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Estoque normalizado ✓</p>
              ) : (
                itensCriticos.slice(0, 8).map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{e.item.descricao}</p>
                      <p className="text-xs text-muted-foreground font-mono">{e.item.codigo}</p>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <p className="text-xs font-bold text-danger">{decimalToNumber(e.quantidadeAtual)}</p>
                      <p className="text-xs text-muted-foreground">min: {decimalToNumber(e.quantidadeMin)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
