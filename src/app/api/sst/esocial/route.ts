export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// GET /api/sst/esocial?evento=S2210|S2220&ano=&formato=json|csv
// Exportação PRÉ-eSocial: os dados que os eventos pedem, prontos para o
// contador/provedor montar e transmitir. Não transmite nada.
export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  const evento = sp.get("evento") ?? "S2210";
  const ano = parseInt(sp.get("ano") ?? "") || new Date().getFullYear();
  const formato = sp.get("formato") ?? "json";
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const empresa = await prismaSemEscopo.empresa.findUnique({ where: { id: empresaId }, select: { razaoSocial: true, cnpj: true } });
  const periodo = { gte: new Date(ano, 0, 1), lt: new Date(ano + 1, 0, 1) };
  let linhas: Record<string, unknown>[] = [];
  if (evento === "S2210") {
    // CAT — Comunicação de Acidente de Trabalho
    const incs = await prismaSemEscopo.sstIncidente.findMany({ where: { empresaId, data: periodo, tipo: { in: ["ACIDENTE_COM_AFASTAMENTO", "ACIDENTE_SEM_AFASTAMENTO", "TRAJETO", "DOENCA_OCUPACIONAL"] } }, orderBy: { data: "asc" }, include: { colaborador: { select: { nome: true, cpf: true, matricula: true, cargo: true } }, setor: { select: { nome: true } } } });
    linhas = incs.map((i) => ({
      evento: "S-2210", numeroInterno: i.numero, cpfTrabalhador: i.colaborador?.cpf ?? "", nomeTrabalhador: i.colaborador?.nome ?? "", matricula: i.colaborador?.matricula ?? "", cargo: i.colaborador?.cargo ?? "",
      dtAcid: i.data.toISOString().slice(0, 10), tpAcid: i.tipo === "TRAJETO" ? "2 (trajeto)" : i.tipo === "DOENCA_OCUPACIONAL" ? "3 (doença)" : "1 (típico)",
      houveAfastamento: i.tipo === "ACIDENTE_COM_AFASTAMENTO" || i.tipo === "DOENCA_OCUPACIONAL" ? "S" : "N", diasAfastamento: i.diasAfastamento ?? 0,
      localAcidente: i.local ?? i.setor?.nome ?? "", parteAtingida: i.parteCorpo ?? "", agenteCausador: i.agente ?? "", descricao: i.descricao,
      nrRecCat: i.catNumero ?? "", dtCat: i.catEmitidaEm ? i.catEmitidaEm.toISOString().slice(0, 10) : "", pendente: !i.catNumero ? "CAT NÃO EMITIDA" : "",
    }));
  } else if (evento === "S2220") {
    // Monitoramento da saúde — ASO
    const asos = await prismaSemEscopo.sstAso.findMany({ where: { empresaId, data: periodo }, orderBy: { data: "asc" }, include: { colaborador: { select: { nome: true, cpf: true, matricula: true } }, exames: { include: { exameTipo: { select: { nome: true } } } } } });
    const tp: Record<string, string> = { ADMISSIONAL: "0", PERIODICO: "1", RETORNO: "2", MUDANCA_FUNCAO: "3", MUDANCA_RISCO: "3", DEMISSIONAL: "9" };
    linhas = asos.map((a) => ({
      evento: "S-2220", cpfTrabalhador: a.colaborador.cpf ?? "", nomeTrabalhador: a.colaborador.nome, matricula: a.colaborador.matricula ?? "",
      dtAso: a.data.toISOString().slice(0, 10), tpExameOcup: `${tp[a.tipo] ?? ""} (${a.tipo})`, resAso: a.resultado === "APTO" ? "1 (apto)" : a.resultado === "INAPTO" ? "2 (inapto)" : "1 (apto c/ restrições)",
      nmMed: a.medico ?? "", crm: a.crm ?? "", exames: a.exames.map((e) => `${e.exameTipo.nome}:${e.data.toISOString().slice(0, 10)}`).join("; "), validade: a.validade ? a.validade.toISOString().slice(0, 10) : "",
    }));
  } else {
    return NextResponse.json({ error: "Evento não suportado (S2210 ou S2220)." }, { status: 400 });
  }
  if (formato === "csv") {
    const cols = Object.keys(linhas[0] ?? { evento: "" });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(";"), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(";"))].join("\n");
    return new NextResponse("\uFEFF" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pre-esocial-${evento}-${ano}.csv"` } });
  }
  return NextResponse.json({ data: { evento, ano, empresa, total: linhas.length, linhas } });
}
