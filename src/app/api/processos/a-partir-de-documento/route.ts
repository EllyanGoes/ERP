export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { salvarPdfNoProcesso } from "@/lib/processos-externo";
import {
  PAPEIS_PARTE, TIPOS_ANDAMENTO, aplicarRoteiro, camposProcesso, carregarProcesso, dadosPrazo, dataOuNull, erroAcompanhamentoDatajud,
  dadosPagamentoPrazo, podeEditar, proximoCodigoProcesso, situacaoPorAndamento, textoOuNull,
} from "@/lib/processos";

const MAX_BYTES = 4.5 * 1024 * 1024; // limite do corpo da função na Vercel

type Dados = {
  processoId?: string;
  processo?: Record<string, unknown>;
  andamento?: { data?: string; tipo?: string; descricao?: string };
  prazo?: Record<string, unknown> | null;
  partes?: { papel?: string; nome?: string; documento?: string | null }[];
  documento?: { titulo?: string; numero?: string | null };
  roteiroId?: string | null;
  dataCiencia?: string | null;
  // Guia/multa a pagar (§8.3): vira um prazo de PAGAMENTO com valor e desconto antecipado. O
  // título a pagar é criado depois pela tela (POST /api/financeiro/titulos — exige Financeiro)
  // e ligado a este prazo (PATCH prazos acao=vincular-titulo).
  pagamento?: { descricao?: string; vencimento?: string; valorPagar?: unknown; valorComDesconto?: unknown; descontoPercentual?: unknown; descontoAte?: string | null; avisoDias?: unknown } | null;
};

// POST multipart { file: PDF, dados: JSON } — confirma o que o usuário conferiu:
//  • sem processoId: cria o processo + partes + andamento inicial + prazo (+ roteiro);
//  • com processoId: lança andamento + prazo no processo existente.
// Em ambos, o PDF vai para o GED (pasta de sistema "Processos") ligado ao processo e ao andamento.
export async function POST(req: NextRequest) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  let d: Dados;
  try { d = JSON.parse(String(form?.get("dados") ?? "{}")); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!file) return NextResponse.json({ error: "Envie o PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "O arquivo passa de 4,5 MB." }, { status: 400 });

  // Processo alvo (existente ou novo) — validações antes de gravar qualquer coisa.
  let existente: { id: string; codigo: string; empresaId: string; situacao: string } | null = null;
  let campos: ReturnType<typeof camposProcesso> | null = null;
  if (d.processoId) {
    existente = await carregarProcesso(auth.session, d.processoId);
    if (!existente) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  } else {
    campos = camposProcesso(d.processo ?? {});
    if (!campos.titulo) return NextResponse.json({ error: "Informe o título do processo." }, { status: 400 });
    if (!campos.orgao) return NextResponse.json({ error: "Informe o órgão (ou vara/tribunal)." }, { status: 400 });
    const erroDj = erroAcompanhamentoDatajud(!!campos.datajudAtivo, campos.numero as string | null);
    if (erroDj) return NextResponse.json({ error: erroDj }, { status: 400 });
  }
  const descricaoAnd = String(d.andamento?.descricao ?? "").trim();
  if (!descricaoAnd) return NextResponse.json({ error: "Descreva o andamento (o que o documento traz)." }, { status: 400 });
  const tipoAnd = TIPOS_ANDAMENTO[String(d.andamento?.tipo)] ? String(d.andamento!.tipo) : "EXIGENCIA";
  const dataAnd = dataOuNull(d.andamento?.data) ?? new Date();
  const tipoProc = existente ? (await prismaSemEscopo.processo.findUnique({ where: { id: existente.id }, select: { tipo: true } }))?.tipo : String(campos!.tipo ?? "OUTRO");
  let prazo: Extract<ReturnType<typeof dadosPrazo>, { ok: true }>["data"] | null = null;
  const prazoDesc = textoOuNull(d.prazo?.descricao);
  if (d.prazo && prazoDesc) {
    const dp = dadosPrazo({ inicioContagem: d.dataCiencia ?? d.andamento?.data, ...d.prazo }, tipoProc);
    if (!dp.ok) return NextResponse.json({ error: dp.erro }, { status: 400 });
    prazo = dp.data;
  }

  let pagamento: { descricao: string; vence: Date; avisoDias: number; dados: Extract<ReturnType<typeof dadosPagamentoPrazo>, { ok: true }>["data"] } | null = null;
  if (d.pagamento && d.pagamento.vencimento) {
    const vence = dataOuNull(d.pagamento.vencimento);
    if (!vence || isNaN(+vence)) return NextResponse.json({ error: "Vencimento do pagamento inválido." }, { status: 400 });
    const pg = dadosPagamentoPrazo({ valorPagar: d.pagamento.valorPagar, valorComDesconto: d.pagamento.valorComDesconto, descontoPercentual: d.pagamento.descontoPercentual, descontoAte: d.pagamento.descontoAte ?? null });
    if (!pg.ok) return NextResponse.json({ error: pg.erro }, { status: 400 });
    pagamento = { descricao: textoOuNull(d.pagamento.descricao) ?? "Pagamento", vence, avisoDias: Math.max(0, Number(d.pagamento.avisoDias ?? 5) || 5), dados: pg.data };
  }

  const empresaId = existente?.empresaId ?? auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  const r = await prismaSemEscopo.$transaction(async (tx) => {
    let proc: { id: string; codigo: string; tipo: string; responsavelId: string | null; abertoEm: Date | null; confidencial: boolean; situacao: string };
    if (existente) {
      proc = (await tx.processo.findUnique({ where: { id: existente.id }, select: { id: true, codigo: true, tipo: true, responsavelId: true, abertoEm: true, confidencial: true, situacao: true } }))!;
    } else {
      const c = campos!;
      const codigo = await proximoCodigoProcesso(tx, empresaId);
      proc = await tx.processo.create({
        data: {
          ...(c as object), empresaId, codigo, titulo: String(c.titulo), orgao: String(c.orgao), tipo: String(c.tipo ?? "OUTRO"),
          responsavelId: (c.responsavelId as string | null | undefined) ?? auth.session.sub,
          confidencial: "confidencial" in (d.processo ?? {}) ? !!d.processo!.confidencial : c.interessadoTipo === "PESSOA",
          abertoEm: (c.abertoEm as Date | null | undefined) ?? dataAnd,
          situacao: situacaoPorAndamento(tipoAnd) ?? "EM_ANDAMENTO",
          criadoPor: auth.session.nome,
        },
        select: { id: true, codigo: true, tipo: true, responsavelId: true, abertoEm: true, confidencial: true, situacao: true },
      });
      const partes = (d.partes ?? []).filter((x) => x?.nome?.trim()).slice(0, 20);
      if (partes.length) await tx.processoParte.createMany({ data: partes.map((x) => ({ processoId: proc.id, papel: PAPEIS_PARTE[String(x.papel)] ? String(x.papel) : "OUTRO", nome: String(x.nome).trim(), documento: textoOuNull(x.documento) })) });
      if (d.roteiroId) await aplicarRoteiro(tx, proc, String(d.roteiroId), { ciencia: dataOuNull(d.dataCiencia) ?? dataAnd, criadoPor: auth.session.nome });
    }
    const a = await tx.processoAndamento.create({ data: { processoId: proc.id, data: dataAnd, tipo: tipoAnd, descricao: descricaoAnd, usuario: auth.session.nome } });
    if (prazo) await tx.processoPrazo.create({ data: { processoId: proc.id, descricao: prazoDesc!, ...prazo, avisoDias: Math.max(0, Number(d.prazo?.avisoDias ?? 5) || 5), responsavelId: proc.responsavelId, andamentoId: a.id, criadoPor: auth.session.nome } });
    const prazoPag = pagamento
      ? await tx.processoPrazo.create({
          data: { processoId: proc.id, descricao: pagamento.descricao, vence: pagamento.vence, ...pagamento.dados, avisoDias: pagamento.avisoDias, responsavelId: proc.responsavelId, andamentoId: a.id, fundamento: "Lido do documento", criadoPor: auth.session.nome },
          select: { id: true },
        })
      : null;
    const nova = situacaoPorAndamento(tipoAnd);
    if (existente && nova && nova !== proc.situacao) await tx.processo.update({ where: { id: proc.id }, data: { situacao: nova, atualizadoPor: auth.session.nome } });
    return { proc, andamentoId: a.id, prazoPagamentoId: prazoPag?.id ?? null };
  });

  // PDF no GED (fora da transação: upload externo). Falha aqui não desfaz o processo.
  let aviso: string | null = null;
  try {
    const titulo = textoOuNull(d.documento?.titulo) ?? `${r.proc.codigo} — ${file.name.replace(/\.pdf$/i, "")}`;
    const docId = await salvarPdfNoProcesso({
      processo: { id: r.proc.id, codigo: r.proc.codigo, empresaId, confidencial: r.proc.confidencial, responsavelId: r.proc.responsavelId },
      conteudo: Buffer.from(await file.arrayBuffer()), nomeArquivo: file.name, titulo, emissao: dataAnd, autor: auth.session.nome, numero: textoOuNull(d.documento?.numero),
    });
    await prismaSemEscopo.processoAndamento.update({ where: { id: r.andamentoId }, data: { documentoId: docId } });
  } catch (e) {
    console.error("[processos/a-partir-de-documento] PDF não gravado no GED:", e);
    aviso = "Processo gravado, mas o PDF não foi salvo no GED. Envie o arquivo de novo pela aba Documentos.";
  }
  return NextResponse.json({ data: { id: r.proc.id, codigo: r.proc.codigo, empresaId, prazoPagamentoId: r.prazoPagamentoId }, aviso }, { status: 201 });
}
