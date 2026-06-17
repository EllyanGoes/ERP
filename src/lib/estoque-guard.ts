import { NextResponse } from "next/server";

// Trava de saldo negativo. A regra do negócio passou a ser: NENHUMA saída pode
// deixar o saldo de um item negativo (antes vários fluxos permitiam). Cada fluxo
// de SAÍDA, depois de calcular o saldoDepois de cada item, junta os que ficariam
// negativos e chama `assertSaldoNaoNegativo` — que aborta a transação. O handler
// mapeia o erro para HTTP 422 com `respostaSaldoNegativo`.

export type ItemSaldoNegativo = {
  itemId: string;
  descricao?: string | null;
  saldoAtual: number;
  saldoDepois: number;
};

export class SaldoNegativoError extends Error {
  readonly itens: ItemSaldoNegativo[];
  constructor(itens: ItemSaldoNegativo[]) {
    super("SALDO_NEGATIVO");
    this.name = "SaldoNegativoError";
    this.itens = itens;
  }
}

// Tolerância p/ ruído de ponto flutuante (saldos são Decimal(15,3)).
const EPS = 1e-9;

/** Lança SaldoNegativoError se algum item ficar com saldoDepois < 0. */
export function assertSaldoNaoNegativo(itens: ItemSaldoNegativo[]): void {
  const negativos = itens.filter((i) => i.saldoDepois < -EPS);
  if (negativos.length > 0) throw new SaldoNegativoError(negativos);
}

/** Resposta HTTP 422 padrão para SaldoNegativoError (consumida pelo front). */
export function respostaSaldoNegativo(err: SaldoNegativoError): NextResponse {
  const nomes = err.itens.map((i) => i.descricao ?? i.itemId).join(", ");
  const plural = err.itens.length === 1;
  return NextResponse.json(
    {
      error:
        `Saldo insuficiente: a saída deixaria ${plural ? "o item" : "os itens"} ` +
        `${nomes} com saldo negativo. Registre a entrada/ajuste de inventário antes.`,
      codigo: "SALDO_NEGATIVO",
      negativos: err.itens,
    },
    { status: 422 },
  );
}
