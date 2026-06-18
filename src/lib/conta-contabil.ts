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
  // Cliente pode ter duas analíticas com o mesmo clienteId (1.1.2 Clientes a
  // Receber, ATIVO; e 2.1.2.x Material a Entregar, PASSIVO) — desambigua pelo grupo.
  const grupoChave = tipo === "cliente" ? "ATIVO" : "PASSIVO";
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, grupo: grupoChave, ...chave } });
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
  chave: { naturezaFinanceiraId: string } | { localEstoqueId: string } | { contaBancariaId: string },
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

/**
 * Vincula uma natureza financeira a uma conta de resultado escolhida pelo usuário
 * (cadastro de relacionamento). Move o link `naturezaFinanceiraId` para a conta
 * escolhida (1 por empresa), liberando a conta antes vinculada à natureza.
 */
export async function vincularNaturezaConta(empresaId: string, naturezaId: string, contaContabilId: string) {
  await prismaSemEscopo.contaContabil.updateMany({
    where: { empresaId, naturezaFinanceiraId: naturezaId, id: { not: contaContabilId } },
    data: { naturezaFinanceiraId: null },
  });
  await prismaSemEscopo.contaContabil.update({
    where: { id: contaContabilId },
    data: { naturezaFinanceiraId: naturezaId },
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

/** Garante (idempotente) a conta de disponibilidade de uma conta bancária, sob 1.1.1. */
export async function garantirContaContabilBanco(contaBancariaId: string) {
  const cb = await prismaSemEscopo.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { empresaId: true, nome: true, banco: { select: { nome: true } } },
  });
  if (!cb) return null;
  const nome = cb.banco?.nome ? `${cb.banco.nome} — ${cb.nome}` : cb.nome;
  return garantirAnaliticaSobPai(cb.empresaId, "1.1.1", nome, { contaBancariaId });
}

/**
 * Garante a conta de Estoque de um local numa empresa específica (útil quando o
 * movimento é de uma empresa diferente da `empresaId` cadastrada no local —
 * ex.: local "Produção (WIP)" criado sem empresa explícita). Idempotente.
 */
export async function garantirContaLocalNaEmpresa(empresaId: string, localId: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, localEstoqueId: localId } });
  if (existente) return existente;
  const l = await prismaSemEscopo.localEstoque.findUnique({ where: { id: localId }, select: { nome: true } });
  if (!l) return null;
  return garantirAnaliticaSobPai(empresaId, "1.1.3", l.nome, { localEstoqueId: localId });
}

// ── Contas de sistema do estoque (códigos reservados .9xxx, semeadas por migration) ──
// Resolvidas por código; get-or-create defensivo caso o seed ainda não tenha
// rodado para esta empresa.
const CONTAS_SISTEMA_ESTOQUE: Record<string, { codigo: string; nome: string; pai: string }> = {
  sobras:   { codigo: "3.1.9001", nome: "Sobras de Estoque",    pai: "3.1" },
  producao: { codigo: "3.2.9001", nome: "Custo de Produção",    pai: "3.2" },
  consumo:  { codigo: "3.3.9001", nome: "Consumo de Materiais", pai: "3.3" },
  perdas:   { codigo: "3.3.9002", nome: "Perdas de Estoque",    pai: "3.3" },
};

async function garantirContaSistema(empresaId: string, def: { codigo: string; nome: string; pai: string }) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: def.codigo }, select: { id: true } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: def.pai } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: def.codigo, nome: def.nome,
      grupo: "RESULTADO", natureza: pai.natureza, tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

// ── Imobilizado (Ativo Não Circulante) ───────────────────────────────────────
// Contas compartilhadas: 1.2.2 Depreciação Acumulada e 3.3.9003 Despesa de
// Depreciação (semeadas por migration; get-or-create defensivo).
async function garantirContaPorCodigo(
  empresaId: string,
  def: { codigo: string; nome: string; pai: string; grupo: "ATIVO" | "RESULTADO"; natureza: "DEVEDORA" | "CREDORA" },
) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: def.codigo }, select: { id: true } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: def.pai } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: def.codigo, nome: def.nome,
      grupo: def.grupo, natureza: def.natureza, tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) a analítica de PL que recebe o resultado do exercício (2.3.2.0001). */
export async function garantirContaResultadoAcumulado(empresaId: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.3.2.0001" }, select: { id: true } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.3.2" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "2.3.2.0001", nome: "Lucros/Prejuízos Acumulados",
      grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) as contas compartilhadas do imobilizado e retorna seus ids. */
export async function garantirContasImobilizado(empresaId: string) {
  const [deprAcum, despesa] = await Promise.all([
    garantirContaPorCodigo(empresaId, { codigo: "1.2.2", nome: "(-) Depreciação Acumulada", pai: "1.2", grupo: "ATIVO", natureza: "CREDORA" }),
    garantirContaPorCodigo(empresaId, { codigo: "3.3.9003", nome: "Despesa de Depreciação", pai: "3.3", grupo: "RESULTADO", natureza: "DEVEDORA" }),
  ]);
  return { deprAcumId: deprAcum?.id ?? null, despesaId: despesa?.id ?? null };
}

/** Cria a analítica de um bem sob o pai indicado (1.2.1 Imobilizado depreciável; 1.2.3 Terrenos). */
export async function garantirContaImobilizadoBem(empresaId: string, descricao: string, codigoPai = "1.2.1") {
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: codigoPai } });
  if (!pai) return null;
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  const codigo = montarProximo(pai.codigo, filhos.map((f) => f.codigo));
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome: descricao,
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

// Contas de resultado dedicadas (analíticas) para fatos que antes caíam nas
// sintéticas 3.1/3.2/3.3 — assim o Balanço (que só soma analíticas) as enxerga.

/** Garante (idempotente) uma SINTÉTICA de resultado sob um pai (por código). */
async function garantirSinteticaResultado(empresaId: string, codigo: string, nome: string, paiCodigo: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo }, select: { id: true } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome,
      grupo: "RESULTADO", natureza: pai.natureza, tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id,
    },
    select: { id: true },
  });
}

/**
 * Analítica de CMV (3.2.1.0001) sob a sintética 3.2.1 CMV — baixa de estoque de
 * mercadoria (revenda) na venda. O motor perpétuo lança aqui; a sintética pai
 * totaliza no DRE (modelo periódico, Fase 1).
 */
export async function garantirContaCmv(empresaId: string) {
  await garantirSinteticaResultado(empresaId, "3.2.1", "CMV — Custo das Mercadorias Vendidas", "3.2");
  return garantirContaSistema(empresaId, { codigo: "3.2.1.0001", nome: "Custo das mercadorias vendidas", pai: "3.2.1" });
}
/** Analítica de CPV (3.2.2.0001) sob a sintética 3.2.2 CPV — baixa de produto acabado na venda. */
export async function garantirContaCpv(empresaId: string) {
  await garantirSinteticaResultado(empresaId, "3.2.2", "CPV — Custo dos Produtos Vendidos", "3.2");
  return garantirContaSistema(empresaId, { codigo: "3.2.2.0001", nome: "Custo dos produtos vendidos", pai: "3.2.2" });
}
/** Analítica de receita sem natureza (3.1.9002). */
export async function garantirContaReceitaFallback(empresaId: string) {
  return garantirContaSistema(empresaId, { codigo: "3.1.9002", nome: "Receita de Vendas", pai: "3.1" });
}
/** Analítica de despesa sem natureza (3.3.9004). */
export async function garantirContaDespesaFallback(empresaId: string) {
  return garantirContaSistema(empresaId, { codigo: "3.3.9004", nome: "Despesas Gerais", pai: "3.3" });
}
/**
 * Conta "Compras de Mercadorias" (3.2.1.9001), DEVEDORA sob a sintética CMV (3.2.1).
 * Destino das compras de mercadoria (revenda) sem natureza nas empresas que não
 * industrializam. Ativa a conta (foi semeada como Fase 2 inativa). Get-or-create.
 */
export async function garantirContaComprasMercadorias(empresaId: string) {
  await garantirSinteticaResultado(empresaId, "3.2.1", "CMV — Custo das Mercadorias Vendidas", "3.2");
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "3.2.1.9001" }, select: { id: true, ativo: true } });
  if (ex) {
    if (!ex.ativo) await prismaSemEscopo.contaContabil.update({ where: { id: ex.id }, data: { ativo: true } });
    return ex;
  }
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "3.2.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "3.2.1.9001", nome: "Compras de Mercadorias",
      grupo: "RESULTADO", natureza: "DEVEDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id, ativo: true,
    },
    select: { id: true },
  });
}

/**
 * Conta redutora de receita "(-) Descontos Concedidos" (3.1.9003) — DEVEDORA sob
 * 3.1 Receitas. Reconhece o desconto dado no pedido como dedução da receita bruta.
 * (No DRE fica na seção de Deduções, que subtrai.) Get-or-create defensivo.
 */
export async function garantirContaDescontoConcedido(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "3.1.9003" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "3.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "3.1.9003", nome: "(-) Descontos Concedidos",
      grupo: "RESULTADO", natureza: "DEVEDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}
/**
 * Sintética "Material a Entregar" (2.1.2) — receita diferida até a entrega.
 * Passou a ser conta-pai: o saldo fica nas analíticas por cliente (2.1.2.NNNN),
 * espelhando Fornecedores a Pagar (2.1.1). Get-or-create defensivo.
 */
export async function garantirContaMaterialEntregar(empresaId: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.1.2" }, select: { id: true } });
  if (existente) return existente;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "2.1.2", nome: "Material a Entregar",
      grupo: "PASSIVO", natureza: "CREDORA", tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id,
    },
    select: { id: true },
  });
}

/**
 * Garante (idempotente) a analítica de Material a Entregar de um cliente, sob a
 * sintética 2.1.2. Keyed por clienteId + grupo=PASSIVO (o mesmo clienteId também
 * identifica a analítica de Clientes a Receber, em ATIVO). Best-effort.
 */
export async function garantirContaMaterialEntregarCliente(empresaId: string, clienteId: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({
    where: { empresaId, grupo: "PASSIVO", clienteId },
    select: { id: true },
  });
  if (existente) return existente;
  const pai = await garantirContaMaterialEntregar(empresaId);
  if (!pai) return null;
  const cliente = await prismaSemEscopo.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } });
  const paiFull = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.1.2" }, select: { id: true, codigo: true, nivel: true } });
  if (!paiFull) return null;
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: paiFull.id }, select: { codigo: true } });
  const codigo = montarProximo(paiFull.codigo, filhos.map((f) => f.codigo));
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome: cliente?.razaoSocial ?? "Cliente",
      grupo: "PASSIVO", natureza: "CREDORA", tipo: "ANALITICA",
      nivel: paiFull.nivel + 1, aceitaLancamento: true, paiId: paiFull.id, clienteId,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) as 4 contas de sistema do estoque na empresa e retorna seus ids. */
export async function garantirContasSistemaEstoque(empresaId: string) {
  const [sobras, producao, consumo, perdas] = await Promise.all([
    garantirContaSistema(empresaId, CONTAS_SISTEMA_ESTOQUE.sobras),
    garantirContaSistema(empresaId, CONTAS_SISTEMA_ESTOQUE.producao),
    garantirContaSistema(empresaId, CONTAS_SISTEMA_ESTOQUE.consumo),
    garantirContaSistema(empresaId, CONTAS_SISTEMA_ESTOQUE.perdas),
  ]);
  return {
    sobrasId: sobras?.id ?? null,
    producaoId: producao?.id ?? null,
    consumoId: consumo?.id ?? null,
    perdasId: perdas?.id ?? null,
  };
}
