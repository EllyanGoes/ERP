// Captura automática de andamentos pela API Pública do DataJud (CNJ) — docs/processos-prd.md, Fase 1.5.
// Documentação: https://datajud-wiki.cnj.jus.br/api-publica/ (endpoints por tribunal,
// consulta Elasticsearch por numeroProcesso só com dígitos, header "Authorization: APIKey <chave>").
//
// Fluxo de consultarDatajud(processo): busca → normaliza os movimentos de todos os graus →
// grava só os novos (dedup por processoId+externoId) → classifica a importância (tabela abaixo)
// → resumo por IA só dos ALTA novos (best-effort) → completa no processo o que estiver vazio.
import { prismaSemEscopo } from "@/lib/prisma";
import { validarCnj } from "@/lib/processos-cnj";
import { resumirMovimento } from "@/lib/processos-ia";
import { notificarUsuario } from "@/lib/notificacoes";
import { sendTelegramDM, escMD } from "@/lib/telegram";

// Chave PÚBLICA do DataJud (não é segredo: o CNJ publica para todos e troca de tempos em tempos).
// Fonte: https://datajud-wiki.cnj.jus.br/api-publica/acesso — conferida em 26/11/2026.
// Se o CNJ trocar, defina DATAJUD_API_KEY no ambiente (sem precisar de deploy de código).
const CHAVE_PUBLICA_DATAJUD = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const chaveDatajud = () => process.env.DATAJUD_API_KEY?.trim() || CHAVE_PUBLICA_DATAJUD;
const URL_BASE = "https://api-publica.datajud.cnj.jus.br";

// ── Importância por código TPU/CNJ (Tabela Processual Unificada — movimentos) ────────────
// Códigos mais comuns; o que não estiver aqui cai nas regras por NOME do movimento logo abaixo
// (o DataJud manda nome + código, e cada tribunal usa um subconjunto da TPU).
const TPU_ALTA = new Set<number>([
  3,     // Decisão (magistrado)
  193,   // Julgamento
  219, 220, 221, // Procedência / Improcedência / Procedência em parte
  196, 198, 200, // Extinção da execução / Acolhimento / Não acolhimento de embargos
  235, 236, 237, 238, 239, // Recurso: não conhecimento, negação de seguimento, provimento (total/parcial), não provimento
  466,   // Homologação de transação (acordo)
  848,   // Trânsito em julgado
  22,    // Baixa definitiva
  245, 246, 861, // Arquivamento provisório / definitivo / arquivamento
  332, 339, 347, // Antecipação de tutela / liminar (concessão e afins)
  12475, // Bloqueio/penhora on-line (SISBAJUD)
  12164, // Outras decisões
  12252, // Sentença confirmada (recurso)
  12263, // Intimação
]);
const TPU_ROTINA = new Set<number>([
  51,    // Conclusão
  67, 85, 581, // Juntada / Petição / Documento
  123,   // Remessa
  132,   // Recebimento
  60,    // Expedição de documento (vira ALTA se o complemento for citação/intimação — ver abaixo)
  92, 1061, // Publicação / Disponibilização no Diário da Justiça
  26, 36, // Distribuição / Redistribuição
  11009, 11010, // Despacho de mero expediente
  12116, // Conclusão "para julgamento de mérito" (ainda não é o julgamento)
  11383, // Ato ordinatório
  493, 977, 978, // Entrega em carga/vista, recebidos os autos…
]);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ALTA_NOME = /(sentenca|julgamento|julgad|acordao|decis|transito em julgado|baixa definitiva|arquivamento|arquivad|liminar|tutela|penhora|bloqueio|sisbajud|citacao|intimacao|procedencia|improcedencia|provimento|homologa)/;
const ROTINA_NOME = /(conclus|juntada|remessa|remetid|recebimento|recebid|expedicao|publicacao|publicad|disponibiliza|distribui|redistribui|mero expediente|ato ordinatorio|carga|vista)/;

export type Importancia = "ALTA" | "NORMAL" | "ROTINA";

/** Classifica o movimento: código TPU primeiro, depois nome; complemento de citação/intimação ou
 *  audiência designada sobe para ALTA. */
export function classificarMovimento(codigo: number | null, nome: string, complementos: string[]): Importancia {
  const n = semAcento(nome), c = semAcento(complementos.join(" "));
  if (/audiencia/.test(n) || /audiencia/.test(c)) return /(designad|redesignad|marcad|agendad)/.test(n + " " + c) ? "ALTA" : "NORMAL";
  if (/(citacao|intimacao)/.test(c)) return "ALTA"; // expedição/publicação de citação ou intimação
  if (codigo != null && TPU_ALTA.has(codigo)) return "ALTA";
  if (codigo != null && TPU_ROTINA.has(codigo)) return "ROTINA";
  if (ALTA_NOME.test(n)) return "ALTA";
  if (ROTINA_NOME.test(n)) return "ROTINA";
  return "NORMAL";
}

/** Tipo do andamento (lista do módulo) a partir do movimento. */
function tipoAndamento(nome: string, imp: Importancia): string {
  const n = semAcento(nome);
  if (/audiencia/.test(n)) return "AUDIENCIA";
  if (imp === "ALTA" && /(sentenca|julgamento|acordao|decis|liminar|tutela|procedencia|provimento)/.test(n)) return "DECISAO";
  return "MOVIMENTACAO";
}

// ── Resposta do DataJud ─────────────────────────────────────────────────────────────────
type Complemento = { codigo?: number; valor?: number; nome?: string; descricao?: string };
type Movimento = { codigo?: number; nome?: string; dataHora?: string; complementosTabelados?: Complemento[] };
type Fonte = {
  numeroProcesso?: string; grau?: string; tribunal?: string; dataAjuizamento?: string;
  classe?: { codigo?: number; nome?: string }; orgaoJulgador?: { nome?: string };
  assuntos?: ({ codigo?: number; nome?: string } | { codigo?: number; nome?: string }[])[];
  movimentos?: Movimento[];
};

export type MovimentoNormalizado = { externoId: string; codigo: number | null; nome: string; complementos: string[]; data: Date; dataTexto: string; importancia: Importancia };

/** "2024-05-01T13:22:00.000Z" ou "20240501132200" → dia (meia-noite UTC), como o tribunal mostra. */
function diaDoTribunal(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(+d) ? null : d;
}

// { descricao: "situacao_da_audiencia", nome: "designada" } → "situação da audiência: designada"
const textoComplemento = (c: Complemento) => [c.descricao?.replace(/_/g, " "), c.nome].filter(Boolean).join(": ");

export function normalizarMovimentos(fontes: Fonte[]): MovimentoNormalizado[] {
  const vistos = new Map<string, MovimentoNormalizado>();
  for (const f of fontes) {
    for (const m of f.movimentos ?? []) {
      const data = diaDoTribunal(m.dataHora);
      if (!data || !m.nome) continue;
      const comps = (m.complementosTabelados ?? []).map(textoComplemento).filter(Boolean);
      const chaveComp = (m.complementosTabelados ?? []).map((c) => `${c.codigo ?? ""}:${c.valor ?? ""}`).sort().join(",");
      const externoId = `${m.codigo ?? 0}|${m.dataHora}|${chaveComp}`.slice(0, 250);
      if (vistos.has(externoId)) continue; // mesmo movimento repetido em dois graus
      vistos.set(externoId, { externoId, codigo: m.codigo ?? null, nome: m.nome, complementos: comps, data, dataTexto: data.toISOString().slice(0, 10), importancia: classificarMovimento(m.codigo ?? null, m.nome, comps) });
    }
  }
  return Array.from(vistos.values()).sort((a, b) => +a.data - +b.data);
}

/** Erro "amigável" para gravar em datajudUltimoErro e mostrar na ficha. */
export class ErroDatajud extends Error {}

/** Consulta crua (sem gravar): devolve os registros (um por grau) do processo no tribunal. */
export async function buscarNoDatajud(tribunal: string, numeroDigitos: string): Promise<Fonte[]> {
  const url = `${URL_BASE}/api_publica_${tribunal}/_search`;
  const body = JSON.stringify({ size: 10, query: { match: { numeroProcesso: numeroDigitos } } });
  let ultimo = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) { // a API pública vive sobrecarregada (429): 2 tentativas e segue
    if (tentativa) await new Promise((r) => setTimeout(r, 2000 * tentativa));
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { Authorization: `APIKey ${chaveDatajud()}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    } catch {
      ultimo = "O DataJud não respondeu (tempo esgotado). Tentaremos de novo na próxima rodada.";
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ErroDatajud("O DataJud recusou a chave de acesso. A chave pública pode ter mudado: atualize DATAJUD_API_KEY (veja a wiki do DataJud).");
    if (res.status === 404) throw new ErroDatajud(`O DataJud não tem o tribunal "${tribunal}".`);
    if (res.status === 429 || res.status >= 500) { ultimo = `O DataJud está sobrecarregado (HTTP ${res.status}). Tentaremos de novo na próxima rodada.`; continue; }
    if (!res.ok) throw new ErroDatajud(`O DataJud devolveu erro HTTP ${res.status}.`);
    const j = (await res.json().catch(() => null)) as { hits?: { hits?: { _source?: Fonte }[] } } | null;
    return (j?.hits?.hits ?? []).map((h) => h._source ?? {}).filter((f) => f.numeroProcesso);
  }
  throw new ErroDatajud(ultimo || "Falha ao consultar o DataJud.");
}

export type ResultadoConsulta = { ok: boolean; novos: number; importantes: number; erro?: string; primeiraCaptura?: boolean };

type ProcessoParaConsulta = {
  id: string; codigo: string; titulo: string; tipo: string; numero: string | null; orgao: string; polo: string | null; assunto: string | null; abertoEm: Date | null;
  responsavelId: string | null; datajudTribunal: string | null; datajudUltimaConsulta: Date | null;
};
const SELECT_CONSULTA = {
  id: true, codigo: true, titulo: true, tipo: true, numero: true, orgao: true, polo: true, assunto: true, abertoEm: true,
  responsavelId: true, datajudTribunal: true, datajudUltimaConsulta: true,
} as const;

/** Máximo de resumos por IA numa consulta (custo) e janela da 1ª captura (histórico antigo não ganha resumo). */
const MAX_RESUMOS_POR_CONSULTA = 15;
const JANELA_RESUMO_1A_CAPTURA_DIAS = 60;

/**
 * Consulta o processo no DataJud e grava os andamentos novos. Nunca lança: o erro vai para
 * datajudUltimoErro e para o retorno. `notificar` = alerta (sino + Telegram) dos ALTA novos —
 * desligado na 1ª captura (seria o histórico inteiro).
 */
export async function consultarDatajud(processoId: string, opts: { notificar?: boolean } = {}): Promise<ResultadoConsulta> {
  const p = (await prismaSemEscopo.processo.findUnique({ where: { id: processoId }, select: SELECT_CONSULTA })) as ProcessoParaConsulta | null;
  if (!p) return { ok: false, novos: 0, importantes: 0, erro: "Processo não encontrado." };
  const agora = new Date();
  const falhar = async (erro: string) => {
    await prismaSemEscopo.processo.update({ where: { id: p.id }, data: { datajudUltimaConsulta: agora, datajudUltimoErro: erro } });
    return { ok: false, novos: 0, importantes: 0, erro };
  };
  const v = validarCnj(p.numero);
  if (!v.ok) return falhar(v.erro);
  const tribunal = v.info.tribunal;
  if (!tribunal) return falhar("Este tribunal não está na API pública do DataJud (ex.: STF).");

  let fontes: Fonte[];
  try {
    fontes = await buscarNoDatajud(tribunal, v.info.digitos);
  } catch (e) {
    return falhar(e instanceof ErroDatajud ? e.message : "Falha ao consultar o DataJud.");
  }
  if (!fontes.length) return falhar(`Processo não encontrado no DataJud (${tribunal.toUpperCase()}). Processos em segredo de justiça ou muito recentes podem não aparecer.`);

  const primeiraCaptura = !p.datajudUltimaConsulta;
  const movs = normalizarMovimentos(fontes);
  const existentes = new Set((await prismaSemEscopo.processoAndamento.findMany({ where: { processoId: p.id, externoId: { not: null } }, select: { externoId: true } })).map((a) => a.externoId));
  const novos = movs.filter((m) => !existentes.has(m.externoId));

  // Resumo por IA só dos ALTA novos (mais recentes primeiro); na 1ª captura, só os da janela recente.
  const limiteJanela = Date.now() - JANELA_RESUMO_1A_CAPTURA_DIAS * 86_400_000;
  const paraResumir = novos.filter((m) => m.importancia === "ALTA" && (!primeiraCaptura || +m.data >= limiteJanela)).reverse().slice(0, MAX_RESUMOS_POR_CONSULTA);
  const f0 = fontes.find((f) => f.grau === "G1") ?? fontes[0];
  const classe = f0.classe?.nome ?? null;
  const resumos = new Map<string, string>();
  for (const m of paraResumir) {
    const r = await resumirMovimento({ titulo: p.titulo, tipo: p.tipo, classe, orgao: f0.orgaoJulgador?.nome ?? p.orgao, polo: p.polo }, { nome: m.nome, complementos: m.complementos, data: m.dataTexto });
    if (r) resumos.set(m.externoId, r);
  }

  if (novos.length) {
    await prismaSemEscopo.processoAndamento.createMany({
      data: novos.map((m) => ({
        processoId: p.id, data: m.data, tipo: tipoAndamento(m.nome, m.importancia),
        descricao: m.complementos.length ? `${m.nome} — ${m.complementos.join("; ")}` : m.nome,
        origem: "DATAJUD", externoId: m.externoId, importancia: m.importancia, codigoMovimento: m.codigo,
        resumoIa: resumos.get(m.externoId) ?? null, usuario: "DataJud",
      })),
      skipDuplicates: true, // corrida com outra consulta simultânea: o unique (processoId, externoId) segura
    });
  }

  // Metadados do tribunal: os campos datajud* são sempre atualizados; os do usuário só se vazios.
  const assuntos = (f0.assuntos ?? []).flat().map((a) => a?.nome).filter(Boolean).join("; ") || null;
  const ajuizamento = diaDoTribunal(f0.dataAjuizamento);
  await prismaSemEscopo.processo.update({
    where: { id: p.id },
    data: {
      datajudTribunal: tribunal, datajudUltimaConsulta: agora, datajudUltimoErro: null,
      datajudClasse: classe, datajudOrgaoJulgador: f0.orgaoJulgador?.nome ?? null, datajudAssuntos: assuntos,
      ...(!p.assunto && assuntos ? { assunto: classe ? `${classe} — ${assuntos}` : assuntos } : {}),
      ...(!p.abertoEm && ajuizamento ? { abertoEm: ajuizamento } : {}),
    },
  });

  const altas = novos.filter((m) => m.importancia === "ALTA");
  if (opts.notificar && !primeiraCaptura && altas.length && p.responsavelId) {
    await alertarResponsavel(p, altas.map((m) => ({ ...m, resumo: resumos.get(m.externoId) ?? null })));
  }
  return { ok: true, novos: novos.length, importantes: altas.length, primeiraCaptura };
}

/** Uma notificação agrupada por processo por rodada (sino + Telegram) para o responsável. */
async function alertarResponsavel(p: ProcessoParaConsulta, altas: (MovimentoNormalizado & { resumo: string | null })[]) {
  const u = await prismaSemEscopo.usuario.findUnique({ where: { id: p.responsavelId! }, select: { ativo: true, colaborador: { select: { telegramChatId: true } } } });
  if (!u?.ativo) return;
  const titulo = `${p.codigo}: ${altas.length === 1 ? "novidade importante" : `${altas.length} novidades importantes`} no tribunal`;
  const linhas = altas.slice(-5).reverse().map((m) => `• ${m.dataTexto.split("-").reverse().join("/")} — ${m.resumo ?? m.nome}`);
  const mensagem = `${p.titulo}\n${linhas.join("\n")}${altas.length > 5 ? `\n… e mais ${altas.length - 5}` : ""}`;
  const link = `/processos/${p.id}`;
  await notificarUsuario({ usuarioId: p.responsavelId!, tipo: "PROCESSOS_DATAJUD", titulo, mensagem, link }).catch(() => {});
  if (u.colaborador?.telegramChatId) {
    await sendTelegramDM(u.colaborador.telegramChatId, { text: [`⚖️ *${escMD(titulo)}*`, escMD(p.titulo), ``, ...linhas.map((l) => escMD(l))].join("\n") }).catch(() => {});
  }
}
