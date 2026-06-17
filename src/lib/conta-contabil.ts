import { prisma } from "@/lib/prisma";

// Códigos das contas sintéticas-pai que recebem as analíticas por entidade
// (criadas no seed da migration do módulo Contabilidade).
const COD_CLIENTES = "1.1.2";
const COD_FORNECEDORES = "2.1.1";

// Próximo código sequencial sob um pai: <codigoPai>.NNNN
export async function proximoCodigo(paiId: string, paiCodigo: string): Promise<string> {
  const filhos = await prisma.contaContabil.findMany({
    where: { paiId },
    select: { codigo: true },
  });
  let max = 0;
  for (const f of filhos) {
    const n = parseInt(f.codigo.split(".").pop() ?? "", 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${paiCodigo}.${String(max + 1).padStart(4, "0")}`;
}

/**
 * Garante (idempotente) a conta contábil analítica de um cliente, sob a conta
 * sintética "Clientes" (1.1.2). Retorna null se o plano ainda não foi semeado.
 */
export async function garantirContaContabilCliente(clienteId: string) {
  const existente = await prisma.contaContabil.findUnique({ where: { clienteId } });
  if (existente) return existente;

  const [cliente, pai] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } }),
    prisma.contaContabil.findFirst({ where: { codigo: COD_CLIENTES } }),
  ]);
  if (!cliente || !pai) return null;

  const codigo = await proximoCodigo(pai.id, pai.codigo);
  return prisma.contaContabil.create({
    data: {
      codigo,
      nome: cliente.razaoSocial,
      grupo: "ATIVO",
      natureza: "DEVEDORA",
      tipo: "ANALITICA",
      nivel: pai.nivel + 1,
      aceitaLancamento: true,
      paiId: pai.id,
      clienteId,
    },
  });
}

/**
 * Garante (idempotente) a conta contábil analítica de um fornecedor, sob a
 * conta sintética "Fornecedores" (2.1.1). Retorna null se o plano não foi semeado.
 */
export async function garantirContaContabilFornecedor(fornecedorId: string) {
  const existente = await prisma.contaContabil.findUnique({ where: { fornecedorId } });
  if (existente) return existente;

  const [fornecedor, pai] = await Promise.all([
    prisma.fornecedor.findUnique({ where: { id: fornecedorId }, select: { razaoSocial: true } }),
    prisma.contaContabil.findFirst({ where: { codigo: COD_FORNECEDORES } }),
  ]);
  if (!fornecedor || !pai) return null;

  const codigo = await proximoCodigo(pai.id, pai.codigo);
  return prisma.contaContabil.create({
    data: {
      codigo,
      nome: fornecedor.razaoSocial,
      grupo: "PASSIVO",
      natureza: "CREDORA",
      tipo: "ANALITICA",
      nivel: pai.nivel + 1,
      aceitaLancamento: true,
      paiId: pai.id,
      fornecedorId,
    },
  });
}
