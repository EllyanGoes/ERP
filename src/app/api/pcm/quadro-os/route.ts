export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";
import { STATUS_OS_LABEL, PRIORIDADE_LABEL, type StatusOS } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// Quadro de O.S. por equipe executante (ManutEquipe).
//
// Traz as O.S. NÃO finalizadas (STATUS_ABERTOS, inclui ENCERRADA aguardando a
// validação do PCM), agrupadas por equipe, com o que o card mostra: número,
// descrição, ativo, tipo, datas, atraso e responsáveis (responsável da OS +
// executantes dos apontamentos de mão de obra). Atrasada = prazo (ou data
// programada) no passado. O card leva à tela da OS (/pcm/os/<id>).
// ─────────────────────────────────────────────────────────────────────────────

export interface CardOS {
  id: string;
  numero: string;
  descricao: string;
  ativo: string | null;
  tipo: string | null;
  status: string;        // status nativo (ABERTA, EM_EXECUCAO…)
  statusLabel: string;
  prioridade: string;    // EMERGENCIA | ALTA | MEDIA | BAIXA
  prioridadeLabel: string;
  dataEntrada: string | null;
  dataProgramada: string | null;
  atrasada: boolean;
  responsaveis: string[];
  setor: string;
  ocorrencias: string[];
  causas: string[];
  servicos: string[];
}

export interface SetorQuadro {
  equipeId: string | null;
  setor: string;
  total: number;
  atrasadas: number;
  os: CardOS[];
}

export interface QuadroOsResponse {
  totais: { os: number; emAberto: number; emEspera: number; emProgresso: number; atrasadas: number; setores: number };
  setores: SetorQuadro[];
  source: "db";
  generatedAt: string;
}

const EM_ESPERA = ["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"];
const EM_PROGRESSO = ["EM_EXECUCAO", "ENCERRADA"];
const SEM_EQUIPE = "(sem equipe)";

export async function GET() {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  try {
    const ordens = await prisma.manutOrdem.findMany({
      where: { status: { in: STATUS_ABERTOS } },
      select: {
        id: true, numero: true, descricao: true, status: true, prioridade: true,
        createdAt: true, programadaPara: true, prazo: true, localTexto: true,
        equipe: { select: { id: true, nome: true } },
        ativo: { select: { tag: true, nome: true } },
        tipo: { select: { nome: true } },
        responsavel: { select: { nome: true } },
        apontamentos: { select: { nome: true } },
        servicos: {
          select: { descricao: true, sintoma: { select: { descricao: true } }, causa: { select: { descricao: true } } },
          orderBy: { seq: "asc" },
        },
      },
      orderBy: [{ programadaPara: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });

    const agora = Date.now();
    const porSetor = new Map<string, SetorQuadro>();
    let emAberto = 0, emEspera = 0, emProgresso = 0, atrasadasTotal = 0;

    for (const o of ordens) {
      if (EM_ESPERA.includes(o.status)) emEspera++;
      else if (EM_PROGRESSO.includes(o.status)) emProgresso++;
      else emAberto++;

      // OS encerrada pelo técnico já não está "atrasada" — só falta a validação
      const limite = o.prazo ?? o.programadaPara;
      const atrasada = !!limite && limite.getTime() < agora && o.status !== "ENCERRADA";
      if (atrasada) atrasadasTotal++;

      const responsaveis = Array.from(new Set(
        [o.responsavel?.nome, ...o.apontamentos.map((a) => a.nome)]
          .map((n) => n?.trim())
          .filter((n): n is string => !!n),
      ));
      const setor = o.equipe?.nome ?? SEM_EQUIPE;
      const servicosTxt = o.servicos.map((s) => s.descricao?.trim()).filter((s): s is string => !!s && s !== "—");

      const card: CardOS = {
        id: o.id,
        numero: o.numero,
        descricao: o.descricao.replace(/\r?\n/g, " ").trim() || "(sem descrição)",
        ativo: o.ativo ? `${o.ativo.tag} — ${o.ativo.nome}` : o.localTexto,
        tipo: o.tipo.nome,
        status: o.status,
        statusLabel: STATUS_OS_LABEL[o.status as StatusOS] ?? o.status,
        prioridade: o.prioridade,
        prioridadeLabel: PRIORIDADE_LABEL[o.prioridade] ?? o.prioridade,
        dataEntrada: o.createdAt.toISOString(),
        dataProgramada: (o.programadaPara ?? o.prazo)?.toISOString() ?? null,
        atrasada,
        responsaveis,
        setor,
        ocorrencias: Array.from(new Set(o.servicos.map((s) => s.sintoma?.descricao).filter((s): s is string => !!s))),
        causas: Array.from(new Set(o.servicos.map((s) => s.causa?.descricao).filter((s): s is string => !!s))),
        servicos: Array.from(new Set(servicosTxt)),
      };

      const grupo = porSetor.get(setor) ?? { equipeId: o.equipe?.id ?? null, setor, total: 0, atrasadas: 0, os: [] };
      grupo.total++;
      if (atrasada) grupo.atrasadas++;
      grupo.os.push(card);
      porSetor.set(setor, grupo);
    }

    const setores = Array.from(porSetor.values()).sort((a, b) => b.total - a.total);

    const resposta: QuadroOsResponse = {
      totais: {
        os: ordens.length,
        emAberto,
        emEspera,
        emProgresso,
        atrasadas: atrasadasTotal,
        setores: setores.length,
      },
      setores,
      source: "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[pcm/quadro-os]", err);
    return NextResponse.json({ error: "Não foi possível montar o quadro de O.S." }, { status: 500 });
  }
}
