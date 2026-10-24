import { prismaSemEscopo as db } from "@/lib/prisma";
import { criarOrdem } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// Gerador de OS preventivas (docs/manutencao-prd.md §5.4). Para cada aplicação
// ativa de plano: CALENDÁRIO gera quando faltam ≤ antecedência dias para o
// vencimento; MEDIDOR gera quando o acumulado chega a 90% do próximo marco.
// Idempotente por (planoAtivoId, planoRef) e nunca empilha: se a OS anterior do
// mesmo plano×ativo ainda está aberta, não gera outra (ela aparece atrasada).
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoGeracao = { geradas: { numero: string; plano: string; ativo: string }[]; puladas: number };

const DIA = 86_400_000;

export async function gerarPreventivas(opts: { empresaId?: string; usuario?: string; ate?: Date } = {}): Promise<ResultadoGeracao> {
  const agora = opts.ate ?? new Date();
  const aplicacoes = await db.manutPlanoAtivo.findMany({
    where: { ativo: true, plano: { ativo: true, ...(opts.empresaId ? { empresaId: opts.empresaId } : {}) }, ativoRef: { ativo: true } },
    include: {
      plano: { include: { tarefas: { orderBy: { seq: "asc" } }, materiais: { include: { item: { select: { descricao: true } } } } } },
      ativoRef: { select: { id: true, tag: true, nome: true, empresaId: true } },
      medidor: { select: { acumulado: true } },
    },
  });
  const res: ResultadoGeracao = { geradas: [], puladas: 0 };
  for (const pa of aplicacoes) {
    let ref: string | null = null;
    let programadaPara: Date | null = null;
    if (pa.gatilho === "CALENDARIO" && pa.intervaloDias) {
      const venc = pa.proximoVencimento ?? agora;
      if (venc.getTime() - pa.plano.antecedenciaDias * DIA > agora.getTime()) continue;
      ref = venc.toISOString().slice(0, 10);
      programadaPara = venc;
    } else if (pa.gatilho === "MEDIDOR" && pa.intervaloMedida && pa.medidor) {
      const alvo = pa.proximaMedida != null ? Number(pa.proximaMedida) : Number(pa.intervaloMedida);
      if (Number(pa.medidor.acumulado) < alvo - Number(pa.intervaloMedida) * 0.1) continue;
      ref = `M:${alvo}`;
      programadaPara = agora;
    } else {
      continue;
    }
    const aberta = await db.manutOrdem.count({ where: { planoAtivoId: pa.id, status: { notIn: ["CONCLUIDA", "CANCELADA"] } } });
    const jaExiste = await db.manutOrdem.count({ where: { planoAtivoId: pa.id, planoRef: ref } });
    if (aberta > 0 || jaExiste > 0) { res.puladas++; continue; }
    const ordem = await criarOrdem({
      empresaId: pa.ativoRef.empresaId, ativoId: pa.ativoId, tipoId: pa.plano.tipoId,
      descricao: pa.plano.nome, equipeId: pa.plano.equipeId,
      horasEstimadas: pa.plano.horasEstimadas != null ? Number(pa.plano.horasEstimadas) : null,
      exigeParada: pa.plano.exigeParada, programadaPara, prazo: programadaPara,
      planoId: pa.planoId, planoAtivoId: pa.id, planoRef: ref, status: "PLANEJADA",
      usuario: opts.usuario ?? "Gerador de preventivas", origem: `Plano ${pa.plano.codigo}`,
    });
    if (pa.plano.tarefas.length) {
      await db.manutOrdemServico.createMany({
        data: pa.plano.tarefas
          .filter((t) => !t.ativoId || t.ativoId === pa.ativoId || t.tipoResposta !== "NENHUMA")
          .map((t, i) => ({
            ordemId: ordem.id, seq: i + 1, descricao: t.descricao, servicoId: t.servicoId,
            tipoResposta: t.tipoResposta, faixaMin: t.faixaMin, faixaMax: t.faixaMax,
          })),
      });
    }
    if (pa.plano.materiais.length) {
      await db.manutOrdemMaterial.createMany({
        data: pa.plano.materiais.map((m) => ({ ordemId: ordem.id, itemId: m.itemId, descricao: m.item.descricao, quantidade: m.quantidade, origem: "PREVISTO" })),
      });
    }
    res.geradas.push({ numero: ordem.numero, plano: pa.plano.nome, ativo: `${pa.ativoRef.tag} ${pa.ativoRef.nome}` });
  }
  return res;
}

/** Próximo vencimento ao (re)configurar uma aplicação de calendário. */
export function vencimentoInicial(ultimaExecucao: Date | null, intervaloDias: number): Date {
  return ultimaExecucao ? new Date(ultimaExecucao.getTime() + intervaloDias * DIA) : new Date();
}
