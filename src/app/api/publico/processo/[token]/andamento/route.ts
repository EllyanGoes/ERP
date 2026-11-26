export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { TIPOS_ANDAMENTO } from "@/lib/processos-tipos";
import {
  MAX_PDF_BYTES, acessoPorToken, avisarResponsavelExterno, ehPdf, hashIp, limiteExternoExcedido, registrarLog, salvarPdfNoProcesso,
} from "@/lib/processos-externo";

// POST /api/publico/processo/[token]/andamento — multipart { descricao, data (YYYY-MM-DD), tipo?, file? (PDF ≤ 4,5 MB) }
// Página pública do advogado/despachante (sem login; liberada no middleware por /api/publico).
// Grava o andamento com autoria "Externo: <nome>", o PDF no GED (pasta Processos) e avisa o
// responsável (sino + Telegram). NÃO muda a situação do processo — o responsável decide.
const TIPOS_EXTERNO = ["MOVIMENTACAO", "PROTOCOLO", "MANIFESTACAO", "EXIGENCIA", "DECISAO", "AUDIENCIA", "VISTORIA", "PAGAMENTO", "OUTRO"];

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const a = await acessoPorToken(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido, revogado ou expirado." }, { status: 404 });
  if (!a.podeLancar) return NextResponse.json({ error: "Este link é só de consulta." }, { status: 403 });
  const ip = hashIp(req);
  const limite = await limiteExternoExcedido(a.id, ip);
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const descricao = String(form.get("descricao") ?? "").trim();
  if (!descricao) return NextResponse.json({ error: "Descreva o andamento." }, { status: 400 });
  if (descricao.length > 4000) return NextResponse.json({ error: "Descrição muito longa (máx. 4000 caracteres)." }, { status: 400 });
  const dataTxt = String(form.get("data") ?? "");
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataTxt) ? new Date(`${dataTxt}T00:00:00.000Z`) : null;
  if (!data || isNaN(+data)) return NextResponse.json({ error: "Informe a data do andamento." }, { status: 400 });
  if (data.getTime() > Date.now() + 2 * 86_400_000) return NextResponse.json({ error: "A data não pode ser no futuro." }, { status: 400 });
  const tipo = TIPOS_EXTERNO.includes(String(form.get("tipo"))) ? String(form.get("tipo")) : "MOVIMENTACAO";
  const file = form.get("file");
  let pdf: Buffer | null = null, nomeArq = "";
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "O PDF passa de 4,5 MB." }, { status: 400 });
    pdf = Buffer.from(await file.arrayBuffer());
    if (!ehPdf(pdf)) return NextResponse.json({ error: "Envie o anexo em PDF." }, { status: 400 });
    nomeArq = (file.name || "documento.pdf").replace(/[^\w.\- ()À-ÿ]/g, "_").slice(0, 120);
  }

  const autor = `Externo: ${a.nome}`;
  const p = a.processo;
  const and = await prismaSemEscopo.processoAndamento.create({ data: { processoId: p.id, data, tipo, descricao, origem: "EXTERNO", usuario: autor }, select: { id: true } });
  await registrarLog({ processoId: p.id, acao: "EXTERNO_ANDAMENTO", autor, referenciaId: a.id, detalhe: descricao.slice(0, 300), ipHash: ip });

  let aviso: string | null = null;
  if (pdf) {
    try {
      const titulo = `${p.codigo} — ${nomeArq.replace(/\.pdf$/i, "")} (enviado por ${a.nome})`.slice(0, 200);
      const docId = await salvarPdfNoProcesso({ processo: p, conteudo: pdf, nomeArquivo: nomeArq, titulo, emissao: data, autor });
      await prismaSemEscopo.processoAndamento.update({ where: { id: and.id }, data: { documentoId: docId } });
      // O que o externo envia fica visível para o próprio link.
      await prismaSemEscopo.processoAcessoExterno.update({ where: { id: a.id }, data: { documentoIds: { push: docId } } });
      await registrarLog({ processoId: p.id, acao: "EXTERNO_DOCUMENTO", autor, referenciaId: a.id, detalhe: nomeArq, ipHash: ip });
    } catch (e) {
      console.error("[publico/processo] PDF não gravado:", e);
      aviso = "O andamento foi registrado, mas o PDF não foi salvo. Tente enviar de novo.";
    }
  }
  await avisarResponsavelExterno(p, a.nome, `${TIPOS_ANDAMENTO[tipo] ?? tipo}: ${descricao.slice(0, 280)}${pdf && !aviso ? " (com PDF)" : ""}`);
  return NextResponse.json({ ok: true, aviso }, { status: 201 });
}
