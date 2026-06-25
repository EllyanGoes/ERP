/**
 * Seed idempotente das naturezas-gaveta de requisição de material.
 *
 * Hierarquia:
 *  - "Material de manutenção" é um NÓ SINTÉTICO (NaturezaSubgrupo, NÃO lançável,
 *    só agrupa/soma). Os lançamentos vão nos filhos folha.
 *  - As demais são naturezas folha lançáveis direto (sem subgrupo).
 *
 * `destinoSugerido` é só a "flag de roteamento" do ALERTA de coerência na RM — o
 * destino contábil real (PEP_MD/CIF/IMOBILIZADO/DESPESA) vem das flags do item +
 * centro de custo (FASE 4). Por isso NÃO setamos `cif=true` aqui (isso voltaria a
 * rotear por natureza). Ajuste fino de grupo/destino pode ser feito no cadastro.
 *
 * Rodar: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seeds/naturezas-requisicao.ts
 */
import { PrismaClient, NaturezaTipo, NaturezaGrupo, DestinoConsumo } from "@prisma/client";

const prisma = new PrismaClient();
const EMPRESA_ID = "emp_tramontin";

// Folhas de manutenção (filhas do subgrupo sintético) — manutenção fabril = CIF.
const MANUTENCAO_FILHAS = ["Peças de reposição", "Abrasivos", "Material elétrico", "Solda", "Lubrificante", "Refratário"];

// Naturezas folha lançáveis direto (sem subgrupo).
const FOLHAS: { nome: string; grupo: NaturezaGrupo; destino: DestinoConsumo }[] = [
  { nome: "Material de segurança", grupo: "CUSTO_OPERACIONAL", destino: "CIF" }, // EPI/uniforme fabril
  { nome: "Material de limpeza", grupo: "DESPESA_OPERACIONAL", destino: "DESPESA" },
  { nome: "Material de consumo geral", grupo: "DESPESA_OPERACIONAL", destino: "DESPESA" },
  { nome: "Material de escritório/TI", grupo: "DESPESA_OPERACIONAL", destino: "DESPESA" },
];

async function getOrCreateSubgrupo(nome: string, grupo: NaturezaGrupo) {
  const existing = await prisma.naturezaSubgrupo.findFirst({ where: { nome, empresaId: EMPRESA_ID } });
  if (existing) return existing;
  return prisma.naturezaSubgrupo.create({ data: { nome, grupo, empresaId: EMPRESA_ID } });
}

async function getOrCreateNatureza(nome: string, grupo: NaturezaGrupo, destino: DestinoConsumo, subgrupoId: string | null) {
  const existing = await prisma.naturezaFinanceira.findFirst({ where: { nome, empresaId: EMPRESA_ID } });
  if (existing) {
    // Mantém em dia subgrupo/destino caso já exista de uma rodada anterior.
    return prisma.naturezaFinanceira.update({ where: { id: existing.id }, data: { subgrupoId, destinoSugerido: destino } });
  }
  return prisma.naturezaFinanceira.create({
    data: { nome, tipo: NaturezaTipo.SAIDA, grupo, subgrupoId, destinoSugerido: destino, empresaId: EMPRESA_ID, cif: false },
  });
}

async function main() {
  const manutencao = await getOrCreateSubgrupo("Material de manutenção", "CUSTO_OPERACIONAL");
  for (const nome of MANUTENCAO_FILHAS) {
    await getOrCreateNatureza(nome, "CUSTO_OPERACIONAL", "CIF", manutencao.id);
  }
  for (const f of FOLHAS) {
    await getOrCreateNatureza(f.nome, f.grupo, f.destino, null);
  }
  const total = MANUTENCAO_FILHAS.length + FOLHAS.length;
  console.log(`OK — subgrupo "Material de manutenção" + ${total} naturezas (idempotente).`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
