import { prismaSemEscopo } from "@/lib/prisma";
import { vincularNaturezaConta } from "@/lib/conta-contabil";
import type { NaturezaGrupo, NaturezaTipo } from "@prisma/client";

// ── Reestruturação do plano de naturezas financeiras — TRAMONTIN (jul/2026) ──
// Substitui o cadastro plano/duplicado por um plano hierárquico de 9 grupos com
// código ("2.04"). Princípio: a natureza diz "o que é"; o centro de custo diz
// "onde bate"; o destino contábil vem da precedência material_direto →
// capitaliza → centro. Nenhuma natureza nova carrega flag CIF nem sufixo
// "(fabril)".
//
// Regras:
//   • antigas NÃO são excluídas: ativo=false + sucessoraId (histórico intacto);
//   • títulos/lançamentos históricos NÃO são migrados;
//   • naturezas TRAVADAS (sistemaChave) nunca desativam — as chaves de encargo
//     MIGRAM para as naturezas novas do grupo 6 (o motor continua resolvendo
//     por chave); travadas sem equivalente (retenções/descontos) ficam como estão;
//   • defaults (Item.naturezaPadrao, recorrências ativas, DEs não concluídas)
//     são REMAPEADOS para a sucessora — senão o próximo lançamento nasceria
//     com natureza inativa e seria bloqueado.
// Idempotente: upsert por (empresaId, codigo); desativa só quem ainda está
// ativa; backups _bkp_nat_plano_20260720_* só na primeira aplicação real.

const EMP = "emp_tramontin";
const BKP = "_bkp_nat_plano_20260720";

// ── Os 9 grupos (viram NaturezaSubgrupo; o enum dá o eixo DRE/DFC) ───────────
const GRUPOS: { n: number; nome: string; grupo: NaturezaGrupo }[] = [
  { n: 1, nome: "1. Receitas", grupo: "RECEITA_OPERACIONAL" },
  { n: 2, nome: "2. Materiais e insumos", grupo: "CUSTO_OPERACIONAL" },
  { n: 3, nome: "3. Pessoal", grupo: "DESPESA_OPERACIONAL" },
  { n: 4, nome: "4. Serviços e utilidades", grupo: "DESPESA_OPERACIONAL" },
  { n: 5, nome: "5. Tributos", grupo: "DESPESA_OPERACIONAL" },
  { n: 6, nome: "6. Financeiras", grupo: "DESPESA_OPERACIONAL" },
  { n: 7, nome: "7. Investimento", grupo: "INVESTIMENTO" },
  { n: 8, nome: "8. Financiamento", grupo: "FINANCIAMENTO" },
  { n: 9, nome: "9. Movimentações internas", grupo: "MOVIMENTACAO_INTERNA" },
];

type DefNatureza = {
  codigo: string;
  nome: string;
  tipo: NaturezaTipo;
  // Conta de RESULTADO padrão (por código do plano contábil); null = TES/precedência resolve.
  contaResultado?: string;
  // Contrapartida patrimonial padrão (por código); sintéticas por-beneficiário são ok.
  contrapartida?: string;
  // Requisição de material lista esta natureza (grupo 2, exceto revenda/frete).
  requisitavel?: boolean;
};

const PLANO: DefNatureza[] = [
  // Grupo 1 — Receitas
  { codigo: "1.01", nome: "Venda de produção", tipo: "ENTRADA", contaResultado: "3.1.0002", contrapartida: "1.1.5" },
  { codigo: "1.02", nome: "Venda de revenda", tipo: "ENTRADA", contaResultado: "3.1.0002", contrapartida: "1.1.5" },
  { codigo: "1.03", nome: "Venda de serviços", tipo: "ENTRADA", contaResultado: "3.1.0003", contrapartida: "1.1.5" },
  { codigo: "1.04", nome: "Receitas financeiras", tipo: "ENTRADA" },
  { codigo: "1.05", nome: "Outras receitas", tipo: "ENTRADA" },
  // Grupo 2 — Materiais e insumos (destino via precedência/centro)
  { codigo: "2.01", nome: "Matéria-prima", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.02", nome: "Insumos de queima", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.03", nome: "Combustíveis e lubrificantes", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.04", nome: "Material de manutenção", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.05", nome: "Material de consumo", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.06", nome: "Material de segurança", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.07", nome: "Embalagens", tipo: "SAIDA", requisitavel: true },
  { codigo: "2.08", nome: "Mercadorias para revenda", tipo: "SAIDA", contaResultado: "3.2.0001" },
  { codigo: "2.09", nome: "Frete sobre compras", tipo: "SAIDA", contaResultado: "3.2.0002" },
  // Grupo 3 — Pessoal (compatível com a futura alimentação pela folha; sem integração agora)
  { codigo: "3.01", nome: "Salários e ordenados", tipo: "SAIDA", contrapartida: "2.1.6.0001" },
  { codigo: "3.02", nome: "Encargos sociais", tipo: "SAIDA" },
  { codigo: "3.03", nome: "Benefícios", tipo: "SAIDA" },
  { codigo: "3.04", nome: "Rescisões e verbas eventuais", tipo: "SAIDA" },
  // Grupo 4 — Serviços e utilidades
  { codigo: "4.01", nome: "Energia elétrica", tipo: "SAIDA", contaResultado: "3.3.0003", contrapartida: "2.1.8" },
  { codigo: "4.02", nome: "Água, telefone e internet", tipo: "SAIDA", contaResultado: "3.3.0003", contrapartida: "2.1.8" },
  { codigo: "4.03", nome: "Aluguel", tipo: "SAIDA", contaResultado: "3.3.0001", contrapartida: "2.1.8" },
  { codigo: "4.04", nome: "Serviços de terceiros", tipo: "SAIDA" },
  { codigo: "4.05", nome: "Frete sobre vendas", tipo: "SAIDA" },
  // Grupo 5 — Tributos
  { codigo: "5.01", nome: "Impostos sobre vendas", tipo: "SAIDA", contaResultado: "3.3.0004", contrapartida: "2.1.5.0001" },
  { codigo: "5.02", nome: "Impostos e taxas diversos", tipo: "SAIDA", contaResultado: "3.3.0004", contrapartida: "2.1.5.0001" },
  // Grupo 6 — Financeiras (as chaves de sistema migram para cá)
  { codigo: "6.01", nome: "Juros pagos", tipo: "SAIDA" },
  { codigo: "6.02", nome: "Tarifas bancárias", tipo: "SAIDA" },
  { codigo: "6.03", nome: "Taxa de cartão", tipo: "SAIDA" },
  { codigo: "6.04", nome: "Deságio de antecipação", tipo: "SAIDA" },
  { codigo: "6.05", nome: "Multas pagas", tipo: "SAIDA" },
  { codigo: "6.06", nome: "IOF", tipo: "SAIDA" },
  // Grupo 7 — Investimento (não afeta resultado)
  { codigo: "7.01", nome: "Compra de imobilizado", tipo: "SAIDA", contaResultado: "3.3.0002" },
  { codigo: "7.02", nome: "Venda de imobilizado", tipo: "ENTRADA" },
  // Grupo 8 — Financiamento (não afeta resultado)
  { codigo: "8.01", nome: "Captação de empréstimos", tipo: "ENTRADA", contaResultado: "3.1.0001" },
  { codigo: "8.02", nome: "Amortização de empréstimos", tipo: "SAIDA", contaResultado: "3.3.0005", contrapartida: "2.1.3.0001" },
  { codigo: "8.03", nome: "Contas de terceiros", tipo: "AMBOS", contrapartida: "1.1.6" },
  // Grupo 9 — Movimentações internas (não afeta resultado)
  { codigo: "9.01", nome: "Transferência entre contas", tipo: "AMBOS" },
];

// Chaves de natureza TRAVADA que migram da antiga para a natureza nova do plano.
const CHAVES_MIGRAR: { chave: string; codigo: string }[] = [
  { chave: "juros-pagos", codigo: "6.01" },
  { chave: "tarifa-bancaria", codigo: "6.02" },
  { chave: "taxa-cartao", codigo: "6.03" },
  { chave: "desagio-antecipacao", codigo: "6.04" },
  { chave: "multa-paga", codigo: "6.05" },
  { chave: "juros-recebidos", codigo: "1.04" },
];

// Mapeamento nome-antigo → código sucessor (match sem caixa/acentos).
const MAPA_SUCESSORA: [string, string][] = [
  ["Juros Recebidos", "1.04"],
  ["Venda de mercadorias", "1.01"],
  ["Venda de serviços", "1.03"],
  ["Combustível (produção)", "2.03"],
  ["Combustivel (producao)", "2.03"],
  ["Energia Elétrica (fabril)", "4.01"],
  ["Insumos de Queima", "2.02"],
  ["Material de segurança", "2.06"],
  ["Compra de mercadorias", "2.08"],
  ["Frete sobre compras", "2.09"],
  ["Insumos / matéria-prima", "2.01"],
  ["Abrasivos", "2.04"],
  ["Lubrificante", "2.04"],
  ["Material elétrico", "2.04"],
  ["Peças de reposição", "2.04"],
  ["Refratário", "2.04"],
  ["Solda", "2.04"],
  ["Deságio de Antecipação", "6.04"],
  ["Juros Pagos", "6.01"],
  ["Material de consumo geral", "2.05"],
  ["Material de escritório/TI", "2.05"],
  ["Material de escritório", "2.05"],
  ["Material de limpeza", "2.05"],
  ["Multa Paga", "6.05"],
  ["Tarifa Bancária", "6.02"],
  ["Taxa de Cartão", "6.03"],
  ["Aluguel", "4.03"],
  ["Energia, água e telefone", "4.01"],
  ["Impostos e taxas", "5.02"],
  ["Salários e encargos", "3.01"],
  ["Compra de imobilizado", "7.01"],
  ["Captação de empréstimos", "8.01"],
  ["Pagamento de empréstimos", "8.02"],
  ["Embalagens", "2.07"],
  ["EPI", "2.06"],
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type ResultadoPlano = {
  dry: boolean;
  gruposCriados: string[];
  criadas: string[];
  jaExistiam: string[];
  chavesMigradas: string[];
  desativadas: { nome: string; sucessora: string | null }[];
  semSucessora: string[];
  remapeadas: { itens: number; recorrencias: number; conferencias: number };
  avisos: string[];
};

export async function executarPlanoNaturezasTramontin(dry: boolean): Promise<ResultadoPlano> {
  const db = prismaSemEscopo;
  const out: ResultadoPlano = {
    dry, gruposCriados: [], criadas: [], jaExistiam: [], chavesMigradas: [],
    desativadas: [], semSucessora: [], remapeadas: { itens: 0, recorrencias: 0, conferencias: 0 }, avisos: [],
  };

  // Backup (só na primeira aplicação real).
  if (!dry) {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${BKP}_naturezas AS SELECT * FROM "NaturezaFinanceira" WHERE "empresaId" = '${EMP}'`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${BKP}_itens AS SELECT id, "naturezaPadraoId" FROM "Item" WHERE "naturezaPadraoId" IS NOT NULL`,
    );
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${BKP}_recorrencias AS SELECT id, "naturezaFinanceiraId" FROM "Recorrencia" WHERE "naturezaFinanceiraId" IS NOT NULL`,
    );
  }

  // ── 1. Grupos (NaturezaSubgrupo 1-9) ───────────────────────────────────────
  const subgrupoId = new Map<number, string>();
  for (const g of GRUPOS) {
    let sub = await db.naturezaSubgrupo.findFirst({ where: { empresaId: EMP, nome: g.nome } });
    if (!sub) {
      out.gruposCriados.push(g.nome);
      if (!dry) {
        sub = await db.naturezaSubgrupo.create({ data: { empresaId: EMP, nome: g.nome, grupo: g.grupo, ordem: g.n } });
      }
    }
    if (sub) subgrupoId.set(g.n, sub.id);
  }

  // ── 2. Naturezas do plano (upsert por codigo) ──────────────────────────────
  const porCodigo = new Map<string, string>(); // codigo → id
  for (const def of PLANO) {
    const n = parseInt(def.codigo.split(".")[0], 10);
    const g = GRUPOS.find((x) => x.n === n)!;
    let nat = await db.naturezaFinanceira.findFirst({ where: { empresaId: EMP, codigo: def.codigo } });
    if (nat) {
      out.jaExistiam.push(`${def.codigo} ${def.nome}`);
      // Rerun completa vínculos que faltaram (ex.: conta criada depois do 1º apply).
      if (!dry) {
        if (def.contrapartida && !nat.contaContrapartidaId) {
          const cp = await db.contaContabil.findFirst({ where: { empresaId: EMP, codigo: def.contrapartida }, select: { id: true } });
          if (cp) await db.naturezaFinanceira.update({ where: { id: nat.id }, data: { contaContrapartidaId: cp.id } });
          else out.avisos.push(`Contrapartida ${def.contrapartida} não encontrada (${def.codigo})`);
        }
        if (def.contaResultado) {
          const temResultado = await db.contaContabil.count({ where: { empresaId: EMP, naturezaFinanceiraId: nat.id } });
          if (temResultado === 0) {
            const conta = await db.contaContabil.findFirst({ where: { empresaId: EMP, codigo: def.contaResultado }, select: { id: true } });
            if (conta) await vincularNaturezaConta(EMP, nat.id, conta.id);
            else out.avisos.push(`Conta ${def.contaResultado} não encontrada (${def.codigo})`);
          }
        }
      }
    } else {
      out.criadas.push(`${def.codigo} ${def.nome}`);
      if (!dry) {
        const contrapartida = def.contrapartida
          ? await db.contaContabil.findFirst({ where: { empresaId: EMP, codigo: def.contrapartida }, select: { id: true } })
          : null;
        if (def.contrapartida && !contrapartida) out.avisos.push(`Contrapartida ${def.contrapartida} não encontrada (${def.codigo})`);
        nat = await db.naturezaFinanceira.create({
          data: {
            empresaId: EMP,
            codigo: def.codigo,
            nome: def.nome,
            tipo: def.tipo,
            grupo: g.grupo,
            subgrupoId: subgrupoId.get(n) ?? null,
            afetaResultado: n < 7,
            aplicavelRequisicao: def.requisitavel === true,
            cif: false,
            ordem: Math.round(parseFloat(def.codigo.replace(".", "")) || 0),
          },
        });
        if (def.contaResultado) {
          const conta = await db.contaContabil.findFirst({ where: { empresaId: EMP, codigo: def.contaResultado }, select: { id: true } });
          if (conta) await vincularNaturezaConta(EMP, nat.id, conta.id);
          else out.avisos.push(`Conta ${def.contaResultado} não encontrada (${def.codigo})`);
        }
      }
    }
    if (nat) porCodigo.set(def.codigo, nat.id);
  }

  // ── 3. Chaves de sistema migram para as naturezas novas ────────────────────
  for (const m of CHAVES_MIGRAR) {
    const nova = porCodigo.get(m.codigo);
    const antiga = await db.naturezaFinanceira.findFirst({
      where: { empresaId: EMP, sistemaChave: m.chave },
      select: { id: true, nome: true },
    });
    if (!antiga) { out.avisos.push(`Chave ${m.chave} não existe na empresa — nada a migrar`); continue; }
    if (antiga.id === nova) continue; // já migrada
    out.chavesMigradas.push(`${m.chave}: ${antiga.nome} → ${m.codigo}`);
    if (!dry && nova) {
      await db.naturezaFinanceira.update({ where: { id: antiga.id }, data: { sistemaChave: null, sistema: false } });
      await db.naturezaFinanceira.update({ where: { id: nova }, data: { sistema: true, sistemaChave: m.chave } });
    }
  }

  // ── 4. Desativação das antigas + sucessora ─────────────────────────────────
  const mapa = new Map(MAPA_SUCESSORA.map(([nome, cod]) => [norm(nome), cod]));
  const antigas = await db.naturezaFinanceira.findMany({
    where: { empresaId: EMP, codigo: null, ativo: true, sistema: false },
    select: { id: true, nome: true },
  });
  const sucessoraDe = new Map<string, string>(); // antigaId → sucessoraId
  for (const a of antigas) {
    const cod = mapa.get(norm(a.nome));
    const sucId = cod ? porCodigo.get(cod) ?? null : null;
    out.desativadas.push({ nome: a.nome, sucessora: cod ?? null });
    if (!cod) out.semSucessora.push(a.nome);
    if (sucId) sucessoraDe.set(a.id, sucId);
    if (!dry) {
      await db.naturezaFinanceira.update({ where: { id: a.id }, data: { ativo: false, sucessoraId: sucId } });
    }
  }

  // ── 5. Remap de DEFAULTS (não é histórico): item, recorrência ativa, DE aberto
  for (const [antigaId, sucId] of Array.from(sucessoraDe.entries())) {
    if (dry) {
      out.remapeadas.itens += await db.item.count({ where: { naturezaPadraoId: antigaId } });
      out.remapeadas.recorrencias += await db.recorrencia.count({ where: { naturezaFinanceiraId: antigaId, ativo: true } });
      out.remapeadas.conferencias += await db.conferenciaCompra.count({
        where: { naturezaFinanceiraId: antigaId, status: { in: ["PENDENTE", "EM_CONFERENCIA"] } },
      });
    } else {
      const i = await db.item.updateMany({ where: { naturezaPadraoId: antigaId }, data: { naturezaPadraoId: sucId } });
      const r = await db.recorrencia.updateMany({ where: { naturezaFinanceiraId: antigaId, ativo: true }, data: { naturezaFinanceiraId: sucId } });
      const c = await db.conferenciaCompra.updateMany({
        where: { naturezaFinanceiraId: antigaId, status: { in: ["PENDENTE", "EM_CONFERENCIA"] } },
        data: { naturezaFinanceiraId: sucId },
      });
      out.remapeadas.itens += i.count;
      out.remapeadas.recorrencias += r.count;
      out.remapeadas.conferencias += c.count;
    }
  }

  return out;
}
