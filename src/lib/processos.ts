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
  // Permissão gravada é "processos.confidenciais.ver" (modules.ts); temPermissao aceita o nível acima.
  if (session.perfil === "ADMIN" || (await temPermissao(session.sub, "processos.confidenciais.ver"))) return {};
  return { OR: [{ confidencial: false }, { responsavelId: session.sub }] };
}
export async function podeEditar(session: { sub: string; perfil: string }) {
  return session.perfil === "ADMIN" || temPermissao(session.sub, "processos.lista.editar");
}

/** Cofre de acessos: ver/copiar exige processos.credenciais.ver; gravar exige também editar. */
export async function podeVerCredenciais(session: { sub: string; perfil: string }) {
  return session.perfil === "ADMIN" || temPermissao(session.sub, "processos.credenciais.ver");
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
  tipo: "PRAZO_VENCIDO" | "PRAZO_VENCE_EM_BREVE" | "DESCONTO_ACABANDO" | "SEM_ANDAMENTO" | "AGUARDANDO_EMPRESA" | "SEM_RESPONSAVEL";
  severidade: "ALTA" | "MEDIA";
  titulo: string;
  vence?: Date;
  /** Prazo de origem (prazos e desconto) — o cron avisa o responsável do prazo. */
  prazoId?: string;
};

type PrazoParaPendencia = {
  id?: string; descricao: string; vence: Date; avisoDias: number; status: string;
  // Desconto por pagamento antecipado (§8.3) — opcionais.
  descontoAte?: Date | null; valorPagar?: unknown; valorComDesconto?: unknown;
};
type ProcessoParaPendencia = {
  situacao: string; responsavelId: string | null; diasSemAndamentoAlerta: number; createdAt: Date;
  prazos: PrazoParaPendencia[];
  andamentos: { data: Date }[];
};

/** Economia do desconto por pagamento antecipado (valor cheio − valor com desconto), ou null. */
export function economiaDesconto(p: { valorPagar?: unknown; valorComDesconto?: unknown }): number | null {
  if (p.valorPagar == null || p.valorComDesconto == null) return null;
  const e = Math.round((Number(p.valorPagar) - Number(p.valorComDesconto)) * 100) / 100;
  return e > 0 ? e : null;
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

export function pendenciasProcesso(p: ProcessoParaPendencia, hoje = new Date()): PendenciaProcesso[] {
  if (!SITUACOES[p.situacao]?.aberto) return [];
  const out: PendenciaProcesso[] = [];
  for (const pr of p.prazos) {
    if (pr.status !== "PENDENTE") continue;
    const d = diasAte(pr.vence, hoje);
    if (d < 0) out.push({ tipo: "PRAZO_VENCIDO", severidade: "ALTA", titulo: `Prazo vencido há ${-d} dia(s): ${pr.descricao}`, vence: pr.vence, prazoId: pr.id });
    else if (d <= pr.avisoDias) out.push({ tipo: "PRAZO_VENCE_EM_BREVE", severidade: d <= 2 ? "ALTA" : "MEDIA", titulo: d === 0 ? `Prazo HOJE: ${pr.descricao}` : `Prazo em ${d} dia(s): ${pr.descricao}`, vence: pr.vence, prazoId: pr.id });
    // Desconto por pagamento antecipado acabando (mesma janela de aviso do prazo).
    if (pr.descontoAte) {
      const dd = diasAte(pr.descontoAte, hoje);
      const eco = economiaDesconto(pr);
      if (dd >= 0 && dd <= pr.avisoDias) {
        out.push({
          tipo: "DESCONTO_ACABANDO", severidade: dd <= 2 ? "ALTA" : "MEDIA", vence: pr.descontoAte, prazoId: pr.id,
          titulo: `${dd === 0 ? "Desconto acaba HOJE" : `Desconto acaba em ${dd} dia(s)`}: pague até ${ddmm(pr.descontoAte)}${pr.valorComDesconto != null ? ` (${brl(Number(pr.valorComDesconto))})` : ""}${eco ? ` e economize ${brl(eco)}` : ""} — ${pr.descricao}`,
        });
      }
    }
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
  prazos: { where: { status: "PENDENTE" }, orderBy: { vence: "asc" as const }, select: { id: true, descricao: true, vence: true, avisoDias: true, status: true, valorPagar: true, descontoAte: true, valorComDesconto: true } },
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

/** Valor em reais vindo do body: número ou texto BR ("1.234,56"). null se vazio/inválido. */
export function valorOuNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const t = String(v).trim();
  const x = Number(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

/**
 * Campos de PAGAMENTO do prazo (§8.3): valor a pagar e desconto por pagamento antecipado
 * (até a data `descontoAte`, pelo `valorComDesconto` OU pelo `descontoPercentual` sobre o valor).
 * Só as chaves presentes no body. Erro amigável ou dados.
 */
export function dadosPagamentoPrazo(b: Record<string, unknown>):
  { ok: true; data: { valorPagar?: number | null; descontoAte?: Date | null; valorComDesconto?: number | null; descontoPercentual?: number | null } } | { ok: false; erro: string } {
  const d: { valorPagar?: number | null; descontoAte?: Date | null; valorComDesconto?: number | null; descontoPercentual?: number | null } = {};
  if ("valorPagar" in b) d.valorPagar = valorOuNull(b.valorPagar);
  if ("descontoAte" in b) d.descontoAte = dataOuNull(b.descontoAte);
  if ("descontoPercentual" in b) d.descontoPercentual = valorOuNull(b.descontoPercentual);
  if ("valorComDesconto" in b) d.valorComDesconto = valorOuNull(b.valorComDesconto);
  if (d.descontoAte && isNaN(+d.descontoAte)) return { ok: false, erro: "Data do desconto inválida." };
  if (d.descontoPercentual != null && (d.descontoPercentual <= 0 || d.descontoPercentual >= 100)) return { ok: false, erro: "Percentual de desconto deve ficar entre 0 e 100." };
  // Percentual sem valor com desconto: calcula sobre o valor a pagar.
  if (d.valorComDesconto == null && d.descontoPercentual != null && d.valorPagar != null) {
    d.valorComDesconto = Math.round(d.valorPagar * (1 - d.descontoPercentual / 100) * 100) / 100;
  }
  if (d.valorComDesconto != null && d.valorPagar != null && d.valorComDesconto > d.valorPagar) return { ok: false, erro: "O valor com desconto não pode passar do valor a pagar." };
  if ((d.valorComDesconto != null || d.descontoPercentual != null) && "descontoAte" in b && !d.descontoAte) return { ok: false, erro: "Informe até quando vale o desconto." };
  return { ok: true, data: d };
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
