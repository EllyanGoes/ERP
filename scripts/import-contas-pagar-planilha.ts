/**
 * Import da planilha "CONTAS A PAGAR.xlsx" (Tramontin / Atlas) — jul/2026.
 *
 * Cria um título ContaPagar por linha EM ABERTO das abas 07 e 08 e, para os
 * parcelamentos/financiamentos com total conhecido (PARC X/Y), TODAS as
 * parcelas futuras até a última. Os dados foram extraídos da planilha e ficam
 * HARDCODED abaixo (determinístico e revisável — o xlsx não é lido em runtime).
 *
 * Passivo:
 *  - impostos correntes (sem vínculo)      → 2.1.5.x "Impostos a Recolher"
 *  - parcelamentos tributários ≤ 12 meses  → 2.1.5.x "Parcelamentos Tributários"
 *  - parcelamentos tributários > 12 meses  → 2.2.2   "Parcelamentos Tributários (LP)"
 *  - financiamentos de máquinas (≤ 12m)    → 2.1.3.0001 "Financiamentos a Pagar"
 *  - FGTS / pensão / consignados           → contas da folha (2.1.5.x / 2.1.8)
 * Parcelamentos/financiamentos usam semProvisao=true (dívida de exercícios
 * anteriores): a provisão NÃO vai para a DRE — um único lançamento de ABERTURA
 * por empresa (D 2.3.3 Saldos de Abertura / C passivos) registra o estoque da
 * dívida; a liquidação de cada parcela segue D passivo / C banco normalmente.
 *
 * Uso:  npx tsx scripts/import-contas-pagar-planilha.ts [--dry]
 * Idempotente: tag [import-planilha-cp-2026-07 #chave] em observacoes; re-rodar
 * pula o que já existe. Lançamento de abertura re-sincroniza (MANUAL/origemId).
 */
import { prismaSemEscopo } from "../src/lib/prisma";
import { proximaSequenciaDaEmpresa } from "../src/lib/empresa";
import { generateSimpleDocNumber } from "../src/lib/utils";
import { contabilizarTituloPagar, registrarLancamento } from "../src/lib/contabilidade";
import {
  garantirContasFolha,
  garantirContaSaldoAbertura,
  garantirContaContabilFornecedor,
  garantirContaContabilNatureza,
  garantirContaColaboradorNaEmpresa,
} from "../src/lib/conta-contabil";
import crypto from "crypto";

const TAG = "import-planilha-cp-2026-07";
const CRIADO_POR = "Import planilha CP";
// Parcela tributária com vencimento APÓS esta data → passivo não circulante (2.2.2).
const CUTOFF_LP = "2027-07-31";

const EMP = { T: "emp_tramontin", A: "emp_atlas" } as const;
type Emp = keyof typeof EMP;

// ── Dados extraídos da planilha ─────────────────────────────────────────────

type Avulso = {
  chave: string;
  empresa: Emp;
  venc: string; // YYYY-MM-DD
  desc: string;
  valor: number;
  natureza: string; // código do plano de naturezas
  fornecedor?: string; // razão social (get-or-create)
  colaborador?: string; // termo de busca por nome (fallback: sem vínculo/OUTROS)
  passivo?: "IMP" | "FGTS" | "OUTROS"; // destino do passivo quando sem vínculo
  doc?: string;
  parcela?: { n: number; total: number | null; grupo: string };
};

// Abas 07 e 08 — apenas linhas PENDENTE / A PAGAR (as PAGAS ficam fora).
// Parcelas "curtas" com evidência nas abas 09/10 (Metal Nobre 2/2, Santa
// Apolônia 03, Bertan 2-3/3, Real 03, Machado 3-5/5) entram aqui com data e
// valor próprios. CEA EQUATORIAL MÊS 07 está SEM VALOR na planilha → fora.
const AVULSOS: Avulso[] = [
  // ── Aba 07 — Tramontin
  { chave: "a07-01", empresa: "T", venc: "2026-04-20", desc: "SIMPLES NACIONAL - MÊS 03", valor: 28824.09, natureza: "5.02", passivo: "IMP", doc: "07.20.26100.4930065-5" },
  { chave: "a07-02", empresa: "T", venc: "2026-06-05", desc: "ENGMED", valor: 1410.0, natureza: "4.04", fornecedor: "Clínica Engmed", doc: "9959" },
  { chave: "a07-03", empresa: "T", venc: "2026-06-07", desc: "ALUGUEL - IVANETE - MÊS 06", valor: 800.0, natureza: "4.03", fornecedor: "Ivanete (Aluguel)" },
  { chave: "a07-04", empresa: "T", venc: "2026-06-10", desc: "ICMS SUBSTITUIÇÃO TRIBUTÁRIA", valor: 12935.86, natureza: "5.02", passivo: "IMP", doc: "3005009577" },
  { chave: "a07-05", empresa: "T", venc: "2026-06-21", desc: "CEA EQUATORIAL - MÊS 05", valor: 95661.4, natureza: "4.01", fornecedor: "CEA Equatorial", doc: "12376108" },
  { chave: "a07-06", empresa: "T", venc: "2026-06-30", desc: "Cobrança Picpay Bank - Banco Múltiplo S.A", valor: 1791.64, natureza: "8.02", fornecedor: "Picpay Bank", doc: "7613888654" },
  { chave: "a07-07", empresa: "T", venc: "2026-07-07", desc: "ALUGUEL - IVANETE - MÊS 07", valor: 800.0, natureza: "4.03", fornecedor: "Ivanete (Aluguel)" },
  { chave: "a07-08", empresa: "T", venc: "2026-07-10", desc: "RECIBO DE FÉRIAS - ALTAMIDISON (aquisitivo 17/05/2024 a 16/05/2025)", valor: 4787.48, natureza: "3.01", colaborador: "ALTAMIDISON" },
  { chave: "a07-09", empresa: "T", venc: "2026-07-10", desc: "RECIBO DE FÉRIAS - JULIO CEZAR (aquisitivo 12/09/2024 a 11/09/2025)", valor: 1914.22, natureza: "3.01", colaborador: "JULIO CEZAR" },
  { chave: "a07-10", empresa: "T", venc: "2026-07-10", desc: "RECIBO DE FÉRIAS - RAIMUNDO DIAS (aquisitivo 01/07/2025 a 30/06/2026)", valor: 4267.04, natureza: "3.01", colaborador: "RAIMUNDO DIAS" },
  { chave: "a07-11", empresa: "T", venc: "2026-07-10", desc: "ICMS DIFERENCIAL DE ALÍQUOTAS DECLARAÇÃO - REF 06/2026", valor: 13211.31, natureza: "5.02", passivo: "IMP" },
  { chave: "a07-12", empresa: "T", venc: "2026-07-13", desc: "SIMPLES NACIONAL - MÊS 05", valor: 27102.47, natureza: "5.02", passivo: "IMP", doc: "0720261916028537-9" },
  { chave: "a07-13", empresa: "T", venc: "2026-07-13", desc: "PENSÃO - JUNHO/2026 - JOSE COSTA", valor: 468.22, natureza: "3.02", passivo: "OUTROS" },
  { chave: "a07-14", empresa: "T", venc: "2026-07-20", desc: "FGTS - CONSIGNADO / FALTA NATANAEL", valor: 16589.91, natureza: "3.02", passivo: "FGTS", doc: "0126071349451288-5" },
  // ── Aba 07 — Atlas
  { chave: "a07-15", empresa: "A", venc: "2026-03-27", desc: "BMP - CIMENTOS DO BRASIL S.A. / CIBRASA - NASSAU (doc 0400527/01)", valor: 34022.42, natureza: "2.08", fornecedor: "BMP - Cimentos do Brasil S.A. (Cibrasa)", doc: "0400527/01" },
  { chave: "a07-16", empresa: "A", venc: "2026-03-27", desc: "BMP - CIMENTOS DO BRASIL S.A. / CIBRASA - NASSAU (doc 0400528/01)", valor: 34022.42, natureza: "2.08", fornecedor: "BMP - Cimentos do Brasil S.A. (Cibrasa)", doc: "0400528/01" },
  { chave: "a07-17", empresa: "A", venc: "2026-03-27", desc: "BMP - CIMENTOS DO BRASIL S.A. / CIBRASA - NASSAU (doc 0400533/01)", valor: 34022.42, natureza: "2.08", fornecedor: "BMP - Cimentos do Brasil S.A. (Cibrasa)", doc: "0400533/01" },
  { chave: "a07-18", empresa: "A", venc: "2026-05-15", desc: "ICMS - CTE 142 (DAE)", valor: 33440.0, natureza: "5.02", passivo: "IMP", doc: "712689154490" },
  { chave: "a07-19", empresa: "A", venc: "2026-05-28", desc: "ICMS - CTE 143 (DAE)", valor: 20290.18, natureza: "5.02", passivo: "IMP", doc: "712689214064" },
  { chave: "a07-20", empresa: "A", venc: "2026-05-28", desc: "ICMS - CTE 144 (DAE)", valor: 20930.4, natureza: "5.02", passivo: "IMP", doc: "712689202445" },
  { chave: "a07-21", empresa: "A", venc: "2026-06-12", desc: "ICMS - CTE 147 (DAE)", valor: 18468.0, natureza: "5.02", passivo: "IMP", doc: "712689293726" },
  { chave: "a07-22", empresa: "A", venc: "2026-06-12", desc: "ICMS - CTE 148 (DAE)", valor: 14774.4, natureza: "5.02", passivo: "IMP", doc: "712689293722" },
  { chave: "a07-23", empresa: "A", venc: "2026-06-20", desc: "RECIBO - MARIA FAVACHO - MÊS 05 + SERVIÇOS EMISSÃO DAE AVULSO", valor: 1801.0, natureza: "4.04", fornecedor: "Maria Favacho" },
  { chave: "a07-24", empresa: "A", venc: "2026-07-10", desc: "ICMS - CTE 152 (DAE)", valor: 39520.0, natureza: "5.02", passivo: "IMP", doc: "71268944" },
  { chave: "a07-25", empresa: "A", venc: "2026-07-10", desc: "COFINS - MAIO/2026", valor: 21819.25, natureza: "5.02", passivo: "IMP", doc: "0716261915793542-6" },
  // ── Aba 08 — Tramontin
  { chave: "a08-01", empresa: "T", venc: "2026-08-07", desc: "ALUGUEL - IVANETE - MÊS 08", valor: 800.0, natureza: "4.03", fornecedor: "Ivanete (Aluguel)" },
  { chave: "a08-02", empresa: "T", venc: "2026-08-10", desc: "BREVIDIESEL - PARC 2/2", valor: 4400.0, natureza: "2.03", fornecedor: "Brevidiesel", parcela: { n: 2, total: 2, grupo: "brevidiesel" } },
  { chave: "a08-03", empresa: "T", venc: "2026-08-10", desc: "VOCE TELECOM - FÁBRICA - MÊS 07", valor: 334.9, natureza: "4.02", fornecedor: "Voce Telecom" },
  { chave: "a08-04", empresa: "T", venc: "2026-08-10", desc: "HORUS - MÊS 07", valor: 410.0, natureza: "4.04", fornecedor: "Horus" },
  { chave: "a08-05", empresa: "T", venc: "2026-08-11", desc: "EGS SISTEMAS - MÊS 07", valor: 134.65, natureza: "4.04", fornecedor: "EGS Sistemas" },
  { chave: "a08-06", empresa: "T", venc: "2026-08-13", desc: "DEXION INFORMATICA - MÊS 07", valor: 533.16, natureza: "4.04", fornecedor: "Dexion Informática" },
  { chave: "a08-07", empresa: "T", venc: "2026-08-15", desc: "VOCE TELECOM - PORTO - MÊS 07", valor: 142.41, natureza: "4.02", fornecedor: "Voce Telecom" },
  { chave: "a08-08", empresa: "T", venc: "2026-08-23", desc: "PONTO ONLINE - RH - MÊS 08", valor: 279.9, natureza: "4.04", fornecedor: "Ponto Online" },
  { chave: "a08-09", empresa: "T", venc: "2026-08-30", desc: "ATALAIA SERVIÇO E MONITORAMENTO - MÊS 08", valor: 1485.0, natureza: "4.04", fornecedor: "Atalaia Serviço e Monitoramento", doc: "767086544" },
  { chave: "a08-10", empresa: "T", venc: "2026-08-14", desc: "METAL NOBRE - PARC 1/2", valor: 4600.0, natureza: "2.04", fornecedor: "Metal Nobre", doc: "1/2", parcela: { n: 1, total: 2, grupo: "metal-nobre" } },
  { chave: "a08-11", empresa: "T", venc: "2026-09-14", desc: "METAL NOBRE - PARC 2/2", valor: 4600.0, natureza: "2.04", fornecedor: "Metal Nobre", doc: "2/2", parcela: { n: 2, total: 2, grupo: "metal-nobre" } },
  { chave: "a08-12", empresa: "T", venc: "2026-08-17", desc: "SANTA APOLONIA - MOACIR BERNADINI - PARC 02", valor: 7100.0, natureza: "2.01", fornecedor: "Santa Apolônia (Moacir Bernadini)", doc: "964-02", parcela: { n: 2, total: null, grupo: "santa-apolonia" } },
  { chave: "a08-13", empresa: "T", venc: "2026-09-16", desc: "SANTA APOLONIA - MOACIR BERNADINI - PARC 03", valor: 7100.0, natureza: "2.01", fornecedor: "Santa Apolônia (Moacir Bernadini)", doc: "964-03", parcela: { n: 3, total: null, grupo: "santa-apolonia" } },
  { chave: "a08-14", empresa: "T", venc: "2026-08-24", desc: "BERTAN INDÚSTRIA E COMÉRCIO DE MÁQUINAS - PARC 1/3", valor: 10000.0, natureza: "2.04", fornecedor: "Bertan Indústria e Comércio de Máquinas", doc: "10272-1/3", parcela: { n: 1, total: 3, grupo: "bertan-10272" } },
  { chave: "a08-15", empresa: "T", venc: "2026-09-24", desc: "BERTAN INDÚSTRIA E COMÉRCIO DE MÁQUINAS - PARC 2/3", valor: 10000.0, natureza: "2.04", fornecedor: "Bertan Indústria e Comércio de Máquinas", doc: "10272-2/3", parcela: { n: 2, total: 3, grupo: "bertan-10272" } },
  { chave: "a08-16", empresa: "T", venc: "2026-10-24", desc: "BERTAN INDÚSTRIA E COMÉRCIO DE MÁQUINAS - PARC 3/3", valor: 10000.0, natureza: "2.04", fornecedor: "Bertan Indústria e Comércio de Máquinas", doc: "10272-3/3", parcela: { n: 3, total: 3, grupo: "bertan-10272" } },
  // ── Aba 08 — Atlas
  { chave: "a08-17", empresa: "A", venc: "2026-08-21", desc: "MACHADO DISTRIBUIÇÃO COMÉRCIO DE PEÇAS - PARC 2/5", valor: 2087.08, natureza: "2.04", fornecedor: "Machado Distribuição Comércio de Peças", doc: "50760", parcela: { n: 2, total: 5, grupo: "machado-5x" } },
  { chave: "a08-18", empresa: "A", venc: "2026-09-11", desc: "MACHADO DISTRIBUIÇÃO COMÉRCIO DE PEÇAS - PARC 3/5", valor: 2087.08, natureza: "2.04", fornecedor: "Machado Distribuição Comércio de Peças", doc: "50761", parcela: { n: 3, total: 5, grupo: "machado-5x" } },
  { chave: "a08-19", empresa: "A", venc: "2026-10-01", desc: "MACHADO DISTRIBUIÇÃO COMÉRCIO DE PEÇAS - PARC 4/5", valor: 2087.08, natureza: "2.04", fornecedor: "Machado Distribuição Comércio de Peças", doc: "50762", parcela: { n: 4, total: 5, grupo: "machado-5x" } },
  { chave: "a08-20", empresa: "A", venc: "2026-10-21", desc: "MACHADO DISTRIBUIÇÃO COMÉRCIO DE PEÇAS - PARC 5/5", valor: 2087.06, natureza: "2.04", fornecedor: "Machado Distribuição Comércio de Peças", doc: "50763", parcela: { n: 5, total: 5, grupo: "machado-5x" } },
  { chave: "a08-21", empresa: "A", venc: "2026-08-29", desc: "REAL COMÉRCIO DE EQUIPAMENTOS DE SEGURANÇA - PARC 02", valor: 2070.67, natureza: "2.06", fornecedor: "Real Comércio de Equipamentos de Segurança", doc: "108178-02", parcela: { n: 2, total: null, grupo: "real-108178" } },
  { chave: "a08-22", empresa: "A", venc: "2026-09-28", desc: "REAL COMÉRCIO DE EQUIPAMENTOS DE SEGURANÇA - PARC 03", valor: 2070.67, natureza: "2.06", fornecedor: "Real Comércio de Equipamentos de Segurança", doc: "108178-03", parcela: { n: 3, total: null, grupo: "real-108178" } },
];

// Parcelamentos/financiamentos com total conhecido: gera parcelas `de..ate`
// mensais a partir de `primeiroVenc` (fimDeMes: sempre último dia do mês).
type Contrato = {
  slug: string;
  empresa: Emp;
  base: string; // descrição sem o "PARC X/Y"
  doc?: string;
  de: number;
  ate: number;
  valor: number;
  primeiroVenc: string;
  fimDeMes?: boolean;
  destino: "FIN" | "TRIB";
  natureza: string;
};

const CONTRATOS: Contrato[] = [
  { slug: "escavadeira", empresa: "T", base: "ESCAVADEIRA", doc: "COS71639", de: 38, ate: 43, valor: 19190.05, primeiroVenc: "2026-08-10", destino: "FIN", natureza: "8.02" },
  { slug: "pa-carregadeira", empresa: "T", base: "PÁ CARREGADEIRA", doc: "COS72836", de: 39, ate: 46, valor: 22839.22, primeiroVenc: "2026-08-25", destino: "FIN", natureza: "8.02" },
  { slug: "simples-9131", empresa: "T", base: "SIMPLES PARCELADO Nº 9131 (10/2018 A 02/2022)", de: 51, ate: 59, valor: 17159.55, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "simples-9101", empresa: "T", base: "SIMPLES PARCELADO Nº 9101 (08/2013 A 10/2017)", de: 97, ate: 150, valor: 5209.54, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "darf-263939", empresa: "T", base: "DARF COD 1124 (02110001200263939172535) - PARCELADO 60X", de: 19, ate: 60, valor: 1034.79, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "parc-221257", empresa: "T", base: "PARC DÍVIDA (02110001200221257912669) ENTRADA", de: 8, ate: 60, valor: 3041.97, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "darf-074473", empresa: "T", base: "DARF COD 1124 (02110001200074473322520) - PARCELADO 60X", de: 18, ate: 60, valor: 4224.74, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "inss-pert", empresa: "T", base: "INSS COD 4308 PED 625179846 PERT", de: 104, ate: 145, valor: 1753.26, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "inss-643360050", empresa: "T", base: "INSS COMP 06/2021 A 09/2021 (643360050)", de: 46, ate: 56, valor: 703.25, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "reparc-5327253", empresa: "T", base: "NOVO REPARC DÍVIDA (5327253) 1734 DEMAIS DÉBITOS", de: 58, ate: 60, valor: 864.35, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "reparc-5331616", empresa: "T", base: "NOVO REPARC DÍVIDA (5331616) 1734 DEMAIS DÉBITOS", de: 58, ate: 60, valor: 803.68, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "reparc-015015754", empresa: "T", base: "NOVO REPARC DÍVIDA (015015754) ENTRADA", de: 8, ate: 12, valor: 6204.83, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "reparc-015017836", empresa: "T", base: "NOVO REPARC DÍVIDA (015017836) ENTRADA", de: 8, ate: 12, valor: 4214.9, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "reparc-015019051", empresa: "T", base: "NOVO REPARC DÍVIDA (015019051) ENTRADA", de: 8, ate: 12, valor: 448.75, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "simples-atlas", empresa: "A", base: "SIMPLES NACIONAL - PARCELAMENTO 60X", de: 7, ate: 60, valor: 6210.12, primeiroVenc: "2026-08-31", fimDeMes: true, destino: "TRIB", natureza: "8.06" },
  { slug: "pref-santana", empresa: "A", base: "PREF SANTANA - PARCELAMENTO 60X", de: 20, ate: 60, valor: 340.65, primeiroVenc: "2026-08-10", destino: "TRIB", natureza: "8.06" },
];

// Naturezas usadas no import (mesmas defs do plano hierárquico; get-or-create
// por empresa — na Atlas o plano com código ainda não foi aplicado). 8.06 é NOVA
// nas duas empresas (8.04/8.05 já são Aporte/Retirada de capital).
const NATUREZAS: Record<string, { nome: string; grupo: "CUSTO_OPERACIONAL" | "DESPESA_OPERACIONAL" | "FINANCIAMENTO" }> = {
  "2.01": { nome: "Matéria-prima", grupo: "CUSTO_OPERACIONAL" },
  "2.03": { nome: "Combustíveis e lubrificantes", grupo: "CUSTO_OPERACIONAL" },
  "2.04": { nome: "Material de manutenção", grupo: "CUSTO_OPERACIONAL" },
  "2.06": { nome: "Material de segurança", grupo: "CUSTO_OPERACIONAL" },
  "2.08": { nome: "Mercadorias para revenda", grupo: "CUSTO_OPERACIONAL" },
  "3.01": { nome: "Salários e ordenados", grupo: "DESPESA_OPERACIONAL" },
  "3.02": { nome: "Encargos sociais", grupo: "DESPESA_OPERACIONAL" },
  "4.01": { nome: "Energia elétrica", grupo: "DESPESA_OPERACIONAL" },
  "4.02": { nome: "Água, telefone e internet", grupo: "DESPESA_OPERACIONAL" },
  "4.03": { nome: "Aluguel", grupo: "DESPESA_OPERACIONAL" },
  "4.04": { nome: "Serviços de terceiros", grupo: "DESPESA_OPERACIONAL" },
  "5.02": { nome: "Impostos e taxas diversos", grupo: "DESPESA_OPERACIONAL" },
  "8.02": { nome: "Amortização de empréstimos", grupo: "FINANCIAMENTO" },
  "8.06": { nome: "Parcelamentos tributários", grupo: "FINANCIAMENTO" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const r2 = (x: number) => Math.round(x * 100) / 100;
const dUTC = (iso: string) => new Date(`${iso}T12:00:00`);

/** Soma `meses` a uma data ISO, clampando o dia (fimDeMes: sempre último dia). */
function addMeses(iso: string, meses: number, fimDeMes: boolean): string {
  const [y, m, d] = iso.split("-").map(Number);
  const alvoMes = m - 1 + meses;
  const ano = y + Math.floor(alvoMes / 12);
  const mes = ((alvoMes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = fimDeMes ? ultimo : Math.min(d, ultimo);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Próximo código de analítica sob um pai (NNNN sequencial, pulando .9xxx). */
function proximoSufixo(codigos: string[], paiCodigo: string): string {
  const usados = codigos
    .map((c) => c.startsWith(`${paiCodigo}.`) ? parseInt(c.slice(paiCodigo.length + 1), 10) : NaN)
    .filter((n) => Number.isFinite(n) && n < 9000);
  const prox = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${paiCodigo}.${String(prox).padStart(4, "0")}`;
}

async function garantirConta(
  empresaId: string,
  codigo: string,
  nome: string,
  paiCodigo: string,
  tipo: "SINTETICA" | "ANALITICA",
): Promise<string | null> {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo }, select: { id: true } });
  if (ex) return ex.id;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  const criada = await prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome, grupo: "PASSIVO", natureza: "CREDORA",
      tipo, nivel: pai.nivel + 1, aceitaLancamento: tipo === "ANALITICA", paiId: pai.id,
    },
    select: { id: true },
  });
  return criada.id;
}

async function garantirAnaliticaPorNome(empresaId: string, paiCodigo: string, nome: string): Promise<string | null> {
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, paiId: pai.id, nome }, select: { id: true } });
  if (ex) return ex.id;
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  const criada = await prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: proximoSufixo(filhos.map((f) => f.codigo), pai.codigo), nome,
      grupo: "PASSIVO", natureza: "CREDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
  return criada.id;
}

type ContasEmpresa = {
  impostosId: string; parcTribCircId: string; parcTribLpId: string;
  finId: string; fgtsId: string | null; outrosId: string | null;
};

async function setupContas(empresaId: string): Promise<ContasEmpresa> {
  // 2.1.5 Impostos a Pagar (sintética) + analíticas de imposto/parcelamento.
  await garantirConta(empresaId, "2.1.5", "Impostos a Pagar", "2.1", "SINTETICA");
  const impostosId = await garantirAnaliticaPorNome(empresaId, "2.1.5", "Impostos a Recolher");
  const parcTribCircId = await garantirAnaliticaPorNome(empresaId, "2.1.5", "Parcelamentos Tributários");
  // 2.1.3 Empréstimos e Financiamentos (circulante) + analítica.
  await garantirConta(empresaId, "2.1.3", "Empréstimos e Financiamentos", "2.1", "SINTETICA");
  const finId = await garantirConta(empresaId, "2.1.3.0001", "Financiamentos a Pagar", "2.1.3", "ANALITICA");
  // 2.2.2 Parcelamentos Tributários no NÃO CIRCULANTE (2.2 já existe no plano).
  const parcTribLpId = await garantirConta(empresaId, "2.2.2", "Parcelamentos Tributários (Longo Prazo)", "2.2", "ANALITICA");
  // 2.1.6 Salários a Pagar (pré-requisito das analíticas por colaborador).
  await garantirConta(empresaId, "2.1.6", "Salários a Pagar", "2.1", "SINTETICA");
  // Pré-cria SEQUENCIALMENTE as analíticas da folha: garantirContasFolha as cria
  // em Promise.all e as três calculariam o mesmo próximo código (P2002).
  for (const nome of ["INSS a Recolher", "IRRF a Recolher", "FGTS a Recolher"]) {
    await garantirAnaliticaPorNome(empresaId, "2.1.5", nome);
  }
  // FGTS a Recolher / Consignados e Outros a Repassar (helpers da folha).
  const folha = await garantirContasFolha(empresaId);
  if (!impostosId || !parcTribCircId || !parcTribLpId || !finId) {
    throw new Error(`Contas de passivo incompletas na empresa ${empresaId} — o plano contábil base (2.1/2.2) existe?`);
  }
  return { impostosId, parcTribCircId, parcTribLpId, finId, fgtsId: folha.fgtsId, outrosId: folha.outrosId };
}

async function setupNaturezas(empresaId: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const [codigo, def] of Object.entries(NATUREZAS)) {
    let nat = await prismaSemEscopo.naturezaFinanceira.findFirst({ where: { empresaId, codigo }, select: { id: true } });
    if (!nat) {
      const n = parseInt(codigo, 10);
      nat = await prismaSemEscopo.naturezaFinanceira.create({
        data: {
          empresaId, codigo, nome: def.nome, tipo: "SAIDA", grupo: def.grupo,
          afetaResultado: n < 7, cif: false,
          ordem: Math.round(parseFloat(codigo.replace(".", "")) || 0),
          criadoPor: CRIADO_POR,
        },
        select: { id: true },
      });
      // Conta de resultado auto-criada p/ naturezas que afetam a DRE.
      if (n < 7) await garantirContaContabilNatureza(nat.id).catch(() => null);
    }
    mapa.set(codigo, nat.id);
  }
  return mapa;
}

/** Backfill de contrapartidas nulas (corrige o aviso do seed p/ títulos futuros). */
async function backfillContrapartidas(empresaId: string, contas: ContasEmpresa) {
  const alvos: [string, string][] = [
    ["5.01", contas.impostosId], ["5.02", contas.impostosId],
    ["8.02", contas.finId], ["8.06", contas.parcTribCircId],
  ];
  for (const [codigo, contaId] of alvos) {
    await prismaSemEscopo.naturezaFinanceira.updateMany({
      where: { empresaId, codigo, contaContrapartidaId: null },
      data: { contaContrapartidaId: contaId },
    });
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dry = process.argv.includes("--dry");
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log(`DB: ${dbUrl.replace(/:\/\/[^@]*@/, "://***@") || "(default .env)"}`);
  console.log(dry ? "── DRY RUN (nada será gravado) ──" : "── IMPORT REAL ──");

  // Linhas expandidas: avulsos + parcelas dos contratos.
  type LinhaFinal = Avulso & { destino?: "FIN" | "TRIB"; semProvisao?: boolean; grupoContrato?: string };
  const linhas: LinhaFinal[] = [...AVULSOS];
  for (const c of CONTRATOS) {
    for (let n = c.de; n <= c.ate; n++) {
      const venc = addMeses(c.primeiroVenc, n - c.de, c.fimDeMes === true);
      linhas.push({
        chave: `p-${c.slug}-${n}`, empresa: c.empresa, venc,
        desc: `${c.base} - PARC ${n}/${c.ate}`, valor: c.valor, natureza: c.natureza,
        doc: c.doc, parcela: { n, total: c.ate, grupo: c.slug },
        destino: c.destino, semProvisao: true, grupoContrato: c.slug,
      });
    }
  }

  // Idempotência: chaves já importadas (tag em observacoes).
  const existentes = await prismaSemEscopo.contaPagar.findMany({
    where: { observacoes: { contains: `[${TAG}` } },
    select: { observacoes: true },
  });
  const jaImportadas = new Set<string>();
  for (const e of existentes) {
    const m = e.observacoes?.match(/#([\w-]+)\]/g) ?? [];
    for (const x of m) jaImportadas.add(x.slice(1, -1));
  }

  // Setup por empresa (contas/naturezas) — no dry, só resolve o que já existe.
  const contasPorEmpresa = new Map<string, ContasEmpresa>();
  const natPorEmpresa = new Map<string, Map<string, string>>();
  if (!dry) {
    for (const empresaId of [EMP.T, EMP.A]) {
      const contas = await setupContas(empresaId);
      contasPorEmpresa.set(empresaId, contas);
      natPorEmpresa.set(empresaId, await setupNaturezas(empresaId));
      await backfillContrapartidas(empresaId, contas);
    }
  }

  // Fornecedores: get-or-create por nome normalizado.
  const fornCache = new Map<string, string>();
  const fornCriados: string[] = [];
  async function fornecedorId(nome: string): Promise<string | null> {
    const norm = nome.trim().toUpperCase().replace(/\s+/g, " ");
    if (fornCache.has(norm)) return fornCache.get(norm)!;
    // Busca ampla: razão social OU fantasia contendo o primeiro termo relevante.
    const termo = norm.split(" ")[0];
    const candidatos = await prismaSemEscopo.fornecedor.findMany({
      where: { OR: [{ razaoSocial: { contains: termo, mode: "insensitive" } }, { nomeFantasia: { contains: termo, mode: "insensitive" } }] },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
    });
    const hit = candidatos.find((c) =>
      c.razaoSocial.trim().toUpperCase().replace(/\s+/g, " ") === norm ||
      (c.nomeFantasia ?? "").trim().toUpperCase().replace(/\s+/g, " ") === norm) ?? candidatos[0] ?? null;
    if (hit) { fornCache.set(norm, hit.id); return hit.id; }
    if (dry) { fornCriados.push(`${nome} (novo)`); fornCache.set(norm, "dry"); return null; }
    const criado = await prismaSemEscopo.fornecedor.create({ data: { razaoSocial: nome, criadoPor: CRIADO_POR }, select: { id: true } });
    await garantirContaContabilFornecedor(criado.id).catch(() => null);
    fornCache.set(norm, criado.id);
    fornCriados.push(nome);
    return criado.id;
  }

  // Colaboradores: match por nome (fallback: sem vínculo / Consignados).
  const colabCache = new Map<string, string | null>();
  const colabSemMatch = new Set<string>();
  async function colaboradorId(termo: string): Promise<string | null> {
    if (colabCache.has(termo)) return colabCache.get(termo)!;
    const c = await prismaSemEscopo.colaborador.findFirst({
      where: { nome: { contains: termo, mode: "insensitive" } }, select: { id: true },
    });
    colabCache.set(termo, c?.id ?? null);
    if (!c) colabSemMatch.add(termo);
    return c?.id ?? null;
  }

  // Grupo de parcelamento estável por contrato/grupo (uuid v5-like via hash).
  const grupoIds = new Map<string, string>();
  const grupoId = (g: string) => {
    if (!grupoIds.has(g)) grupoIds.set(g, crypto.createHash("sha1").update(`${TAG}:${g}`).digest("hex").slice(0, 32));
    return grupoIds.get(g)!;
  };

  const stats = {
    criados: { [EMP.T]: 0, [EMP.A]: 0 } as Record<string, number>,
    pulados: 0,
    total: { [EMP.T]: 0, [EMP.A]: 0 } as Record<string, number>,
    porPassivo: new Map<string, number>(),
  };

  for (const l of linhas) {
    const empresaId = EMP[l.empresa];
    if (jaImportadas.has(l.chave)) { stats.pulados++; continue; }

    // Guarda extra: colisão exata (mesma empresa/descrição/vencimento/valor).
    const colisao = await prismaSemEscopo.contaPagar.findFirst({
      where: { empresaId, descricao: l.desc, dataVencimento: dUTC(l.venc), valorOriginal: l.valor },
      select: { numero: true },
    });
    if (colisao) {
      console.log(`  ~ pulado (já existe ${colisao.numero}): ${l.desc} ${l.venc}`);
      stats.pulados++;
      continue;
    }

    // Resolve credor/passivo.
    let fornId: string | null = null;
    let beneficiarioTipo: string | null = null;
    let beneficiarioId: string | null = null;
    let contaPassivoId: string | null = null;
    if (l.fornecedor) {
      fornId = await fornecedorId(l.fornecedor);
      beneficiarioTipo = "FORNECEDOR";
    } else if (l.colaborador) {
      const cid = await colaboradorId(l.colaborador);
      if (cid) {
        beneficiarioTipo = "COLABORADOR";
        beneficiarioId = cid;
        if (!dry) await garantirContaColaboradorNaEmpresa(empresaId, cid).catch(() => null);
      } else if (!dry) {
        contaPassivoId = contasPorEmpresa.get(empresaId)!.outrosId;
      }
    } else if (!dry) {
      const contas = contasPorEmpresa.get(empresaId)!;
      if (l.destino === "FIN") contaPassivoId = contas.finId;
      else if (l.destino === "TRIB") contaPassivoId = l.venc > CUTOFF_LP ? contas.parcTribLpId : contas.parcTribCircId;
      else if (l.passivo === "FGTS") contaPassivoId = contas.fgtsId ?? contas.outrosId;
      else if (l.passivo === "OUTROS") contaPassivoId = contas.outrosId;
      else contaPassivoId = contas.impostosId; // IMP e default sem vínculo
    }

    const destinoLabel = l.destino === "FIN" ? "2.1.3 Financiamentos"
      : l.destino === "TRIB" ? (l.venc > CUTOFF_LP ? "2.2.2 Parc.Trib LP" : "2.1.5 Parc.Trib circ")
      : l.fornecedor ? "2.1.1 Fornecedores" : l.colaborador ? "2.1.6 Colaborador" : `2.1.x ${l.passivo ?? "IMP"}`;
    stats.total[empresaId] = r2((stats.total[empresaId] ?? 0) + l.valor);
    stats.porPassivo.set(destinoLabel, r2((stats.porPassivo.get(destinoLabel) ?? 0) + l.valor));

    if (dry) { stats.criados[empresaId]++; continue; }

    const natId = natPorEmpresa.get(empresaId)!.get(l.natureza);
    if (!natId) throw new Error(`Natureza ${l.natureza} não resolvida (${empresaId})`);

    const numero = generateSimpleDocNumber("CP", await proximaSequenciaDaEmpresa(empresaId, "CP"));
    const cp = await prismaSemEscopo.contaPagar.create({
      data: {
        empresaId,
        numero,
        descricao: l.desc,
        categoria: l.destino ? "Parcelamento" : null,
        fornecedorId: fornId,
        beneficiarioTipo,
        beneficiarioId,
        naturezaFinanceiraId: natId,
        contaPassivoId,
        semProvisao: l.semProvisao === true,
        valorOriginal: l.valor,
        dataVencimento: dUTC(l.venc),
        dataCompetencia: dUTC(l.venc),
        status: "ABERTA",
        grupoParcelamentoId: l.parcela ? grupoId(l.parcela.grupo) : null,
        parcelaNumero: l.parcela?.n ?? null,
        parcelaTotal: l.parcela?.total ?? null,
        notaFiscal: l.doc ?? null,
        observacoes: `Importado da planilha CONTAS A PAGAR (jul/2026). [${TAG} #${l.chave}]`,
        criadoPor: CRIADO_POR,
      },
      select: { id: true, numero: true },
    });
    await contabilizarTituloPagar(cp.id).catch((e) => console.log(`  ! contabilização falhou ${cp.numero}: ${e?.message}`));
    stats.criados[empresaId]++;
    if (stats.criados[EMP.T] + stats.criados[EMP.A] > 0 && (stats.criados[EMP.T] + stats.criados[EMP.A]) % 50 === 0) {
      console.log(`  … ${stats.criados[EMP.T] + stats.criados[EMP.A]} títulos criados`);
    }
  }

  // Lançamento de ABERTURA por empresa: D 2.3.3 / C passivos dos parcelamentos.
  // Idempotente (MANUAL + origemId fixo → registrarLancamento re-sincroniza).
  if (!dry) {
    for (const emp of ["T", "A"] as Emp[]) {
      const empresaId = EMP[emp];
      const contas = contasPorEmpresa.get(empresaId)!;
      let fin = 0, tribCirc = 0, tribLp = 0;
      for (const c of CONTRATOS.filter((x) => x.empresa === emp)) {
        for (let n = c.de; n <= c.ate; n++) {
          const venc = addMeses(c.primeiroVenc, n - c.de, c.fimDeMes === true);
          if (c.destino === "FIN") fin = r2(fin + c.valor);
          else if (venc > CUTOFF_LP) tribLp = r2(tribLp + c.valor);
          else tribCirc = r2(tribCirc + c.valor);
        }
      }
      const totalAbertura = r2(fin + tribCirc + tribLp);
      if (totalAbertura <= 0.005) continue;
      const contaAbertura = await garantirContaSaldoAbertura(empresaId);
      if (!contaAbertura) { console.log(`  ! sem conta 2.3.3 em ${empresaId} — abertura não lançada`); continue; }
      const partidas: { contaId: string; tipo: "DEBITO" | "CREDITO"; valor: number }[] = [
        { contaId: contaAbertura.id, tipo: "DEBITO", valor: totalAbertura },
      ];
      if (fin > 0.005) partidas.push({ contaId: contas.finId, tipo: "CREDITO", valor: fin });
      if (tribCirc > 0.005) partidas.push({ contaId: contas.parcTribCircId, tipo: "CREDITO", valor: tribCirc });
      if (tribLp > 0.005) partidas.push({ contaId: contas.parcTribLpId, tipo: "CREDITO", valor: tribLp });
      await registrarLancamento({
        empresaId,
        data: dUTC("2026-07-01"),
        historico: "Saldo de abertura — parcelamentos e financiamentos (import planilha CP jul/2026)",
        origemTipo: "MANUAL",
        origemId: `import-cp-abertura-${empresaId}`,
        criadoPor: CRIADO_POR,
        partidas,
      });
      console.log(`  ✔ abertura ${empresaId}: D 2.3.3 ${totalAbertura.toLocaleString("pt-BR")} / C fin ${fin.toLocaleString("pt-BR")} + trib.circ ${tribCirc.toLocaleString("pt-BR")} + trib.LP ${tribLp.toLocaleString("pt-BR")}`);
    }
  }

  // ── Relatório ──
  console.log("\n══ RESUMO ══");
  console.log(`Títulos criados: Tramontin ${stats.criados[EMP.T]} (R$ ${stats.total[EMP.T]?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) · Atlas ${stats.criados[EMP.A]} (R$ ${stats.total[EMP.A]?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  console.log(`Pulados (idempotência/colisão): ${stats.pulados}`);
  console.log("Por destino de passivo:");
  for (const [k, v] of Array.from(stats.porPassivo.entries()).sort()) {
    console.log(`  ${k}: R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if (fornCriados.length) console.log(`Fornecedores criados: ${fornCriados.join(" · ")}`);
  if (colabSemMatch.size) console.log(`Colaboradores SEM match (foram sem vínculo → Consignados): ${Array.from(colabSemMatch).join(", ")}`);
  console.log("Ignorado de propósito: CEA EQUATORIAL - MÊS 07 (sem valor na planilha).");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prismaSemEscopo.$disconnect());
