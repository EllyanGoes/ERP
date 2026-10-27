export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { EMPRESA_PADRAO_ID, prismaSemEscopo } from "@/lib/prisma";
import { afastamentoAtual, asoVigente, colaboradoresDaEmpresa, epiVigente, type ColaboradorSst } from "@/lib/sst";
import { custosComFallback } from "@/lib/custo-empresa";

// GET /api/sst/relatorios/matriz?tipo=epi|exames — dados da planilha em matriz
// (colaborador × EPI / exame) no formato da "Exames a realizar — PCMSO":
//   OK ✓ (feito/entregue, data) · VENCIDO V (precisa refazer/trocar) · FALTA X
//   (nunca) · EXTRA + (feito/entregue sem a função exigir) · NA — (não exigido).
// Entram os colaboradores ATIVOS, com função SST e não afastados. A planilha é
// montada no navegador (components/sst/planilhaMatriz.ts).
type Estado = "OK" | "VENCIDO" | "FALTA" | "EXTRA" | "NA";
type Celula = { estado: Estado; data: string | null };

const DIA_MS = 86_400_000;
const somaMeses = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

export async function GET(req: NextRequest) {
  const auth = await requireModulo("sst");
  if (!auth.ok) return auth.response;
  const tipo = req.nextUrl.searchParams.get("tipo") === "exames" ? "exames" : "epi";
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const hoje = new Date();

  const todos = await colaboradoresDaEmpresa(empresaId);
  const extras = await prismaSemEscopo.colaborador.findMany({
    where: { id: { in: todos.map((c) => c.id) } },
    select: { id: true, matricula: true, sstFuncoes: { where: { fim: null }, take: 1, orderBy: { inicio: "desc" }, select: { funcao: { select: { ghe: true } } } } },
  });
  const extra = new Map(extras.map((e) => [e.id, e]));
  const incluidos = todos.filter((c) => c.ativo && c.sstFuncoes[0] && !afastamentoAtual(c as unknown as ColaboradorSst, hoje));
  const fora = { semFuncao: todos.filter((c) => c.ativo && !c.sstFuncoes[0]).length, afastados: todos.filter((c) => c.ativo && c.sstFuncoes[0] && afastamentoAtual(c as unknown as ColaboradorSst, hoje)).length };

  const funcoesRaw = await prismaSemEscopo.sstFuncao.findMany({
    where: { empresaId, ativo: true },
    select: {
      id: true, nome: true, ghe: true,
      requisitosEpi: { select: { epiId: true, quantidade: true, obrigatorio: true } },
      requisitosExame: { select: { exameTipoId: true, periodicidadeMeses: true } },
    },
  });
  const nPorFuncao = new Map<string, number>();
  for (const c of incluidos) { const f = c.sstFuncoes[0].funcao.id; nPorFuncao.set(f, (nPorFuncao.get(f) ?? 0) + 1); }

  const base = (c: (typeof incluidos)[number]) => ({
    nome: c.nome, matricula: extra.get(c.id)?.matricula ?? null, setor: c.setor?.nome ?? null,
    funcao: c.sstFuncoes[0].funcao.nome, ghe: extra.get(c.id)?.sstFuncoes[0]?.funcao.ghe ?? null,
  });

  if (tipo === "epi") {
    const epis = await prismaSemEscopo.sstEpi.findMany({
      where: { empresaId },
      select: { id: true, nome: true, ca: true, ativo: true, itemId: true, itens: { orderBy: { ordem: "asc" }, select: { itemId: true } } },
    });
    const epiPorId = new Map(epis.map((e) => [e.id, e]));
    // Colunas: EPIs exigidos (pelas funções de quem entra) + entregues sem exigência.
    const usos = new Map<string, number>();
    const linhas = incluidos.map((c) => {
      const exig = new Map(c.sstFuncoes[0].funcao.requisitosEpi.filter((r) => r.obrigatorio).map((r) => [r.epi.id, r]));
      const celulas: Record<string, Celula> = {};
      for (const [epiId] of Array.from(exig)) {
        usos.set(epiId, (usos.get(epiId) ?? 0) + 1);
        const v = epiVigente(c.sstEpiEntregas as ColaboradorSst["sstEpiEntregas"], epiId);
        celulas[epiId] = !v ? { estado: "FALTA", data: null }
          : v.vencimentoUso && v.vencimentoUso.getTime() < hoje.getTime() ? { estado: "VENCIDO", data: v.vencimentoUso.toISOString() }
          : { estado: "OK", data: v.data.toISOString() };
      }
      for (const epiId of Array.from(new Set(c.sstEpiEntregas.map((e) => e.epiId)))) {
        if (exig.has(epiId)) continue;
        const v = epiVigente(c.sstEpiEntregas as ColaboradorSst["sstEpiEntregas"], epiId);
        if (v) { celulas[epiId] = { estado: "EXTRA", data: v.data.toISOString() }; if (!usos.has(epiId)) usos.set(epiId, 0); }
      }
      const datas = c.sstEpiEntregas.map((e) => e.data.getTime());
      return { ...base(c), info: { ultimaEntrega: datas.length ? new Date(Math.max(...datas)).toISOString() : null }, celulas };
    });
    const ids = Array.from(usos.keys()).filter((id) => epiPorId.has(id))
      .sort((a, b) => (usos.get(b)! - usos.get(a)!) || epiPorId.get(a)!.nome.localeCompare(epiPorId.get(b)!.nome, "pt-BR"));
    // Preço (custo médio da empresa, com fallback no global) e saldo em estoque (todos os tamanhos).
    const itensDoEpi = new Map(ids.map((id) => { const e = epiPorId.get(id)!; return [id, Array.from(new Set([e.itemId, ...e.itens.map((i) => i.itemId)].filter((x): x is string => !!x)))]; }));
    const todosItens = Array.from(new Set(Array.from(itensDoEpi.values()).flat()));
    const custos = await custosComFallback(prismaSemEscopo, empresaId, todosItens);
    const saldos = await prismaSemEscopo.estoqueItem.groupBy({ by: ["itemId"], where: { empresaId, itemId: { in: todosItens }, clienteDonoId: null }, _sum: { quantidadeAtual: true } });
    const saldo = new Map(saldos.map((s) => [s.itemId, Number(s._sum.quantidadeAtual ?? 0)]));
    // Já comprado e não recebido: pedidos de compra em aberto (aprovação, pagamento, trânsito).
    const abertos = await prismaSemEscopo.pedidoCompraItem.findMany({
      where: { itemId: { in: todosItens }, pedido: { empresaId, status: { in: ["AGUARDANDO_APROVACAO", "AGUARDANDO_PAGAMENTO", "EM_TRANSITO", "CONFIRMADO", "ENVIADO"] } } },
      select: { itemId: true, quantidade: true, pedido: { select: { numero: true } } },
    });
    const colunas = ids.map((id) => {
      const e = epiPorId.get(id)!; const its = itensDoEpi.get(id)!;
      const ped = abertos.filter((p) => its.includes(p.itemId));
      return {
        id, nome: e.nome, sub: e.ca ? `CA ${e.ca}` : null, preco: its.map((i) => custos.get(i) ?? 0).find((v) => v > 0) ?? 0,
        saldo: its.reduce((s, i) => s + Math.max(0, saldo.get(i) ?? 0), 0),
        emPedido: ped.reduce((s, p) => s + Number(p.quantidade), 0), pedidos: Array.from(new Set(ped.map((p) => p.pedido.numero))),
      };
    });
    const funcoes = funcoesRaw.filter((f) => nPorFuncao.has(f.id)).map((f) => ({
      ghe: f.ghe, nome: f.nome.split(" — ")[0], n: nPorFuncao.get(f.id)!,
      exigidos: Object.fromEntries(f.requisitosEpi.filter((r) => r.obrigatorio).map((r) => [r.epiId, r.quantidade])),
    }));
    return NextResponse.json({ data: { tipo, geradoEm: hoje.toISOString(), colunas, linhas, funcoes, fora } });
  }

  // ── Exames ──────────────────────────────────────────────────────────────────
  const tipos = await prismaSemEscopo.sstExameTipo.findMany({ where: { empresaId }, select: { id: true, nome: true, preco: true, clinico: true, periodicidadeMeses: true } });
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  const clinico = tipos.find((t) => t.clinico) ?? null;
  const CLINICO = "__clinico";
  const usos = new Map<string, number>();
  const linhas = incluidos.map((c) => {
    const exig = c.sstFuncoes[0].funcao.requisitosExame;
    const ultimo = new Map<string, Date>();
    for (const e of [...c.sstExames, ...c.sstAsos.flatMap((a) => a.exames)]) {
      const d = new Date(e.data);
      if (!ultimo.has(e.exameTipoId) || ultimo.get(e.exameTipoId)!.getTime() < d.getTime()) ultimo.set(e.exameTipoId, d);
    }
    const { ultimo: aso } = asoVigente(c.sstAsos as ColaboradorSst["sstAsos"], hoje);
    const celulas: Record<string, Celula> = {};
    celulas[CLINICO] = !aso ? { estado: "FALTA", data: null }
      : aso.validade && aso.validade.getTime() < hoje.getTime() ? { estado: "VENCIDO", data: aso.data.toISOString() }
      : { estado: "OK", data: aso.data.toISOString() };
    for (const r of exig) {
      const id = r.exameTipo.id;
      if (clinico && id === clinico.id) continue;
      usos.set(id, (usos.get(id) ?? 0) + 1);
      const u = ultimo.get(id);
      celulas[id] = !u ? { estado: "FALTA", data: null }
        : somaMeses(u, r.periodicidadeMeses).getTime() < hoje.getTime() ? { estado: "VENCIDO", data: u.toISOString() }
        : { estado: "OK", data: u.toISOString() };
    }
    for (const [id, u] of Array.from(ultimo)) {
      if (celulas[id] || (clinico && id === clinico.id) || !tipoPorId.has(id)) continue;
      celulas[id] = { estado: "EXTRA", data: u.toISOString() };
      if (!usos.has(id)) usos.set(id, 0);
    }
    const venc = aso?.validade ?? null;
    const fazerEm = !aso || (venc && venc.getTime() < hoje.getTime()) ? "JÁ" : venc ? venc.toISOString() : null;
    return {
      ...base(c),
      info: { ultimoAso: aso ? aso.data.toISOString() : null, fazerEm, diasAso: venc ? Math.ceil((venc.getTime() - hoje.getTime()) / DIA_MS) : null },
      celulas,
    };
  });
  const ids = Array.from(usos.keys()).sort((a, b) => (usos.get(b)! - usos.get(a)!) || tipoPorId.get(a)!.nome.localeCompare(tipoPorId.get(b)!.nome, "pt-BR"));
  const colunas = [
    { id: CLINICO, nome: clinico?.nome ?? "Exame clínico (ASO)", sub: null, preco: Number(clinico?.preco ?? 0), base: true },
    ...ids.map((id) => ({ id, nome: tipoPorId.get(id)!.nome, sub: null, preco: Number(tipoPorId.get(id)!.preco ?? 0) })),
  ];
  const funcoes = funcoesRaw.filter((f) => nPorFuncao.has(f.id)).map((f) => ({
    ghe: f.ghe, nome: f.nome.split(" — ")[0], n: nPorFuncao.get(f.id)!,
    exigidos: {
      [CLINICO]: f.requisitosExame.length ? Math.min(...f.requisitosExame.map((r) => r.periodicidadeMeses)) : 12,
      ...Object.fromEntries(f.requisitosExame.filter((r) => !clinico || r.exameTipoId !== clinico.id).map((r) => [r.exameTipoId, r.periodicidadeMeses])),
    },
  }));
  return NextResponse.json({ data: { tipo, geradoEm: hoje.toISOString(), colunas, linhas, funcoes, fora } });
}
