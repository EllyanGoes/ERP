import { prismaSemEscopo } from "@/lib/prisma";

// Conjunto PADRÃO de TES (Tipos de Entrada e Saída) alinhado às automações do
// backend: a precedência do material (rotearDestinoRequisicao) decide o destino a
// partir de compoeCusto (→PEP-MD), capitaliza (→Imobilizado) e centro fabril
// (→CIF/Despesa). O TES só CARREGA o comportamento e sugere almoxarifado/centro —
// NÃO decide destino nem carrega conta contábil. Referencia o almoxarifado por
// NOME (resolvido por empresa) e o centro por CÓDIGO (CentroCusto é global).

export type TesPadrao = {
  codigo: string;
  nome: string;
  sentido: "ENTRADA" | "SAIDA";
  estocavel: boolean;
  almoxarifadoNome: string | null; // resolvido p/ almoxarifadoDefaultId por empresa
  compoeCusto: boolean;
  permiteCapitalizar: boolean;
  geraFinanceiro: boolean;
  geraFiscal: boolean;
  cfop: string | null;
  centroSugeridoCodigo: string | null; // resolvido p/ centroCustoSugeridoId (global)
};

export const TES_PADRAO: TesPadrao[] = [
  // ── ENTRADA (compra → estoque; gera financeiro + fiscal) ──────────────────────
  { codigo: "TES-E01", nome: "Compra de Matéria-Prima", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Estoque de Argila", compoeCusto: true, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1101", centroSugeridoCodigo: null },
  { codigo: "TES-E02", nome: "Compra de Insumos (queima)", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Estoque de Insumos p/ queima", compoeCusto: true, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1101", centroSugeridoCodigo: null },
  { codigo: "TES-E03", nome: "Compra de Combustível", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Estoque de combustivel", compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1101", centroSugeridoCodigo: null },
  { codigo: "TES-E04", nome: "Compra de Embalagem", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Estoque de Embalagem (almoxarifado)", compoeCusto: true, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1101", centroSugeridoCodigo: null },
  { codigo: "TES-E05", nome: "Compra de Manutenção / MRO", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Almoxarifado", compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1556", centroSugeridoCodigo: null },
  { codigo: "TES-E06", nome: "Compra de Mercadoria p/ Revenda", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Estoque de Mercadorias", compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1102", centroSugeridoCodigo: null },
  { codigo: "TES-E07", nome: "Compra de Imobilizado", sentido: "ENTRADA", estocavel: true, almoxarifadoNome: "Almoxarifado", compoeCusto: false, permiteCapitalizar: true, geraFinanceiro: true, geraFiscal: true, cfop: "1551", centroSugeridoCodigo: null },
  { codigo: "TES-E08", nome: "Uso e Consumo (Despesa direta)", sentido: "ENTRADA", estocavel: false, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1556", centroSugeridoCodigo: null },
  { codigo: "TES-E09", nome: "Contratação de Serviço", sentido: "ENTRADA", estocavel: false, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: true, geraFiscal: true, cfop: "1933", centroSugeridoCodigo: null },

  // ── SAÍDA / RM (consumo; interno, sem financeiro/fiscal) ──────────────────────
  { codigo: "TES-S01", nome: "Consumo — Material Direto (Produção)", sentido: "SAIDA", estocavel: true, almoxarifadoNome: null, compoeCusto: true, permiteCapitalizar: false, geraFinanceiro: false, geraFiscal: false, cfop: null, centroSugeridoCodigo: null },
  { codigo: "TES-S02", nome: "Consumo — Manutenção Fabril (CIF)", sentido: "SAIDA", estocavel: true, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: false, geraFiscal: false, cfop: null, centroSugeridoCodigo: "AUX-05" },
  { codigo: "TES-S03", nome: "Consumo — Administrativo (Despesa)", sentido: "SAIDA", estocavel: true, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: false, geraFinanceiro: false, geraFiscal: false, cfop: null, centroSugeridoCodigo: "ADM-01" },
  { codigo: "TES-S04", nome: "Consumo — Imobilizado / Obra (Capex)", sentido: "SAIDA", estocavel: true, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: true, geraFinanceiro: false, geraFiscal: false, cfop: null, centroSugeridoCodigo: null },
  { codigo: "TES-S05", nome: "Troca de Componente (Capex + baixa CPC 27)", sentido: "SAIDA", estocavel: true, almoxarifadoNome: null, compoeCusto: false, permiteCapitalizar: true, geraFinanceiro: false, geraFiscal: false, cfop: null, centroSugeridoCodigo: null },
];

/**
 * Cria (idempotente) o conjunto padrão de TES numa empresa. Resolve o almoxarifado
 * por NOME (na empresa) e o centro sugerido por CÓDIGO (global); ausente → null.
 * Só cria o que ainda não existe (por empresaId+codigo) — NUNCA sobrescreve edições.
 */
export async function garantirTiposOperacaoPadrao(empresaId: string): Promise<{ criados: number; jaExistiam: number }> {
  const [locais, centros, existentes] = await Promise.all([
    prismaSemEscopo.localEstoque.findMany({ where: { empresaId }, select: { id: true, nome: true } }),
    prismaSemEscopo.centroCusto.findMany({ select: { id: true, codigo: true } }),
    prismaSemEscopo.tipoOperacao.findMany({ where: { empresaId }, select: { codigo: true } }),
  ]);
  const localPorNome = new Map(locais.map((l) => [l.nome, l.id]));
  const centroPorCodigo = new Map(centros.map((c) => [c.codigo, c.id]));
  const jaTem = new Set(existentes.map((e) => e.codigo));

  let criados = 0;
  let jaExistiam = 0;
  for (const t of TES_PADRAO) {
    if (jaTem.has(t.codigo)) { jaExistiam++; continue; }
    await prismaSemEscopo.tipoOperacao.create({
      data: {
        empresaId,
        codigo: t.codigo,
        nome: t.nome,
        sentido: t.sentido,
        estocavel: t.estocavel,
        almoxarifadoDefaultId: t.almoxarifadoNome ? (localPorNome.get(t.almoxarifadoNome) ?? null) : null,
        compoeCusto: t.compoeCusto,
        permiteCapitalizar: t.permiteCapitalizar,
        geraFinanceiro: t.geraFinanceiro,
        geraFiscal: t.geraFiscal,
        cfop: t.cfop,
        centroCustoSugeridoId: t.centroSugeridoCodigo ? (centroPorCodigo.get(t.centroSugeridoCodigo) ?? null) : null,
      },
    }).then(() => { criados++; }).catch(() => { /* corrida na unique (empresa,codigo) → ignora */ });
  }
  return { criados, jaExistiam };
}
