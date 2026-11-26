export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { salvarNaLixeira } from "@/lib/lixeira";
import { SITUACOES, camposProcesso, carregarProcesso, erroAcompanhamentoDatajud, pendenciasProcesso, podeEditar } from "@/lib/processos";

type Ctx = { params: { id: string } };

// GET — processo completo: linha do tempo, prazos, partes, documentos do GED e pendências.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const p = await prismaSemEscopo.processo.findUnique({
    where: { id: params.id },
    include: {
      responsavel: { select: { id: true, nome: true } },
      andamentos: { orderBy: [{ data: "desc" }, { createdAt: "desc" }] },
      prazos: { orderBy: [{ status: "asc" }, { vence: "asc" }], include: { contaPagar: { select: { id: true, numero: true, status: true, valorOriginal: true, valorPago: true } } } },
      partes: { orderBy: { papel: "asc" } },
      bens: { orderBy: { createdAt: "asc" }, select: { id: true, observacao: true, imobilizado: { select: { id: true, descricao: true, status: true, dataAquisicao: true } } } },
      _count: { select: { credenciais: true, contasPagar: true, contasReceber: true, acessosExternos: { where: { revogadoEm: null } } } },
      documentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, titulo: true, numero: true, emissao: true, confidencial: true, createdAt: true, categoria: { select: { nome: true } }, versaoVigente: { select: { nome: true, tamanho: true } } },
      },
    },
  });
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  return NextResponse.json({ data: { ...p, pendencias: pendenciasProcesso(p) }, podeEditar: await podeEditar(auth.session) });
}

// PATCH — edita os campos do processo (só as chaves enviadas).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão para editar processos." }, { status: 403 });
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const data = camposProcesso(b);
  if ("titulo" in b && !data.titulo) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
  if ("orgao" in b && !data.orgao) return NextResponse.json({ error: "O órgão não pode ficar vazio." }, { status: 400 });
  if ("datajudAtivo" in b || "numero" in b) {
    const atual = await prismaSemEscopo.processo.findUnique({ where: { id: params.id }, select: { numero: true, datajudAtivo: true } });
    const ativo = "datajudAtivo" in data ? !!data.datajudAtivo : !!atual?.datajudAtivo;
    const erroDj = erroAcompanhamentoDatajud(ativo, "numero" in data ? (data.numero as string | null) : atual?.numero);
    if (erroDj) return NextResponse.json({ error: erroDj }, { status: 400 });
  }
  // Mudança de situação (quadro, ficha ou formulário) fica registrada na linha do tempo.
  const mudouSituacao = typeof data.situacao === "string" && data.situacao !== base.situacao;
  await prismaSemEscopo.$transaction(async (tx) => {
    await tx.processo.update({ where: { id: params.id }, data: { ...data, atualizadoPor: auth.session.nome } });
    if (mudouSituacao) {
      const de = SITUACOES[base.situacao]?.label ?? base.situacao, para = SITUACOES[String(data.situacao)]?.label ?? String(data.situacao);
      await tx.processoAndamento.create({ data: { processoId: params.id, data: new Date(new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)), tipo: "MOVIMENTACAO", descricao: `Situação alterada de "${de}" para "${para}"`, usuario: auth.session.nome } });
    }
  });
  return NextResponse.json({ ok: true });
}

// DELETE — vai para a lixeira (snapshot completo); documentos ficam no GED sem vínculo.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão para excluir processos." }, { status: 403 });
  const base = await carregarProcesso(auth.session, params.id);
  if (!base) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  // Depósito judicial com destino registrado (conversão = lançamento contábil; levantamento = título
  // a receber): desfazer na aba Financeiro antes — excluir aqui deixaria o contábil órfão (§8.3).
  if (await prismaSemEscopo.processoDepositoDestino.count({ where: { processoId: params.id } })) {
    return NextResponse.json({ error: "Este processo tem destinos de depósito judicial (levantamento/conversão) — desfaça-os na aba Financeiro antes de excluir." }, { status: 409 });
  }
  await prismaSemEscopo.$transaction(async (tx) => {
    // Credenciais (cifradas) NÃO vão para o snapshot da lixeira; títulos do financeiro só perdem o vínculo (SetNull).
    const snap = await tx.processo.findUnique({ where: { id: params.id }, include: { andamentos: true, prazos: true, partes: true, bens: true } });
    await salvarNaLixeira(tx, { empresaId: base.empresaId, tipo: "PROCESSO", origemId: base.id, numero: base.codigo, descricao: base.titulo, snapshot: snap, apagadoPor: auth.session.nome });
    await tx.documento.updateMany({ where: { processoId: params.id }, data: { processoId: null } });
    await tx.processo.delete({ where: { id: params.id } });
  });
  return NextResponse.json({ ok: true });
}
