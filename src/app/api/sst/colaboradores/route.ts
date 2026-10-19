export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { afastamentoAtual, asoVigente, colaboradoresDaEmpresa, pendenciasColaborador, semaforo, type ColaboradorSst } from "@/lib/sst";

// GET /api/sst/colaboradores — colaboradores da empresa ativa com semáforo SST.
export async function GET() {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const colabs = await colaboradoresDaEmpresa(empresaId);
  const hoje = new Date();
  const data = colabs.map((c) => {
    const pend = pendenciasColaborador(c as unknown as ColaboradorSst, hoje);
    const v = c.sstFuncoes[0];
    const aso = asoVigente(c.sstAsos as unknown as ColaboradorSst["sstAsos"], hoje).ultimo;
    return {
      id: c.id, nome: c.nome, ativo: c.ativo, setor: c.setor?.nome ?? null,
      funcao: v ? { id: v.funcao.id, nome: v.funcao.nome, desde: v.inicio } : null,
      semaforo: semaforo(pend),
      afastamento: afastamentoAtual(c as unknown as ColaboradorSst, hoje),
      pendencias: pend,
      nEpi: pend.filter((p) => p.tipo.startsWith("EPI")).length,
      nAso: pend.filter((p) => p.tipo.startsWith("ASO") || p.tipo === "EXAME_PENDENTE").length,
      nTreino: pend.filter((p) => p.tipo.startsWith("TREINAMENTO")).length,
      // Para a planilha de exames (ASO e exames): o que a função exige, o que foi feito e o último ASO.
      exigidos: v ? v.funcao.requisitosExame.map((r) => ({ exameTipoId: r.exameTipo.id, nome: r.exameTipo.nome, periodicidadeMeses: r.periodicidadeMeses })) : [],
      exames: c.sstExames.map((e) => ({ exameTipoId: e.exameTipoId, data: e.data })),
      ultimoAso: aso && { tipo: aso.tipo, data: aso.data, validade: aso.validade, resultado: aso.resultado },
    };
  });
  return NextResponse.json({ data });
}
