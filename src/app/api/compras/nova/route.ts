export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { generateSimpleDocNumber } from "@/lib/utils";
import { proximaSequenciaDaEmpresa } from "@/lib/empresa";
import {
  ErroCompras, criarCompra, empresaDoDocumento, erroDaSolicitacao, submeterCotacaoParaAprovacao,
  type CorpoSolicitacao,
} from "@/lib/compras-fluxo";
import { agruparItens, validarPropostas, type PropostaCompra } from "@/lib/compras-processo";

// POST /api/compras/nova — registra a compra em um passo só: SC + cotação com as
// propostas e, se pedido, já envia para aprovação.

type Corpo = CorpoSolicitacao & {
  propostas?: PropostaCompra[];
  vencedorFornecedorId?: string | null;
  enviarAprovacao?: boolean;
};

const valorOuNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function normalizarProposta(p: PropostaCompra): PropostaCompra {
  const precos: PropostaCompra["precos"] = {};
  for (const [itemId, preco] of Object.entries(p.precos ?? {})) {
    const n = valorOuNull(preco);
    precos[itemId] = n && n > 0 ? n : null;
  }
  const prazo = valorOuNull(p.prazoEntregaDias);
  return {
    fornecedorId: p.fornecedorId,
    precos,
    frete: valorOuNull(p.frete),
    vrDesconto: valorOuNull(p.vrDesconto),
    condicoesPagamento: p.condicoesPagamento ?? null,
    prazoEntregaDias: prazo == null ? null : Math.round(prazo),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("compras");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Corpo;

    const erroSolicitacao = erroDaSolicitacao(body);
    if (erroSolicitacao) throw new ErroCompras(erroSolicitacao);

    const itens = agruparItens(
      (body.itens ?? []).map((i) => ({ itemId: i.itemId, quantidade: parseFloat(String(i.quantidade)) })),
    );
    if (itens.some((i) => !i.itemId || !(i.quantidade > 0))) {
      throw new ErroCompras("Todos os itens precisam de produto e quantidade válida");
    }

    const propostas = (Array.isArray(body.propostas) ? body.propostas : []).map(normalizarProposta);
    const enviar = body.enviarAprovacao === true;
    const erroPropostas = validarPropostas(itens, propostas, enviar);
    if (erroPropostas) throw new ErroCompras(erroPropostas);

    const empresaId = await empresaDoDocumento(body.empresaId);
    const numeroSC = generateSimpleDocNumber("SC", await proximaSequenciaDaEmpresa(empresaId, "SC"));
    const numeroCT = generateSimpleDocNumber("CT", await proximaSequenciaDaEmpresa(empresaId, "CT"));

    const { solicitacao, cotacao } = await prisma.$transaction((tx) =>
      criarCompra(tx, { empresaId, numeroSC, numeroCT, body, itens, propostas, vencedorFornecedorId: body.vencedorFornecedorId }),
    );

    // A compra já está salva: falha ao enviar vira aviso, e a cotação fica pronta
    // para ser enviada pela própria tela.
    let avisoAprovacao: string | null = null;
    if (enviar) {
      try {
        const { semAprovador } = await submeterCotacaoParaAprovacao({
          cotacaoId: cotacao.id,
          usuarioId: auth.session.sub,
          db: empresaId === auth.session.activeEmpresaId ? undefined : prismaSemEscopo,
        });
        if (semAprovador) avisoAprovacao = "Não há aprovador configurado para compras. Peça a um administrador para aprovar.";
      } catch (e) {
        console.error("[POST /compras/nova] envio para aprovação", e);
        avisoAprovacao = "A compra foi salva, mas não foi enviada para aprovação. Envie pela tela da cotação.";
      }
    }

    return NextResponse.json(
      { data: { id: cotacao.id, solicitacaoId: solicitacao.id, numeroSC, numeroCT }, avisoAprovacao },
      { status: 201 },
    );
  } catch (e: unknown) {
    if (e instanceof ErroCompras) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /compras/nova]", msg);
    return NextResponse.json({ error: "Erro ao registrar a compra" }, { status: 500 });
  }
}
