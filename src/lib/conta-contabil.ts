import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Cria uma analítica de entidade/conta tolerando CORRIDA (backfill paralelo):
// se outra execução criar a mesma analítica ou colidir no código sequencial
// (P2002), re-busca/re-tenta com o próximo código. `refind` localiza a conta da
// entidade; `build` monta os dados recalculando o código a cada tentativa.
async function criarAnaliticaComRetry(
  refind: () => Promise<{ id: string } | null>,
  build: () => Promise<Prisma.ContaContabilUncheckedCreateInput | null>,
) {
  for (let tent = 0; tent < 6; tent++) {
    const existente = await refind();
    if (existente) return existente;
    const data = await build();
    if (!data) return null;
    try {
      return await prismaSemEscopo.contaContabil.create({ data, select: { id: true } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // corrida — re-tenta
      throw e;
    }
  }
  return refind();
}

// Códigos das contas sintéticas-pai que recebem as analíticas por entidade
// (criadas no seed da migration do módulo Contabilidade).
const COD_CLIENTES = "1.1.2";
const COD_FORNECEDORES = "2.1.1";
const COD_COLABORADORES = "2.1.6"; // Salários a Pagar (analíticas por colaborador)

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
  tipo: "cliente" | "fornecedor" | "colaborador",
  entidadeId: string,
  nome: string,
) {
  const chave = tipo === "cliente" ? { clienteId: entidadeId } : tipo === "fornecedor" ? { fornecedorId: entidadeId } : { colaboradorId: entidadeId };
  // Cada entidade tem sua analítica sob a sintética-pai própria: cliente em
  // 1.1.2 (ATIVO), fornecedor em 2.1.1 e colaborador em 2.1.6 Salários a Pagar
  // (PASSIVO). Desambigua pelo CÓDIGO do pai.
  const ehAtivo = tipo === "cliente";
  const codPai = tipo === "cliente" ? COD_CLIENTES : tipo === "fornecedor" ? COD_FORNECEDORES : COD_COLABORADORES;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: codPai } });
  if (!pai) return null; // plano da empresa ainda não semeado

  return criarAnaliticaComRetry(
    () => prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, ...chave, codigo: { startsWith: codPai + "." } }, select: { id: true } }),
    async () => {
      const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
      return {
        empresaId, codigo: montarProximo(pai.codigo, filhos.map((f) => f.codigo)), nome,
        grupo: ehAtivo ? "ATIVO" : "PASSIVO",
        natureza: ehAtivo ? "DEVEDORA" : "CREDORA",
        tipo: "ANALITICA", nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id, ...chave,
      };
    },
  );
}

/** Conta analítica de um colaborador (sob Salários a Pagar 2.1.6) numa empresa. */
export async function contaDoColaborador(empresaId: string, colaboradorId: string) {
  return prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, colaboradorId }, select: { id: true } });
}
/** Garante (idempotente) a conta do colaborador numa empresa (2.1.6.x). */
export async function garantirContaColaboradorNaEmpresa(empresaId: string, colaboradorId: string) {
  const col = await prismaSemEscopo.colaborador.findUnique({ where: { id: colaboradorId }, select: { nome: true } });
  return garantirEntidadeEmpresa(empresaId, "colaborador", colaboradorId, col?.nome ?? "Colaborador");
}
/** Cria a conta do colaborador SÓ nas empresas onde ele está presente. Best-effort. */
export async function sincronizarContasColaborador(colaboradorId: string, empresaIds: string[]) {
  for (const empresaId of empresaIds) {
    await garantirContaColaboradorNaEmpresa(empresaId, colaboradorId).catch(() => null);
  }
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

/** Garante (idempotente) a conta de PL "Saldos de Abertura" (2.3.3). */
export async function garantirContaSaldoAbertura(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.3.3" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.3" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "2.3.3", nome: "Saldos de Abertura",
      grupo: "PATRIMONIO_LIQUIDO", natureza: "CREDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id, ativo: true,
    },
    select: { id: true },
  });
}

/** Conta de Estoque principal da empresa (1.1.3.x analítica) — destino de compras avulsas de revenda. */
export async function contaEstoquePrincipal(empresaId: string) {
  return prismaSemEscopo.contaContabil.findFirst({
    where: { empresaId, codigo: { startsWith: "1.1.3." }, tipo: "ANALITICA", ativo: true },
    select: { id: true }, orderBy: { codigo: "asc" },
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

// Get-or-create de uma analítica por NOME sob um pai (idempotente; evita colidir
// códigos quando o pai já tem filhos — usa o próximo código sequencial).
async function garantirAnaliticaPorNome(
  empresaId: string, paiCodigo: string, nome: string,
  grupo: "ATIVO" | "PASSIVO" | "RESULTADO" | "PATRIMONIO_LIQUIDO", natureza: "DEVEDORA" | "CREDORA",
) {
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, paiId: pai.id, nome }, select: { id: true } });
  if (existente) return existente;
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: montarProximo(pai.codigo, filhos.map((f) => f.codigo)), nome,
      grupo, natureza, tipo: "ANALITICA", nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

/**
 * Garante (idempotente) as contas de passivo da folha de pagamento e retorna ids:
 * INSS/IRRF/FGTS a Recolher (sob 2.1.5 Impostos a Pagar) e Outros a Repassar
 * (2.1.8 Outras Obrigações, ou novo sob 2.1). Salários a Pagar é por colaborador
 * (2.1.6.x via garantirContaColaboradorNaEmpresa).
 */
export async function garantirContasFolha(empresaId: string) {
  const [inss, irrf, fgts] = await Promise.all([
    garantirAnaliticaPorNome(empresaId, "2.1.5", "INSS a Recolher", "PASSIVO", "CREDORA"),
    garantirAnaliticaPorNome(empresaId, "2.1.5", "IRRF a Recolher", "PASSIVO", "CREDORA"),
    garantirAnaliticaPorNome(empresaId, "2.1.5", "FGTS a Recolher", "PASSIVO", "CREDORA"),
  ]);
  const outrosExistente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.1.8" }, select: { id: true } });
  const outros = outrosExistente ?? await garantirAnaliticaPorNome(empresaId, "2.1", "Consignados e Outros a Repassar", "PASSIVO", "CREDORA");
  const cif = await garantirContaCifApropriar(empresaId);
  return { inssId: inss?.id ?? null, irrfId: irrf?.id ?? null, fgtsId: fgts?.id ?? null, outrosId: outros?.id ?? null, cifApropriarId: cif?.id ?? null };
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
  const pai = await garantirContaMaterialEntregar(empresaId);
  if (!pai) return null;
  const paiFull = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "2.1.2" }, select: { id: true, codigo: true, nivel: true } });
  if (!paiFull) return null;
  return criarAnaliticaComRetry(
    () => prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, grupo: "PASSIVO", clienteId }, select: { id: true } }),
    async () => {
      const cliente = await prismaSemEscopo.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } });
      const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: paiFull.id }, select: { codigo: true } });
      return {
        empresaId, codigo: montarProximo(paiFull.codigo, filhos.map((f) => f.codigo)), nome: cliente?.razaoSocial ?? "Cliente",
        grupo: "PASSIVO", natureza: "CREDORA", tipo: "ANALITICA",
        nivel: paiFull.nivel + 1, aceitaLancamento: true, paiId: paiFull.id, clienteId,
      };
    },
  );
}

/** Garante (idempotente) a conta analítica de Clientes a Receber de um cliente (1.1.2.x, ATIVO). */
export async function garantirContaClienteReceber(empresaId: string, clienteId: string) {
  const cliente = await prismaSemEscopo.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } });
  return garantirEntidadeEmpresa(empresaId, "cliente", clienteId, cliente?.razaoSocial ?? "Cliente");
}

/**
 * Garante (idempotente) a sintética "Bens a Entregar" (1.1.4, ATIVO). Espelho
 * ATIVO do "Material a Entregar" (passivo 2.1.2): o backlog de pedidos
 * confirmados-não-entregues fica visível no balanço sem inflar "Clientes a
 * Receber" — o recebível só nasce com o título. Analítica por cliente (1.1.4.x)
 * via garantirContaBensEntregarCliente. Best-effort.
 */
export async function garantirContaBensEntregar(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "1.1.4", nome: "Bens a Entregar",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id, ativo: true,
    },
    select: { id: true },
  });
}

/**
 * Garante (idempotente) a conta "CIF a Apropriar" (1.1.4.0001, ativo de staging) —
 * destino da mão de obra indireta (MOI) na folha e do CIF real, apropriada depois
 * ao PEP-CIF. Reserva o código 1.1.4.0001 (analíticas de cliente vão a 1.1.4.0002+).
 */
export async function garantirContaCifApropriar(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4.0001" }, select: { id: true } });
  if (ex) return ex;
  let pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4" }, select: { id: true, nivel: true } });
  if (!pai) {
    await garantirContaBensEntregar(empresaId);
    pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4" }, select: { id: true, nivel: true } });
  }
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "1.1.4.0001", nome: "CIF a Apropriar",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id,
    },
    select: { id: true },
  });
}

/**
 * Garante (idempotente) a analítica de Bens a Entregar de um cliente, sob a
 * sintética 1.1.4. Keyed por (empresa, pai 1.1.4, cliente) — o mesmo clienteId
 * também tem a analítica de Clientes a Receber (1.1.2.x), por isso a unicidade é
 * por pai e não por grupo. Espelho ativo do Material a Entregar do cliente.
 */
export async function garantirContaBensEntregarCliente(empresaId: string, clienteId: string) {
  let pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4" }, select: { id: true, codigo: true, nivel: true } });
  if (!pai) {
    await garantirContaBensEntregar(empresaId);
    pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.4" }, select: { id: true, codigo: true, nivel: true } });
  }
  if (!pai) return null;
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, paiId: pai.id, clienteId }, select: { id: true } });
  if (existente) return existente;
  const cliente = await prismaSemEscopo.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } });
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: pai.id }, select: { codigo: true } });
  const codigo = montarProximo(pai.codigo, filhos.map((f) => f.codigo));
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo, nome: cliente?.razaoSocial ?? "Cliente",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "ANALITICA",
      nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id, clienteId,
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
