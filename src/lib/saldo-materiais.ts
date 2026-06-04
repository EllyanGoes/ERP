import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

const EPS = 1e-6;

// Uma linha do relatório (um pedido que ainda deve material deste material).
export type SaldoMaterialRow = {
  pedidoId: string;
  numero: string;              // PED
  numeroOrcamento: string | null;
  status: string;
  dataEmissao: string;         // ISO — formatado no cliente
  clienteNome: string;
  quantidade: number;          // saldo a entregar (pedido − entregue)
  valorUnitario: number;       // valor efetivo = valorTotal da linha ÷ quantidade pedida
  valorTotal: number;          // quantidade (saldo) × valorUnitario  →  QNT × VALOR = TOTAL
};

// Um bloco do relatório (um material, ex.: "AREIA 61742").
export type MaterialComSaldo = {
  id: string;                  // id do item (chave)
  codigo: string;
  descricao: string;
  unidade: string;
  rows: SaldoMaterialRow[];
  totalQuantidade: number;
  totalValor: number;
};

/**
 * Saldo de material a ENTREGAR, agrupado por material.
 *
 * Mesma regra de "saldo a entregar" do resto do sistema: só minutas com status
 * ENTREGUE descontam do saldo (igual a getItensPendentesEntrega / auto-conclusão).
 * O universo de pedidos é o mesmo do "Saldo por Cliente" (CONFIRMADO / EM_AGENDAMENTO),
 * mudando apenas a definição de "entregue" (lá conta toda minuta não cancelada).
 *
 * VALOR = valorTotal da linha ÷ quantidade pedida (valor efetivo, já líquido de
 * desconto). Assim QNT × VALOR = TOTAL fecha na tela, batendo com a planilha.
 */
export async function getSaldoMateriaisAEntregar(): Promise<MaterialComSaldo[]> {
  const pedidos = await prisma.pedidoVenda.findMany({
    where: { status: { in: ["CONFIRMADO", "EM_AGENDAMENTO"] } },
    select: {
      id: true,
      numero: true,
      numeroOrcamento: true,
      status: true,
      dataEmissao: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      itens: {
        select: {
          quantidade: true,
          valorTotal: true,
          item: {
            select: {
              id: true,
              codigo: true,
              descricao: true,
              unidade: { select: { sigla: true } },
            },
          },
          // Só o que JÁ saiu fisicamente (minuta ENTREGUE) abate o saldo.
          minutaItens: {
            where: { minuta: { status: "ENTREGUE" } },
            select: { quantidade: true },
          },
        },
      },
    },
    orderBy: { dataEmissao: "asc" },
  });

  const map = new Map<string, MaterialComSaldo>();

  for (const p of pedidos) {
    const clienteNome = p.cliente.nomeFantasia || p.cliente.razaoSocial;

    for (const it of p.itens) {
      const pedida = decimalToNumber(it.quantidade);
      const entregue = it.minutaItens.reduce(
        (s, mi) => s + decimalToNumber(mi.quantidade),
        0,
      );
      const pendente = pedida - entregue;
      if (pendente <= EPS) continue;

      const valorTotalLinha = decimalToNumber(it.valorTotal);
      const valorUnitario = pedida > 0 ? valorTotalLinha / pedida : 0;
      const valorPendente = pendente * valorUnitario;

      const key = it.item.id;
      let mat = map.get(key);
      if (!mat) {
        mat = {
          id: it.item.id,
          codigo: it.item.codigo,
          descricao: it.item.descricao,
          unidade: it.item.unidade?.sigla ?? "",
          rows: [],
          totalQuantidade: 0,
          totalValor: 0,
        };
        map.set(key, mat);
      }

      mat.rows.push({
        pedidoId: p.id,
        numero: p.numero,
        numeroOrcamento: p.numeroOrcamento,
        status: p.status,
        dataEmissao: p.dataEmissao.toISOString(),
        clienteNome,
        quantidade: pendente,
        valorUnitario,
        valorTotal: valorPendente,
      });
      mat.totalQuantidade += pendente;
      mat.totalValor += valorPendente;
    }
  }

  // Materiais em ordem alfabética (igual à planilha: AREIA, BRITA, CIMENTO…).
  return Array.from(map.values()).sort((a, b) =>
    a.descricao.localeCompare(b.descricao, "pt-BR"),
  );
}
