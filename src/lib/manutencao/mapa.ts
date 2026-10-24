import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";

// ─────────────────────────────────────────────────────────────────────────────
// Mapa da planta (docs/manutencao-prd.md §14): cada ativo da empresa ativa com o
// status DERIVADO (não o campo gravado) e a posição salva no canvas. A árvore e
// o roll-up (status do pior descendente, soma de OS) são montados no cliente —
// o payload é plano (435 nós ≈ 60 KB) e serve tanto ao canvas quanto à lista
// do celular.
//
// Precedência do status: PARADO › EM_MANUTENCAO › ATENCAO › OK › INATIVO.
//   PARADO         ManutAtivo.status = PARADO
//   EM_MANUTENCAO  OS EM_EXECUCAO sem parada de máquina
//   ATENCAO        OS aberta atrasada (prazo ?? programadaPara < hoje) ou
//                  preventiva vencida (ManutPlanoAtivo.proximoVencimento < hoje)
//   OK             nada acima
//   INATIVO        ativo = false (fora das listas, mas aparece cinza no mapa)
// ─────────────────────────────────────────────────────────────────────────────

export type StatusMapa = "PARADO" | "EM_MANUTENCAO" | "ATENCAO" | "OK" | "INATIVO";

export interface NoMapa {
  id: string;
  codApl: number;
  tag: string;
  nome: string;
  tipo: string; // LOCAL | EQUIPAMENTO | COMPONENTE | VEICULO
  paiId: string | null;
  ativo: boolean;
  criticidade: "A" | "B" | "C" | null;
  /** status derivado do PRÓPRIO nó (sem descendentes). */
  status: StatusMapa;
  /** nº de OS abertas do próprio nó. */
  osAbertas: number;
  /** OS aberta mais relevante (parada › em execução › atrasada › mais antiga). */
  osPrincipal: { id: string; numero: string; status: string } | null;
  /** motivo do ATENCAO, para o tooltip. */
  motivo: string | null;
  mapaX: number | null;
  mapaY: number | null;
  mapaLargura: number | null;
  mapaAltura: number | null;
}

export interface MapaResponse {
  nos: NoMapa[];
  /** URL (proxy /api/arquivos/…) da planta baixa da empresa, se houver. */
  plantaUrl: string | null;
  geradoEm: string;
}

const PESO_OS: Record<string, number> = { EM_EXECUCAO: 1, ABERTA: 3, PLANEJADA: 3, PAUSADA: 2, AGUARDANDO_MATERIAL: 2, AGUARDANDO_TERCEIRO: 2, ENCERRADA: 4 };

export const CHAVE_PLANTA = (empresaId: string) => `manut_planta_${empresaId}`;

export async function montarMapa(empresaId: string, agora = new Date()): Promise<MapaResponse> {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  const [ativos, ordens, vencidos, planta] = await Promise.all([
    prisma.manutAtivo.findMany({
      select: {
        id: true, codApl: true, tag: true, nome: true, tipo: true, paiId: true, ativo: true, status: true, criticidade: true,
        mapaX: true, mapaY: true, mapaLargura: true, mapaAltura: true,
      },
      orderBy: { nome: "asc" },
    }),
    prisma.manutOrdem.findMany({
      where: { status: { in: STATUS_ABERTOS }, ativoId: { not: null } },
      select: { id: true, numero: true, status: true, ativoId: true, prazo: true, programadaPara: true, paradaInicio: true, paradaFim: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.manutPlanoAtivo.findMany({
      where: { ativo: true, proximoVencimento: { lt: hoje }, plano: { ativo: true } },
      select: { ativoId: true, proximoVencimento: true, plano: { select: { codigo: true } } },
    }),
    prisma.configuracao.findUnique({ where: { chave: CHAVE_PLANTA(empresaId) }, select: { valor: true } }),
  ]);

  // OS abertas por ativo
  const osPorAtivo = new Map<string, typeof ordens>();
  for (const o of ordens) {
    const lista = osPorAtivo.get(o.ativoId!) ?? [];
    lista.push(o);
    osPorAtivo.set(o.ativoId!, lista);
  }
  const vencidoPorAtivo = new Map<string, (typeof vencidos)[number]>();
  for (const v of vencidos) if (!vencidoPorAtivo.has(v.ativoId)) vencidoPorAtivo.set(v.ativoId, v);

  const nos: NoMapa[] = ativos.map((a) => {
    const os = osPorAtivo.get(a.id) ?? [];
    const emParada = os.find((o) => o.paradaInicio && !o.paradaFim);
    const emExecucao = os.find((o) => o.status === "EM_EXECUCAO");
    const atrasada = os.find((o) => o.status !== "ENCERRADA" && (o.prazo ?? o.programadaPara) && (o.prazo ?? o.programadaPara)! < hoje);
    const vencido = vencidoPorAtivo.get(a.id);

    let status: StatusMapa = "OK";
    let motivo: string | null = null;
    if (!a.ativo) status = "INATIVO";
    else if (a.status === "PARADO") { status = "PARADO"; motivo = emParada ? `Parado desde ${emParada.paradaInicio!.toLocaleDateString("pt-BR")} (${emParada.numero})` : "Máquina parada"; }
    else if (emExecucao) { status = "EM_MANUTENCAO"; motivo = `${emExecucao.numero} em execução`; }
    else if (atrasada) { status = "ATENCAO"; motivo = `${atrasada.numero} atrasada (prazo ${(atrasada.prazo ?? atrasada.programadaPara)!.toLocaleDateString("pt-BR")})`; }
    else if (vencido) { status = "ATENCAO"; motivo = `Preventiva ${vencido.plano.codigo} vencida em ${vencido.proximoVencimento!.toLocaleDateString("pt-BR")}`; }

    const principal = emParada ?? emExecucao ?? atrasada ?? [...os].sort((x, y) => (PESO_OS[x.status] ?? 9) - (PESO_OS[y.status] ?? 9))[0] ?? null;

    return {
      id: a.id, codApl: a.codApl, tag: a.tag, nome: a.nome, tipo: a.tipo, paiId: a.paiId, ativo: a.ativo,
      criticidade: a.criticidade, status, osAbertas: os.length,
      osPrincipal: principal ? { id: principal.id, numero: principal.numero, status: principal.status } : null,
      motivo, mapaX: a.mapaX, mapaY: a.mapaY, mapaLargura: a.mapaLargura, mapaAltura: a.mapaAltura,
    };
  });

  return { nos, plantaUrl: planta?.valor ?? null, geradoEm: agora.toISOString() };
}
