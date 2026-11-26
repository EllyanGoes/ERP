export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo, temPermissao } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { empresasVisiveis } from "@/lib/empresa";
import { filtroVisibilidade, SITUACOES_ABERTAS } from "@/lib/processos";
import { resumoFinanceiroProcessos, temFinanceiro } from "@/lib/processos-pagamento";

// GET /api/processos/relatorios/provisoes?empresaId=&dataBase=YYYY-MM-DD — relatório CPC 25 (fase 3).
// Processos ATIVOS na data-base (abertos até ela e não encerrados antes dela) com valor em
// discussão, para a contabilidade decidir provisão (provável), nota explicativa (possível) ou nada
// (remota). Polo AUTOR/REQUERENTE = ativo contingente (não se reconhece; divulga se provável).
// Só relatório: NÃO gera lançamento contábil. Valor e risco são os ATUAIS do cadastro (sem histórico).
// §8.3: por processo, (−) já pago (caixa dos títulos a pagar ligados até a data-base, exceto
// depósitos, + depósitos convertidos em pagamento) e o depositado em juízo (saldo, à parte — é
// ATIVO, não reduz a provisão); exposição remanescente = valor em discussão − já pago (≥ 0).
// Os valores pagos/depositados só vêm para quem também tem o módulo Financeiro.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (auth.session.perfil !== "ADMIN" && !(await temPermissao(auth.session.sub, "processos.relatorios.ver"))) {
    return NextResponse.json({ error: "Sem permissão para o relatório de provisões (Processos › Relatório de provisões)." }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const empresas = await empresasVisiveis(auth.session.sub, auth.session.perfil);
  const permitidas = empresas.map((e) => e.id);
  const pedida = sp.get("empresaId");
  const empresaIds = pedida && pedida !== "todas" ? permitidas.filter((e) => e === pedida) : permitidas;
  const txt = sp.get("dataBase");
  const dataBase = txt && /^\d{4}-\d{2}-\d{2}$/.test(txt) ? new Date(`${txt}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const fimDoDia = new Date(dataBase.getTime() + 86_400_000);
  const visivel = await filtroVisibilidade(auth.session);

  const lista = await prismaSemEscopo.processo.findMany({
    where: {
      empresaId: { in: empresaIds },
      AND: [
        visivel,
        { OR: [{ abertoEm: null, createdAt: { lt: fimDoDia } }, { abertoEm: { lt: fimDoDia } }] },
        { OR: [{ situacao: { in: SITUACOES_ABERTAS }, encerradoEm: null }, { encerradoEm: { gte: fimDoDia } }] },
      ],
    },
    orderBy: [{ empresaId: "asc" }, { codigo: "asc" }],
    select: {
      id: true, codigo: true, titulo: true, tipo: true, orgao: true, numero: true, polo: true, situacao: true, riscoPerda: true, valorCausa: true,
      abertoEm: true, confidencial: true, empresaId: true, responsavel: { select: { nome: true } },
    },
  });
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const fin = await temFinanceiro(auth.session);
  const resumo = fin ? await resumoFinanceiroProcessos(lista.map((p) => p.id), fimDoDia) : null;
  const linhas = lista.map((p) => ({
    ...p,
    valorCausa: p.valorCausa == null ? null : Number(p.valorCausa),
    jaPago: resumo ? resumo.get(p.id)?.jaPago ?? 0 : null,
    depositado: resumo ? resumo.get(p.id)?.depositado ?? 0 : null,
    exposicao: Math.max(0, Math.round(((p.valorCausa == null ? 0 : Number(p.valorCausa)) - (resumo?.get(p.id)?.jaPago ?? 0)) * 100) / 100),
    empresa: nomeEmpresa.get(p.empresaId) ?? p.empresaId,
    natureza: p.polo === "AUTOR" || p.polo === "REQUERENTE" ? "ATIVO" : "PASSIVO",
    responsavel: p.responsavel?.nome ?? null,
  }));
  return NextResponse.json({ data: linhas, empresas, dataBase: dataBase.toISOString().slice(0, 10), comFinanceiro: fin });
}
