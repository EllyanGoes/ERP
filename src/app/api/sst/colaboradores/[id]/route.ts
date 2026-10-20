export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { COLABORADOR_SST_SELECT, afastamentoAtual, pendenciasColaborador, epiVigente, type ColaboradorSst } from "@/lib/sst";

// GET /api/sst/colaboradores/[id] — ficha SST completa.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const c = await prismaSemEscopo.colaborador.findUnique({
    where: { id: params.id },
    select: {
      ...COLABORADOR_SST_SELECT,
      cargo: true, dataAdmissao: true, matricula: true,
      sstFuncoes: { orderBy: { inicio: "desc" }, select: { id: true, inicio: true, fim: true, funcao: { select: { id: true, nome: true, requisitosEpi: { select: { obrigatorio: true, quantidade: true, epi: { select: { id: true, nome: true, vidaUtilDias: true, caValidade: true, ca: true } } } }, requisitosExame: { select: { periodicidadeMeses: true, exameTipo: { select: { id: true, nome: true } } } }, requisitosTreinamento: { select: { treinamentoTipo: { select: { id: true, nome: true, validadeMeses: true } } } } } } } },
      sstEpiEntregas: { orderBy: { data: "desc" }, select: { id: true, epiId: true, tipo: true, data: true, vencimentoUso: true, quantidade: true, tamanho: true, motivo: true, documentoId: true, movimentacaoEstoqueId: true, epi: { select: { nome: true, ca: true } }, ficha: { select: { id: true, numero: true, documentoId: true } } } },
      sstTreinamentos: { select: { validade: true, aprovado: true, certificadoDocumentoId: true, treinamento: { select: { id: true, tipoId: true, data: true, instrutor: true, cargaHoraria: true, tipo: { select: { nome: true, norma: true } } } } }, orderBy: { treinamento: { data: "desc" } } },
      sstExames: { orderBy: { data: "desc" }, select: { id: true, exameTipoId: true, data: true, resultado: true, observacao: true, documentoId: true, asoId: true, exameTipo: { select: { nome: true } }, aso: { select: { tipo: true, data: true } } } },
      sstAsos: { orderBy: { data: "desc" }, select: { id: true, tipo: true, data: true, validade: true, resultado: true, restricoes: true, medico: true, crm: true, medicoId: true, documentoId: true, exames: { select: { exameTipoId: true, data: true, resultado: true, exameTipo: { select: { nome: true } } } } } },
    },
  });
  if (!c) return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
  const vigentes = c.sstFuncoes.filter((v) => !v.fim);
  const comoSst = { ...c, sstFuncoes: vigentes } as unknown as ColaboradorSst;
  const pendencias = pendenciasColaborador(comoSst);
  const funcao = vigentes[0]?.funcao ?? null;
  const episStatus = funcao ? funcao.requisitosEpi.map((r) => {
    const v = epiVigente(comoSst.sstEpiEntregas, r.epi.id);
    return { epi: r.epi, obrigatorio: r.obrigatorio, quantidade: r.quantidade, entregaVigente: v };
  }) : [];
  return NextResponse.json({ data: { ...c, pendencias, episStatus, afastamento: afastamentoAtual(comoSst) } });
}

// PATCH /api/sst/colaboradores/[id] — informações complementares de cadastro que
// a cautela de EPI imprime: { cpf?, rg?, matricula?, cargo?, dataAdmissao?, setorId? }.
// Só os campos enviados mudam; string vazia limpa.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const data: Record<string, unknown> = {};
  for (const k of ["rg", "matricula", "cargo"] as const) if (k in b) data[k] = texto(b[k]);
  if ("cpf" in b) {
    const dig = String(b.cpf ?? "").replace(/\D/g, "");
    if (dig && dig.length !== 11) return NextResponse.json({ error: "CPF deve ter 11 dígitos." }, { status: 400 });
    data.cpf = dig ? dig.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : null;
  }
  if ("dataAdmissao" in b) data.dataAdmissao = b.dataAdmissao ? new Date(b.dataAdmissao) : null;
  if ("setorId" in b) data.setorId = b.setorId || null;
  try {
    const c = await prismaSemEscopo.colaborador.update({ where: { id: params.id }, data, select: { id: true, cpf: true, rg: true, matricula: true, cargo: true, dataAdmissao: true, setor: { select: { id: true, nome: true } } } });
    return NextResponse.json({ data: c });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "Este CPF já está cadastrado em outro colaborador." }, { status: 409 });
    if ((e as { code?: string }).code === "P2025") return NextResponse.json({ error: "Colaborador não encontrado" }, { status: 404 });
    throw e;
  }
}
