// Processos externos (docs/processos-prd.md): constantes, visibilidade,
// numeração, pendências e situação automática pelo tipo de andamento.
import type { Prisma } from "@prisma/client";
import { temPermissao } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export { TIPOS_PROCESSO, SITUACOES, SITUACOES_ABERTAS, TIPOS_ANDAMENTO, PAPEIS_PARTE, ESFERAS, RISCOS, situacaoPorAndamento } from "@/lib/processos-tipos";
import { ESFERAS, RISCOS, SITUACOES, TIPOS_PROCESSO } from "@/lib/processos-tipos";
import { pareceCnj, validarCnj } from "@/lib/processos-cnj";
import { calcularVencimento } from "@/lib/dias-uteis";

/** Quem vê processo confidencial: ADMIN, responsável e quem tem processos.confidenciais. */
export async function filtroVisibilidade(session: { sub: string; perfil: string }): Promise<Prisma.ProcessoWhereInput> {
  if (session.perfil === "ADMIN" || (await temPermissao(session.sub, "processos.confidenciais"))) return {};
  return { OR: [{ confidencial: false }, { responsavelId: session.sub }] };
}
export async function podeEditar(session: { sub: string; perfil: string }) {
  return session.perfil === "ADMIN" || temPermissao(session.sub, "processos.lista.editar");
}

export async function proximoCodigoProcesso(tx: Pick<Prisma.TransactionClient, "processo">, empresaId: string) {
  const ult = await tx.processo.findFirst({ where: { empresaId, codigo: { startsWith: "PRC-" } }, orderBy: { codigo: "desc" }, select: { codigo: true } });
  const n = ult ? parseInt(ult.codigo.replace(/\D/g, "")) || 0 : 0;
  return `PRC-${String(n + 1).padStart(4, "0")}`;
}

const DIA = 86_400_000;
// Datas do processo são DIAS gravados à meia-noite UTC: compara o dia UTC da data com o dia de hoje.
const diaUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const hojeUtc = (h: Date) => Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
const diasAte = (d: Date, hoje: Date) => Math.round((diaUtc(new Date(d)) - hojeUtc(hoje)) / DIA);

export type PendenciaProcesso = {
  tipo: "PRAZO_VENCIDO" | "PRAZO_VENCE_EM_BREVE" | "SEM_ANDAMENTO" | "AGUARDANDO_EMPRESA" | "SEM_RESPONSAVEL";
  severidade: "ALTA" | "MEDIA";
  titulo: string;
  vence?: Date;
};

type ProcessoParaPendencia = {
  situacao: string; responsavelId: string | null; diasSemAndamentoAlerta: number; createdAt: Date;
  prazos: { descricao: string; vence: Date; avisoDias: number; status: string }[];
  andamentos: { data: Date }[];
};

export function pendenciasProcesso(p: ProcessoParaPendencia, hoje = new Date()): PendenciaProcesso[] {
  if (!SITUACOES[p.situacao]?.aberto) return [];
  const out: PendenciaProcesso[] = [];
  for (const pr of p.prazos) {
    if (pr.status !== "PENDENTE") continue;
    const d = diasAte(pr.vence, hoje);
    if (d < 0) out.push({ tipo: "PRAZO_VENCIDO", severidade: "ALTA", titulo: `Prazo vencido há ${-d} dia(s): ${pr.descricao}`, vence: pr.vence });
    else if (d <= pr.avisoDias) out.push({ tipo: "PRAZO_VENCE_EM_BREVE", severidade: d <= 2 ? "ALTA" : "MEDIA", titulo: d === 0 ? `Prazo HOJE: ${pr.descricao}` : `Prazo em ${d} dia(s): ${pr.descricao}`, vence: pr.vence });
  }
  if (p.situacao === "AGUARDANDO_EMPRESA") out.push({ tipo: "AGUARDANDO_EMPRESA", severidade: "MEDIA", titulo: "Aguardando ação da empresa" });
  const ultimo = p.andamentos.reduce<Date | null>((m, a) => (!m || a.data > m ? a.data : m), null) ?? p.createdAt;
  const parado = -diasAte(ultimo, hoje);
  if (p.situacao !== "SUSPENSO" && parado > p.diasSemAndamentoAlerta) out.push({ tipo: "SEM_ANDAMENTO", severidade: "MEDIA", titulo: `Sem andamento há ${parado} dias` });
  if (!p.responsavelId) out.push({ tipo: "SEM_RESPONSAVEL", severidade: "MEDIA", titulo: "Sem responsável" });
  return out;
}

export const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
export const dataOuNull = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);
export const textoOuNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Campos editáveis do processo vindos do body (create/patch): só as chaves presentes. */
export function camposProcesso(b: Record<string, unknown>): Prisma.ProcessoUncheckedUpdateInput {
  const d: Prisma.ProcessoUncheckedUpdateInput = {};
  const txt = ["titulo", "orgao", "numero", "portalUrl", "interessadoNome", "assunto", "fase", "advogado", "imovel", "observacoes"] as const;
  for (const k of txt) if (k in b) d[k] = textoOuNull(b[k]) as never;
  if ("tipo" in b) d.tipo = TIPOS_PROCESSO[String(b.tipo)] ? String(b.tipo) : "OUTRO";
  if ("esfera" in b) d.esfera = ESFERAS[String(b.esfera)] ? String(b.esfera) : null;
  if ("polo" in b) d.polo = textoOuNull(b.polo);
  if ("interessadoTipo" in b) d.interessadoTipo = b.interessadoTipo === "PESSOA" ? "PESSOA" : "EMPRESA";
  if ("situacao" in b && SITUACOES[String(b.situacao)]) d.situacao = String(b.situacao);
  if ("abertoEm" in b) d.abertoEm = dataOuNull(b.abertoEm);
  if ("encerradoEm" in b) d.encerradoEm = dataOuNull(b.encerradoEm);
  if ("responsavelId" in b) d.responsavelId = textoOuNull(b.responsavelId);
  if ("valorCausa" in b) d.valorCausa = num(b.valorCausa);
  if ("riscoPerda" in b) d.riscoPerda = RISCOS[String(b.riscoPerda)] ? String(b.riscoPerda) : null;
  if ("confidencial" in b) d.confidencial = !!b.confidencial;
  if ("diasSemAndamentoAlerta" in b) d.diasSemAndamentoAlerta = Math.max(1, Math.round(Number(b.diasSemAndamentoAlerta)) || 60);
  if ("tags" in b) d.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags ?? "").split(",")).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  if ("numerosExtras" in b) d.numerosExtras = Array.isArray(b.numerosExtras)
    ? (b.numerosExtras as { rotulo?: string; valor?: string }[]).filter((n) => n?.valor?.trim()).map((n) => ({ rotulo: String(n.rotulo ?? "").trim(), valor: String(n.valor).trim() }))
    : undefined;
  for (const k of ["colaboradorId", "fornecedorId", "clienteId", "contratoId", "imobilizadoId"] as const) if (k in b) d[k] = textoOuNull(b[k]);
  // Número CNJ válido: grava formatado e já guarda o tribunal do DataJud.
  if ("numero" in b && d.numero) {
    const v = validarCnj(String(d.numero));
    if (v.ok) { d.numero = v.info.formatado; d.datajudTribunal = v.info.tribunal; }
  }
  if ("datajudAtivo" in b) d.datajudAtivo = !!b.datajudAtivo;
  return d;
}

/** Regra do acompanhamento automático: só liga com número CNJ válido e tribunal no DataJud.
 *  Devolve a mensagem de erro (amigável) ou null se está ok. */
export function erroAcompanhamentoDatajud(datajudAtivo: boolean, numero: string | null | undefined): string | null {
  if (!datajudAtivo) return null;
  if (!numero) return "Para acompanhar no tribunal, informe o número CNJ do processo.";
  const v = validarCnj(numero);
  if (!v.ok) return pareceCnj(numero) || numero.replace(/\D/g, "").length >= 15 ? v.erro : "Acompanhamento automático só para processo judicial com número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).";
  if (!v.info.tribunal) return "Este tribunal não está na API pública do DataJud (ex.: STF).";
  return null;
}

export const PROCESSO_LISTA_SELECT = {
  id: true, codigo: true, titulo: true, tipo: true, orgao: true, numero: true, situacao: true, fase: true, abertoEm: true,
  interessadoTipo: true, interessadoNome: true, confidencial: true, valorCausa: true, riscoPerda: true, responsavelId: true,
  diasSemAndamentoAlerta: true, createdAt: true, tags: true,
  responsavel: { select: { id: true, nome: true } },
  prazos: { where: { status: "PENDENTE" }, orderBy: { vence: "asc" as const }, select: { id: true, descricao: true, vence: true, avisoDias: true, status: true } },
  andamentos: { orderBy: { data: "desc" as const }, take: 1, select: { data: true, tipo: true, descricao: true } },
  _count: { select: { documentos: true, andamentos: true } },
} satisfies Prisma.ProcessoSelect;

/** Processo visível ao usuário (confidencial só p/ responsável/permissão/ADMIN) ou null. */
export async function carregarProcesso(session: { sub: string; perfil: string }, id: string) {
  const visivel = await filtroVisibilidade(session);
  return prisma.processo.findFirst({ where: { id, AND: [visivel] }, select: { id: true, codigo: true, titulo: true, empresaId: true, situacao: true, responsavelId: true } });
}

/**
 * Dados do prazo vindos do body: data fixa (`vence`) OU contagem (`inicioContagem` + `prazoDias`,
 * úteis ou corridos, com suspensão forense opcional — src/lib/dias-uteis.ts). Erro amigável ou dados.
 */
export function dadosPrazo(b: Record<string, unknown>, tipoProcesso?: string):
  { ok: true; data: { vence: Date; diasUteis: boolean; prazoDias: number | null; inicioContagem: Date | null; suspensaoForense: boolean; fundamento: string | null } } | { ok: false; erro: string } {
  const fundamento = textoOuNull(b.fundamento);
  const dias = b.prazoDias === "" || b.prazoDias == null ? null : Math.round(Number(b.prazoDias));
  if (dias != null) {
    if (!Number.isFinite(dias) || dias < 0 || dias > 3650) return { ok: false, erro: "Número de dias inválido." };
    const inicio = dataOuNull(b.inicioContagem);
    if (!inicio || isNaN(+inicio)) return { ok: false, erro: "Informe a data de início da contagem (ciência/intimação)." };
    const diasUteis = !!b.diasUteis;
    const suspensaoForense = "suspensaoForense" in b ? !!b.suspensaoForense : tipoProcesso === "JUDICIAL";
    const vence = calcularVencimento(inicio, dias, { uteis: diasUteis, suspensaoForense, judicial: tipoProcesso === "JUDICIAL" });
    return { ok: true, data: { vence, diasUteis, prazoDias: dias, inicioContagem: inicio, suspensaoForense, fundamento } };
  }
  const vence = dataOuNull(b.vence);
  if (!vence || isNaN(+vence)) return { ok: false, erro: "Informe a data de vencimento ou a contagem em dias." };
  return { ok: true, data: { vence, diasUteis: false, prazoDias: null, inicioContagem: null, suspensaoForense: false, fundamento } };
}

/**
 * Aplica o roteiro (tarefas padrão do tipo) ao processo: cada etapa vira um prazo contado da
 * abertura ou da ciência (dias úteis/corridos). Devolve quantos prazos criou.
 */
export async function aplicarRoteiro(
  tx: Pick<Prisma.TransactionClient, "processoRoteiro" | "processoPrazo">,
  proc: { id: string; tipo: string; responsavelId: string | null; abertoEm?: Date | null },
  roteiroId: string,
  opts: { ciencia?: Date | null; criadoPor?: string | null } = {},
): Promise<number> {
  const r = await tx.processoRoteiro.findFirst({ where: { id: roteiroId, ativo: true }, include: { etapas: { orderBy: { ordem: "asc" } } } });
  if (!r) return 0;
  const hoje = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const judicial = proc.tipo === "JUDICIAL";
  for (const e of r.etapas) {
    const base = (e.base === "CIENCIA" ? opts.ciencia ?? proc.abertoEm : proc.abertoEm ?? opts.ciencia) ?? hoje;
    await tx.processoPrazo.create({
      data: {
        processoId: proc.id, descricao: e.titulo, vence: calcularVencimento(base, e.dias, { uteis: e.diasUteis, suspensaoForense: judicial, judicial }),
        avisoDias: e.avisoDias, responsavelId: e.responsavelId ?? proc.responsavelId, diasUteis: e.diasUteis, prazoDias: e.dias, inicioContagem: base,
        suspensaoForense: judicial, fundamento: `Roteiro: ${r.nome}`, criadoPor: opts.criadoPor ?? null,
      },
    });
  }
  return r.etapas.length;
}
