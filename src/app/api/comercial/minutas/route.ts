export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { minutaCreateSchema } from "@/lib/validations/minuta";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";

// ── GET /api/comercial/minutas ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const pedidoVendaId = searchParams.get("pedidoVendaId");
    const status = searchParams.get("status");
    const dataFrom = searchParams.get("dataFrom");
    const dataTo = searchParams.get("dataTo");
    const semData = searchParams.get("semData"); // minutas sem dataEntrega (pendentes de agendamento)

    // Filtro por dataEntrega prevista (usado pela Agenda de Entregas).
    const dataEntregaFilter =
      semData === "true"
        ? { dataEntrega: null }
        : dataFrom || dataTo
        ? {
            dataEntrega: {
              ...(dataFrom ? { gte: new Date(dataFrom) } : {}),
              ...(dataTo ? { lte: new Date(dataTo) } : {}),
            },
          }
        : {};

    const minutas = await prisma.minuta.findMany({
      where: {
        ...(pedidoVendaId ? { pedidoVendaId } : {}),
        ...(status ? { status: status as never } : {}),
        ...dataEntregaFilter,
      },
      include: {
        pedidoVenda: {
          select: {
            id: true,
            numero: true,
            numeroOrcamento: true,
            // Entrega de venda à ordem: este pedido é o "pedido de entrega" da
            // origem; pedidoVendaOrigem aponta para a venda comercial.
            pedidoVendaOrigem: {
              select: { id: true, numero: true, empresa: { select: { razaoSocial: true, nomeFantasia: true } } },
            },
            cliente: {
              select: {
                id: true,
                razaoSocial: true,
                nomeFantasia: true,
                cidade: true,
                bairro: true,
                logradouro: true,
                numero: true,
                estado: true,
                telefone: true,
                celular: true,
              },
            },
          },
        },
        localEstoque: { select: { id: true, nome: true } },
        motorista: { select: { id: true, nome: true } },
        itens: {
          include: {
            item: { select: { id: true, codigo: true, descricao: true } },
            unidade: { select: { id: true, sigla: true, nome: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: minutas });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Assinatura do conteúdo da minuta (itens+quantidades) p/ detectar duplicata exata.
function assinaturaItens(itens: { pedidoVendaItemId: string; quantidade: unknown }[]): string {
  return itens.map((i) => `${i.pedidoVendaItemId}:${Number(i.quantidade)}`).sort().join("|");
}

// Valida sobre-entrega: qtd de cada item ≤ pendente do pedido (pedida − em minutas
// ativas). Usada duas vezes: pre-check (resposta rápida, sem queimar numeração) e
// DENTRO da transação com o pedido travado (autoritativa — duas requisições
// simultâneas não passam juntas).
function erroSobreEntrega(
  itensPedido: { id: string; quantidade: unknown; item: { descricao: string }; minutaItens: { quantidade: unknown }[] }[],
  itensReq: { pedidoVendaItemId: string; quantidade: unknown }[],
): { status: number; error: string } | null {
  const EPS = 1e-6;
  const porPvi = new Map(itensPedido.map((i) => [i.id, {
    descricao: i.item.descricao,
    pendente: Number(i.quantidade) - i.minutaItens.reduce((s, mi) => s + Number(mi.quantidade), 0),
  }]));
  const pedidaPorPvi = new Map<string, number>();
  for (const it of itensReq) {
    pedidaPorPvi.set(it.pedidoVendaItemId, (pedidaPorPvi.get(it.pedidoVendaItemId) ?? 0) + Number(it.quantidade));
  }
  const excessos: string[] = [];
  for (const [pviId, qtd] of Array.from(pedidaPorPvi)) {
    const alvo = porPvi.get(pviId);
    if (!alvo) return { status: 422, error: "Item não pertence ao pedido de venda." };
    if (qtd > alvo.pendente + EPS) excessos.push(`${alvo.descricao} (pendente ${alvo.pendente}, minuta ${qtd})`);
  }
  if (excessos.length > 0) {
    return { status: 422, error: `Quantidade maior que o saldo pendente de entrega: ${excessos.join("; ")}.` };
  }
  return null;
}

// Erros de negócio lançados de dentro da transação (rollback + resposta tipada).
class MinutaDuplicadaError extends Error {
  constructor(public numero: string, public criadaEm: Date) { super("Minuta idêntica recém-criada"); }
}
class SobreEntregaError extends Error {
  constructor(public payload: { status: number; error: string }) { super(payload.error); }
}

// ── POST /api/comercial/minutas ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireModulo("comercial");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    const { numeroFisico, localEstoqueId, motoristaId, tipo, dataEntrega, placa, observacoes } = body;

    // Valida o que vira movimentação de estoque (ids e quantidades dos itens).
    const parsed = minutaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const { pedidoVendaId, itens } = parsed.data;
    // A minuta nasce PENDENTE e NÃO baixa estoque na criação. O Local de Estoque é
    // opcional aqui: a baixa só ocorre ao "Marcar saída" (PENDENTE→SAIU_PARA_ENTREGA),
    // quando o local passa a ser exigido. Se informado agora, fica guardado p/ essa etapa.

    // Multiempresa: a minuta herda a empresa do pedido de venda; numeração dela.
    const pedidoOrigem = await prisma.pedidoVenda.findUnique({
      where: { id: pedidoVendaId },
      select: {
        empresaId: true, estoqueOrigemEmpresaId: true, status: true,
        itens: {
          select: {
            id: true, quantidade: true,
            item: { select: { descricao: true } },
            // Já comprometido em minutas ativas (inclui ENTREGUE; exclui canceladas).
            minutaItens: { where: { minuta: { status: { not: "CANCELADA" } } }, select: { quantidade: true } },
          },
        },
      },
    });
    if (!pedidoOrigem) {
      return NextResponse.json({ error: "Pedido de venda não encontrado" }, { status: 404 });
    }
    // Pedido encerrado não recebe novas minutas (e não pode ser "ressuscitado").
    if (pedidoOrigem.status === "CANCELADO" || pedidoOrigem.status === "CONCLUIDO") {
      return NextResponse.json(
        { error: `Pedido ${pedidoOrigem.status === "CANCELADO" ? "cancelado" : "concluído"} não pode receber novas minutas.` },
        { status: 422 },
      );
    }
    // Venda à ordem: a venda comercial NÃO gera minuta própria — a entrega e a
    // baixa são feitas no Pedido de Entrega da empresa de origem (Tramontin).
    if (pedidoOrigem.estoqueOrigemEmpresaId) {
      return NextResponse.json(
        { error: "Esta é uma venda à ordem: a entrega e a baixa de estoque são feitas no pedido de entrega da empresa de origem." },
        { status: 422 },
      );
    }

    // Sobre-entrega (pre-check): resposta rápida sem queimar numeração. A checagem
    // AUTORITATIVA roda de novo dentro da transação, com o pedido travado.
    {
      const erro = erroSobreEntrega(pedidoOrigem.itens, itens);
      if (erro) return NextResponse.json({ error: erro.error }, { status: erro.status });
    }
    const numeroMin = generateSimpleDocNumber(
      "MIN",
      await proximaSequenciaDaEmpresa(pedidoOrigem.empresaId, "MIN")
    );

    const minuta = await prisma.$transaction(async (tx) => {
      // Serializa criações concorrentes do MESMO pedido: quem chegar segundo espera
      // o commit do primeiro e revalida contra o estado já atualizado. É esta trava
      // que impede duas requisições simultâneas (duplo envio, duas abas, dois
      // usuários) de passarem juntas pela validação de pendente.
      await tx.$queryRaw`SELECT id FROM "PedidoVenda" WHERE id = ${pedidoVendaId} FOR UPDATE`;

      // Duplicata exata: mesma composição de itens/quantidades em minuta ativa
      // criada nos últimos 10 minutos → bloqueia (o front pode reenviar com
      // ignorarDuplicidade quando for entrega repetida de verdade, ex. 2 caminhões).
      if (body.ignorarDuplicidade !== true) {
        const desde = new Date(Date.now() - 10 * 60 * 1000);
        const recentes = await tx.minuta.findMany({
          where: { pedidoVendaId, status: { not: "CANCELADA" }, createdAt: { gte: desde } },
          select: { numero: true, createdAt: true, itens: { select: { pedidoVendaItemId: true, quantidade: true } } },
        });
        const nova = assinaturaItens(itens);
        const igual = recentes.find((m) => assinaturaItens(m.itens) === nova);
        if (igual) throw new MinutaDuplicadaError(igual.numero, igual.createdAt);
      }

      // Revalidação de sobre-entrega SOB O LOCK (autoritativa).
      const itensAtuais = await tx.pedidoVendaItem.findMany({
        where: { pedidoVendaId },
        select: {
          id: true, quantidade: true,
          item: { select: { descricao: true } },
          minutaItens: { where: { minuta: { status: { not: "CANCELADA" } } }, select: { quantidade: true } },
        },
      });
      const erro = erroSobreEntrega(itensAtuais, itens);
      if (erro) throw new SobreEntregaError(erro);

      const created = await tx.minuta.create({
        data: {
          numero: numeroMin,
          empresaId: pedidoOrigem.empresaId,
          numeroFisico: numeroFisico || null,
          pedidoVendaId,
          localEstoqueId: localEstoqueId || null,
          motoristaId: motoristaId || null,
          tipo: tipo === "RETIRADA" ? "RETIRADA" : "ENTREGA",
          status: "PENDENTE",
          dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
          placa: placa || null,
          observacoes: observacoes || null,
          itens: {
            create: itens.map((it) => ({
              pedidoVendaItemId: it.pedidoVendaItemId,
              itemId: it.itemId,
              quantidade: it.quantidade,
              quantidadeConvertida: it.quantidadeConvertida ?? null,
              unidadeId: it.unidadeId || null,
            })),
          },
        },
        include: {
          pedidoVenda: {
            select: {
              id: true,
              numero: true,
              cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
            },
          },
          localEstoque: { select: { id: true, nome: true } },
          motorista: { select: { id: true, nome: true } },
          itens: {
            include: {
              item: { select: { id: true, codigo: true, descricao: true } },
              unidade: { select: { id: true, sigla: true, nome: true } },
            },
          },
        },
      });

      // A minuta nasce PENDENTE e não movimenta estoque aqui — a SAÍDA é gerada
      // depois, na transição PENDENTE→SAIU_PARA_ENTREGA ("Marcar saída"), tratada
      // no PATCH /api/comercial/minutas/[id].

      // Move pedido para EM_AGENDAMENTO quando a primeira minuta é criada.
      // CONDICIONAL ao estado aberto: nunca "ressuscita" um pedido CANCELADO
      // (nem regride um CONCLUIDO) — o guard acima já barrou, mas uma corrida
      // entre a leitura e esta transação não pode furar a regra.
      await tx.pedidoVenda.updateMany({
        where: { id: pedidoVendaId, status: { in: ["ORCAMENTO", "CONFIRMADO", "EM_AGENDAMENTO"] } },
        data: { status: "EM_AGENDAMENTO" },
      });

      return created;
    });

    return NextResponse.json({ data: minuta }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof MinutaDuplicadaError) {
      const min = Math.max(1, Math.round((Date.now() - err.criadaEm.getTime()) / 60000));
      return NextResponse.json(
        {
          error: `Já existe a minuta ${err.numero}, idêntica (mesmos itens e quantidades), criada há ${min} min. Se for mesmo uma segunda entrega igual, confirme a criação.`,
          duplicada: true,
          minutaNumero: err.numero,
        },
        { status: 409 },
      );
    }
    if (err instanceof SobreEntregaError) {
      return NextResponse.json({ error: err.payload.error }, { status: err.payload.status });
    }
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/comercial/minutas]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
