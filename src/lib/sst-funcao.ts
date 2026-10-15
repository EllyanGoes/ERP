// Nome da função SST = "cargo — GHE". O GHE tem campo próprio (SstFuncao.ghe);
// o nome composto continua sendo o que as telas exibem. Só a API monta o nome.
import type { Prisma } from "@prisma/client";

export const SEP_GHE = " — ";

export const cargoDe = (nome: string) => nome.split(SEP_GHE)[0].trim();
export const nomeFuncao = (cargo: string, ghe: string | null | undefined) => (ghe?.trim() ? `${cargo.trim()}${SEP_GHE}${ghe.trim()}` : cargo.trim());

type Req = { epis?: unknown; exames?: unknown; treinamentos?: unknown };

/** Substitui os requisitos (EPIs/exames/treinamentos enviados) de uma função. */
export async function gravarRequisitos(tx: Prisma.TransactionClient, funcaoId: string, b: Req) {
  if (Array.isArray(b.epis)) {
    await tx.sstFuncaoEpi.deleteMany({ where: { funcaoId } });
    await tx.sstFuncaoEpi.createMany({
      data: (b.epis as { epiId: string; obrigatorio?: boolean; quantidade?: number }[]).filter((e) => e?.epiId)
        .map((e) => ({ funcaoId, epiId: e.epiId, obrigatorio: e.obrigatorio !== false, quantidade: Math.max(1, Number(e.quantidade) || 1) })),
      skipDuplicates: true,
    });
  }
  if (Array.isArray(b.exames)) {
    await tx.sstFuncaoExame.deleteMany({ where: { funcaoId } });
    await tx.sstFuncaoExame.createMany({
      data: (b.exames as { exameTipoId: string; periodicidadeMeses: number }[]).filter((e) => e?.exameTipoId && Number(e.periodicidadeMeses) > 0)
        .map((e) => ({ funcaoId, exameTipoId: e.exameTipoId, periodicidadeMeses: Number(e.periodicidadeMeses) })),
      skipDuplicates: true,
    });
  }
  if (Array.isArray(b.treinamentos)) {
    await tx.sstFuncaoTreinamento.deleteMany({ where: { funcaoId } });
    await tx.sstFuncaoTreinamento.createMany({
      data: (b.treinamentos as { treinamentoTipoId: string }[]).filter((t) => t?.treinamentoTipoId).map((t) => ({ funcaoId, treinamentoTipoId: t.treinamentoTipoId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Deixa na função exatamente os colaboradores informados (vínculos vigentes).
 * Entrou: encerra a função atual dele e abre esta (como "Mudar função").
 * Saiu: encerra o vínculo (fica sem função até ser atribuído a outra).
 */
export async function sincronizarColaboradores(tx: Prisma.TransactionClient, funcaoId: string, ids: string[], quando = new Date()) {
  const desejados = new Set(ids.filter(Boolean));
  const atuais = await tx.sstColaboradorFuncao.findMany({ where: { funcaoId, fim: null }, select: { id: true, colaboradorId: true } });
  const jaEstao = new Set(atuais.map((a) => a.colaboradorId));
  let entraram = 0, sairam = 0;
  for (const a of atuais) if (!desejados.has(a.colaboradorId)) { await tx.sstColaboradorFuncao.update({ where: { id: a.id }, data: { fim: quando } }); sairam++; }
  for (const colaboradorId of Array.from(desejados)) {
    if (jaEstao.has(colaboradorId)) continue;
    await tx.sstColaboradorFuncao.updateMany({ where: { colaboradorId, fim: null }, data: { fim: quando } });
    await tx.sstColaboradorFuncao.create({ data: { colaboradorId, funcaoId, inicio: quando } });
    entraram++;
  }
  return { entraram, sairam };
}
