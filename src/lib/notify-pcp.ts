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

// Detecta a etapa de Embalagem pelo nome (Embalar/Embalagem/Paletização).
const ehEmbalagem = (nome: string) => /embalag|embalar|paletiza/i.test(nome);

type ItemUnidadeConv = { fatorConversao: unknown; isPrincipal: boolean; unidade: { sigla: string; nome: string } };
/**
 * Converte uma quantidade da unidade DA OP para UN (base) e PLT (palete), usando o
 * cadastro de unidades DO PRÓPRIO PRODUTO (os fatores variam por produto). Retorna
 * null quando não dá pra converter (unidade da OP sem correspondência). PLT null
 * quando o produto não tem palete cadastrado.
 */
function converterUnPlt(qtd: number, unidadeOp: string | null | undefined, uns: ItemUnidadeConv[]): { un: number; plt: number | null } | null {
  if (!unidadeOp || !uns?.length) return null;
  const norm = (s: string) => (s ?? "").trim().toLowerCase();
  const alvo = norm(unidadeOp);
  const uOp = uns.find((u) => norm(u.unidade.sigla) === alvo || norm(u.unidade.nome) === alvo);
  if (!uOp) return null;
  const fatorOp = uOp.isPrincipal ? 1 : decimalToNumber(uOp.fatorConversao);
  if (!(fatorOp > 0)) return null;
  const un = qtd * fatorOp; // base do item (UN)
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
        item: { select: { descricao: true } }, _count: { select: { etapas: true } } },
    });
    if (!op) return;
    const produto = op.item?.descricao ?? "—";
    const qtd = fmtNum(decimalToNumber(op.quantidadePlanejada));
    const linhas = [
      `🏭 *Nova OP* — ${escMD(op.numero)}`,
      `📦 ${escMD(produto)}`,
      `🎯 Planejado: *${escMD(qtd)}* ${escMD(op.unidade ?? "")}`.trimEnd(),
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
      select: { nome: true, status: true, qtdEntrada: true, qtdSaida: true, qtdPerda: true, apontadoPor: true,
        ordemProducao: { select: { numero: true, unidade: true, item: { select: { descricao: true, itemUnidades: selItemUnidades } } } } },
    });
    if (!et) return;
    const op = et.ordemProducao;
    const saida = decimalToNumber(et.qtdSaida);
    const perda = decimalToNumber(et.qtdPerda);
    const concl = et.status === "CONCLUIDA";
    const emb = ehEmbalagem(et.nome); // na Embalagem, a perda é "quebra" + UN/PLT
    const un = op.unidade ?? "";
    // Na Embalagem, converte o produzido para UN e PLT pelo cadastro do produto.
    const conv = emb ? converterUnPlt(saida, op.unidade, op.item?.itemUnidades ?? []) : null;
    const linhaProd = saida > 0
      ? `📤 Produzido: *${escMD(fmtNum(saida))}* ${escMD(un)}`.trimEnd() +
        (conv ? ` \\(${escMD(fmtNum(conv.un))} UN${conv.plt != null ? ` · ${escMD(fmtNum(conv.plt))} PLT` : ""}\\)` : "")
      : null;
    const linhas = [
      `${concl ? "✅" : "📝"} *Apontamento* — ${escMD(op.numero)}`,
      `📦 ${escMD(op.item?.descricao ?? "—")}`,
      `🔧 Etapa: *${escMD(et.nome)}*${concl ? " \\(concluída\\)" : ""}`,
      linhaProd,
      perda > 0 ? `${emb ? "🧱 Quebra" : "♻️ Perda"}: ${escMD(fmtNum(perda))}` : null,
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
      nome: true, sequencia: true, qtdSaida: true, qtdPerda: true,
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
    // Agrupa por LOCAL DE OPERAÇÃO (a etapa: Preparação, Conformação, Secagem,
    // Queima, Embalar…). Unidade lida da OP; Embalagem também em UN e PLT.
    const grupos = new Map<string, typeof etapas>();
    for (const e of etapas) {
      const arr = grupos.get(e.nome) ?? [];
      arr.push(e); grupos.set(e.nome, arr);
    }
    for (const [etapaNome, itens] of Array.from(grupos.entries())) {
      linhas.push("", `📍 *${escMD(etapaNome)}*`);
      for (const e of itens) {
        const op = e.ordemProducao;
        const prod = decimalToNumber(e.qtdSaida);
        const un = op.unidade ?? "";
        let linha = `  • ${escMD(op.numero)} — ${escMD(op.item?.descricao ?? "—")}: *${escMD(fmtNum(prod))}* ${escMD(un)}`.trimEnd();
        if (ehEmbalagem(etapaNome)) {
          const conv = converterUnPlt(prod, op.unidade, op.item?.itemUnidades ?? []);
          if (conv) linha += ` \\= ${escMD(fmtNum(conv.un))} UN${conv.plt != null ? ` · ${escMD(fmtNum(conv.plt))} PLT` : ""}`;
          const quebra = decimalToNumber(e.qtdPerda);
          if (quebra > 0) linha += ` · 🧱 quebra ${escMD(fmtNum(quebra))}`;
        }
        linhas.push(linha);
      }
    }
  }

  await sendPcp({ text: linhas.join("\n") });
  return { ok: true, apontamentos: etapas.length };
}
