import { Prisma } from "@prisma/client";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import { generateDocNumber } from "@/lib/utils";

const num = (d: unknown) => parseFloat(String(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CondicaoParcelas = {
  numeroParcelas?: number | null;
  prazoInicial?: number | null;     // dias até a 1ª parcela
  intervaloParcelas?: number | null; // dias entre parcelas
} | null;

/**
 * Gera as contas a receber de um pedido conforme a CONDIÇÃO DE PAGAMENTO:
 *  • à vista (1×, prazo 0) → 1 título vence hoje/emissão;
 *  • a prazo → 1 título vence em `prazoInicial` dias;
 *  • parcelado → N títulos (parcelaNumero/parcelaTotal) com vencimentos
 *    escalonados por `intervaloParcelas`.
 * Todos nascem ABERTA. Não cria nada se já houver título no pedido (guarda no
 * chamador) ou se valorTotal ≤ 0. Reaproveita a numeração por empresa.
 */
export async function gerarContasReceberDoPedido(
  tx: Prisma.TransactionClient,
  pedido: {
    id: string; empresaId: string; clienteId: string; numero: string;
    valorTotal: unknown; dataEmissao: Date | string;
  },
  condicao: CondicaoParcelas,
): Promise<number> {
  const total = round2(num(pedido.valorTotal));
  if (total <= 0) return 0;

  const n = Math.max(1, Math.floor(condicao?.numeroParcelas ?? 1));
  const prazoInicial = Math.max(0, Math.floor(condicao?.prazoInicial ?? 0));
  const intervalo = Math.max(0, Math.floor(condicao?.intervaloParcelas ?? 30));

  // Emissão como meia-noite UTC (datas puras no padrão do projeto).
  const baseSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(pedido.dataEmissao));
  const emissao = new Date(`${baseSP}T00:00:00.000Z`);

  const base = Math.floor((total / n) * 100) / 100;
  const grupoId = n > 1 ? crypto.randomUUID() : null;

  for (let i = 0; i < n; i++) {
    const venc = new Date(emissao.getTime() + (prazoInicial + i * intervalo) * 86400000);
    const valor = i === n - 1 ? round2(total - base * (n - 1)) : base;
    const numero = generateDocNumber("CR", await proximaSequenciaDaEmpresa(pedido.empresaId, "CR"));
    await tx.contaReceber.create({
      data: {
        empresaId: pedido.empresaId,
        numero,
        clienteId: pedido.clienteId,
        pedidoVendaId: pedido.id,
        descricao: n > 1 ? `Faturamento pedido ${pedido.numero} (${i + 1}/${n})` : `Faturamento pedido ${pedido.numero}`,
        valorOriginal: valor,
        dataVencimento: venc,
        status: "ABERTA",
        ...(grupoId ? { grupoParcelamentoId: grupoId, parcelaNumero: i + 1, parcelaTotal: n } : {}),
      },
    });
  }
  return n;
}
