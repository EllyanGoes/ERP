import { prisma, prismaSemEscopo } from "@/lib/prisma";

// Códigos das contas sintéticas-pai que recebem as analíticas por entidade
// (criadas no seed da migration do módulo Contabilidade).
const COD_CLIENTES = "1.1.2";
const COD_FORNECEDORES = "2.1.1";

// Próximo código sequencial sob um pai (empresa ativa / escopo atual). Usado pela
// API de criação manual de contas.
export async function proximoCodigo(paiId: string, paiCodigo: string): Promise<string> {
  const filhos = await prisma.contaContabil.findMany({ where: { paiId }, select: { codigo: true } });
  return montarProximo(paiCodigo, filhos.map((f) => f.codigo));
}

function montarProximo(paiCodigo: string, codigos: string[]): string {
  let max = 0;
  for (const c of codigos) {
    const n = parseInt(c.split(".").pop() ?? "", 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${paiCodigo}.${String(max + 1).padStart(4, "0")}`;
}

// Garante a conta analítica de uma entidade (cliente/fornecedor) numa empresa
// específica. Cross-empresa: usa prismaSemEscopo com empresaId explícito.
async function garantirEntidadeEmpresa(
  empresaId: string,
  tipo: "cliente" | "fornecedor",
  entidadeId: string,
  nome: string,
) {
  const chave = tipo === "cliente" ? { clienteId: entidadeId } : { fornecedorId: entidadeId };
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, ...chave } });
  if (existente) return existente;

  const codPai = tipo === "cliente" ? COD_CLIENTES : COD_FORNECEDORES;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: codPai } });
  if (!pai) return null; // plano da empresa ainda não semeado

  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  const codigo = montarProximo(pai.codigo, filhos.map((f) => f.codigo));

  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId,
      codigo,
      nome,
      grupo: tipo === "cliente" ? "ATIVO" : "PASSIVO",
      natureza: tipo === "cliente" ? "DEVEDORA" : "CREDORA",
      tipo: "ANALITICA",
      nivel: pai.nivel + 1,
      aceitaLancamento: true,
      paiId: pai.id,
      ...chave,
    },
  });
}

/**
 * Garante (idempotente) a conta analítica do cliente em **todas as empresas** —
 * cada empresa tem seu próprio plano de contas. Best-effort.
 */
export async function garantirContaContabilCliente(clienteId: string) {
  const cliente = await prismaSemEscopo.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } });
  if (!cliente) return;
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true } });
  for (const e of empresas) {
    await garantirEntidadeEmpresa(e.id, "cliente", clienteId, cliente.razaoSocial).catch(() => null);
  }
}

/**
 * Garante (idempotente) a conta analítica do fornecedor em todas as empresas.
 */
export async function garantirContaContabilFornecedor(fornecedorId: string) {
  const fornecedor = await prismaSemEscopo.fornecedor.findUnique({ where: { id: fornecedorId }, select: { razaoSocial: true } });
  if (!fornecedor) return;
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true } });
  for (const e of empresas) {
    await garantirEntidadeEmpresa(e.id, "fornecedor", fornecedorId, fornecedor.razaoSocial).catch(() => null);
  }
}

// Conta-pai de Resultado para uma natureza, por grupo (fallback por tipo).
function paiCodResultado(grupo: string, tipo: string): string {
  if (grupo === "RECEITA_OPERACIONAL") return "3.1";
  if (grupo === "CUSTO_OPERACIONAL") return "3.2";
  if (grupo === "DESPESA_OPERACIONAL") return "3.3";
  return tipo === "ENTRADA" ? "3.1" : "3.3";
}

// Cria a analítica de uma conta sob um pai (por código) na empresa indicada.
async function garantirAnaliticaSobPai(
  empresaId: string,
  paiCodigo: string,
  nome: string,
  chave: { naturezaFinanceiraId: string } | { localEstoqueId: string },
) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, ...chave } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  const codigo = montarProximo(pai.codigo, filhos.map((f) => f.codigo));
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome,
      grupo: pai.grupo, natureza: pai.natureza, tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id, ...chave,
    },
  });
}

/** Garante (idempotente) a conta de Resultado de uma natureza, na empresa dela. */
export async function garantirContaContabilNatureza(naturezaId: string) {
  const n = await prismaSemEscopo.naturezaFinanceira.findUnique({
    where: { id: naturezaId }, select: { empresaId: true, nome: true, grupo: true, tipo: true },
  });
  if (!n) return null;
  return garantirAnaliticaSobPai(n.empresaId, paiCodResultado(n.grupo, n.tipo), n.nome, { naturezaFinanceiraId: naturezaId });
}

/** Garante (idempotente) a conta de Estoque de um local, na empresa dele. */
export async function garantirContaContabilLocalEstoque(localId: string) {
  const l = await prismaSemEscopo.localEstoque.findUnique({
    where: { id: localId }, select: { empresaId: true, nome: true },
  });
  if (!l) return null;
  return garantirAnaliticaSobPai(l.empresaId, "1.1.3", l.nome, { localEstoqueId: localId });
}
