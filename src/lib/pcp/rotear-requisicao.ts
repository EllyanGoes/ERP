// Roteamento do destino contábil de uma Requisição de Material (RM), por item.
//
// Decide entre absorver o consumo no PEP (material direto), no CIF (indireto
// fabril) ou lançar como despesa — a partir de DOIS dados: o que é o item
// (cadastro) e onde está sendo consumido (centro de custo da RM). Função PURA,
// sem efeito colateral e sem tocar no ledger: quem chama resolve as contas e
// gera as partidas (ver contabilizarRequisicao em src/lib/contabilidade.ts).
//
// O destino vem das FLAGS DO ITEM + CENTRO DE CUSTO — nunca da natureza (que é só
// gaveta gerencial). O escape manual é o campo `destinoManual` da linha da RM, um
// destino explícito desacoplado da natureza.
//
// Precedência (não reordenar sem revisar os testes):
//  1. Material que compõe produto → PEP_MD, SEMPRE (independe do centro).
//  2. Destino manual explícito (destinoManual da linha) → vence (raro, escape).
//  3. Item que capitaliza (item.capitaliza) → IMOBILIZADO, ANTES do teste de centro —
//     material de obra p/ área fabril satisfaz "fabril", mas é investimento (ativo),
//     não CIF do mês; só impacta o resultado depois, via depreciação (CPC 27).
//  4. Item indireto de fábrica (item.fabril): decide pelo centro (dual-use) —
//     fabril → CIF; não-fabril → DESPESA; sem centro → INDEFINIDO (dado incompleto).
//  5. Resto → DESPESA (default seguro).

// Destino contábil "fechado" (sem o INDEFINIDO, que é estado de runtime). Espelha
// o enum Prisma DestinoConsumo — usado em destinoManual e natureza.destinoSugerido.
export type DestinoConsumo = "PEP_MD" | "IMOBILIZADO" | "CIF" | "DESPESA";
export type DestinoRequisicao = DestinoConsumo | "INDEFINIDO";

export type ItemRoteamento = {
  categoriaEstoque: string | null;
  compoeCusto: boolean;
  fabril: boolean;
  capitaliza: boolean;
};

// Categorias de material que compõem o produto e vão direto ao PEP-MD.
export const CATEGORIAS_DIRETO_PEP = new Set(["MATERIA_PRIMA", "INSUMO", "EMBALAGEM"]);

export function rotearDestinoRequisicao(args: {
  item: ItemRoteamento;
  /** Destino manual explícito da linha da RM (escape, independe da natureza). */
  destinoManual?: DestinoConsumo | null;
  /** O centro de custo da RM é fabril? null/undefined = centro não informado. */
  centroFabril?: boolean | null;
}): DestinoRequisicao {
  const { item, destinoManual, centroFabril } = args;

  // 1) Material direto que compõe o produto → PEP-MD, sempre. Nunca é ambíguo.
  if (item.compoeCusto && item.categoriaEstoque != null && CATEGORIAS_DIRETO_PEP.has(item.categoriaEstoque)) {
    return "PEP_MD";
  }

  // 2) Escape manual explícito: o destino da linha vence (desacoplado da natureza).
  if (destinoManual) return destinoManual;

  // 3) Item que capitaliza → Imobilizado (precede o centro: obra em área fabril é
  //    investimento, não CIF do mês).
  if (item.capitaliza) return "IMOBILIZADO";

  // 4) Indireto de fábrica: o destino depende de ONDE foi consumido.
  if (item.fabril) {
    if (centroFabril === true) return "CIF";
    if (centroFabril === false) return "DESPESA";
    return "INDEFINIDO"; // item indireto sem centro = dado incompleto; sinaliza.
  }

  // 5) Default seguro.
  return "DESPESA";
}
