import { Prisma } from "@prisma/client";
import { prisma, prismaSemEscopo } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Cadastro de ativos da Manutenção (ManutAtivo — docs/manutencao-prd.md §4.1).
// Validação única do formulário (POST/PATCH) e geração do codApl.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_ATIVO = ["LOCAL", "EQUIPAMENTO", "COMPONENTE", "VEICULO"] as const;
export type TipoAtivo = (typeof TIPOS_ATIVO)[number];

export class ErroAtivo extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function id(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function data(v: unknown, campo: string): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v));
  if (isNaN(d.getTime())) throw new ErroAtivo(`${campo} inválida.`);
  return d;
}
function inteiro(v: unknown, campo: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ErroAtivo(`${campo} inválido.`);
  return n;
}

/** Campos editáveis da ficha (texto livre e FKs). */
type CampoAtivo =
  | "tag" | "nome" | "tipo" | "paiId" | "familiaId" | "localizacao" | "setorId" | "centroCustoId" | "imobilizadoId" | "fornecedorId" | "fabricante" | "modelo" | "numeroSerie" | "numeroPatrimonio" | "placa" | "anoFabricacao" | "dataAquisicao" | "garantiaAte" | "observacoes" | "ativo";

/**
 * Converte o corpo do POST/PATCH em dados do Prisma. Em PATCH (`atualId`), só
 * os campos presentes no corpo são alterados. Valida: tag única por empresa,
 * tipo, pai da mesma empresa e sem ciclo (o pai não pode ser o próprio ativo
 * nem um descendente dele).
 */
export async function dadosDoAtivo(
  body: Record<string, unknown>,
  atualId?: string,
): Promise<Prisma.ManutAtivoUncheckedUpdateInput> {
  const out: Prisma.ManutAtivoUncheckedUpdateInput = {};
  const tem = (k: CampoAtivo) => !atualId || k in body;

  if (tem("tag")) {
    const tag = texto(body.tag)?.toUpperCase() ?? null;
    if (!tag) throw new ErroAtivo("Informe a tag do ativo.");
    const dup = await prisma.manutAtivo.findFirst({
      where: { tag, ...(atualId ? { id: { not: atualId } } : {}) },
      select: { nome: true },
    });
    if (dup) throw new ErroAtivo(`A tag ${tag} já é usada por "${dup.nome}".`, 409);
    out.tag = tag;
  }
  if (tem("nome")) {
    const nome = texto(body.nome);
    if (!nome) throw new ErroAtivo("Informe o nome do ativo.");
    out.nome = nome;
  }
  if (tem("tipo")) {
    const tipo = texto(body.tipo) ?? "EQUIPAMENTO";
    if (!(TIPOS_ATIVO as readonly string[]).includes(tipo)) throw new ErroAtivo("Tipo inválido.");
    out.tipo = tipo;
  }
  if (tem("paiId")) {
    const paiId = id(body.paiId);
    if (paiId) {
      if (paiId === atualId) throw new ErroAtivo("O ativo não pode ser pai dele mesmo.");
      const pai = await prisma.manutAtivo.findUnique({ where: { id: paiId }, select: { id: true } });
      if (!pai) throw new ErroAtivo("Ativo pai não encontrado nesta empresa.");
      if (atualId) {
        // sobe a árvore a partir do pai: se cruzar o próprio ativo, seria ciclo
        const todos = await prisma.manutAtivo.findMany({ select: { id: true, paiId: true } });
        const paiDe = new Map(todos.map((a) => [a.id, a.paiId]));
        let cur: string | null | undefined = paiId;
        const vistos = new Set<string>();
        while (cur && !vistos.has(cur)) {
          if (cur === atualId) throw new ErroAtivo("O pai escolhido está abaixo deste ativo na árvore.");
          vistos.add(cur);
          cur = paiDe.get(cur);
        }
      }
    }
    out.paiId = paiId;
  }
  if (tem("familiaId")) out.familiaId = id(body.familiaId);
  if (tem("setorId")) out.setorId = id(body.setorId);
  if (tem("centroCustoId")) out.centroCustoId = id(body.centroCustoId);
  if (tem("imobilizadoId")) out.imobilizadoId = id(body.imobilizadoId);
  if (tem("fornecedorId")) out.fornecedorId = id(body.fornecedorId);
  for (const k of ["localizacao", "fabricante", "modelo", "numeroSerie", "numeroPatrimonio", "placa", "observacoes"] as const) {
    if (tem(k)) out[k] = texto(body[k]);
  }
  if (tem("placa") && typeof out.placa === "string") out.placa = out.placa.toUpperCase();
  if (tem("anoFabricacao")) {
    const ano = inteiro(body.anoFabricacao, "Ano de fabricação");
    if (ano != null && (ano < 1900 || ano > 2100)) throw new ErroAtivo("Ano de fabricação inválido.");
    out.anoFabricacao = ano;
  }
  if (tem("dataAquisicao")) out.dataAquisicao = data(body.dataAquisicao, "Data de aquisição");
  if (tem("garantiaAte")) out.garantiaAte = data(body.garantiaAte, "Data de garantia");
  if (atualId && "ativo" in body) out.ativo = body.ativo !== false;

  // FKs de cadastros escopados: confere que pertencem à empresa ativa.
  const confere = async (valor: unknown, achar: (v: string) => Promise<unknown>, nome: string) => {
    if (typeof valor === "string" && !(await achar(valor))) throw new ErroAtivo(`${nome} não encontrado nesta empresa.`);
  };
  await confere(out.centroCustoId, (v) => prisma.centroCusto.findUnique({ where: { id: v }, select: { id: true } }), "Centro de custo");
  await confere(out.imobilizadoId, (v) => prisma.imobilizado.findUnique({ where: { id: v }, select: { id: true } }), "Imobilizado");

  return out;
}

/**
 * Próximo codApl (global, não por empresa): continua a numeração do Engeman.
 * Considera também as tabelas que referenciam codApl para não herdar
 * criticidade/regime/fechamento de um código antigo.
 */
export async function proximoCodApl(): Promise<number> {
  const [a, c, r, f] = await Promise.all([
    prismaSemEscopo.manutAtivo.aggregate({ _max: { codApl: true } }),
    prismaSemEscopo.ativoCriticidade.aggregate({ _max: { codApl: true } }),
    prismaSemEscopo.ativoRegime.aggregate({ _max: { codApl: true } }),
    prismaSemEscopo.fechamentoMtbf.aggregate({ _max: { codApl: true } }),
  ]);
  return Math.max(0, a._max.codApl ?? 0, c._max.codApl ?? 0, r._max.codApl ?? 0, f._max.codApl ?? 0) + 1;
}
