export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { colaboradoresDaEmpresa, pendenciasColaborador, semaforo, type ColaboradorSst } from "@/lib/sst";

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
    return {
      id: c.id, nome: c.nome, ativo: c.ativo, setor: c.setor?.nome ?? null,
      funcao: v ? { id: v.funcao.id, nome: v.funcao.nome, desde: v.inicio } : null,
      semaforo: semaforo(pend),
      pendencias: pend,
      nEpi: pend.filter((p) => p.tipo.startsWith("EPI")).length,
      nAso: pend.filter((p) => p.tipo.startsWith("ASO") || p.tipo === "EXAME_PENDENTE").length,
      nTreino: pend.filter((p) => p.tipo.startsWith("TREINAMENTO")).length,
    };
  });
  return NextResponse.json({ data });
}
