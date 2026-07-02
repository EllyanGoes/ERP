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

/**
 * Chave de ordenação de exibição (plano/balanço): por segmento do código, usa a
 * `ordem` do ancestral naquele nível quando definida (senão o próprio segmento).
 * Assim uma conta pode aparecer fora da ordem numérica do código (ex.: "Contas de
 * Terceiros" 1.1.6 logo após Disponibilidades 1.1.1). Sem `ordem` = ordena pelo código.
 */
export function chaveOrdenacaoConta(codigo: string, ordemPorCodigo: Map<string, number | null | undefined>): string {
  const segs = codigo.split(".");
  const partes: string[] = [];
  let prefixo = "";
  for (const seg of segs) {
    prefixo = prefixo ? `${prefixo}.${seg}` : seg;
    const ord = ordemPorCodigo.get(prefixo);
    const chave = ord != null ? ord : (parseInt(seg, 10) || 0);
    partes.push(String(chave).padStart(6, "0"));
  }
  return partes.join(".");
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

// Local de WIP de produção (estados úmido/seco/queimado, todos categoria "WIP", +
// o genérico "Produção (WIP)"): a conta de estoque deve nascer DENTRO da sintética
// PEP (1.1.3.0005), não solta como irmã em 1.1.3. A embalagem liberada à produção
// (categoria EMBALAGEM) NÃO é WIP e segue em 1.1.3.
function localEhWipProducao(nome: string, categoriasAceitas: string[]): boolean {
  return categoriasAceitas.includes("WIP") || nome === "Produção (WIP)";
}

/** Garante (idempotente) a sintética "Estoque de Produto em Processo (PEP)" (1.1.3.0005). */
export async function garantirContaPep(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.3.0005" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.3" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "1.1.3.0005", nome: "Estoque de Produto em Processo (PEP)",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id, ativo: true,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) a conta de Estoque de um local, na empresa dele. WIP de produção vai sob a PEP. */
export async function garantirContaContabilLocalEstoque(localId: string) {
  const l = await prismaSemEscopo.localEstoque.findUnique({
    where: { id: localId }, select: { empresaId: true, nome: true, categoriasAceitas: true },
  });
  if (!l) return null;
  if (localEhWipProducao(l.nome, l.categoriasAceitas as string[])) {
    await garantirContaPep(l.empresaId);
    return garantirAnaliticaSobPai(l.empresaId, "1.1.3.0005", l.nome, { localEstoqueId: localId });
  }
  return garantirAnaliticaSobPai(l.empresaId, "1.1.3", l.nome, { localEstoqueId: localId });
}

/** Garante (idempotente) a sintética "Contas de Terceiros" (1.1.6, ATIVO) — dinheiro
 *  de 3º sob guarda, exibida logo após Disponibilidades (ordem de liquidez = 2). */
export async function garantirContaTerceiros(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.6" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "1.1.6", nome: "Contas de Terceiros",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id, ativo: true, ordem: 2,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) a sintética "Adiantamento a Fornecedores" (1.1.7, ATIVO) —
 *  DIREITO a realizar (mercadoria paga e ainda não recebida). Distinta de "Contas de
 *  Terceiros" (1.1.6, pessoas) e da conta do fornecedor no passivo (2.1.1). */
export async function garantirContaAdiantamentoFornecedores(empresaId: string) {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.7" }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1" } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: {
      empresaId, codigo: "1.1.7", nome: "Adiantamento a Fornecedores",
      grupo: "ATIVO", natureza: "DEVEDORA", tipo: "SINTETICA",
      nivel: pai.nivel + 1, aceitaLancamento: false, paiId: pai.id, ativo: true,
    },
    select: { id: true },
  });
}

/** Garante (idempotente) a analítica de adiantamento de UM fornecedor (1.1.7.x),
 *  keyed por (empresa, fornecedorId, prefixo 1.1.7.). O mesmo fornecedorId também
 *  tem a analítica de passivo em 2.1.1.x — por isso a unicidade é pelo CÓDIGO do pai. */
export async function garantirContaAdiantamentoFornecedor(empresaId: string, fornecedorId: string) {
  const pai = await garantirContaAdiantamentoFornecedores(empresaId);
  if (!pai) return null;
  const paiFull = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: "1.1.7" }, select: { id: true, nivel: true } });
  if (!paiFull) return null;
  const forn = await prismaSemEscopo.fornecedor.findUnique({ where: { id: fornecedorId }, select: { razaoSocial: true } });
  const nome = forn?.razaoSocial ?? "Fornecedor";
  return criarAnaliticaComRetry(
    () => prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, fornecedorId, codigo: { startsWith: "1.1.7." } }, select: { id: true } }),
    async () => {
      const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId, paiId: paiFull.id }, select: { codigo: true } });
      return {
        empresaId, codigo: montarProximo("1.1.7", filhos.map((f) => f.codigo)), nome,
        grupo: "ATIVO", natureza: "DEVEDORA", tipo: "ANALITICA",
        nivel: paiFull.nivel + 1, aceitaLancamento: true, paiId: paiFull.id, fornecedorId,
      };
    },
  );
}

/**
 * Garante (idempotente) a conta de uma conta bancária: da EMPRESA vai sob
 * Disponibilidades (1.1.1); de TERCEIROS (ehTerceiro) vai sob "Contas de Terceiros"
 * (1.1.6), com o nome do terceiro.
 */
export async function garantirContaContabilBanco(contaBancariaId: string) {
  const cb = await prismaSemEscopo.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { empresaId: true, nome: true, ehTerceiro: true, terceiroNome: true, banco: { select: { nome: true } } },
  });
  if (!cb) return null;
  if (cb.ehTerceiro) {
    await garantirContaTerceiros(cb.empresaId);
    const nome = `${cb.terceiroNome?.trim() || "Terceiro"} — ${cb.nome}`;
    return garantirAnaliticaSobPai(cb.empresaId, "1.1.6", nome, { contaBancariaId });
  }
  const nome = cb.banco?.nome ? `${cb.banco.nome} — ${cb.nome}` : cb.nome;
  return garantirAnaliticaSobPai(cb.empresaId, "1.1.1", nome, { contaBancariaId });
}

/**
 * Sincroniza a conta contábil de uma conta bancária ao seu tipo (empresa/terceiro):
 * cria se faltar; se já existe mas está no pai errado, MOVE (1.1.1 ↔ 1.1.6)
 * renumerando o código; e atualiza o nome. Usar na edição da conta.
 */
export async function sincronizarContaContabilBanco(contaBancariaId: string) {
  const cb = await prismaSemEscopo.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { empresaId: true, nome: true, ehTerceiro: true, terceiroNome: true, banco: { select: { nome: true } } },
  });
  if (!cb) return null;
  const paiCodigo = cb.ehTerceiro ? "1.1.6" : "1.1.1";
  const nome = cb.ehTerceiro
    ? `${cb.terceiroNome?.trim() || "Terceiro"} — ${cb.nome}`
    : (cb.banco?.nome ? `${cb.banco.nome} — ${cb.nome}` : cb.nome);
  if (cb.ehTerceiro) await garantirContaTerceiros(cb.empresaId);

  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId: cb.empresaId, contaBancariaId }, select: { id: true, paiId: true } });
  if (!existente) return garantirContaContabilBanco(contaBancariaId);
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId: cb.empresaId, codigo: paiCodigo }, select: { id: true, codigo: true, nivel: true } });
  if (!pai || existente.paiId === pai.id) {
    await prismaSemEscopo.contaContabil.update({ where: { id: existente.id }, data: { nome } });
    return existente;
  }
  const filhos = await prismaSemEscopo.contaContabil.findMany({ where: { empresaId: cb.empresaId, paiId: pai.id }, select: { codigo: true } });
  await prismaSemEscopo.contaContabil.update({
    where: { id: existente.id },
    data: { paiId: pai.id, codigo: montarProximo(pai.codigo, filhos.map((f) => f.codigo)), nivel: pai.nivel + 1, nome },
  });
  return existente;
}

/**
 * Garante a conta de Estoque de um local numa empresa específica (útil quando o
 * movimento é de uma empresa diferente da `empresaId` cadastrada no local —
 * ex.: local "Produção (WIP)" criado sem empresa explícita). Idempotente.
 */
export async function garantirContaLocalNaEmpresa(empresaId: string, localId: string) {
  const existente = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, localEstoqueId: localId } });
  if (existente) return existente;
  const l = await prismaSemEscopo.localEstoque.findUnique({ where: { id: localId }, select: { nome: true, categoriasAceitas: true } });
  if (!l) return null;
  if (localEhWipProducao(l.nome, l.categoriasAceitas as string[])) {
    await garantirContaPep(empresaId);
    return garantirAnaliticaSobPai(empresaId, "1.1.3.0005", l.nome, { localEstoqueId: localId });
  }
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

/** Conta de resultado "Perda na Baixa de Imobilizado" (3.3.9006) — resíduo (valor
 *  contábil líquido) do componente velho dado baixa numa troca (CPC 27).
 *  (Era 3.3.9004, que colidia com Despesas Gerais e Juros Passivos — renumerada.) */
export async function garantirContaPerdaBaixaImobilizado(empresaId: string) {
  return garantirContaPorCodigo(empresaId, { codigo: "3.3.9006", nome: "Perda na Baixa de Imobilizado", pai: "3.3", grupo: "RESULTADO", natureza: "DEVEDORA" });
}

/**
 * Garante (idempotente) a conta "Imobilizado em Andamento" (1.2.4) — obra/ferramental
 * capitalizado a partir de requisição (CPC 27), antes de virar bem depreciável.
 * D 1.2.4 / C Estoque na baixa; a transferência p/ 1.2.1.xxxx (ativo depreciável) é manual.
 */
export async function garantirContaImobilizadoEmAndamento(empresaId: string) {
  return garantirContaPorCodigo(empresaId, { codigo: "1.2.4", nome: "Imobilizado em Andamento", pai: "1.2", grupo: "ATIVO", natureza: "DEVEDORA" });
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

// Cria (idempotente) uma conta analítica de resultado por código sob um pai
// (3.1 Receitas / 3.3 Despesas). Usada pelos ajustes do Encontro de Contas.
async function garantirResultadoSobPai(empresaId: string, codigo: string, nome: string, paiCodigo: string, natureza: "DEVEDORA" | "CREDORA") {
  const ex = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo }, select: { id: true } });
  if (ex) return ex;
  const pai = await prismaSemEscopo.contaContabil.findFirst({ where: { empresaId, codigo: paiCodigo } });
  if (!pai) return null;
  return prismaSemEscopo.contaContabil.create({
    data: { empresaId, codigo, nome, grupo: "RESULTADO", natureza, tipo: "ANALITICA", nivel: pai.nivel + 1, aceitaLancamento: true, paiId: pai.id },
    select: { id: true },
  });
}

/** Receita: juros e multas ativos (recebidos), CREDORA sob 3.1. */
export async function garantirContaJurosMultasAtivos(empresaId: string) {
  return garantirResultadoSobPai(empresaId, "3.1.9004", "Juros e Multas Ativos", "3.1", "CREDORA");
}
/** Despesa: juros e multas passivos (pagos), DEVEDORA sob 3.3.
 *  (Era 3.3.9004, que colidia com Despesas Gerais — renumerada p/ 3.3.9005.) */
export async function garantirContaJurosMultasPassivos(empresaId: string) {
  return garantirResultadoSobPai(empresaId, "3.3.9005", "Juros e Multas Passivos", "3.3", "DEVEDORA");
}
/** Receita: descontos obtidos (em contas a pagar), CREDORA sob 3.1. */
export async function garantirContaDescontosObtidos(empresaId: string) {
  return garantirResultadoSobPai(empresaId, "3.1.9005", "Descontos Obtidos", "3.1", "CREDORA");
}
/** Despesa "Fretes e Encargos sobre Compras" (3.3.9007), DEVEDORA sob 3.3 —
 *  frete/seguro/despesas do documento de entrada. A dívida com o fornecedor é o
 *  LÍQUIDO do documento; o estoque continua ao preço unitário (ratear encargos
 *  no custo do item é evolução futura). */
export async function garantirContaFretesSobreCompras(empresaId: string) {
  return garantirResultadoSobPai(empresaId, "3.3.9007", "Fretes e Encargos sobre Compras", "3.3", "DEVEDORA");
}
/** Redutora de receita "(-) Devoluções de Vendas" (3.1.9006), DEVEDORA sob 3.1 —
 *  estorno da receita na devolução de venda (contabilizarDevolucao). */
export async function garantirContaDevolucaoVendas(empresaId: string) {
  return garantirResultadoSobPai(empresaId, "3.1.9006", "(-) Devoluções de Vendas", "3.1", "DEVEDORA");
}
/** Passivo "Créditos de Clientes a Utilizar" (sob 2.1) — vale gerado por devolução
 *  com resolução CRÉDITO/TROCA, consumido como pagamento em vendas futuras. */
export async function garantirContaCreditosClientes(empresaId: string) {
  return garantirAnaliticaPorNome(empresaId, "2.1", "Créditos de Clientes a Utilizar", "PASSIVO", "CREDORA");
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
 * Garante (idempotente) a sintética 1.1.4 (ATIVO). O modelo "Bens a Entregar"
 * foi DESCARTADO (venda usa o modelo clássico: D Clientes / C Material a
 * Entregar na confirmação) — a sintética sobrevive apenas como PAI da conta
 * "CIF a Apropriar" (1.1.4.0001). Best-effort.
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
