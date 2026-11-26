export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { contextoFinanceiroProcesso, excluirDestinoDeposito, registrarDestinoDeposito } from "@/lib/processos-pagamento";
import { dataOuNull, textoOuNull, valorOuNull } from "@/lib/processos";

type Ctx = { params: { id: string } };

// Destino do depósito judicial do processo (docs/processos-prd.md §8.3). Exige Processos (com
// visibilidade) + Financeiro + editar processos — mesmo contexto da aba Financeiro.
//
// POST { contaPagarId, tipo: "LEVANTADO" | "CONVERTIDO", valor, data, naturezaFinanceiraId? (convertido),
//        vencimento? (levantado: vencimento do título a receber), observacao? }
export async function POST(req: NextRequest, { params }: Ctx) {
  const c = await contextoFinanceiroProcesso(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão (exige Financeiro e editar processos)." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const tipo = b.tipo === "CONVERTIDO" ? "CONVERTIDO" : b.tipo === "LEVANTADO" ? "LEVANTADO" : null;
  if (!tipo) return NextResponse.json({ error: "Escolha o destino: levantado ou convertido em pagamento." }, { status: 400 });
  const data = dataOuNull(b.data);
  if (!data) return NextResponse.json({ error: "Informe a data." }, { status: 400 });
  const r = await registrarDestinoDeposito({
    processo: { id: c.p.id, codigo: c.p.codigo, empresaId: c.p.empresaId },
    contaPagarId: String(b.contaPagarId ?? ""), tipo, valor: valorOuNull(b.valor) ?? 0, data,
    naturezaFinanceiraId: textoOuNull(b.naturezaFinanceiraId), vencimento: dataOuNull(b.vencimento), observacao: textoOuNull(b.observacao),
    usuario: c.auth.session.nome,
  });
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ data: r }, { status: 201 });
}

// DELETE ?destinoId= — desfaz: conversão apaga o lançamento contábil; levantamento exclui o título
// a receber (só se ainda não recebido).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const c = await contextoFinanceiroProcesso(params.id);
  if (!c.ok) return c.res;
  if (!c.editar) return NextResponse.json({ error: "Sem permissão (exige Financeiro e editar processos)." }, { status: 403 });
  const r = await excluirDestinoDeposito(c.p.id, req.nextUrl.searchParams.get("destinoId") ?? "");
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}
