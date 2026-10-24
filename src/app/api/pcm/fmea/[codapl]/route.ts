export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { horasParada } from "@/lib/manutencao/consultas";

export interface FalhaRegistro {
  id: string;               // ManutOrdem.id (link /pcm/os/<id>)
  numero: string;           // nº da OS
  descricao: string;        // descrição da OS
  datent: string;           // data abertura (createdAt)
  datafim: string | null;   // data conclusão (concluidaEm)
  status: string;           // ManutOrdem.status
  horasParada: number;      // tempo de parada calculado
  tipo: string;             // ManutTipo.nome
  prioridade: string | null;
  fechadoPor: string | null; // concluidaPor
}

export interface FMEAResponse {
  codapl: number;
  equipamento: string;
  tag: string;
  local: string;
  totalFalhas: number;
  totalHorasParada: number;
  mtbf: number;
  mttr: number;
  disponibilidade: number;
  confiabilidade: number;
  periodoMeses: number;
  falhas: FalhaRegistro[];
  source: "db";
  generatedAt: string;
}


function fmtDatetime(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const PRIORIDADE_FMEA: Record<string, string> = {
  EMERGENCIA: "EMERGÊNCIA",
  ALTA: "ALTA",
  MEDIA: "MÉDIA",
  BAIXA: "BAIXA",
};

async function queryFMEA(codapl: number, dias: number): Promise<FMEAResponse> {
  const periodoHoras = dias * 24;
  const desde = new Date(Date.now() - dias * 86_400_000);

  // ── Equipamento ──────────────────────────────────────────────────────────
  const ativo = await prisma.manutAtivo.findFirst({
    where: { codApl: codapl },
    select: { id: true, tag: true, nome: true, localizacao: true, pai: { select: { nome: true } } },
  });
  const equipamento = ativo?.nome || "Equipamento não encontrado";
  const tag = ativo?.tag ?? "";
  const local = ativo?.localizacao || ativo?.pai?.nome || "Não informado";

  // ── OS do ativo abertas no período (todas, como no relatório antigo) ──────
  const ordens = ativo
    ? await prisma.manutOrdem.findMany({
        where: { ativoId: ativo.id, createdAt: { gte: desde } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          numero: true,
          descricao: true,
          createdAt: true,
          concluidaEm: true,
          concluidaPor: true,
          paradaInicio: true,
          paradaFim: true,
          status: true,
          prioridade: true,
          tipo: { select: { nome: true, sigla: true } },
        },
      })
    : [];

  // Tempo de parada = janela de máquina parada da OS (0h sem carimbo). NÃO usa
  // horas apontadas (homem-hora, pode se sobrepor).
  const falhas: FalhaRegistro[] = ordens.map((r) => ({
    id:          r.id,
    numero:      r.numero,
    descricao:   r.descricao?.trim() || "Sem descrição",
    datent:      fmtDatetime(r.createdAt),
    datafim:     r.concluidaEm ? fmtDatetime(r.concluidaEm) : null,
    status:      r.status,
    horasParada: parseFloat(horasParada(r).toFixed(2)),
    tipo:        r.tipo.nome || r.tipo.sigla || "—",
    prioridade:  PRIORIDADE_FMEA[r.prioridade] ?? null,
    fechadoPor:  r.concluidaPor ?? null,
  }));

  const totalFalhas      = falhas.length;
  const totalHorasParada = falhas.reduce((s, f) => s + f.horasParada, 0);
  const mttr  = totalFalhas > 0 ? totalHorasParada / totalFalhas : 0;
  const mtbf  = totalFalhas > 0 ? Math.max((periodoHoras - totalHorasParada) / totalFalhas, 0) : periodoHoras;
  const disp  = Math.min(Math.max((1 - totalHorasParada / periodoHoras) * 100, 0), 100);
  const conf  = totalFalhas > 0 ? (mtbf > 0 ? Math.exp(-720 / mtbf) * 100 : 0) : 0;

  return {
    codapl, equipamento, tag, local,
    totalFalhas,
    totalHorasParada: parseFloat(totalHorasParada.toFixed(2)),
    mtbf:             parseFloat(mtbf.toFixed(2)),
    mttr:             parseFloat(mttr.toFixed(2)),
    disponibilidade:  parseFloat(disp.toFixed(2)),
    confiabilidade:   parseFloat(conf.toFixed(2)),
    periodoMeses:     Math.round(dias / 30),
    falhas,
    source: "db",
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { codapl: string } }
) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  const codapl = parseInt(params.codapl, 10);
  if (isNaN(codapl) || codapl <= 0) {
    return NextResponse.json({ error: "CODAPL inválido" }, { status: 400 });
  }
  const dias = parseInt(req.nextUrl.searchParams.get("dias") ?? "365", 10) || 365;

  const data = await queryFMEA(codapl, dias);
  return NextResponse.json(data);
}
