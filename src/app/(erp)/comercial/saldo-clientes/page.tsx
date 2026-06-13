export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { getSaldoMateriaisAEntregar } from "@/lib/saldo-materiais";
import SaldoClientesView, {
  type ClienteComSaldo,
  type ItemPendente,
} from "@/components/comercial/SaldoClientesView";

const EPS = 1e-6;

export default async function SaldoClientesPage() {
  // Pedidos elegíveis para entrega (mesmos status que aparecem na Nova Minuta).
  const pedidos = await prisma.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO"] } },
    select: {
      id: true,
      numero: true,
      numeroOrcamento: true,
      status: true,
      dataEmissao: true,
      dataEntrega: true,
      cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
      // Pago? (recebimento já lançado) — pedido pago mas com saldo a entregar.
      contasReceber: { where: { status: "PAGA" }, select: { id: true } },
      itens: {
        select: {
          id: true,
          quantidade: true,
          valorTotal: true,
          item: {
            select: {
              codigo: true,
              descricao: true,
              unidade: { select: { sigla: true } },
            },
          },
          // Tudo que já foi comprometido em minutas não canceladas — mesma
          // regra de saldo usada na Nova Minuta e no PUT do pedido.
          minutaItens: {
            where: { minuta: { status: { not: "CANCELADA" } } },
            select: { quantidade: true },
          },
        },
      },
    },
    orderBy: { dataEmissao: "asc" },
  });

  // Agrega Cliente → Pedido → itens que ainda faltam minutar/entregar.
  const clientesMap = new Map<string, ClienteComSaldo>();

  for (const p of pedidos) {
    const itensPendentes: ItemPendente[] = [];

    for (const it of p.itens) {
      const pedida = decimalToNumber(it.quantidade);
      const minutado = it.minutaItens.reduce(
        (s, mi) => s + decimalToNumber(mi.quantidade),
        0,
      );
      const pendente = pedida - minutado;
      if (pendente > EPS) {
        // Valor monetário proporcional ao que ainda falta entregar
        // (já líquido do desconto da linha — valorTotal é o total da linha).
        const valorTotalLinha = decimalToNumber(it.valorTotal);
        const valorPendente = pedida > 0 ? (pendente / pedida) * valorTotalLinha : 0;
        itensPendentes.push({
          id: it.id,
          codigo: it.item.codigo,
          descricao: it.item.descricao,
          unidade: it.item.unidade?.sigla ?? "",
          pedida,
          minutado,
          pendente,
          valorPendente,
        });
      }
    }

    // Pedido sem nenhuma pendência (já todo minutado) não aparece.
    if (itensPendentes.length === 0) continue;

    const nome = p.cliente.nomeFantasia || p.cliente.razaoSocial;
    let cli = clientesMap.get(p.cliente.id);
    if (!cli) {
      cli = { id: p.cliente.id, nome, pedidos: [], totalItensPendentes: 0 };
      clientesMap.set(p.cliente.id, cli);
    }

    cli.pedidos.push({
      id: p.id,
      numero: p.numero,
      numeroOrcamento: p.numeroOrcamento,
      status: p.status,
      pago: p.contasReceber.length > 0,
      dataEmissao: p.dataEmissao.toISOString(),
      dataEntrega: p.dataEntrega ? p.dataEntrega.toISOString() : null,
      itens: itensPendentes,
      totalPendente: itensPendentes.reduce((s, i) => s + i.pendente, 0),
      valorPendente: itensPendentes.reduce((s, i) => s + i.valorPendente, 0),
    });
    cli.totalItensPendentes += itensPendentes.length;
  }

  const clientes = Array.from(clientesMap.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );

  // Mesma tela, alternável: visão por material (regra ENTREGUE, formato planilha).
  const materiais = await getSaldoMateriaisAEntregar();

  return <SaldoClientesView clientes={clientes} materiais={materiais} />;
}
