import { prismaSemEscopo } from "@/lib/prisma";
import { garantirContaContabilBanco } from "@/lib/conta-contabil";

// PERMUTA como forma de pagamento: quitação por bens/serviços no lugar de
// dinheiro (total ou parcial). A condição de pagamento estrutura o PRAZO; a
// forma define o MEIO de quitação. A baixa de um título por permuta passa pela
// conta bancária TRANSITÓRIA "Permutas a liquidar" — a baixa do CP a credita,
// a do CR a debita, e ela zera quando os dois lados da troca liquidam (ou via
// Encontro de Contas). Nunca toca caixa/banco de verdade.

/**
 * Garante (idempotente) a conta bancária TRANSITÓRIA de permuta da empresa e a
 * sua analítica contábil (sob 1.1.1, via garantirContaContabilBanco). Retorna a
 * ContaBancaria. Espelho de garantirContaCompensacao (Encontro de Contas).
 */
export async function garantirContaPermuta(empresaId: string) {
  let cb = await prismaSemEscopo.contaBancaria.findFirst({ where: { empresaId, permuta: true } });
  if (!cb) {
    cb = await prismaSemEscopo.contaBancaria.create({
      data: { empresaId, nome: "Permutas a liquidar", permuta: true, ativo: true },
    });
  }
  await garantirContaContabilBanco(cb.id).catch((e) => console.error("[permuta] contabilizar conta transitória:", e));
  return cb;
}
