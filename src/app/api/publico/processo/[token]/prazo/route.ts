export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { acessoPorToken, avisarResponsavelExterno, hashIp, limiteExternoExcedido, registrarLog } from "@/lib/processos-externo";

// POST /api/publico/processo/[token]/prazo { prazoId, observacao? } — o externo marca um prazo
// PENDENTE deste processo como cumprido (autoria "Externo: <nome>", log e aviso ao responsável).
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const a = await acessoPorToken(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido, revogado ou expirado." }, { status: 404 });
  if (!a.podeLancar) return NextResponse.json({ error: "Este link é só de consulta." }, { status: 403 });
  const ip = hashIp(req);
  const limite = await limiteExternoExcedido(a.id, ip);
  if (limite) return NextResponse.json({ error: limite }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const obs = String(b.observacao ?? "").trim().slice(0, 500);
  const pr = await prismaSemEscopo.processoPrazo.findFirst({ where: { id: String(b.prazoId ?? ""), processoId: a.processoId, status: "PENDENTE" }, select: { id: true, descricao: true } });
  if (!pr) return NextResponse.json({ error: "Prazo não encontrado ou já resolvido." }, { status: 404 });
  const autor = `Externo: ${a.nome}`;
  await prismaSemEscopo.processoPrazo.update({ where: { id: pr.id }, data: { status: "CUMPRIDO", cumpridoEm: new Date(), motivo: `Cumprido por ${autor} (link externo)${obs ? ` — ${obs}` : ""}` } });
  await registrarLog({ processoId: a.processoId, acao: "EXTERNO_PRAZO", autor, referenciaId: a.id, detalhe: pr.descricao, ipHash: ip });
  await avisarResponsavelExterno(a.processo, a.nome, `Prazo cumprido: ${pr.descricao}${obs ? ` — ${obs}` : ""}`);
  return NextResponse.json({ ok: true });
}
