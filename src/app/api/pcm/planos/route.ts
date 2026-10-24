export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";

// ─────────────────────────────────────────────────────────────────────────────
// Execução dos planos de manutenção (aderência).
//
// As O.S. geradas por plano carregam ManutOrdem.planoId. Acompanha, por plano e
// por mês de abertura: O.S. geradas × concluídas, abertas, atrasadas (programada
// no passado e ainda não concluída) e % de execução.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanoResumo {
  planoId: string;
  tag: string;                 // ManutPlano.codigo
  descricao: string;
  geradas: number;
  concluidas: number;
  abertas: number;
  canceladas: number;
  atrasadas: number;           // abertas com data programada < hoje
  concluidasComAtraso: number; // concluídas depois do dia programado
  pctExecucao: number | null;  // concluídas / (geradas − canceladas)
  ultimaConclusao: string | null;
  proximaProgramada: string | null;
}

export interface PlanosResponse {
  meses: number;
  totais: {
    planosComOs: number;
    geradas: number;
    concluidas: number;
    abertas: number;
    atrasadas: number;
    pctExecucao: number | null;
  };
  serie: { label: string; geradas: number; concluidas: number }[];
  planos: PlanoResumo[];
  source: "db";
  generatedAt: string;
}

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const diaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const meses = Math.min(Math.max(Number(req.nextUrl.searchParams.get("meses") ?? 12) || 12, 1), 36);
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);

  try {
    const ordens = await prisma.manutOrdem.findMany({
      where: { planoId: { not: null }, createdAt: { gte: desde } },
      select: {
        planoId: true, status: true, createdAt: true, programadaPara: true, concluidaEm: true,
        plano: { select: { codigo: true, nome: true } },
      },
    });

    const agora = Date.now();
    const porPlano = new Map<string, PlanoResumo>();
    const porMes = new Map<string, { label: string; geradas: number; concluidas: number }>();

    for (const o of ordens) {
      const p = porPlano.get(o.planoId!) ?? {
        planoId: o.planoId!,
        tag: o.plano?.codigo ?? "—",
        descricao: o.plano?.nome ?? "Plano",
        geradas: 0, concluidas: 0, abertas: 0, canceladas: 0, atrasadas: 0, concluidasComAtraso: 0,
        pctExecucao: null, ultimaConclusao: null, proximaProgramada: null,
      };
      p.geradas++;
      const concluida = o.status === "CONCLUIDA";
      if (concluida) {
        p.concluidas++;
        if (o.concluidaEm && o.programadaPara && diaISO(o.concluidaEm) > diaISO(o.programadaPara)) p.concluidasComAtraso++;
        if (o.concluidaEm && (!p.ultimaConclusao || o.concluidaEm.toISOString() > p.ultimaConclusao)) {
          p.ultimaConclusao = o.concluidaEm.toISOString();
        }
      } else if (o.status === "CANCELADA") {
        p.canceladas++;
      } else if (STATUS_ABERTOS.includes(o.status)) {
        p.abertas++;
        if (o.programadaPara) {
          if (o.programadaPara.getTime() < agora) p.atrasadas++;
          if (!p.proximaProgramada || o.programadaPara.toISOString() < p.proximaProgramada) {
            p.proximaProgramada = o.programadaPara.toISOString();
          }
        }
      }
      porPlano.set(o.planoId!, p);

      // série mensal pela abertura
      const chave = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const m = porMes.get(chave) ?? {
        label: `${MESES_LABEL[o.createdAt.getMonth()]}/${String(o.createdAt.getFullYear()).slice(2)}`,
        geradas: 0, concluidas: 0,
      };
      m.geradas++;
      if (concluida) m.concluidas++;
      porMes.set(chave, m);
    }

    const planos = Array.from(porPlano.values())
      .map((p) => ({ ...p, pctExecucao: pct(p.concluidas, p.geradas - p.canceladas) }))
      .sort((a, b) => b.geradas - a.geradas);

    const soma = (f: (p: PlanoResumo) => number) => planos.reduce((s, p) => s + f(p), 0);
    const geradas = soma((p) => p.geradas);
    const canceladas = soma((p) => p.canceladas);
    const concluidas = soma((p) => p.concluidas);

    const resposta: PlanosResponse = {
      meses,
      totais: {
        planosComOs: planos.length,
        geradas,
        concluidas,
        abertas: soma((p) => p.abertas),
        atrasadas: soma((p) => p.atrasadas),
        pctExecucao: pct(concluidas, geradas - canceladas),
      },
      serie: Array.from(porMes.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, m]) => m),
      planos,
      source: "db",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[pcm/planos]", err);
    return NextResponse.json({ error: "Não foi possível montar a execução dos planos." }, { status: 500 });
  }
}
