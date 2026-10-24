export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { dataReferenciaOS, horasParada, wherePeriodoOS } from "@/lib/manutencao/consultas";
import { janelaMesUTC } from "@/lib/pcm-mtbf";

export interface OsDetalhe {
  id: string; // ManutOrdem.id (link para /pcm/os/<id>)
  tipo: string; // ManutTipo.nome
  planejada: boolean; // true = tipo que NÃO conta como falha (não desconta)
  cancelada: boolean; // OS cancelada — nunca desconta
  temDefeito: boolean; // algum serviço com sintoma preenchido
  contabilizada: boolean; // entra na parada não planejada (tipo conta como falha e não cancelada)
  comJanela: boolean; // tem início e fim de parada; senão a parada fica 0
  inicio: string | null; // ISO (paradaInicio, fallback data de referência)
  fim: string | null; // ISO (paradaFim, fallback concluidaEm)
  horas: number; // parada (paradaInicio→paradaFim)
  status: string; // ManutOrdem.status
  descricao: string; // Solicitação (descrição da OS)
  osNumero: string; // nº da O.S. (ManutOrdem.numero)
  tipoSigla: string; // sigla do tipo (ex.: CRN)
  ocorrencia: string | null; // sintoma(s) dos serviços
  causa: string | null; // causa(s) dos serviços
  servico: string | null; // descrição dos serviços com sintoma
}

export interface Segmento {
  osId: string;
  tipo: "naoPlanejada" | "planejada";
  inicioPct: number; // 0–100 dentro do mês
  fimPct: number;
  horas: number;
}

export interface DetalheResponse {
  codApl: number;
  ano: number;
  mes: number;
  inicioMes: string;
  fimMes: string;
  os: OsDetalhe[];
  segmentos: Segmento[];
  resumo: {
    paradaNaoPlanejada: number; // soma das contabilizadas (== nº usado no fechamento)
    nFalhas: number; // contagem das contabilizadas
    paradaDemais: number; // soma das NÃO contabilizadas
    nDemais: number;
    semJanela: number; // contabilizadas sem início/fim de parada (parada = 0)
  };
  source: "db";
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const round2 = (n: number) => parseFloat(n.toFixed(2));
const juntar = (s: Set<string>) => (s.size ? Array.from(s).join(" / ") : null);

export async function GET(req: NextRequest) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const codApl = Number(sp.get("codApl"));
  const ano = Number(sp.get("ano"));
  const mes = Number(sp.get("mes"));
  if (
    !Number.isInteger(codApl) || codApl <= 0 ||
    !Number.isInteger(ano) || ano < 2000 ||
    !Number.isInteger(mes) || mes < 1 || mes > 12
  ) {
    return NextResponse.json({ error: "Parâmetros codApl/ano/mes inválidos" }, { status: 400 });
  }

  // Janela do mês (para a timeline em %).
  const { inicio: inicioMes, fim, fimExclusivo: fimMes } = janelaMesUTC(ano, mes);

  const ordens = await prisma.manutOrdem.findMany({
    where: { AND: [{ ativo: { codApl } }, wherePeriodoOS(inicioMes, fim)] },
    select: {
      id: true,
      numero: true,
      descricao: true,
      status: true,
      programadaPara: true,
      createdAt: true,
      concluidaEm: true,
      paradaInicio: true,
      paradaFim: true,
      tipo: { select: { sigla: true, nome: true, contaComoFalha: true } },
      // Ocorrência/causa/serviço: só os serviços com sintoma (registro de falha).
      servicos: {
        where: { sintomaId: { not: null } },
        orderBy: { seq: "asc" },
        select: {
          descricao: true,
          sintoma: { select: { descricao: true } },
          causa: { select: { descricao: true } },
        },
      },
    },
  });

  // Ordena pela parada (sem parada primeiro, como no relatório antigo) e pela data de referência.
  ordens.sort((a, b) => {
    const pa = a.paradaInicio?.getTime() ?? -Infinity;
    const pb = b.paradaInicio?.getTime() ?? -Infinity;
    if (pa !== pb) return pa - pb;
    return dataReferenciaOS(a).getTime() - dataReferenciaOS(b).getTime();
  });

  const spanMs = fimMes.getTime() - inicioMes.getTime();
  const pct = (d: Date) => {
    const c = Math.min(Math.max(d.getTime(), inicioMes.getTime()), fimMes.getTime());
    return ((c - inicioMes.getTime()) / spanMs) * 100;
  };

  const os: OsDetalhe[] = [];
  const segmentos: Segmento[] = [];

  for (const r of ordens) {
    const comJanela = !!(r.paradaInicio && r.paradaFim);
    // Parada = só a janela de máquina parada da OS. Sem carimbo → 0h. NÃO usa
    // horas apontadas (homem-hora, pode se sobrepor entre técnicos).
    const horas = horasParada(r);
    const oc = new Set<string>();
    const ca = new Set<string>();
    const se = new Set<string>();
    for (const s of r.servicos) {
      if (s.sintoma?.descricao?.trim()) oc.add(s.sintoma.descricao.trim());
      if (s.causa?.descricao?.trim()) ca.add(s.causa.descricao.trim());
      const d = s.descricao?.trim();
      if (d && d !== "—") se.add(d);
    }
    const temDefeito = r.servicos.length > 0;
    const planejada = !r.tipo.contaComoFalha;
    const cancelada = r.status === "CANCELADA";
    // Desconta = OS de TIPO que conta como falha e não cancelada (inspeção/preventiva
    // não contam, mesmo com sintoma). temDefeito segue exposto só como informação.
    const contabilizada = !planejada && !cancelada;

    os.push({
      id: r.id,
      tipo: r.tipo.nome || r.tipo.sigla,
      planejada,
      cancelada,
      temDefeito,
      contabilizada,
      comJanela,
      inicio: iso(r.paradaInicio ?? dataReferenciaOS(r)),
      fim: iso(r.paradaFim ?? r.concluidaEm),
      horas: round2(horas),
      status: r.status,
      descricao: r.descricao || "",
      osNumero: r.numero,
      tipoSigla: r.tipo.sigla || r.tipo.nome || "—",
      ocorrencia: juntar(oc),
      causa: juntar(ca),
      servico: juntar(se),
    });

    if (comJanela && !cancelada) {
      segmentos.push({
        osId: r.id,
        tipo: contabilizada ? "naoPlanejada" : "planejada",
        inicioPct: round2(pct(r.paradaInicio!)),
        fimPct: round2(pct(r.paradaFim!)),
        horas: round2(horas),
      });
    }
  }

  const contab = os.filter((o) => o.contabilizada);
  const demais = os.filter((o) => !o.contabilizada);

  return NextResponse.json({
    codApl,
    ano,
    mes,
    inicioMes: inicioMes.toISOString(),
    fimMes: fimMes.toISOString(),
    os,
    segmentos,
    resumo: {
      paradaNaoPlanejada: round2(contab.reduce((s, o) => s + o.horas, 0)),
      nFalhas: contab.length,
      paradaDemais: round2(demais.reduce((s, o) => s + o.horas, 0)),
      nDemais: demais.length,
      semJanela: contab.filter((o) => !o.comJanela).length,
    },
    source: "db",
  } satisfies DetalheResponse);
}
