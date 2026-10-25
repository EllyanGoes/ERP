// ─────────────────────────────────────────────────────────────────────────────
// Página PÚBLICA da OS (/os/<linkToken>) — o link que vai por WhatsApp para os
// mecânicos (muitos sem login no ERP). Só leitura: o que fazer, onde, quando, as
// atividades (checklist) com seus itens e quem está escalado.
//
// Sem sessão não há escopo de empresa: TUDO aqui usa `prismaSemEscopo` e filtra
// SEMPRE pela OS do token (e pela empresa dela). Nada de custos nem valores; de
// pessoas, só o primeiro nome. OS concluída/cancelada há mais de 30 dias → link
// expirado (null), assim como token inexistente.
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from "crypto";
import { prismaSemEscopo } from "@/lib/prisma";
import { STATUS_OS_PUBLICO } from "@/lib/manutencao/publico";

const DIA = 86_400_000;
/** Dias que o link continua valendo depois de a OS ser concluída/cancelada. */
export const VALIDADE_LINK_FECHADA_DIAS = 30;

export const STATUS_OS_PUBLICO_TODOS: Record<string, string> = {
  ...STATUS_OS_PUBLICO,
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TIPO_RESPOSTA_PUBLICO: Record<string, string> = {
  NENHUMA: "Serviço",
  OK_NOK: "Checklist · OK / Não OK",
  NUMERO: "Medição",
  TEXTO: "Anotação",
};

/** Código novo do link da OS: 32 hex aleatórios (trocar invalida o link antigo). */
export function novoLinkToken(): string {
  return randomBytes(16).toString("hex");
}

const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;
const num = (v: unknown) => (v == null ? null : Number(v));

export type ItemOSPublico = { descricao: string; codigo: string | null; quantidade: number; unidade: string | null };

export type DadosOSPublica = {
  id: string;
  empresa: string;
  numero: string;
  tipoSigla: string;
  tipoNome: string;
  prioridade: string;
  status: string;
  statusLabel: string;
  descricao: string;
  abertaEm: string;
  programadaPara: string | null;
  prazo: string | null;
  atrasada: boolean;
  horasEstimadas: number | null;
  exigeParada: boolean;
  paradaDesde: string | null;
  fechadaEm: string | null;
  ativo: { tag: string; nome: string; caminho: string[]; localizacao: string | null; parado: boolean; qrToken: string | null } | null;
  localTexto: string | null;
  atividades: {
    seq: number; descricao: string; tipoResposta: string; tipoLabel: string;
    faixaMin: number | null; faixaMax: number | null; feita: boolean; resposta: string | null; conforme: boolean | null;
    itens: ItemOSPublico[];
  }[];
  itensGerais: ItemOSPublico[];
  equipe: { nome: string; membros: string[] } | null;
  responsavel: string | null;
};

/** OS do token (id + empresa) — null se o formato não bate ou não existe. */
export async function ordemPorLinkToken(token: string) {
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;
  return prismaSemEscopo.manutOrdem.findUnique({
    where: { linkToken: token.toLowerCase() },
    select: { id: true, empresaId: true, numero: true },
  });
}

/** Tudo o que a página pública da OS mostra. null = link inválido ou expirado. */
export async function dadosOSPublica(token: string): Promise<DadosOSPublica | null> {
  const base = await ordemPorLinkToken(token);
  if (!base) return null;
  const db = prismaSemEscopo;
  const { id, empresaId } = base;

  const [o, empresa] = await Promise.all([
    db.manutOrdem.findFirst({
      where: { id, empresaId },
      select: {
        id: true, numero: true, prioridade: true, status: true, descricao: true, createdAt: true, updatedAt: true,
        programadaPara: true, prazo: true, horasEstimadas: true, exigeParada: true, paradaInicio: true, paradaFim: true,
        concluidaEm: true, canceladaEm: true, localTexto: true,
        tipo: { select: { sigla: true, nome: true } },
        ativo: { select: { tag: true, nome: true, paiId: true, localizacao: true, status: true, qrToken: true, ativo: true } },
        equipe: { select: { nome: true, membros: { select: { colaborador: { select: { nome: true, ativo: true } } } } } },
        responsavel: { select: { nome: true } },
        servicos: {
          orderBy: { seq: "asc" },
          select: {
            id: true, seq: true, descricao: true, tipoResposta: true, faixaMin: true, faixaMax: true,
            resposta: true, conforme: true, executado: true, servico: { select: { descricao: true } },
          },
        },
        materiais: {
          orderBy: { descricao: "asc" },
          select: { servicoId: true, descricao: true, quantidade: true, unidade: true, item: { select: { codigo: true, descricao: true } } },
        },
      },
    }),
    db.empresa.findUnique({ where: { id: empresaId }, select: { nomeFantasia: true, razaoSocial: true } }),
  ]);
  if (!o) return null;

  // Fechada há mais de 30 dias → o link expira.
  const fechadaEm = o.status === "CONCLUIDA" ? (o.concluidaEm ?? o.updatedAt) : o.status === "CANCELADA" ? (o.canceladaEm ?? o.updatedAt) : null;
  if (fechadaEm && Date.now() - fechadaEm.getTime() > VALIDADE_LINK_FECHADA_DIAS * DIA) return null;

  // Caminho do ativo na árvore (Planta › Área › …), sempre dentro da empresa da OS.
  const caminho: string[] = [];
  let paiId = o.ativo?.paiId ?? null;
  for (let i = 0; paiId && i < 15; i++) {
    const pai = await db.manutAtivo.findFirst({ where: { id: paiId, empresaId }, select: { nome: true, paiId: true } });
    if (!pai) break;
    caminho.unshift(pai.nome);
    paiId = pai.paiId;
  }

  const item = (m: (typeof o.materiais)[number]): ItemOSPublico => ({
    descricao: m.item?.descricao || m.descricao, codigo: m.item?.codigo ?? null, quantidade: Number(m.quantidade), unidade: m.unidade,
  });
  const fechadaOuEncerrada = ["ENCERRADA", "CONCLUIDA", "CANCELADA"].includes(o.status);
  // Atrasada: prazo (ou programação) já passou e a OS ainda não foi executada.
  const ref = o.prazo ?? o.programadaPara;
  const atrasada = !fechadaOuEncerrada && !!ref && ref.getTime() < Date.now();

  return {
    id: o.id,
    empresa: empresa?.nomeFantasia || empresa?.razaoSocial || "",
    numero: o.numero,
    tipoSigla: o.tipo.sigla,
    tipoNome: o.tipo.nome,
    prioridade: o.prioridade,
    status: o.status,
    statusLabel: STATUS_OS_PUBLICO_TODOS[o.status] ?? o.status,
    descricao: o.descricao,
    abertaEm: o.createdAt.toISOString(),
    programadaPara: o.programadaPara?.toISOString() ?? null,
    prazo: o.prazo?.toISOString() ?? null,
    atrasada,
    horasEstimadas: num(o.horasEstimadas),
    exigeParada: o.exigeParada,
    paradaDesde: o.paradaInicio && !o.paradaFim ? o.paradaInicio.toISOString() : null,
    fechadaEm: fechadaEm?.toISOString() ?? null,
    ativo: o.ativo ? {
      tag: o.ativo.tag, nome: o.ativo.nome, caminho, localizacao: o.ativo.localizacao, parado: o.ativo.status === "PARADO",
      // link para a ficha pública só se a etiqueta do ativo estiver valendo
      qrToken: o.ativo.ativo ? o.ativo.qrToken : null,
    } : null,
    localTexto: o.localTexto,
    atividades: o.servicos.map((s) => ({
      seq: s.seq,
      descricao: s.descricao || s.servico?.descricao || "",
      tipoResposta: s.tipoResposta,
      tipoLabel: TIPO_RESPOSTA_PUBLICO[s.tipoResposta] ?? s.tipoResposta,
      faixaMin: num(s.faixaMin), faixaMax: num(s.faixaMax),
      feita: s.tipoResposta === "NENHUMA" ? s.executado : !!s.resposta,
      resposta: s.resposta, conforme: s.conforme,
      itens: o.materiais.filter((m) => m.servicoId === s.id).map(item),
    })),
    itensGerais: o.materiais.filter((m) => !m.servicoId || !o.servicos.some((s) => s.id === m.servicoId)).map(item),
    equipe: o.equipe ? {
      nome: o.equipe.nome,
      membros: o.equipe.membros.filter((m) => m.colaborador.ativo).map((m) => primeiroNome(m.colaborador.nome)).filter((n): n is string => !!n),
    } : null,
    responsavel: primeiroNome(o.responsavel?.nome),
  };
}
