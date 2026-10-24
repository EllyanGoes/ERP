// Abertura de Solicitação de Serviço (SS) da Manutenção — um só caminho para a
// tela de SS, o celular (QR do ativo) e os módulos que geram SS (SST: inspeção
// não conforme / incidente com máquina). Grava a SS e avisa o PCM.
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { proximoNumeroSS, PRIORIDADES } from "@/lib/manutencao/ordem";
import { notificarUsuario } from "@/lib/notificacoes";

export const ORIGENS_SS = ["USUARIO", "SST_INSPECAO", "SST_INCIDENTE", "CHECKLIST"] as const;
export type OrigemSS = (typeof ORIGENS_SS)[number];

export const ORIGEM_SS_LABEL: Record<string, string> = {
  USUARIO: "Usuário",
  SST_INSPECAO: "SST · inspeção",
  SST_INCIDENTE: "SST · incidente",
  CHECKLIST: "Checklist da OS",
};

export type NovaSolicitacao = {
  empresaId: string;
  ativoId?: string | null;
  localTexto?: string | null;
  descricao: string;
  ativoParado?: boolean;
  paradoDesde?: Date | null;
  prioridade?: string | null;
  solicitanteId: string;
  solicitanteNome: string;
  origem?: OrigemSS;
  origemId?: string | null;
};

/** Cria a SS (cliente escopado — a empresa vem da sessão) e notifica quem tem o módulo PCM. */
export async function criarSolicitacao(n: NovaSolicitacao) {
  const ss = await prisma.manutSolicitacao.create({
    data: {
      empresaId: n.empresaId,
      numero: await proximoNumeroSS(n.empresaId),
      ativoId: n.ativoId || null,
      localTexto: n.localTexto?.trim() || null,
      descricao: n.descricao,
      ativoParado: !!n.ativoParado,
      paradoDesde: n.ativoParado ? (n.paradoDesde ?? new Date()) : null,
      prioridade: n.prioridade && (PRIORIDADES as readonly string[]).includes(n.prioridade) ? n.prioridade : null,
      solicitanteId: n.solicitanteId,
      solicitanteNome: n.solicitanteNome,
      origem: n.origem ?? "USUARIO",
      origemId: n.origemId ?? null,
    },
    include: { ativo: { select: { tag: true, nome: true } } },
  });

  // Avisa o PCM (módulo pcm); emergência/máquina parada vai com destaque no título.
  const pcm = await prismaSemEscopo.usuario.findMany({
    where: { ativo: true, id: { not: n.solicitanteId }, permissoes: { some: { modulo: { startsWith: "pcm" } } }, empresas: { some: { empresaId: n.empresaId } } },
    select: { id: true },
  });
  const urgente = ss.ativoParado || ss.prioridade === "EMERGENCIA";
  const origem = ss.origem !== "USUARIO" ? ` (${ORIGEM_SS_LABEL[ss.origem] ?? ss.origem})` : "";
  for (const u of pcm) {
    await notificarUsuario({
      usuarioId: u.id, tipo: "MANUT_SS_NOVA",
      titulo: `${urgente ? "⚠ Máquina parada — " : ""}${ss.numero} de ${n.solicitanteNome}${origem}`,
      mensagem: `${ss.ativo ? `${ss.ativo.tag} ${ss.ativo.nome}: ` : ss.localTexto ? `${ss.localTexto}: ` : ""}${n.descricao.slice(0, 160)}`,
      link: "/pcm/solicitacoes",
    });
  }
  return ss;
}

/** SS (e a OS gerada) ligadas a registros de outro módulo, agrupadas por origemId. */
export async function solicitacoesPorOrigem(origem: OrigemSS, origemIds: string[]) {
  if (origemIds.length === 0) return new Map<string, SsVinculada[]>();
  const lista = await prisma.manutSolicitacao.findMany({
    where: { origem, origemId: { in: origemIds } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, numero: true, status: true, origemId: true, createdAt: true,
      ordem: { select: { id: true, numero: true, status: true } },
    },
  });
  const mapa = new Map<string, SsVinculada[]>();
  for (const s of lista) {
    const k = s.origemId!;
    mapa.set(k, [...(mapa.get(k) ?? []), { id: s.id, numero: s.numero, status: s.status, createdAt: s.createdAt, ordem: s.ordem }]);
  }
  return mapa;
}

export type SsVinculada = {
  id: string;
  numero: string;
  status: string;
  createdAt: Date;
  ordem: { id: string; numero: string; status: string } | null;
};
