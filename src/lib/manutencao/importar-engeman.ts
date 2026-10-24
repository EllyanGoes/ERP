import sql from "mssql";
import { prismaSemEscopo as db } from "@/lib/prisma";
import { getEngemanConfig, stripRtf } from "@/lib/engeman";
import { EMPRESA_PADRAO_ID } from "@/lib/empresa";

// ─────────────────────────────────────────────────────────────────────────────
// Importação ÚNICA (reexecutável) do Engeman para o módulo de Manutenção nativo.
// docs/manutencao-prd.md §9. Idempotente pelos campos *legado*: rodar de novo só
// cria o que faltou e atualiza o status das OS que ainda estavam abertas.
// Todos os ativos do Engeman são da Tramontin (não há ativo da Atlas lá).
// ─────────────────────────────────────────────────────────────────────────────

export type ResumoImportacao = Record<string, { engeman: number; novos: number; atualizados?: number }>;

const EMPRESA = EMPRESA_PADRAO_ID;
const CHUNK = 500;

const normNome = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const txt = (s: unknown) => (typeof s === "string" ? s.trim() : s == null ? "" : String(s).trim());

function naturezaPorSigla(sigla: string): string {
  if (["CRT", "CRP", "CRN"].includes(sigla)) return "CORRETIVA";
  if (sigla === "PVT") return "PREVENTIVA";
  if (["PDT", "PDI", "PDS"].includes(sigla)) return "PREDITIVA";
  if (sigla === "INP") return "INSPECAO";
  if (sigla === "LUB") return "LUBRIFICACAO";
  if (sigla === "ADP") return "MELHORIA";
  return "OUTROS";
}

function statusOs(statord: string | null, temApontamento: boolean): string {
  switch ((statord ?? "A").trim()) {
    case "F": return "CONCLUIDA";
    case "C": return "CANCELADA";
    case "E": return "PAUSADA";
    case "P": return "EM_EXECUCAO";
    default: return temApontamento ? "EM_EXECUCAO" : "ABERTA";
  }
}

function prioridadeOs(prisub: number | null): string {
  if (prisub === 1) return "ALTA";
  if (prisub === 2) return "MEDIA";
  return "BAIXA";
}

export function numeroOsLegado(tag: string | null, codord: number): string {
  const n = parseInt(txt(tag), 10);
  return `OS-${String(Number.isFinite(n) ? n : codord).padStart(4, "0")}`;
}

function parentTaggru(tg: string): string | null {
  const s = tg.endsWith(".") ? tg.slice(0, -1) : tg;
  const i = s.lastIndexOf(".");
  return i < 0 ? null : s.slice(0, i + 1);
}

async function emLotes<T>(itens: T[], fn: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += CHUNK) await fn(itens.slice(i, i + CHUNK));
}

/** Lê tudo do Engeman de uma vez (volume pequeno: ~2k OS, ~13k registros). */
async function lerEngeman() {
  const pool = await sql.connect(await getEngemanConfig({ requestTimeout: 120000 }));
  try {
    const q = async <T,>(query: string) => (await pool.request().query<T>(query)).recordset;
    return {
      tipapl: await q<{ CODTIPAPL: number; DESCRICAO: string }>(`SELECT CODTIPAPL, DESCRICAO FROM TIPAPLIC`),
      locapl: await q<{ CODLOCAPL: number; DESCRICAO: string }>(`SELECT CODLOCAPL, DESCRICAO FROM LOCAPLIC`),
      aplic: await q<{
        CODAPL: number; TAG: string | null; TAGGRU: string | null; DESCRICAO: string | null; ATIVO: string | null;
        CODTIPAPL: number | null; CODLOCAPL: number | null; MODELO: string | null; NUMSER: string | null;
        NUMPAT: string | null; DATAQU: Date | null; DATGAR: Date | null; OBS: string | null;
      }>(`SELECT CODAPL, TAG, TAGGRU, DESCRICAO, ATIVO, CODTIPAPL, CODLOCAPL, MODELO, NUMSER, NUMPAT, DATAQU, DATGAR, CAST(OBS AS VARCHAR(4000)) AS OBS FROM APLIC`),
      tipman: await q<{ CODTIPMAN: number; TAG: string; DESCRICAO: string; PRIORIDADE: number | null }>(`SELECT CODTIPMAN, TAG, DESCRICAO, PRIORIDADE FROM TIPMANUT`),
      defeito: await q<{ CODDEF: number; DESCRICAO: string }>(`SELECT CODDEF, DESCRICAO FROM DEFEITO`),
      causa: await q<{ CODCAU: number; DESCRICAO: string }>(`SELECT CODCAU, DESCRICAO FROM CAUSA`),
      servico: await q<{ CODSER: number; DESCRICAO: string }>(`SELECT CODSER, DESCRICAO FROM SERVICO`),
      setexe: await q<{ CODSET: number; DESCRICAO: string }>(`SELECT CODSET, DESCRICAO FROM SETEXE`),
      func: await q<{ CODFUN: number; NOME: string; CUSTO_HORA: number | null }>(`SELECT CODFUN, NOME, CUSTO_HORA FROM FUNC`),
      material: await q<{ CODMAT: number; DESCRICAO: string }>(`SELECT CODMAT, DESCRICAO FROM MATERIAL`),
      ordserv: await q<{
        CODORD: number; TAG: string | null; CODAPL: number | null; CODLOCAPL: number | null; CODTIPMAN: number;
        CODPLA: number | null; CODSET: number | null; CODFUN_RESP: number | null; PRISUB: number | null; STATORD: string | null;
        DATENT: Date | null; DATPRO: Date | null; DATFEC: Date | null; DATCAN: Date | null; MAQPAR: Date | null; MAQFUN: Date | null;
        NOME_FECHOU: string | null; NOME_GEROU: string | null; OBS: string | null; OBSCAN: string | null; HHPRE: number | null;
      }>(`SELECT CODORD, TAG, CODAPL, CODLOCAPL, CODTIPMAN, CODPLA, CODSET, CODFUN_RESP, PRISUB, STATORD, DATENT, DATPRO, DATFEC, DATCAN,
                 MAQPAR, MAQFUN, NOME_FECHOU, NOME_GEROU, CAST(OBS AS VARCHAR(MAX)) AS OBS, CAST(OBSCAN AS VARCHAR(2000)) AS OBSCAN, HHPRE
          FROM ORDSERV`),
      ordxpar: await q<{ CODORD: number; MAQPAR: Date | null; MAQFUN: Date | null }>(`SELECT CODORD, MAQPAR, MAQFUN FROM ORDXPAR`),
      regserv: await q<{
        CODREGSER: number; CODORD: number; CODSER: number | null; CODMAT: number | null; CODDEF: number | null; CODCAU: number | null;
        DESCRICAO: string | null; EXECUTADO: string | null; TEMPO: number | null; QTDE: number | null; QTDEREA: number | null;
        VALOR: number | null; CUSTOREA: number | null; ORDEMEXEC: number | null;
      }>(`SELECT CODREGSER, CODORD, CODSER, CODMAT, CODDEF, CODCAU, CAST(DESCRICAO AS VARCHAR(2000)) AS DESCRICAO, EXECUTADO, TEMPO,
                 QTDE, QTDEREA, VALOR, CUSTOREA, ORDEMEXEC FROM REGSERV`),
      regservxmat: await q<{ CODRXMAT: number; CODORD: number; CODMAT: number | null; QTDEREA: number | null; QTDEPRE: number | null; VALORREA: number | null }>(
        `SELECT CODRXMAT, CODORD, CODMAT, QTDEREA, QTDEPRE, VALORREA FROM REGSERVXMAT`),
      ordxfun: await q<{ CODREGFUN: number; CODORD: number; CODFUN: number; DATHORINI: Date | null; DATHORFIM: Date | null }>(
        `SELECT CODREGFUN, CODORD, CODFUN, DATHORINI, DATHORFIM FROM ORDXFUN`),
      plamanut: await q<{ CODPLA: number; TAG: string | null; DESCRICAO: string; ATIVO: string | null; CODTIPMAN: number; OBS: string | null }>(
        `SELECT CODPLA, TAG, DESCRICAO, ATIVO, CODTIPMAN, CAST(OBS AS VARCHAR(4000)) AS OBS FROM PLAMANUT`),
      plaxset: await q<{ CODPLA: number; CODSET: number; ATIVO: string | null }>(`SELECT CODPLA, CODSET, ATIVO FROM PLAXSET`),
      chkplano: await q<{ CODCHKPLANO: number; CODPLA: number; CODAPL: number | null; CODSER: number | null; CODMAT: number | null; DESCRICAO: string | null; ORDEM: number | null; QTDE: number | null }>(
        `SELECT CODCHKPLANO, CODPLA, CODAPL, CODSER, CODMAT, CAST(DESCRICAO AS VARCHAR(2000)) AS DESCRICAO, ORDEM, QTDE FROM CHKPLANO`),
      plaper: await q<{ CODPLA: number; CODAPL: number; PERPLA: number | null; DATULTMAN: Date | null; ATIVO: string | null }>(
        `SELECT CODPLA, CODAPL, PERPLA, DATULTMAN, ATIVO FROM PLAPER`),
      plaacu: await q<{ CODPLA: number; CODAPL: number; CODPONACU: number | null; VALOR: number | null; DATULTMAN: Date | null; ATIVO: string | null }>(
        `SELECT CODPLA, CODAPL, CODPONACU, VALOR, DATULTMAN, ATIVO FROM PLAACU`),
      poncon: await q<{ CODPONACU: number; CODAPL: number | null; DESCRICAO: string | null; ACUMULADO: number | null }>(
        `SELECT CODPONACU, CODAPL, DESCRICAO, ACUMULADO FROM PONCONACU`),
    };
  } finally {
    await pool.close();
  }
}

export async function importarEngeman(opts: { aplicar: boolean }): Promise<ResumoImportacao> {
  const e = await lerEngeman();
  const resumo: ResumoImportacao = {};

  // Mapas de legado → id já existentes no ERP
  const [familiasExist, ativosExist, tiposExist, catExist, equipesExist, ordensExist, servExist, matExist, apExist, planosExist, paExist, medExist, colaboradores, tarefasExist] = await Promise.all([
    db.manutFamilia.findMany({ select: { id: true, legadoId: true } }),
    db.manutAtivo.findMany({ select: { id: true, codApl: true } }),
    db.manutTipo.findMany({ select: { id: true, legadoId: true, sigla: true } }),
    db.manutCatalogo.findMany({ select: { id: true, tipo: true, legadoId: true } }),
    db.manutEquipe.findMany({ select: { id: true, legadoId: true } }),
    db.manutOrdem.findMany({ where: { codOrdLegado: { not: null } }, select: { id: true, codOrdLegado: true, status: true } }),
    db.manutOrdemServico.findMany({ where: { legadoId: { not: null } }, select: { legadoId: true } }),
    db.manutOrdemMaterial.findMany({ where: { legadoId: { not: null } }, select: { legadoId: true } }),
    db.manutApontamento.findMany({ where: { legadoId: { not: null } }, select: { legadoId: true } }),
    db.manutPlano.findMany({ where: { legadoId: { not: null } }, select: { id: true, legadoId: true } }),
    db.manutPlanoAtivo.findMany({ where: { legadoRef: { not: null } }, select: { legadoRef: true } }),
    db.manutMedidor.findMany({ where: { legadoId: { not: null } }, select: { id: true, legadoId: true } }),
    db.colaborador.findMany({ select: { id: true, nome: true } }),
    db.manutPlanoTarefa.findMany({ select: { planoId: true } }),
  ]);

  const novos = <T,>(nome: string, total: number, lista: T[]) => {
    resumo[nome] = { engeman: total, novos: lista.length };
    return lista;
  };

  // ── Famílias ────────────────────────────────────────────────────────────────
  const famLeg = new Set(familiasExist.map((f) => f.legadoId));
  const famNovas = novos("familias", e.tipapl.length, e.tipapl.filter((t) => !famLeg.has(t.CODTIPAPL)));
  // ── Tipos ───────────────────────────────────────────────────────────────────
  const corretivosCfg = await db.configuracao.findUnique({ where: { chave: "pcm_tipos_corretivos" } });
  const corretivos = new Set(
    (corretivosCfg?.valor ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)),
  );
  const tipoLeg = new Set(tiposExist.map((t) => t.legadoId));
  const tipoSiglas = new Set(tiposExist.map((t) => t.sigla));
  const tiposNovos = novos("tipos", e.tipman.length, e.tipman.filter((t) => !tipoLeg.has(t.CODTIPMAN) && !tipoSiglas.has(txt(t.TAG))));
  // ── Catálogo ────────────────────────────────────────────────────────────────
  const catKey = new Set(catExist.map((c) => `${c.tipo}:${c.legadoId}`));
  const catNovos = [
    ...e.defeito.map((d) => ({ tipo: "SINTOMA", legadoId: d.CODDEF, descricao: txt(d.DESCRICAO) })),
    ...e.causa.map((d) => ({ tipo: "CAUSA", legadoId: d.CODCAU, descricao: txt(d.DESCRICAO) })),
    ...e.servico.map((d) => ({ tipo: "SERVICO", legadoId: d.CODSER, descricao: txt(d.DESCRICAO) })),
  ];
  const catParaCriar = novos("catalogo", catNovos.length, catNovos.filter((c) => !catKey.has(`${c.tipo}:${c.legadoId}`)));
  // ── Equipes ─────────────────────────────────────────────────────────────────
  const eqLeg = new Set(equipesExist.map((x) => x.legadoId));
  const eqNovas = novos("equipes", e.setexe.length, e.setexe.filter((s) => !eqLeg.has(s.CODSET)));
  // ── Ativos ──────────────────────────────────────────────────────────────────
  const atvLeg = new Set(ativosExist.map((a) => a.codApl));
  const atvNovos = novos("ativos", e.aplic.length, e.aplic.filter((a) => !atvLeg.has(a.CODAPL)));
  // ── OS e filhos ─────────────────────────────────────────────────────────────
  const osLeg = new Map(ordensExist.map((o) => [o.codOrdLegado!, o]));
  const osNovas = novos("ordens", e.ordserv.length, e.ordserv.filter((o) => !osLeg.has(o.CODORD)));
  const servLeg = new Set(servExist.map((s) => s.legadoId));
  const matLeg = new Set(matExist.map((m) => m.legadoId));
  const regServicos = e.regserv.filter((r) => r.CODMAT == null || r.CODDEF != null || r.CODCAU != null);
  const regMateriais = e.regserv.filter((r) => r.CODMAT != null);
  novos("servicosOs", regServicos.length, regServicos.filter((r) => !servLeg.has(r.CODREGSER)));
  novos("materiaisOs", regMateriais.length + e.regservxmat.length, [
    ...regMateriais.filter((r) => !matLeg.has(`RS:${r.CODREGSER}`)),
    ...e.regservxmat.filter((r) => !matLeg.has(`RX:${r.CODRXMAT}`)),
  ]);
  const apLeg = new Set(apExist.map((a) => a.legadoId));
  novos("apontamentos", e.ordxfun.length, e.ordxfun.filter((x) => !apLeg.has(x.CODREGFUN) && x.DATHORINI));
  // ── Planos ──────────────────────────────────────────────────────────────────
  const plLeg = new Map(planosExist.map((p) => [p.legadoId!, p.id]));
  const planosNovos = novos("planos", e.plamanut.length, e.plamanut.filter((p) => !plLeg.has(p.CODPLA)));
  const medLeg = new Map(medExist.map((m) => [m.legadoId!, m.id]));
  const medNovos = novos("medidores", e.poncon.length, e.poncon.filter((m) => !medLeg.has(m.CODPONACU) && m.CODAPL != null));
  const paLeg = new Set(paExist.map((p) => p.legadoRef));
  const aplicacoes = [
    ...e.plaper.map((p) => ({ ref: `PER:${p.CODPLA}:${p.CODAPL}`, per: p, acu: null as (typeof e.plaacu)[number] | null })),
    ...e.plaacu.map((p) => ({ ref: `ACU:${p.CODPLA}:${p.CODAPL}`, per: null as (typeof e.plaper)[number] | null, acu: p })),
  ];
  novos("planoAtivos", aplicacoes.length, aplicacoes.filter((a) => !paLeg.has(a.ref)));

  // OS ainda abertas no ERP que mudaram no Engeman (fecharam/cancelaram)
  const osParaAtualizar = e.ordserv.filter((o) => {
    const ex = osLeg.get(o.CODORD);
    return ex && !["CONCLUIDA", "CANCELADA"].includes(ex.status) && ["F", "C"].includes(txt(o.STATORD));
  });
  resumo.ordens.atualizados = osParaAtualizar.length;

  // Executantes do Engeman → Colaborador por nome
  // Engeman abrevia ("MARLISSON OLIVEIRA" = "MARLISSON NAZARE DE OLIVEIRA"): casa
  // exato; senão, mesmo primeiro nome + todas as palavras contidas, se ÚNICO.
  const colabPorNome = new Map(colaboradores.map((c) => [normNome(c.nome), c.id]));
  const PARTICULAS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
  const tokens = (s: string) => normNome(s).replace(/[^A-Z ]/g, " ").split(" ").filter((t) => t && !PARTICULAS.has(t));
  const colabTokens = colaboradores.map((c) => ({ id: c.id, t: tokens(c.nome) }));
  const casarColaborador = (nome: string): string | null => {
    const exato = colabPorNome.get(normNome(nome));
    if (exato) return exato;
    const f = tokens(nome);
    if (f.length < 2) return null;
    const cands = colabTokens.filter((c) => c.t[0] === f[0] && f.every((x) => c.t.includes(x)));
    return cands.length === 1 ? cands[0].id : null;
  };
  const funcMap = new Map(e.func.map((f) => [f.CODFUN, { nome: txt(f.NOME), custoHora: f.CUSTO_HORA && f.CUSTO_HORA > 0 ? f.CUSTO_HORA : null, colaboradorId: casarColaborador(txt(f.NOME)) }]));
  const funcUsados = new Set(e.ordxfun.map((x) => x.CODFUN));
  const semVinculo = Array.from(funcUsados).map((c) => funcMap.get(c)).filter((f) => f && !f.colaboradorId);
  resumo.executantesSemColaborador = { engeman: funcUsados.size, novos: semVinculo.length };

  if (!opts.aplicar) return resumo;

  // ═══ APLICAR ═══════════════════════════════════════════════════════════════
  await db.manutFamilia.createMany({ data: famNovas.map((f) => ({ nome: txt(f.DESCRICAO), legadoId: f.CODTIPAPL })), skipDuplicates: true });
  await db.manutTipo.createMany({
    data: tiposNovos.map((t) => {
      const sigla = txt(t.TAG);
      const natureza = naturezaPorSigla(sigla);
      const falha = corretivos.size > 0 ? corretivos.has(t.CODTIPMAN) : natureza === "CORRETIVA";
      return { sigla, nome: txt(t.DESCRICAO), natureza, contaComoFalha: falha, prioridade: Math.round(t.PRIORIDADE ?? 3), legadoId: t.CODTIPMAN };
    }),
    skipDuplicates: true,
  });
  await emLotes(catParaCriar, (l) => db.manutCatalogo.createMany({ data: l, skipDuplicates: true }));
  await db.manutEquipe.createMany({
    data: eqNovas.map((s) => ({ nome: txt(s.DESCRICAO), externa: /EXTERNO/i.test(s.DESCRICAO), legadoId: s.CODSET })),
    skipDuplicates: true,
  });

  const famId = new Map((await db.manutFamilia.findMany({ select: { id: true, legadoId: true } })).map((f) => [f.legadoId, f.id]));
  const locDesc = new Map(e.locapl.map((l) => [l.CODLOCAPL, txt(l.DESCRICAO)]));
  const famDesc = new Map(e.tipapl.map((t) => [t.CODTIPAPL, txt(t.DESCRICAO)]));

  // Ativos: cria sem pai, depois liga a árvore pelo TAGGRU.
  const temFilho = new Set(e.aplic.map((a) => (a.TAGGRU ? parentTaggru(a.TAGGRU.trim()) : null)).filter(Boolean) as string[]);
  const tagsUsadas = new Set((await db.manutAtivo.findMany({ select: { tag: true } })).map((a) => a.tag));
  await emLotes(atvNovos, (l) =>
    db.manutAtivo.createMany({
      data: l.map((a) => {
        let tag = txt(a.TAG) || `APL-${a.CODAPL}`;
        if (tagsUsadas.has(tag)) tag = `${tag}#${a.CODAPL}`;
        tagsUsadas.add(tag);
        const fam = a.CODTIPAPL ? famDesc.get(a.CODTIPAPL) ?? "" : "";
        const tipo = a.TAGGRU && temFilho.has(a.TAGGRU.trim()) ? "LOCAL" : /CAMINH|VEIC|CARRO|MOTO/i.test(`${fam} ${a.DESCRICAO}`) ? "VEICULO" : "EQUIPAMENTO";
        return {
          empresaId: EMPRESA, codApl: a.CODAPL, tag, nome: txt(a.DESCRICAO) || tag, tipo,
          familiaId: a.CODTIPAPL ? famId.get(a.CODTIPAPL) ?? null : null,
          localizacao: a.CODLOCAPL ? locDesc.get(a.CODLOCAPL) ?? null : null,
          modelo: txt(a.MODELO) || null, numeroSerie: txt(a.NUMSER) || null, numeroPatrimonio: txt(a.NUMPAT) || null,
          dataAquisicao: a.DATAQU, garantiaAte: a.DATGAR, observacoes: stripRtf(a.OBS) || null,
          ativo: txt(a.ATIVO) !== "N", criadoPor: "Importação Engeman",
        };
      }),
      skipDuplicates: true,
    }),
  );
  const ativos = await db.manutAtivo.findMany({ select: { id: true, codApl: true, paiId: true } });
  const atvId = new Map(ativos.map((a) => [a.codApl, a.id]));
  const porTaggru = new Map(e.aplic.filter((a) => a.TAGGRU).map((a) => [a.TAGGRU!.trim(), a.CODAPL]));
  for (const a of e.aplic) {
    if (!a.TAGGRU || !atvNovos.some((n) => n.CODAPL === a.CODAPL)) continue;
    const p = parentTaggru(a.TAGGRU.trim());
    const paiCod = p ? porTaggru.get(p) : undefined;
    if (paiCod != null && atvId.get(paiCod)) await db.manutAtivo.update({ where: { id: atvId.get(a.CODAPL)! }, data: { paiId: atvId.get(paiCod)! } });
  }

  // Medidores
  await db.manutMedidor.createMany({
    data: medNovos.filter((m) => atvId.get(m.CODAPL!)).map((m) => ({
      ativoId: atvId.get(m.CODAPL!)!, nome: txt(m.DESCRICAO) || "Horímetro", unidade: "h",
      acumulado: m.ACUMULADO ?? 0, ativo: !/^teste$/i.test(txt(m.DESCRICAO)), legadoId: m.CODPONACU,
    })),
    skipDuplicates: true,
  });
  const medId = new Map((await db.manutMedidor.findMany({ where: { legadoId: { not: null } }, select: { id: true, legadoId: true } })).map((m) => [m.legadoId!, m.id]));

  const tipoId = new Map((await db.manutTipo.findMany({ select: { id: true, legadoId: true } })).map((t) => [t.legadoId, t.id]));
  const eqId = new Map((await db.manutEquipe.findMany({ select: { id: true, legadoId: true } })).map((x) => [x.legadoId, x.id]));
  const catId = new Map((await db.manutCatalogo.findMany({ select: { id: true, tipo: true, legadoId: true } })).map((c) => [`${c.tipo}:${c.legadoId}`, c.id]));

  // Planos
  const equipePlano = new Map<number, number>();
  for (const x of e.plaxset) if (txt(x.ATIVO) !== "N" && !equipePlano.has(x.CODPLA)) equipePlano.set(x.CODPLA, x.CODSET);
  const codigosUsados = new Set((await db.manutPlano.findMany({ where: { empresaId: EMPRESA }, select: { codigo: true } })).map((p) => p.codigo));
  for (const p of planosNovos) {
    let codigo = txt(p.TAG) || String(p.CODPLA);
    if (codigosUsados.has(codigo)) codigo = `${codigo}-${p.CODPLA}`;
    codigosUsados.add(codigo);
    await db.manutPlano.create({
      data: {
        empresaId: EMPRESA, codigo, nome: txt(p.DESCRICAO), tipoId: tipoId.get(p.CODTIPMAN)!, equipeId: eqId.get(equipePlano.get(p.CODPLA) ?? -1) ?? null,
        observacoes: stripRtf(p.OBS) || null, ativo: txt(p.ATIVO) !== "N", legadoId: p.CODPLA, criadoPor: "Importação Engeman",
      },
    });
  }
  const planoId = new Map((await db.manutPlano.findMany({ where: { legadoId: { not: null } }, select: { id: true, legadoId: true } })).map((p) => [p.legadoId!, p.id]));
  // Tarefas só para planos que ainda não têm checklist
  const planosComTarefa = new Set(tarefasExist.map((t) => t.planoId));
  const matDesc = new Map(e.material.map((m) => [m.CODMAT, txt(m.DESCRICAO)]));
  const tarefas = e.chkplano
    .filter((c) => planoId.get(c.CODPLA) && !planosComTarefa.has(planoId.get(c.CODPLA)!))
    .map((c) => {
      let descricao = txt(c.DESCRICAO) || "—";
      if (c.CODMAT) descricao += ` (material: ${matDesc.get(c.CODMAT) ?? c.CODMAT}${c.QTDE ? ` × ${c.QTDE}` : ""})`;
      const cabecalho = c.CODAPL != null && c.CODSER == null && c.CODMAT == null;
      return {
        planoId: planoId.get(c.CODPLA)!, seq: Number(c.ORDEM ?? c.CODCHKPLANO), descricao,
        ativoId: c.CODAPL ? atvId.get(c.CODAPL) ?? null : null,
        servicoId: c.CODSER ? catId.get(`SERVICO:${c.CODSER}`) ?? null : null,
        tipoResposta: cabecalho ? "NENHUMA" : "OK_NOK",
      };
    });
  await emLotes(tarefas, (l) => db.manutPlanoTarefa.createMany({ data: l }));
  // Aplicações do plano (calendário e medidor)
  const aplNovas = aplicacoes.filter((a) => !paLeg.has(a.ref));
  for (const a of aplNovas) {
    const src = a.per ?? a.acu!;
    const pid = planoId.get(src.CODPLA);
    const aid = atvId.get(src.CODAPL);
    if (!pid || !aid) continue;
    const ultima = src.DATULTMAN ?? null;
    if (a.per) {
      const dias = Math.max(1, Math.round(a.per.PERPLA ?? 30));
      const prox = ultima ? new Date(ultima.getTime() + dias * 86400000) : new Date();
      await db.manutPlanoAtivo.create({
        data: { planoId: pid, ativoId: aid, gatilho: "CALENDARIO", intervaloDias: dias, ultimaExecucao: ultima, proximoVencimento: prox, ativo: txt(a.per.ATIVO) !== "N", legadoRef: a.ref },
      });
    } else {
      const acu = a.acu!;
      await db.manutPlanoAtivo.create({
        data: {
          planoId: pid, ativoId: aid, gatilho: "MEDIDOR", medidorId: acu.CODPONACU ? medId.get(acu.CODPONACU) ?? null : null,
          intervaloMedida: acu.VALOR ?? null, ultimaExecucao: ultima, proximaMedida: acu.VALOR ?? null, ativo: txt(acu.ATIVO) !== "N", legadoRef: a.ref,
        },
      });
    }
  }
  const paId = new Map((await db.manutPlanoAtivo.findMany({ where: { legadoRef: { not: null } }, select: { id: true, planoId: true, ativoId: true } })).map((p) => [`${p.planoId}:${p.ativoId}`, p.id]));

  // OS
  const parada = new Map(e.ordxpar.map((p) => [p.CODORD, p]));
  const comApont = new Set(e.ordxfun.map((x) => x.CODORD));
  const tipoFallback = tipoId.values().next().value as string;
  const numerosUsados = new Set((await db.manutOrdem.findMany({ where: { empresaId: EMPRESA }, select: { numero: true } })).map((o) => o.numero));
  await emLotes(osNovas, (l) =>
    db.manutOrdem.createMany({
      data: l.map((o) => {
        let numero = numeroOsLegado(o.TAG, o.CODORD);
        if (numerosUsados.has(numero)) numero = `${numero}-${o.CODORD}`;
        numerosUsados.add(numero);
        const status = statusOs(o.STATORD, comApont.has(o.CODORD));
        const px = parada.get(o.CODORD);
        const ativoId = o.CODAPL ? atvId.get(o.CODAPL) ?? null : null;
        const pid = o.CODPLA ? planoId.get(o.CODPLA) ?? null : null;
        const fechou = txt(o.NOME_FECHOU) || null;
        return {
          empresaId: EMPRESA, numero, ativoId,
          localTexto: !ativoId && o.CODLOCAPL ? locDesc.get(o.CODLOCAPL) ?? null : null,
          tipoId: tipoId.get(o.CODTIPMAN) ?? tipoFallback,
          planoId: pid, planoAtivoId: pid && ativoId ? paId.get(`${pid}:${ativoId}`) ?? null : null,
          planoRef: pid ? `LEGADO:${o.CODORD}` : null,
          equipeId: o.CODSET ? eqId.get(o.CODSET) ?? null : null,
          responsavelId: o.CODFUN_RESP ? funcMap.get(o.CODFUN_RESP)?.colaboradorId ?? null : null,
          prioridade: prioridadeOs(o.PRISUB), status,
          descricao: stripRtf(o.OBS) || "(sem descrição no Engeman)",
          programadaPara: o.DATPRO, horasEstimadas: o.HHPRE && o.HHPRE > 0 ? o.HHPRE : null,
          paradaInicio: o.MAQPAR ?? px?.MAQPAR ?? null, paradaFim: o.MAQPAR ? o.MAQFUN : px?.MAQFUN ?? null,
          encerradaEm: status === "CONCLUIDA" ? o.DATFEC : null, encerradaPor: status === "CONCLUIDA" ? fechou : null,
          concluidaEm: status === "CONCLUIDA" ? o.DATFEC : null, concluidaPor: status === "CONCLUIDA" ? fechou : null,
          canceladaEm: status === "CANCELADA" ? o.DATCAN ?? o.DATFEC : null,
          motivoCancelamento: status === "CANCELADA" ? stripRtf(o.OBSCAN) || null : null,
          codOrdLegado: o.CODORD, criadoPor: txt(o.NOME_GEROU) || "Importação Engeman",
          createdAt: o.DATENT ?? o.DATPRO ?? new Date(),
        };
      }),
      skipDuplicates: true,
    }),
  );
  for (const o of osParaAtualizar) {
    const status = statusOs(o.STATORD, true);
    await db.manutOrdem.update({
      where: { codOrdLegado: o.CODORD },
      data: {
        status, paradaInicio: o.MAQPAR, paradaFim: o.MAQFUN,
        encerradaEm: status === "CONCLUIDA" ? o.DATFEC : null, concluidaEm: status === "CONCLUIDA" ? o.DATFEC : null,
        concluidaPor: status === "CONCLUIDA" ? txt(o.NOME_FECHOU) || null : null,
        canceladaEm: status === "CANCELADA" ? o.DATCAN ?? o.DATFEC : null,
      },
    });
  }
  const osId = new Map((await db.manutOrdem.findMany({ where: { codOrdLegado: { not: null } }, select: { id: true, codOrdLegado: true } })).map((o) => [o.codOrdLegado!, o.id]));

  // Serviços / falhas
  const servNovos = regServicos.filter((r) => !servLeg.has(r.CODREGSER) && osId.get(r.CODORD));
  await emLotes(servNovos, (l) =>
    db.manutOrdemServico.createMany({
      data: l.map((r) => ({
        ordemId: osId.get(r.CODORD)!, seq: Number(r.ORDEMEXEC ?? r.CODREGSER),
        descricao: stripRtf(r.DESCRICAO) || (r.CODSER ? e.servico.find((s) => s.CODSER === r.CODSER)?.DESCRICAO?.trim() : null) || "—",
        servicoId: r.CODSER ? catId.get(`SERVICO:${r.CODSER}`) ?? null : null,
        sintomaId: r.CODDEF ? catId.get(`SINTOMA:${r.CODDEF}`) ?? null : null,
        causaId: r.CODCAU ? catId.get(`CAUSA:${r.CODCAU}`) ?? null : null,
        executado: txt(r.EXECUTADO) === "S", tempoHoras: r.TEMPO && r.TEMPO > 0 ? r.TEMPO : null, legadoId: r.CODREGSER,
      })),
      skipDuplicates: true,
    }),
  );
  // Materiais (histórico — material do Engeman não é Item do ERP)
  const matNovos = [
    ...regMateriais.filter((r) => !matLeg.has(`RS:${r.CODREGSER}`) && osId.get(r.CODORD)).map((r) => ({
      ordemId: osId.get(r.CODORD)!, descricao: matDesc.get(r.CODMAT!) ?? `Material ${r.CODMAT}`,
      quantidade: r.QTDEREA ?? r.QTDE ?? 0, valorTotal: r.CUSTOREA ?? r.VALOR ?? 0, origem: "LEGADO", legadoId: `RS:${r.CODREGSER}`,
    })),
    ...e.regservxmat.filter((r) => !matLeg.has(`RX:${r.CODRXMAT}`) && osId.get(r.CODORD) && r.CODMAT).map((r) => ({
      ordemId: osId.get(r.CODORD)!, descricao: matDesc.get(r.CODMAT!) ?? `Material ${r.CODMAT}`,
      quantidade: r.QTDEREA ?? r.QTDEPRE ?? 0, valorTotal: r.VALORREA ?? 0, origem: "LEGADO", legadoId: `RX:${r.CODRXMAT}`,
    })),
  ];
  await emLotes(matNovos, (l) => db.manutOrdemMaterial.createMany({ data: l, skipDuplicates: true }));
  // Apontamentos
  const apNovos = e.ordxfun.filter((x) => !apLeg.has(x.CODREGFUN) && x.DATHORINI && osId.get(x.CODORD));
  await emLotes(apNovos, (l) =>
    db.manutApontamento.createMany({
      data: l.map((x) => {
        const f = funcMap.get(x.CODFUN);
        return {
          ordemId: osId.get(x.CODORD)!, colaboradorId: f?.colaboradorId ?? null, nome: f?.nome || `Executante ${x.CODFUN}`,
          inicio: x.DATHORINI!, fim: x.DATHORFIM, custoHora: f?.custoHora ?? null, legadoId: x.CODREGFUN, criadoPor: "Importação Engeman",
        };
      }),
      skipDuplicates: true,
    }),
  );

  // Sequência de OS continua do maior número importado.
  const maiorOs = Math.max(0, ...e.ordserv.map((o) => parseInt(txt(o.TAG), 10)).filter(Number.isFinite));
  const seq = await db.sequencia.findUnique({ where: { empresaId_prefixo: { empresaId: EMPRESA, prefixo: "OS" } } });
  if (!seq || seq.ultimo < maiorOs) {
    await db.sequencia.upsert({
      where: { empresaId_prefixo: { empresaId: EMPRESA, prefixo: "OS" } },
      update: { ultimo: maiorOs }, create: { empresaId: EMPRESA, prefixo: "OS", ultimo: maiorOs },
    });
  }

  // Custos e status dos ativos (só das OS novas/atualizadas)
  const tocadas = [...osNovas.map((o) => o.CODORD), ...osParaAtualizar.map((o) => o.CODORD)].map((c) => osId.get(c)).filter(Boolean) as string[];
  // Histórico não tem requisição do ERP nem terceiro: custo = apontamentos × custo-hora + materiais legados (em lote).
  if (tocadas.length) {
    await db.$executeRaw`
      UPDATE "ManutOrdem" o SET
        "custoMaoObra" = COALESCE((SELECT ROUND(SUM(EXTRACT(EPOCH FROM (a."fim" - a."inicio")) / 3600 * COALESCE(a."custoHora", 0))::numeric, 2)
                                   FROM "ManutApontamento" a WHERE a."ordemId" = o."id" AND a."fim" IS NOT NULL AND a."fim" > a."inicio"), 0),
        "custoMaterial" = COALESCE((SELECT SUM(m."valorTotal") FROM "ManutOrdemMaterial" m WHERE m."ordemId" = o."id" AND m."origem" = 'LEGADO'), 0)
      WHERE o."id" = ANY(${tocadas})`;
  }
  const ativosTocados = new Set(osNovas.map((o) => (o.CODAPL ? atvId.get(o.CODAPL) : null)).filter(Boolean) as string[]);
  const parados = new Set(
    (await db.manutOrdem.findMany({
      where: { ativoId: { in: Array.from(ativosTocados) }, status: { not: "CANCELADA" }, paradaInicio: { not: null }, paradaFim: null },
      select: { ativoId: true },
    })).map((o) => o.ativoId),
  );
  if (parados.size) await db.manutAtivo.updateMany({ where: { id: { in: Array.from(parados) as string[] } }, data: { status: "PARADO" } });

  await db.configuracao.upsert({
    where: { chave: "manut_importacao_engeman" },
    update: { valor: new Date().toISOString() },
    create: { chave: "manut_importacao_engeman", valor: new Date().toISOString() },
  });
  return resumo;
}
