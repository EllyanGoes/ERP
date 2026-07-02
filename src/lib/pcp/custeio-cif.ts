// Custeio: deriva a taxa predeterminada de CIF e MOD por milheiro a partir dos
// parâmetros (biomassa/energia/combustível/folha) e do volume produzido (entradas
// manuais no estoque de produto acabado). Calcula o custo de cada produto =
// material (BOM × CMPM) + MOD + CIF, para valorar o estoque de acabado.

import { prismaSemEscopo } from "@/lib/prisma";
import { custosDaEmpresa } from "@/lib/custo-empresa";
import { pecasPorPalete, baseFatorCusteioMilheiro } from "@/lib/pcp/unidades";

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface CusteioProduto {
  itemId: string;
  codigo: string;
  descricao: string;
  volumeUn: number;
  volumeMilheiros: number;
  materialMilheiro: number;
  modMilheiro: number;
  cifMilheiro: number;
  custoMilheiro: number;
  custoUnitario: number; // custo por unidade (base do item) = custoMilheiro / 1000
}

export interface CusteioResult {
  competencia: string;
  params: { biomassaDia: number; energiaMes: number; combustivelDia: number; folhaMes: number; folhaMoiMes: number; diasTrabalhados: number; depreciacaoMes: number; diaristasMes: number } | null;
  biomassaMes: number;
  combustivelMes: number;
  energiaMes: number;
  cifPoolMes: number;
  folhaMes: number;
  folhaMoiMes: number;
  volumeTotalMilheiros: number;
  cifRate: number; // R$/milheiro (predeterminada)
  modRate: number; // R$/milheiro
  composicao: Composicao;
  produtos: CusteioProduto[];
}

export interface ColunaComposicao {
  total: number; // R$/milheiro
  itens: { nome: string; valorMilheiro: number }[];
}
export interface Composicao {
  materiaPrima: ColunaComposicao;
  embalagem: ColunaComposicao;
  md: ColunaComposicao; // material direto total (matéria-prima + embalagem) — compat
  cif: ColunaComposicao;
  mod: ColunaComposicao;
  custoTotalMilheiro: number;
}

type MdItem = { nome: string; valorMilheiro: number; categoria: string | null };

// Insumo de uma BOM (campos usados no custeio/explosão).
type InsumoEng = { insumoItemId: string; quantidade: unknown; base: string; unidadeId: string | null;
  insumoItem: { descricao: string; categoriaEstoque: string | null; compoeCusto: boolean; precoCusto: unknown; itemUnidades: { unidadeId: string; isPrincipal: boolean; fatorConversao: unknown }[] } };

// Fator de conversão (unidade do insumo → unidade-base) pelo itemUnidades.
function fatorUnidade(ins: InsumoEng): number {
  if (!ins.unidadeId) return 1;
  const iu = ins.insumoItem.itemUnidades.find((u) => u.unidadeId === ins.unidadeId);
  if (iu && !iu.isPrincipal && iu.fatorConversao != null) {
    const f = num(iu.fatorConversao);
    if (f > 0) return f;
  }
  return 1;
}

/**
 * Custo de material (R$/milheiro) de um produto pela engenharia × CMPM, com a quebra por insumo.
 * Insumos FABRICADOS (que têm BOM própria em bomMap, ex.: "Mistura de Argila") são EXPLODIDOS na
 * sua matéria-prima de base (ex.: Argila) proporcionalmente — para o relatório mostrar quanto de
 * argila cada produto gastou, mesmo a engenharia usando o intermediário. Água (compoeCusto=false)
 * e demais sem custo são ignorados.
 */
function materialPorMilheiro(
  eng: { insumos: InsumoEng[] },
  custos: Map<string, number | null>,
  bomMap: Map<string, InsumoEng[]>,
  ppp: number | null, // peças/palete do produto (p/ POR_PALETE)
): { total: number; itens: MdItem[] } {
  const itens: MdItem[] = [];

  // Acumula um insumo no custo: se for fabricado (tem BOM), explode; senão é folha (matéria-prima).
  // qtdBaseMilheiro = quantidade do insumo, na sua unidade-base, por milheiro do produto-topo.
  const acumular = (ins: InsumoEng, qtdBaseMilheiro: number, visitados: Set<string>, prof: number) => {
    if (ins.insumoItem.compoeCusto === false) return; // água
    const sub = bomMap.get(ins.insumoItemId);
    if (sub && sub.length && prof < 5 && !visitados.has(ins.insumoItemId)) {
      // Intermediário fabricado → explode na sua BOM. As quantidades da sub-BOM são por
      // 1 unidade-base do intermediário (granel: ex. 1 Batch de mistura), na unidade do
      // insumo → converte p/ a base do insumo pelo fatorUnidade. Sem multiplicador de
      // base (POR_MILHEIRO/POR_UNIDADE/POR_CICLO): a quantidade já é por unidade-base.
      const visit = new Set(visitados).add(ins.insumoItemId);
      for (const s of sub) {
        const razao = num(s.quantidade) * fatorUnidade(s);
        acumular(s, qtdBaseMilheiro * razao, visit, prof + 1);
      }
      return;
    }
    // Folha (matéria-prima/embalagem) → custo direto.
    const custoUnit = custos.get(ins.insumoItemId) ?? num(ins.insumoItem.precoCusto);
    const v = qtdBaseMilheiro * custoUnit;
    itens.push({ nome: ins.insumoItem.descricao, valorMilheiro: v, categoria: ins.insumoItem.categoriaEstoque ?? null });
  };

  for (const ins of eng.insumos) {
    if (ins.insumoItem.compoeCusto === false) continue; // água
    const baseFator = baseFatorCusteioMilheiro(ins.base, ppp); // por milheiro; POR_PALETE = 1000/peçasPorPalete
    acumular(ins, num(ins.quantidade) * fatorUnidade(ins) * baseFator, new Set<string>(), 0);
  }

  // Agrega folhas repetidas (mesmo insumo por caminhos diferentes) por nome.
  const porNome = new Map<string, MdItem>();
  for (const it of itens) {
    const prev = porNome.get(it.nome);
    if (prev) prev.valorMilheiro += it.valorMilheiro;
    else porNome.set(it.nome, { ...it });
  }
  const itensAgg = Array.from(porNome.values());
  const total = itensAgg.reduce((s, i) => s + i.valorMilheiro, 0);
  return { total, itens: itensAgg };
}

/**
 * Pré-carrega as BOMs dos insumos FABRICADOS (que têm engenharia própria) alcançáveis a partir de
 * um conjunto inicial de itemIds, resolvendo profundidade transitiva. Retorna o mapa itemId→insumos.
 */
async function carregarBomsIntermediarios(idsIniciais: string[]): Promise<Map<string, InsumoEng[]>> {
  const insumoSelect = {
    insumoItemId: true, quantidade: true, base: true, unidadeId: true,
    insumoItem: { select: { descricao: true, categoriaEstoque: true, compoeCusto: true, precoCusto: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
  } as const;
  const bomMap = new Map<string, InsumoEng[]>();
  let pendentes = Array.from(new Set(idsIniciais));
  for (let i = 0; i < 6 && pendentes.length; i++) {
    const buscar = pendentes.filter((id) => !bomMap.has(id));
    if (!buscar.length) break;
    const engs = await prismaSemEscopo.engenhariaProduto.findMany({
      where: { itemId: { in: buscar } },
      select: { itemId: true, insumos: { select: insumoSelect } },
    });
    const novos: string[] = [];
    for (const e of engs) {
      bomMap.set(e.itemId, e.insumos as InsumoEng[]);
      for (const ins of e.insumos) if (!bomMap.has(ins.insumoItemId)) novos.push(ins.insumoItemId);
    }
    pendentes = novos;
  }
  return bomMap;
}

/** Todos os itemIds-folha (matéria-prima) alcançáveis a partir de uma BOM, explodindo intermediários. */
function idsFolha(insumos: InsumoEng[], bomMap: Map<string, InsumoEng[]>, acc: Set<string>, visit = new Set<string>()) {
  for (const ins of insumos) {
    const sub = bomMap.get(ins.insumoItemId);
    if (sub && sub.length && !visit.has(ins.insumoItemId)) {
      idsFolha(sub, bomMap, acc, new Set(visit).add(ins.insumoItemId));
    } else {
      acc.add(ins.insumoItemId);
    }
  }
}

/**
 * Calcula o custeio de uma competência. Volume = entradas MANUAIS no estoque de PA
 * (sem ordemProducaoId). CIF pool = biomassa + energia + combustível.
 */
export async function calcularCusteio(
  empresaId: string,
  competencia: Date,
  opts?: { volumeDoMes?: boolean },
): Promise<CusteioResult> {
  const params = await prismaSemEscopo.parametroCusteio.findUnique({
    where: { empresaId_competencia: { empresaId, competencia } },
  });

  const dias = params?.diasTrabalhados ?? 26;
  const biomassaMes = num(params?.biomassaDia) * dias;
  const combustivelMes = num(params?.combustivelDia) * dias;
  const energiaMes = num(params?.energiaMes);
  const folhaMes = num(params?.folhaMes);       // mão de obra DIRETA (MOD)
  const folhaMoiMes = num(params?.folhaMoiMes); // mão de obra INDIRETA (MOI) → CIF
  const depreciacaoMes = num(params?.depreciacaoMes); // depreciação/amortização fabril → CIF
  const diaristasMes = num(params?.diaristasMes);     // diaristas diretos → MOD
  const cifPoolMes = biomassaMes + combustivelMes + energiaMes + folhaMoiMes + depreciacaoMes;
  const modPoolMes = folhaMes + diaristasMes;

  // Volume por produto: entradas manuais (sem OP) no(s) local(is) de produto acabado.
  const locaisPA = await prismaSemEscopo.localEstoque.findMany({
    where: { categoriasAceitas: { has: "PRODUTO_ACABADO" } }, select: { id: true },
  });
  const localIds = locaisPA.map((l) => l.id);
  // Opcional: contar só a produção DO MÊS (data de negócio no mês da competência;
  // cai no createdAt quando a movimentação não tem data). Sem isto, o volume é
  // acumulado (todo o histórico) e o mesmo p/ qualquer competência — o que fazia
  // o "Custo absorvido" repetir o valor em todos os meses, inclusive futuros.
  const filtroMes = opts?.volumeDoMes
    ? {
        OR: [
          { data: { gte: competencia, lt: new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + 1, 1)) } },
          { data: null, createdAt: { gte: competencia, lt: new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + 1, 1)) } },
        ],
      }
    : {};
  const entradas = localIds.length
    ? await prismaSemEscopo.movimentacaoEstoque.groupBy({
        by: ["itemId"],
        // Só produtos de FABRICAÇÃO (acabado próprio) entram no rateio — não revenda.
        where: { tipo: "ENTRADA", ordemProducaoId: null, clienteDonoId: null, localEstoqueId: { in: localIds }, item: { categoriaEstoque: "PRODUTO_ACABADO" }, ...filtroMes },
        _sum: { quantidade: true },
      })
    : [];
  const volPorItem = new Map(entradas.map((e) => [e.itemId, num(e._sum.quantidade)]));
  const itemIds = Array.from(volPorItem.keys());

  const volumeTotalUn = Array.from(volPorItem.values()).reduce((s, v) => s + v, 0);
  const volumeTotalMilheiros = volumeTotalUn / 1000;
  const cifRate = volumeTotalMilheiros > 0 ? cifPoolMes / volumeTotalMilheiros : 0;
  const modRate = volumeTotalMilheiros > 0 ? modPoolMes / volumeTotalMilheiros : 0;

  // Engenharia (BOM) de cada produto produzido, p/ o custo de material.
  const itens = itemIds.length
    ? await prismaSemEscopo.item.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true, codigo: true, descricao: true,
          itemUnidades: { select: { fatorConversao: true, unidade: { select: { sigla: true } } } },
          engenhariaProduto: {
            select: {
              insumos: {
                select: {
                  insumoItemId: true, quantidade: true, base: true, unidadeId: true,
                  insumoItem: { select: { descricao: true, categoriaEstoque: true, compoeCusto: true, precoCusto: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
                },
              },
            },
          },
          // Segunda qualidade: usa a engenharia do produto base (mesmo custo).
          produtoBase: {
            select: {
              engenhariaProduto: {
                select: {
                  insumos: {
                    select: {
                      insumoItemId: true, quantidade: true, base: true, unidadeId: true,
                      insumoItem: { select: { descricao: true, categoriaEstoque: true, compoeCusto: true, precoCusto: true, itemUnidades: { select: { unidadeId: true, isPrincipal: true, fatorConversao: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  // BOMs dos intermediários fabricados (ex.: "Mistura de Argila") p/ explodir na matéria-prima de base.
  const engs = itens.map((it) => it.engenhariaProduto ?? it.produtoBase?.engenhariaProduto ?? null);
  const insumosTopo = engs.flatMap((e) => (e?.insumos ?? []) as InsumoEng[]);
  const bomMap = await carregarBomsIntermediarios(insumosTopo.map((i) => i.insumoItemId));
  // CMPM de todos os ids-folha alcançáveis (inclui os exploded, ex.: Argila).
  const idsCusto = new Set<string>();
  for (const e of engs) if (e) idsFolha(e.insumos as InsumoEng[], bomMap, idsCusto);
  const custos = await custosDaEmpresa(prismaSemEscopo, empresaId, Array.from(idsCusto));

  const produtos: CusteioProduto[] = [];
  const mdAcumItem = new Map<string, { acum: number; categoria: string | null }>(); // nome → Σ(volMi × valor/mi)  (p/ média ponderada)
  for (const it of itens) {
    const volumeUn = volPorItem.get(it.id) ?? 0;
    const volMi = volumeUn / 1000;
    const eng = it.engenhariaProduto ?? it.produtoBase?.engenhariaProduto ?? null;
    const ppp = pecasPorPalete(it.itemUnidades); // peças/palete do produto (p/ POR_PALETE)
    const mat = eng ? materialPorMilheiro({ insumos: eng.insumos as InsumoEng[] }, custos, bomMap, ppp) : { total: 0, itens: [] as MdItem[] };
    const custoMilheiro = mat.total + modRate + cifRate;
    for (const mi of mat.itens) {
      const prev = mdAcumItem.get(mi.nome);
      mdAcumItem.set(mi.nome, { acum: (prev?.acum ?? 0) + volMi * mi.valorMilheiro, categoria: mi.categoria ?? prev?.categoria ?? null });
    }
    produtos.push({
      itemId: it.id, codigo: it.codigo, descricao: it.descricao,
      volumeUn, volumeMilheiros: r4(volMi),
      materialMilheiro: r2(mat.total), modMilheiro: r2(modRate), cifMilheiro: r2(cifRate),
      custoMilheiro: r2(custoMilheiro), custoUnitario: r4(custoMilheiro / 1000),
    });
  }
  produtos.sort((a, b) => b.volumeUn - a.volumeUn);

  // Composição (R$/milheiro) — MD é média ponderada pelo volume; CIF/MOD são as taxas.
  const vt = volumeTotalMilheiros;
  const mdItens = Array.from(mdAcumItem.entries()).map(([nome, { acum, categoria }]) => ({ nome, valorMilheiro: r2(vt > 0 ? acum / vt : 0), categoria }));
  // Embalagem (fita, selo, palete…) sai da matéria-prima — separado pela categoria de estoque.
  const ehEmbalagem = (c: string | null) => c === "EMBALAGEM";
  const mpItens = mdItens.filter((i) => !ehEmbalagem(i.categoria)).map(({ nome, valorMilheiro }) => ({ nome, valorMilheiro }));
  const embItens = mdItens.filter((i) => ehEmbalagem(i.categoria)).map(({ nome, valorMilheiro }) => ({ nome, valorMilheiro }));
  const mpTotal = mpItens.reduce((s, i) => s + i.valorMilheiro, 0);
  const embTotal = embItens.reduce((s, i) => s + i.valorMilheiro, 0);
  const mdTotal = mpTotal + embTotal;
  const composicao = {
    materiaPrima: { total: r2(mpTotal), itens: mpItens },
    embalagem: { total: r2(embTotal), itens: embItens },
    md: { total: r2(mdTotal), itens: mdItens.map(({ nome, valorMilheiro }) => ({ nome, valorMilheiro })) },
    cif: { total: r2(cifRate), itens: [
      { nome: "Biomassa", valorMilheiro: r2(vt > 0 ? biomassaMes / vt : 0) },
      { nome: "Energia elétrica", valorMilheiro: r2(vt > 0 ? energiaMes / vt : 0) },
      { nome: "Combustível", valorMilheiro: r2(vt > 0 ? combustivelMes / vt : 0) },
      { nome: "Mão de obra indireta (MOI)", valorMilheiro: r2(vt > 0 ? folhaMoiMes / vt : 0) },
      { nome: "Depreciação e amortização", valorMilheiro: r2(vt > 0 ? depreciacaoMes / vt : 0) },
    ] },
    mod: { total: r2(modRate), itens: [
      { nome: "Folha de pagamento", valorMilheiro: r2(vt > 0 ? folhaMes / vt : 0) },
      { nome: "Diaristas (diretos)", valorMilheiro: r2(vt > 0 ? diaristasMes / vt : 0) },
    ] },
    custoTotalMilheiro: r2(mdTotal + cifRate + modRate),
  };

  return {
    competencia: competencia.toISOString().slice(0, 7),
    params: params ? { biomassaDia: num(params.biomassaDia), energiaMes: num(params.energiaMes), combustivelDia: num(params.combustivelDia), folhaMes: num(params.folhaMes), folhaMoiMes: num(params.folhaMoiMes), diasTrabalhados: dias, depreciacaoMes, diaristasMes } : null,
    biomassaMes: r2(biomassaMes), combustivelMes: r2(combustivelMes), energiaMes: r2(energiaMes),
    cifPoolMes: r2(cifPoolMes), folhaMes: r2(folhaMes), folhaMoiMes: r2(folhaMoiMes),
    volumeTotalMilheiros: r4(volumeTotalMilheiros),
    cifRate: r2(cifRate), modRate: r2(modRate),
    composicao,
    produtos,
  };
}
