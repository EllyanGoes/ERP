export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { horasParada } from "@/lib/manutencao/consultas";
import { STATUS_OS_LABEL, PRIORIDADE_LABEL, type StatusOS } from "@/lib/manutencao/ordem";

// ─────────────────────────────────────────────────────────────────────────────
// Resumo de uma O.S. (ManutOrdem) para o painel lateral do Relatório de O.S.
// A tela completa da OS é /pcm/os/<id>; aqui só o essencial do popup.
// ─────────────────────────────────────────────────────────────────────────────

export interface OSDetalhe {
  id: string;
  numero: string;         // OS-2572
  titulo: string;         // descrição
  statord: string;        // faixa do relatório: A / E / P / F / C
  status: string;         // status nativo
  statusLabel: string;
  datent: string;         // abertura
  datafim: string | null; // conclusão (ou encerramento pelo técnico)
  maqpar: string | null;  // início parada máquina
  maqfun: string | null;  // retorno máquina
  horexerea: number;      // homem-hora apontado
  horasParada: number;    // horas de parada de máquina
  tipo: string;
  prioridade: string | null; // Emergência / Alta / Média / Baixa
  codApl: number | null;
  equipamento: string;
  tag: string;
  local: string;
  responsavel: string | null;
  observacoes: string | null;
}

function fmtDatetime(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FAIXA: Record<string, string> = {
  ABERTA: "A", PLANEJADA: "A",
  PAUSADA: "E", AGUARDANDO_MATERIAL: "E", AGUARDANDO_TERCEIRO: "E",
  EM_EXECUCAO: "P", ENCERRADA: "P",
  CONCLUIDA: "F", CANCELADA: "C",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;

  try {
    const o = await prisma.manutOrdem.findFirst({
      where: { id: params.id },
      include: {
        tipo: { select: { nome: true } },
        ativo: { select: { codApl: true, tag: true, nome: true, localizacao: true, pai: { select: { nome: true } } } },
        responsavel: { select: { nome: true } },
        apontamentos: { select: { nome: true, inicio: true, fim: true }, orderBy: { inicio: "asc" } },
      },
    });
    if (!o) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

    // homem-hora = soma dos apontamentos fechados (cronômetro aberto não conta)
    const horexerea = o.apontamentos.reduce(
      (s, a) => s + (a.fim ? Math.max(0, (a.fim.getTime() - a.inicio.getTime()) / 3_600_000) : 0),
      0,
    );
    const executantes = Array.from(new Set(o.apontamentos.map((a) => a.nome.trim()).filter(Boolean)));
    const responsavel = o.responsavel?.nome
      ? [o.responsavel.nome, ...executantes.filter((n) => n !== o.responsavel!.nome)].join(", ")
      : executantes.join(", ") || null;

    const os: OSDetalhe = {
      id: o.id,
      numero: o.numero,
      titulo: o.descricao?.trim() || "Sem descrição",
      statord: FAIXA[o.status] ?? "A",
      status: o.status,
      statusLabel: STATUS_OS_LABEL[o.status as StatusOS] ?? o.status,
      datent: fmtDatetime(o.createdAt),
      datafim: o.concluidaEm ? fmtDatetime(o.concluidaEm) : o.encerradaEm ? fmtDatetime(o.encerradaEm) : null,
      maqpar: o.paradaInicio ? fmtDatetime(o.paradaInicio) : null,
      maqfun: o.paradaFim ? fmtDatetime(o.paradaFim) : null,
      horexerea: parseFloat(horexerea.toFixed(2)),
      horasParada: parseFloat(horasParada(o).toFixed(2)),
      tipo: o.tipo.nome,
      prioridade: PRIORIDADE_LABEL[o.prioridade] ?? null,
      codApl: o.ativo?.codApl ?? null,
      equipamento: o.ativo?.nome ?? "Não informado",
      tag: o.ativo?.tag ?? "",
      local: o.ativo?.localizacao || o.ativo?.pai?.nome || o.localTexto || "Não informado",
      responsavel,
      observacoes: o.observacaoTecnica?.trim() || null,
    };
    return NextResponse.json({ os, source: "db" });
  } catch (err) {
    console.error("[pcm/ordens/[id]]", err);
    return NextResponse.json({ error: "Não foi possível carregar a O.S." }, { status: 500 });
  }
}
