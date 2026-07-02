// Notificações de PCP no Telegram — usa o MESMO bot principal (Compras_TRM_Bot),
// enviando ao GRUPO do PCP (chat em `tg_chat_pcp`, como o canal de estoque usa
// `tg_chat_estoque`). Notifica: criação de OP, apontamento de etapa e resumo diário.
// Tudo best-effort (nunca lança / bloqueia o fluxo).
import { prisma } from "@/lib/prisma";
import { sendTelegramChannel, escMD, type TGMessage } from "@/lib/telegram";
import { decimalToNumber } from "@/lib/utils";

async function sendPcp(msg: TGMessage): Promise<void> {
  await sendTelegramChannel("tg_chat_pcp", msg).catch(() => {}); // silencioso se não configurado
}

const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Detecta a etapa de Embalagem pelo nome (Embalar/Embalagem/Paletização).
const ehEmbalagem = (nome: string) => /embalag|embalar|paletiza/i.test(nome);

// Ordem canônica das etapas no resumo (fluxo produtivo, do começo ao fim). Etapas
// fora dessa lista vão para o final, em ordem alfabética.
const ORDEM_ETAPAS = ["mistura", "prepar", "conform", "secagem", "queima", "embal", "paletiz"];
const ordemEtapa = (nome: string): number => {
  const n = nome.toLowerCase();
  const i = ORDEM_ETAPAS.findIndex((k) => n.includes(k));
  return i === -1 ? ORDEM_ETAPAS.length : i;
};

type ItemUnidadeConv = { fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string; nome: string } };
/**
 * Unidade de exibição = unidade PRINCIPAL do item (a mesma que a tela da OP mostra).
 * O campo `op.unidade` é texto livre e hoje o backend grava sempre "milheiro" (default
 * na criação), então NÃO é confiável — a fonte da verdade é o cadastro do item.
 * Cai para o fallback (op.unidade) só quando o item não tem unidade cadastrada.
 */
function unidadeItem(uns: ItemUnidadeConv[], fallback?: string | null): string {
  const p = uns?.find((u) => u.isPrincipal) ?? uns?.[0];
  return p?.unidade?.sigla || (fallback ?? "");
}
/**
 * Converte a quantidade produzida (na unidade PRINCIPAL do item) para UN (base) e PLT
 * (palete), usando o cadastro de unidades DO PRÓPRIO PRODUTO. PLT fica null quando o
 * produto não tem palete cadastrado.
 */
function converterUnPlt(qtd: number, uns: ItemUnidadeConv[]): { un: number; plt: number | null } | null {
  if (!uns?.length) return null;
  const p = uns.find((u) => u.isPrincipal) ?? uns[0];
  const fatorP = decimalToNumber(p?.fatorConversao) || 1; // principal costuma ser a base (fator 1)
  const un = qtd * fatorP; // base do item (UN)
  const uPlt = uns.find((u) => /plt|palete/i.test(u.unidade.sigla) || /palete/i.test(u.unidade.nome));
  const fatorPlt = uPlt ? decimalToNumber(uPlt.fatorConversao) : 0;
  return { un, plt: fatorPlt > 0 ? un / fatorPlt : null };
}
const selItemUnidades = { select: { fatorConversao: true, isPrincipal: true, unidade: { select: { sigla: true, nome: true } } } } as const;
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Intervalo [00:00, 24:00) do dia corrente em America/Sao_Paulo (UTC-3), em UTC. */
function rangeHojeSP(): { ini: Date; fim: Date } {
  const d = hojeSP(); // YYYY-MM-DD
  return { ini: new Date(`${d}T00:00:00-03:00`), fim: new Date(`${d}T23:59:59.999-03:00`) };
}

// ── Criação de OP ─────────────────────────────────────────────────────────────
export async function notifyOpCriada(ordemId: string): Promise<void> {
  try {
    const op = await prisma.ordemProducao.findUnique({
      where: { id: ordemId },
      select: { numero: true, quantidadePlanejada: true, unidade: true, criadoPor: true,
        item: { select: { descricao: true, itemUnidades: selItemUnidades } }, _count: { select: { etapas: true } } },
    });
    if (!op) return;
    const produto = op.item?.descricao ?? "—";
    const un = unidadeItem(op.item?.itemUnidades ?? [], op.unidade);
    const qtd = fmtNum(decimalToNumber(op.quantidadePlanejada));
    const linhas = [
      `🏭 *Nova OP* — ${escMD(op.numero)}`,
      `📦 ${escMD(produto)}`,
      `🎯 Planejado: *${escMD(qtd)}* ${escMD(un)}`.trimEnd(),
      `🔧 ${op._count.etapas} etapa${op._count.etapas === 1 ? "" : "s"}`,
      op.criadoPor ? `👤 ${escMD(op.criadoPor)}` : null,
    ].filter(Boolean) as string[];
    await sendPcp({ text: linhas.join("\n") });
  } catch { /* best-effort */ }
}

// ── Apontamento de etapa ──────────────────────────────────────────────────────
export async function notifyApontamentoPcp(etapaId: string): Promise<void> {
  try {
    const et = await prisma.itemOrdemProducao.findUnique({
      where: { id: etapaId },
      select: { nome: true, status: true, qtdEntrada: true, qtdSaida: true, qtdPerda: true, vagoes: true, vagonetas: true, apontadoPor: true,
        ordemProducao: { select: { numero: true, unidade: true, item: { select: { descricao: true, itemUnidades: selItemUnidades } } } } },
    });
    if (!et) return;
    const op = et.ordemProducao;
    const saida = decimalToNumber(et.qtdSaida);
    const perda = decimalToNumber(et.qtdPerda);
    const concl = et.status === "CONCLUIDA";
    const emb = ehEmbalagem(et.nome); // na Embalagem, a perda é "quebra" + UN/PLT
    const un = unidadeItem(op.item?.itemUnidades ?? [], op.unidade); // unidade principal do item
    // Na Embalagem, converte o produzido para UN e PLT pelo cadastro do produto.
    const conv = emb ? converterUnPlt(saida, op.item?.itemUnidades ?? []) : null;
    const linhaProd = saida > 0
      ? `📤 Produzido: *${escMD(fmtNum(saida))}* ${escMD(un)}`.trimEnd() +
        (conv ? ` \\(${escMD(fmtNum(conv.un))} UN${conv.plt != null ? ` · ${escMD(fmtNum(conv.plt))} PLT` : ""}\\)` : "")
      : null;
    // Na Embalagem: quebra com % (perda/descarregado) e vagões descarregados.
    const desc = saida + perda; // descarregado = apontado + quebra
    const linhaQuebra = perda > 0 || emb
      ? (emb
          ? `🧱 Quebra: ${escMD(fmtNum(perda))} un${desc > 0 ? ` \\(${escMD(fmtPct((perda / desc) * 100))}%\\)` : ""}`
          : (perda > 0 ? `♻️ Perda: ${escMD(fmtNum(perda))}` : null))
      : null;
    const linhas = [
      `${concl ? "✅" : "📝"} *Apontamento* — ${escMD(op.numero)}`,
      `📦 ${escMD(op.item?.descricao ?? "—")}`,
      `🔧 Etapa: *${escMD(et.nome)}*${concl ? " \\(concluída\\)" : ""}`,
      linhaProd,
      emb && et.vagoes != null ? `🚃 Vagões descarregados: ${escMD(String(et.vagoes))}` : null,
      linhaQuebra,
      et.apontadoPor ? `👤 ${escMD(et.apontadoPor)}` : null,
    ].filter(Boolean) as string[];
    await sendPcp({ text: linhas.join("\n") });
  } catch { /* best-effort */ }
}

// ── Resumo diário (19h BRT via cron) ──────────────────────────────────────────
// Baseado nos APONTAMENTOS (resultado real do dia), não no planejado: cada linha é
// uma etapa concluída de uma OP (etapa produtiva + produzido). Na Embalagem, a
// perda aparece como "quebra". Fecha com o total por etapa.
export async function enviarResumoPcpDia(): Promise<{ ok: boolean; apontamentos: number }> {
  const { ini, fim } = rangeHojeSP();

  const etapas = await prisma.itemOrdemProducao.findMany({
    where: { status: "CONCLUIDA", fimReal: { gte: ini, lte: fim } },
    select: {
      nome: true, sequencia: true, qtdSaida: true, qtdPerda: true, vagoes: true, vagonetas: true,
      ordemProducao: { select: { numero: true, unidade: true, item: { select: { descricao: true, itemUnidades: selItemUnidades } } } },
    },
    orderBy: [{ nome: "asc" }, { ordemProducao: { numero: "asc" } }],
  });

  const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const linhas: string[] = [`📊 *Resumo do PCP* — ${escMD(dataBR)} \\(apontamentos\\)`, ""];
  linhas.push(`✅ Apontamentos concluídos: *${etapas.length}*`);

  if (etapas.length === 0) {
    linhas.push("", "_Nenhum apontamento concluído hoje\\._");
  } else {
    // Agrupa por LOCAL DE OPERAÇÃO (a etapa) e ordena pelo fluxo produtivo:
    // Mistura de insumos → Preparação → Conformação → Secagem → Queima → Embalagem.
    const grupos = new Map<string, typeof etapas>();
    for (const e of etapas) {
      const arr = grupos.get(e.nome) ?? [];
      arr.push(e); grupos.set(e.nome, arr);
    }
    const ordenados = Array.from(grupos.entries()).sort(
      (a, b) => ordemEtapa(a[0]) - ordemEtapa(b[0]) || a[0].localeCompare(b[0])
    );
    for (const [etapaNome, itens] of ordenados) {
      linhas.push("", `📍 *${escMD(etapaNome)}*`);
      for (const e of itens) {
        const op = e.ordemProducao;
        const prod = decimalToNumber(e.qtdSaida);
        const produto = op.item?.descricao ?? "—";
        if (ehEmbalagem(etapaNome)) {
          // Embalagem: paletes produzidos, vagões descarregados, quebra unitária e %.
          const conv = converterUnPlt(prod, op.item?.itemUnidades ?? []);
          const cab = conv?.plt != null
            ? `*${escMD(fmtNum(conv.plt))} PLT* \\(${escMD(fmtNum(conv.un))} UN\\)`
            : `*${escMD(fmtNum(prod))}* ${escMD(unidadeItem(op.item?.itemUnidades ?? [], op.unidade))}`;
          linhas.push(`  • ${escMD(op.numero)} — ${escMD(produto)}: ${cab}`.trimEnd());
          if (e.vagoes != null) linhas.push(`      🚃 vagões descarregados: ${escMD(String(e.vagoes))}`);
          const quebra = decimalToNumber(e.qtdPerda);
          const desc = prod + quebra; // descarregado = apontado + quebra
          const pct = desc > 0 ? (quebra / desc) * 100 : 0;
          linhas.push(`      🧱 quebra: ${escMD(fmtNum(quebra))} un${desc > 0 ? ` \\(${escMD(fmtPct(pct))}%\\)` : ""}`);
        } else {
          const un = unidadeItem(op.item?.itemUnidades ?? [], op.unidade); // unidade principal do item
          linhas.push(`  • ${escMD(op.numero)} — ${escMD(produto)}: *${escMD(fmtNum(prod))}* ${escMD(un)}`.trimEnd());
        }
      }
    }
  }

  await sendPcp({ text: linhas.join("\n") });
  return { ok: true, apontamentos: etapas.length };
}
