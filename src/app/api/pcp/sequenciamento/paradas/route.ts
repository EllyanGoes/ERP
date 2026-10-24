export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModuloAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Status de OS que ainda vão parar a máquina (encerrada/concluída/cancelada já não).
const STATUS_PENDENTES = ["ABERTA", "PLANEJADA", "EM_EXECUCAO", "PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"];

// GET ?de=ISO&ate=ISO&centroId= — indisponibilidade programada dos fornos: OS da
// Manutenção com exigeParada e programadaPara no horizonte, dos ativos ligados aos
// centros de trabalho tipo FORNO (CentroTrabalho.ativoId) e de seus filhos na
// árvore. Só leitura — o sequenciamento não muda; a tela mostra como aviso.
export async function GET(req: NextRequest) {
  const auth = await requireModuloAny(["pcp", "pcm"]);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const de = sp.get("de") ? new Date(sp.get("de")!) : new Date();
  const ate = sp.get("ate") ? new Date(sp.get("ate")!) : new Date(de.getTime() + 30 * 86_400_000);
  if (isNaN(de.getTime()) || isNaN(ate.getTime())) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  const centroId = sp.get("centroId") || null;

  const centros = await prisma.centroTrabalho.findMany({
    where: { ativoId: { not: null }, ...(centroId ? { id: centroId } : { tipo: "FORNO", ativo: true }) },
    select: { id: true, codigo: true, nome: true, ativoId: true },
  });
  if (centros.length === 0) return NextResponse.json({ data: [], centrosSemAtivo: await contarFornosSemAtivo(centroId) });

  // Árvore de ativos da empresa ativa → cada ativo raiz dos centros + descendentes.
  const ativos = await prisma.manutAtivo.findMany({ select: { id: true, paiId: true } });
  const filhos = new Map<string, string[]>();
  for (const a of ativos) if (a.paiId) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a.id]);
  const centroDoAtivo = new Map<string, (typeof centros)[number]>();
  for (const c of centros) {
    const fila = [c.ativoId!];
    for (let i = 0; i < fila.length && i < 5000; i++) {
      const id = fila[i];
      if (centroDoAtivo.has(id)) continue;
      centroDoAtivo.set(id, c);
      fila.push(...(filhos.get(id) ?? []));
    }
  }

  const ordens = await prisma.manutOrdem.findMany({
    where: {
      exigeParada: true,
      status: { in: STATUS_PENDENTES },
      programadaPara: { gte: de, lte: ate },
      ativoId: { in: Array.from(centroDoAtivo.keys()) },
    },
    orderBy: { programadaPara: "asc" },
    select: {
      id: true, numero: true, status: true, prioridade: true, descricao: true, programadaPara: true, horasEstimadas: true, ativoId: true,
      ativo: { select: { tag: true, nome: true } },
      tipo: { select: { sigla: true, nome: true } },
    },
  });

  const data = ordens.map((o) => {
    const c = centroDoAtivo.get(o.ativoId!);
    return {
      id: o.id, numero: o.numero, status: o.status, prioridade: o.prioridade, descricao: o.descricao,
      programadaPara: o.programadaPara, horasEstimadas: o.horasEstimadas == null ? null : Number(o.horasEstimadas),
      ativo: o.ativo, tipo: o.tipo,
      centro: c ? { id: c.id, codigo: c.codigo, nome: c.nome } : null,
    };
  });
  return NextResponse.json({ data, centrosSemAtivo: await contarFornosSemAtivo(centroId) });
}

/** Fornos sem ativo da Manutenção ligado (a tela avisa que eles não entram na conta). */
async function contarFornosSemAtivo(centroId: string | null) {
  return prisma.centroTrabalho.count({ where: { ativoId: null, ...(centroId ? { id: centroId } : { tipo: "FORNO", ativo: true }) } });
}
