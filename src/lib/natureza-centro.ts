// Regra de obrigatoriedade do CENTRO DE CUSTO num título que nasce no financeiro
// (sem material). O centro é exigido conforme ONDE o débito pousa, lido da natureza:
//  - despesa/custo (resultado) ou CIF → débito de custo → centro OBRIGATÓRIO.
//  - patrimonial (investimento/financiamento: imposto a recolher, principal de
//    empréstimo, adiantamento, transferência) → centro NÃO se aplica (oculto).
// O centro é gerencial no título (ContaPagar.centroCustoId); o razão segue decidido
// pela natureza — nada de dimensão nova na partida. Ver a feature "centro no
// lançamento financeiro sem material".
export type NaturezaParaCentro = { grupo?: string | null; cif?: boolean | null };

export function centroExigidoPelaNatureza(nat: NaturezaParaCentro | null | undefined): boolean {
  if (!nat) return false;
  if (nat.cif) return true; // CIF: usa o pool; o valor entra no rateio por centro
  return nat.grupo === "CUSTO_OPERACIONAL" || nat.grupo === "DESPESA_OPERACIONAL";
}
