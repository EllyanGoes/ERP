// DRE a partir do Dexion + utilitários compartilhados com a DRE do ERP
// (tipos, cascata de seções). Separado da rota p/ ser testável.
import { prismaSemEscopo } from "@/lib/prisma";
import { dexionBalanceteCache } from "@/lib/dexion";

export type LinhaConta = { id: string; codigo: string; nome: string; ordemDre: number; meses: number[]; total: number; subgrupoCodigo: string | null; subgrupoNome: string | null; filhos?: LinhaConta[] };
export type SecaoOut = { id: string; nome: string; operacao: string; contas: LinhaConta[]; meses: number[]; total: number };
export type SecaoIn = { id: string; nome: string; operacao: string; ordem: number };

export const z = () => new Array(12).fill(0) as number[];
export const r2 = (n: number) => Math.round(n * 100) / 100;

// Cascata: acumula +/− na ordem; cada seção "=" (SUBTOTAL) recebe o acumulado
// até o ponto (Receita Líquida, Margem Bruta, EBITDA…). O resultado final é o
// último acumulado.
export function cascata(secoesOut: SecaoOut[]) {
  const acc = z();
  let accTotal = 0;
  for (const s of secoesOut) {
    if (s.operacao === "SUBTOTAL") {
      s.meses = acc.slice();
      s.total = accTotal;
      continue;
    }
    const sinal = s.operacao === "SUBTRAI" ? -1 : 1;
    for (let i = 0; i < 12; i++) acc[i] = r2(acc[i] + sinal * s.meses[i]);
    accTotal = r2(accTotal + sinal * s.total);
  }
  return { resultadoMeses: acc, resultadoTotal: accTotal };
}

// DRE a partir do Dexion (contabilidade do escritório): usa o balancete do
// exercício vinculado. Linhas = sintéticas de nível 5 do grupo 3 (ex.: 3.2.1.1.03
// Custos c/ pessoal de produção), subgrupo = nível 4; nível 4 sem filhos vira
// linha. Seção pelo prefixo do Dexion: 3.1 e 3.4.1 → Receitas, 3.1.1.1.09 →
// Deduções (se a estrutura tiver), 3.2 → Custos, demais → Despesas. Sinal:
// seção de receita = crédito − débito; as outras = débito − crédito.
export async function dreDexion(empresaId: string, ano: number, secoes: SecaoIn[], opts?: { forcar?: boolean }) {
  const v = await prismaSemEscopo.dexionVinculoEmpresa.findUnique({ where: { empresaId_exercicio: { empresaId, exercicio: ano } } });
  if (!v) throw new Error(`Sem vínculo com o Dexion para ${ano}. Cadastre em Contabilidade → Integração Dexion → Vínculos.`);
  const cache = await dexionBalanceteCache(v.codigoDexion, ano, opts);
  const contas = cache.dados;
  const resultado = contas.filter((c) => c.conta.startsWith("3") && c.sintetica);
  const analiticas = contas.filter((c) => c.conta.startsWith("3") && !c.sintetica);
  const temFilhoN5 = new Set(resultado.filter((c) => c.nivel === 5).map((c) => c.conta.split(".").slice(0, 4).join(".")));
  const linhas = resultado.filter((c) => c.nivel === 5 || (c.nivel === 4 && !temFilhoN5.has(c.conta)));
  const nomeDe = new Map(resultado.map((c) => [c.conta, c.descricao]));

  const acha = (pred: (s: SecaoIn) => boolean) => secoes.find(pred);
  const secReceitas = acha((s) => /receita/i.test(s.nome) && !/dedu/i.test(s.nome)) ?? acha((s) => s.operacao === "SOMA");
  const secDeducoes = acha((s) => /dedu/i.test(s.nome));
  const secCustos = acha((s) => /custo/i.test(s.nome)) ?? acha((s) => s.operacao === "SUBTRAI");
  const secDespesas = acha((s) => /despesa/i.test(s.nome)) ?? secCustos;
  const secaoDe = (conta: string): SecaoIn | undefined => {
    if (conta.startsWith("3.1.1.1.09") && secDeducoes) return secDeducoes;
    if (conta.startsWith("3.1") || conta.startsWith("3.4.1")) return secReceitas;
    if (conta.startsWith("3.2")) return secCustos;
    return secDespesas;
  };

  const porSecao = new Map<string, SecaoOut>();
  for (const s of secoes) porSecao.set(s.id, { id: s.id, nome: s.nome, operacao: s.operacao, contas: [], meses: z(), total: 0 });
  for (const c of linhas) {
    const sec = secaoDe(c.conta);
    const out = sec ? porSecao.get(sec.id) : undefined;
    if (!out) continue;
    const credora = out === porSecao.get(secReceitas?.id ?? "");
    // mensal do Dexion = débito − crédito; receita inverte.
    const meses = c.mensal.map((m) => r2(credora ? -m : m));
    const total = r2(meses.reduce((a, b) => a + b, 0));
    if (Math.abs(total) < 0.005 && meses.every((m) => Math.abs(m) < 0.005)) continue;
    const pai = c.conta.split(".").slice(0, -1).join(".");
    const sg = c.nivel === 5 ? { codigo: pai, nome: nomeDe.get(pai) ?? pai } : null;
    // Analíticas abaixo da linha (abrir mais um nível na DRE).
    const filhos: LinhaConta[] = analiticas
      .filter((a) => a.conta.startsWith(c.conta + "."))
      .map((a) => {
        const m = a.mensal.map((x) => r2(credora ? -x : x));
        return { id: `dexion:${a.conta}`, codigo: a.conta, nome: a.descricao, ordemDre: 0, meses: m, total: r2(m.reduce((p, q) => p + q, 0)), subgrupoCodigo: null, subgrupoNome: null };
      })
      .filter((f) => Math.abs(f.total) >= 0.005 || f.meses.some((m) => Math.abs(m) >= 0.005))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    out.contas.push({ id: `dexion:${c.conta}`, codigo: c.conta, nome: c.descricao, ordemDre: 0, meses, total, subgrupoCodigo: sg?.codigo ?? null, subgrupoNome: sg?.nome ?? null, filhos });
    for (let i = 0; i < 12; i++) out.meses[i] = r2(out.meses[i] + meses[i]);
    out.total = r2(out.total + total);
  }
  const secoesOut = Array.from(porSecao.values());
  for (const s of secoesOut) s.contas.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  return { secoes: secoesOut, ...cascata(secoesOut), codigoDexion: v.codigoDexion, atualizadoEm: cache.atualizadoEm, doCache: cache.doCache, erroAtualizacao: cache.erroAtualizacao ?? null };
}

