/**
 * Gera o relatório diário de movimentações de estoque formatado em MarkdownV2
 * para envio via Telegram.
 */

import { prisma } from "@/lib/prisma";
import { escMD } from "@/lib/telegram";

export interface RelatorioResult {
  text: string;
  totalMovimentacoes: number;
  isEmpty: boolean;
}

/**
 * Monta o relatório de movimentações para um dia específico.
 * @param date  Dia desejado (qualquer horário — usa início/fim do dia em UTC-3)
 */
export async function buildRelatorioEstoque(date: Date): Promise<RelatorioResult> {
  // Converter para início/fim do dia no fuso BRT (UTC-3)
  const BRT_OFFSET = -3 * 60 * 60 * 1000;
  const localMidnight = new Date(
    Math.floor((date.getTime() + (-BRT_OFFSET)) / 86_400_000) * 86_400_000 + BRT_OFFSET
  );
  const startOfDay = new Date(localMidnight.getTime());
  const endOfDay   = new Date(localMidnight.getTime() + 86_400_000 - 1);

  const movs = await prisma.movimentacaoEstoque.findMany({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      item:         { select: { codigo: true, descricao: true, unidadeMedida: true, unidade: { select: { sigla: true } } } },
      localEstoque: { select: { nome: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const dateLabel = startOfDay.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  if (movs.length === 0) {
    return {
      text: `📦 *Relatório de Estoque — ${escMD(dateLabel)}*\n\n_Nenhuma movimentação registrada neste dia\\._`,
      totalMovimentacoes: 0,
      isEmpty: true,
    };
  }

  // Agrupar por tipo
  const grupos: Record<string, typeof movs> = {
    ENTRADA:      [],
    SAIDA:        [],
    AJUSTE:       [],
    TRANSFERENCIA: [],
  };
  for (const m of movs) {
    (grupos[m.tipo] ?? grupos["ENTRADA"]).push(m);
  }

  const tipoMeta: Record<string, { icon: string; label: string }> = {
    ENTRADA:       { icon: "✅", label: "Entradas" },
    SAIDA:         { icon: "📤", label: "Saídas" },
    AJUSTE:        { icon: "🔧", label: "Ajustes" },
    TRANSFERENCIA: { icon: "🔄", label: "Transferências" },
  };

  const MAX_ITEMS_PER_GROUP = 20; // evitar mensagem muito longa

  const lines: string[] = [
    `📦 *Relatório de Estoque — ${escMD(dateLabel)}*`,
    ``,
  ];

  for (const tipo of ["ENTRADA", "SAIDA", "AJUSTE", "TRANSFERENCIA"]) {
    const grupo = grupos[tipo];
    if (!grupo || grupo.length === 0) continue;

    const meta = tipoMeta[tipo];
    lines.push(`${meta.icon} *${escMD(meta.label)}: ${grupo.length}*`);

    const exibir = grupo.slice(0, MAX_ITEMS_PER_GROUP);
    for (const m of exibir) {
      const unidade = m.item.unidade?.sigla ?? m.item.unidadeMedida ?? "un";
      const qty     = parseFloat(m.quantidade.toString())
        .toLocaleString("pt-BR", { maximumFractionDigits: 3 });
      const local   = m.localEstoque?.nome ? ` \\(${escMD(m.localEstoque.nome)}\\)` : "";
      const doc     = m.documento ? ` · ${escMD(m.documento)}` : "";
      lines.push(`• ${escMD(m.item.descricao)} — ${escMD(qty)} ${escMD(unidade)}${local}${doc}`);
    }

    if (grupo.length > MAX_ITEMS_PER_GROUP) {
      lines.push(`_\\.\\.\\. e mais ${grupo.length - MAX_ITEMS_PER_GROUP} itens_`);
    }

    lines.push(``);
  }

  lines.push(`\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-`);
  lines.push(`Total: *${movs.length}* movimentação${movs.length !== 1 ? "ões" : ""}`);

  return {
    text: lines.join("\n"),
    totalMovimentacoes: movs.length,
    isEmpty: false,
  };
}

/**
 * Tenta parsear uma data a partir de strings como "22/05/2026", "hoje", "ontem".
 * Retorna `null` se não conseguir parsear.
 */
export function parseRelatorioDate(arg: string): Date | null {
  const norm = arg.trim().toLowerCase();
  if (!norm || norm === "hoje") return new Date();
  if (norm === "ontem") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = norm.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year  = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const month = parseInt(m[2]) - 1;
    const day   = parseInt(m[1]);
    const d = new Date(year, month, day, 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
