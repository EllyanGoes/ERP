// ─────────────────────────────────────────────────────────────────────────────
// Multiempresa (Fase 2): o `prisma` exportado aqui é um proxy que, a cada
// operação, lê a sessão da requisição (cookie erp_session) e despacha para um
// client Prisma estendido com o escopo da empresa ativa. As rotas continuam
// usando `prisma.<modelo>.<método>()` exatamente como antes — o filtro/carimbo
// de empresaId acontece automaticamente nos modelos escopados.
//
// Regras da extensão de escopo:
//   • leituras e alterações em massa ganham `where: { empresaId }` (AND com o
//     where original);
//   • findUnique/update/delete ganham empresaId como filtro extra (o Prisma
//     aceita filtros não-únicos adicionais no where único);
//   • create/createMany/upsert carimbam empresaId quando não informado —
//     inclusive em criações aninhadas de modelos escopados (ex.: itens dentro
//     de um pedido), resolvidas via dmmf;
//   • Sequencia tem PK composta (empresaId, prefixo): o seletor
//     `empresaId_prefixo` é reescrito para a empresa ativa, então a numeração
//     de documentos é por empresa sem mudar os call sites;
//   • modelos compartilhados (Item, Cliente, Fornecedor, ...) passam direto.
//
// Fora de uma requisição (e em sessões antigas sem activeEmpresaId) o escopo
// cai no padrão Tramontin (EMPRESA_PADRAO_ID). Para relatórios consolidados do
// grupo (Fase 5) e scripts administrativos use `prismaSemEscopo`.
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient, Prisma } from "@prisma/client"
import { getSession } from "@/lib/auth"

/** Id fixo da Tramontin (criado pela migration multiempresa_fase1). */
export const EMPRESA_PADRAO_ID = "emp_tramontin"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Client cru, SEM escopo de empresa — enxerga as 3 empresas.
 * Use apenas em relatórios consolidados do grupo, rotas de auth e scripts.
 */
export const prismaSemEscopo =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaSemEscopo

// Modelos que possuem coluna empresaId (mesma lista da migration da Fase 1).
const MODELOS_ESCOPADOS = new Set<string>([
  "PedidoVenda", "PedidoVendaItem", "Minuta", "MinutaItem", "MovimentacaoComodato",
  "LocalEstoque", "EstoqueItem", "MovimentacaoEstoque", "LoteMovimentacao",
  "RequisicaoMaterial", "InventarioMaterial",
  "NecessidadeCompra", "CotacaoCompra", "PedidoCompra", "ConferenciaCompra", "ConferenciaCompraItem",
  "OrdemProducao", "ItemOrdemProducao", "ConsumoBiomassa", "PlanoMestre",
  "ContaPagar", "ContaReceber", "ContaBancaria", "LancamentoFinanceiro", "Recorrencia", "ImportacaoOFX",
  "Sequencia", "Filial",
])

// Mapas montados uma vez a partir do dmmf:
//   camposRelacao: modelo → { campoDeRelação: modeloAlvo } — para descer nas
//     criações aninhadas;
//   relacoesComFkPropria: modelo → campos de relação to-one cuja FK vive no
//     próprio modelo (ex.: cliente em PedidoVenda) — usá-los como objeto é o
//     que caracteriza o estilo "checked" do payload. Relações to-many (itens)
//     existem nos dois estilos e não dizem nada.
const camposRelacao = new Map<string, Map<string, string>>()
const relacoesComFkPropria = new Map<string, Set<string>>()
for (const m of Prisma.dmmf.datamodel.models) {
  const rel = new Map<string, string>()
  const fkPropria = new Set<string>()
  for (const f of m.fields) {
    if (f.kind !== "object") continue
    rel.set(f.name, f.type)
    if ((f.relationFromFields?.length ?? 0) > 0) fkPropria.add(f.name)
  }
  camposRelacao.set(m.name, rel)
  relacoesComFkPropria.set(m.name, fkPropria)
}

type DadosCreate = Record<string, unknown>

/**
 * Carimba empresaId em um payload de create (e desce recursivamente nas
 * criações aninhadas de modelos escopados).
 *
 * O Prisma aceita, por nível, OU o estilo "checked" (relações to-one como
 * objetos: `cliente: { connect: ... }`) OU o "unchecked" (FKs escalares:
 * `clienteId`), nunca misturados. Se o payload usa alguma relação to-one com
 * FK própria como objeto, é checked e o carimbo entra como
 * `empresa: { connect: { id } }`; caso contrário, como o escalar `empresaId`.
 */
function carimbarCreate(modelo: string, dados: unknown, empresaId: string): unknown {
  if (Array.isArray(dados)) return dados.map((d) => carimbarCreate(modelo, d, empresaId))
  if (!dados || typeof dados !== "object") return dados
  const d: DadosCreate = { ...(dados as DadosCreate) }
  const relacoes = camposRelacao.get(modelo) ?? new Map<string, string>()

  // Empresa efetiva deste nível: a explícita no payload (rotas da cadeia de
  // compras criam documentos para a empresa de origem) ou a do escopo. Os
  // filhos aninhados herdam a do pai — itens de uma conferência da Atlas
  // pertencem à Atlas mesmo com a sessão ativa na Tramontin.
  const empresaConnect = (d.empresa as { connect?: { id?: unknown } } | undefined)?.connect?.id
  if (typeof d.empresaId === "string") empresaId = d.empresaId
  else if (typeof empresaConnect === "string") empresaId = empresaConnect

  // desce nas criações aninhadas de modelos escopados (create/createMany/connectOrCreate)
  for (const [campo, alvo] of Array.from(relacoes.entries())) {
    if (!MODELOS_ESCOPADOS.has(alvo) || alvo === "Empresa") continue
    const aninhado = d[campo] as DadosCreate | undefined
    if (!aninhado || typeof aninhado !== "object") continue
    const novo: DadosCreate = { ...aninhado }
    if (novo.create) novo.create = carimbarCreate(alvo, novo.create, empresaId)
    if (novo.createMany && typeof novo.createMany === "object") {
      const cm = { ...(novo.createMany as DadosCreate) }
      cm.data = carimbarCreate(alvo, cm.data, empresaId)
      novo.createMany = cm
    }
    if (novo.connectOrCreate) {
      const lista = Array.isArray(novo.connectOrCreate) ? novo.connectOrCreate : [novo.connectOrCreate]
      const carimbada = lista.map((coc) => ({
        ...(coc as DadosCreate),
        create: carimbarCreate(alvo, (coc as DadosCreate).create, empresaId),
      }))
      novo.connectOrCreate = Array.isArray(novo.connectOrCreate) ? carimbada : carimbada[0]
    }
    d[campo] = novo
  }

  if (!MODELOS_ESCOPADOS.has(modelo)) return d
  if (d.empresaId !== undefined || d.empresa !== undefined) return d

  const fkPropria = relacoesComFkPropria.get(modelo) ?? new Set<string>()
  const usaEstiloChecked = Object.keys(d).some((k) => fkPropria.has(k))
  if (usaEstiloChecked) d.empresa = { connect: { id: empresaId } }
  else d.empresaId = empresaId
  return d
}

type ArgsQuery = Record<string, unknown>

// Modelos dos processos de COMPRAS e COMERCIAL que aceitam leitura "em
// grupo": quando o cookie erp_escopo=grupo está presente (e o usuário tem 2+
// empresas), as LEITURAS destes modelos enxergam todas as empresas da sessão
// de uma vez — é o que permite conduzir compras e vendas das empresas numa
// tela só. Os modelos de estoque entram porque a minuta movimenta estoque da
// empresa DONA do pedido. A empresa de cada documento novo vem da cadeia
// (cotação herda da solicitação, minuta herda do pedido, ...) ou do seletor
// do formulário; numeração sempre da empresa dona do documento.
const MODELOS_LEITURA_GRUPO = new Set<string>([
  // compras
  "NecessidadeCompra", "CotacaoCompra", "PedidoCompra", "ConferenciaCompra", "ConferenciaCompraItem",
  // comercial
  "PedidoVenda", "PedidoVendaItem", "Minuta", "MinutaItem",
  // estoque (movimentado pela minuta/conferência da empresa dona)
  "LocalEstoque", "EstoqueItem", "MovimentacaoEstoque", "LoteMovimentacao", "Filial",
])

/** Extensão que amarra todas as operações dos modelos escopados a uma empresa. */
function escopoEmpresa(empresaId: string, grupoIds: string[] | null) {
  // filtro de leitura: empresa ativa, ou o grupo todo nos modelos de compras
  const filtroLeitura = (model: string): ArgsQuery =>
    grupoIds && MODELOS_LEITURA_GRUPO.has(model)
      ? { empresaId: { in: grupoIds } }
      : { empresaId }

  return Prisma.defineExtension({
    name: `escopo-empresa-${empresaId}${grupoIds ? "-grupo" : ""}`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!MODELOS_ESCOPADOS.has(model)) return query(args)
          const a: ArgsQuery = { ...(args as ArgsQuery) }

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
              a.where = { AND: [filtroLeitura(model), (a.where as object) ?? {}] }
              break

            case "findUnique":
            case "findUniqueOrThrow":
            case "update":
            case "delete": {
              const where: ArgsQuery = { ...((a.where as ArgsQuery) ?? {}) }
              // Sequencia: PK composta — reescreve o seletor para a empresa ativa
              if (model === "Sequencia" && where.empresaId_prefixo) {
                where.empresaId_prefixo = { ...(where.empresaId_prefixo as ArgsQuery), empresaId }
              } else {
                where.empresaId = filtroLeitura(model).empresaId
              }
              a.where = where
              break
            }

            case "create":
              a.data = carimbarCreate(model, a.data, empresaId)
              break

            case "createMany":
            case "createManyAndReturn":
              a.data = carimbarCreate(model, a.data, empresaId)
              break

            case "upsert": {
              const where: ArgsQuery = { ...((a.where as ArgsQuery) ?? {}) }
              if (model === "Sequencia" && where.empresaId_prefixo) {
                where.empresaId_prefixo = { ...(where.empresaId_prefixo as ArgsQuery), empresaId }
              } else {
                where.empresaId = filtroLeitura(model).empresaId
              }
              a.where = where
              a.create = carimbarCreate(model, a.create, empresaId)
              break
            }

            default:
              // operação não mapeada (ex.: novas APIs do Prisma) — passa direto
              break
          }

          return query(a as never)
        },
      },
    },
  })
}

// Clients estendidos reutilizados por escopo. Não há risco de vazamento entre
// requisições: a chave É o escopo (empresa ativa + grupo de leitura) — cada
// requisição resolve o SEU escopo na sessão (abaixo) e recebe o client
// correspondente.
type ClienteEscopado = ReturnType<typeof criarClienteEscopado>
const clientesEscopados = new Map<string, ClienteEscopado>()

function criarClienteEscopado(empresaId: string, grupoIds: string[] | null) {
  return prismaSemEscopo.$extends(escopoEmpresa(empresaId, grupoIds))
}

function clienteDoEscopo(empresaId: string, grupoIds: string[] | null): ClienteEscopado {
  const chave = `${empresaId}|${grupoIds ? grupoIds.join(",") : ""}`
  let c = clientesEscopados.get(chave)
  if (!c) {
    c = criarClienteEscopado(empresaId, grupoIds)
    clientesEscopados.set(chave, c)
  }
  return c
}

export const COOKIE_ESCOPO = "erp_escopo"

/** Resolve empresa ativa + grupo de leitura da requisição atual. */
async function resolverEscopoRequisicao(): Promise<{ empresaId: string; grupoIds: string[] | null }> {
  let empresaId = EMPRESA_PADRAO_ID
  let grupoIds: string[] | null = null
  try {
    const session = await getSession()
    if (session?.activeEmpresaId) empresaId = session.activeEmpresaId
    // modo grupo (compras): cookie de preferência + 2+ empresas na sessão
    if (session && (session.empresaIds?.length ?? 0) > 1) {
      const { cookies } = await import("next/headers")
      const escopo = (await cookies()).get(COOKIE_ESCOPO)?.value
      if (escopo === "grupo") grupoIds = [...session.empresaIds!].sort()
    }
  } catch {
    // fora do contexto de requisição (cron/script) — escopo padrão
  }
  return { empresaId, grupoIds }
}

/**
 * Empresas visíveis na requisição atual: a ativa, ou todas as da sessão no
 * modo grupo. Para rotas que precisam filtrar à mão relações aninhadas de
 * modelos escopados (o include aninhado NÃO passa pela extensão de escopo).
 */
export async function empresasDoEscopo(): Promise<string[]> {
  const { empresaId, grupoIds } = await resolverEscopoRequisicao()
  return grupoIds ?? [empresaId]
}

/** Resolve o client escopado da requisição atual (sessão → empresa ativa). */
async function dbDaRequisicao(): Promise<ClienteEscopado> {
  const { empresaId, grupoIds } = await resolverEscopoRequisicao()
  return clienteDoEscopo(empresaId, grupoIds)
}

// ── Proxy lazy ───────────────────────────────────────────────────────────────
// `prisma.pedidoVenda.findMany(x)` devolve um "thenable" preguiçoso que só
// resolve a sessão e executa quando aguardado — preservando a semântica do
// PrismaPromise (inclusive em $transaction([...]) em lote, re-despachado no
// client escopado dentro da transação real).

type OpLazy = { modelo: string; metodo: string; args: unknown }

function criarOpLazy(modelo: string, metodo: string, args: unknown) {
  let promessa: Promise<unknown> | null = null
  const executar = () =>
    (promessa ??= dbDaRequisicao().then((db) =>
      (db as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[modelo][metodo](args)
    ))
  return {
    __opLazy: { modelo, metodo, args } satisfies OpLazy,
    then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => executar().then(res, rej),
    catch: (rej?: (e: unknown) => unknown) => executar().catch(rej),
    finally: (fim?: () => void) => executar().finally(fim),
  }
}

async function transactionEscopada(arg: unknown, opts?: unknown): Promise<unknown> {
  const db = (await dbDaRequisicao()) as unknown as {
    $transaction: (a: unknown, o?: unknown) => Promise<unknown>
  }
  if (Array.isArray(arg)) {
    // re-despacha as operações lazy como PrismaPromises reais do client escopado
    const ops = arg.map((item) => {
      const op = (item as { __opLazy?: OpLazy })?.__opLazy
      if (!op) throw new Error("prisma.$transaction([...]) só aceita operações prisma.<modelo>.<método>()")
      const cliente = db as unknown as Record<string, Record<string, (a: unknown) => unknown>>
      return cliente[op.modelo][op.metodo](op.args)
    })
    return db.$transaction(ops, opts)
  }
  return db.$transaction(arg, opts)
}

const proxyModelo = (modelo: string) =>
  new Proxy(
    {},
    {
      get: (_alvo, metodo) => {
        if (typeof metodo !== "string") return undefined
        return (args?: unknown) => criarOpLazy(modelo, metodo, args)
      },
    }
  )

export const prisma = new Proxy({} as PrismaClient, {
  get(_alvo, prop) {
    if (typeof prop !== "string" || prop === "then") return undefined
    if (prop === "$transaction") return transactionEscopada
    if (prop.startsWith("$")) {
      // demais APIs ($queryRaw, $connect, ...) vão para o client cru, SEM escopo
      const valor = (prismaSemEscopo as unknown as Record<string, unknown>)[prop]
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(prismaSemEscopo) : valor
    }
    return proxyModelo(prop)
  },
})
