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
        ordemProducao: { select: { numero: true, item: { select: { descricao: true } } } } },
    });
    if (!et) return;
    const op = et.ordemProducao;
    const saida = decimalToNumber(et.qtdSaida);
    const perda = decimalToNumber(et.qtdPerda);
    const concl = et.status === "CONCLUIDA";
    const linhas = [
      `${concl ? "✅" : "📝"} *Apontamento* — ${escMD(op.numero)}`,
      `📦 ${escMD(op.item?.descricao ?? "—")}`,
      `🔧 Etapa: *${escMD(et.nome)}*${concl ? " \\(concluída\\)" : ""}`,
      saida > 0 ? `📤 Produzido: *${escMD(fmtNum(saida))}*` : null,
      perda > 0 ? `♻️ Perda: ${escMD(fmtNum(perda))}` : null,
      et.apontadoPor ? `👤 ${escMD(et.apontadoPor)}` : null,
    ].filter(Boolean) as string[];
    await sendPcp({ text: linhas.join("\n") });
  } catch { /* best-effort */ }
}

// ── Resumo diário (19h BRT via cron) ──────────────────────────────────────────
export async function enviarResumoPcpDia(): Promise<{ ok: boolean; opsCriadas: number; etapasConcluidas: number }> {
  const { ini, fim } = rangeHojeSP();

  const [opsCriadas, etapasConcluidas] = await Promise.all([
    prisma.ordemProducao.findMany({
      where: { createdAt: { gte: ini, lte: fim } },
      select: { numero: true, quantidadePlanejada: true, unidade: true, item: { select: { descricao: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.itemOrdemProducao.findMany({
      where: { status: "CONCLUIDA", fimReal: { gte: ini, lte: fim } },
      select: { nome: true, qtdSaida: true, qtdPerda: true,
        ordemProducao: { select: { numero: true, item: { select: { descricao: true } } } } },
    }),
  ]);

  const totalProduzido = etapasConcluidas.reduce((s, e) => s + decimalToNumber(e.qtdSaida), 0);
  const totalPerda = etapasConcluidas.reduce((s, e) => s + decimalToNumber(e.qtdPerda), 0);

  // Produção por produto (das etapas concluídas hoje).
  const porProduto = new Map<string, number>();
  for (const e of etapasConcluidas) {
    const p = e.ordemProducao.item?.descricao ?? "—";
    porProduto.set(p, (porProduto.get(p) ?? 0) + decimalToNumber(e.qtdSaida));
  }

  const dataBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

  const linhas: string[] = [`📊 *Resumo do PCP* — ${escMD(dataBR)}`, ""];
  linhas.push(`🏭 OPs criadas: *${opsCriadas.length}*`);
  for (const op of opsCriadas.slice(0, 15)) {
    linhas.push(`  • ${escMD(op.numero)} — ${escMD(op.item?.descricao ?? "—")} \\(${escMD(fmtNum(decimalToNumber(op.quantidadePlanejada)))} ${escMD(op.unidade ?? "")}\\)`.trimEnd());
  }
  if (opsCriadas.length > 15) linhas.push(`  …e mais ${opsCriadas.length - 15}`);
  linhas.push("");
  linhas.push(`✅ Etapas concluídas: *${etapasConcluidas.length}*`);
  linhas.push(`📤 Produzido: *${escMD(fmtNum(totalProduzido))}*`);
  if (totalPerda > 0) linhas.push(`♻️ Perda: ${escMD(fmtNum(totalPerda))}`);
  if (porProduto.size > 0) {
    linhas.push("");
    linhas.push("*Por produto:*");
    for (const [p, q] of Array.from(porProduto.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      linhas.push(`  • ${escMD(p)}: ${escMD(fmtNum(q))}`);
    }
  }

  await sendPcp({ text: linhas.join("\n") });
  return { ok: true, opsCriadas: opsCriadas.length, etapasConcluidas: etapasConcluidas.length };
}
