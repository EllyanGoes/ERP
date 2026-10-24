export const dynamic = "force-dynamic";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { ativoPorToken } from "@/lib/manutencao/publico";
import { criarSolicitacao } from "@/lib/manutencao/solicitacao";
import { PRIORIDADES } from "@/lib/manutencao/ordem";

// POST /api/publico/ativo/[token]/solicitacao — abre uma SS pela página pública
// do QR, SEM login (liberado no middleware). Proteções, sem tabela nova:
//   • tamanhos: descrição ≤ 2000, nome ≤ 80, setor/telefone ≤ 80;
//   • no máx. 3 SS por ativo a cada 10 min vindas do QR;
//   • no máx. 10 SS por hora por IP (x-forwarded-for) — o IP vai como hash em
//     ManutSolicitacao.origemId ("ip:<hash>"), nunca em claro.
// A SS nasce sem usuário (solicitanteId null); quem pediu vai em solicitanteNome.
const LIMITE_ATIVO = 3, JANELA_ATIVO_MS = 10 * 60_000;
const LIMITE_IP = 10, JANELA_IP_MS = 60 * 60_000;

function hashIp(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";
  const sal = (process.env.JWT_SECRET ?? "").slice(0, 16);
  return `ip:${createHash("sha256").update(`${sal}|${ip}`).digest("hex").slice(0, 24)}`;
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ativo = await ativoPorToken(params.token);
  if (!ativo) return NextResponse.json({ error: "Etiqueta inválida ou desativada." }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const descricao = String(b.descricao ?? "").trim();
  const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ");
  const contato = String(b.contato ?? "").trim().replace(/\s+/g, " ");
  if (!descricao) return NextResponse.json({ error: "Conte o que está acontecendo." }, { status: 400 });
  if (descricao.length > 2000) return NextResponse.json({ error: "A descrição passou de 2000 caracteres — resuma um pouco." }, { status: 400 });
  if (!nome) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
  if (nome.length > 80) return NextResponse.json({ error: "Nome muito longo (máx. 80 caracteres)." }, { status: 400 });
  if (contato.length > 80) return NextResponse.json({ error: "Setor/telefone muito longo (máx. 80 caracteres)." }, { status: 400 });
  if (typeof b.ativoParado !== "boolean") return NextResponse.json({ error: "Diga se a máquina parou." }, { status: 400 });
  const prioridade = typeof b.prioridade === "string" && (PRIORIDADES as readonly string[]).includes(b.prioridade) ? b.prioridade : null;

  // Limites de envio (contagem nas próprias SS de origem QR).
  const agora = Date.now();
  const ipId = hashIp(req);
  const [doAtivo, doIp] = await Promise.all([
    prismaSemEscopo.manutSolicitacao.count({ where: { origem: "QR", ativoId: ativo.id, createdAt: { gte: new Date(agora - JANELA_ATIVO_MS) } } }),
    prismaSemEscopo.manutSolicitacao.count({ where: { origem: "QR", origemId: ipId, createdAt: { gte: new Date(agora - JANELA_IP_MS) } } }),
  ]);
  if (doAtivo >= LIMITE_ATIVO) {
    return NextResponse.json({ error: "Já chegaram vários pedidos para este equipamento agora há pouco. A Manutenção já foi avisada — se for urgente, procure o responsável do setor." }, { status: 429 });
  }
  if (doIp >= LIMITE_IP) {
    return NextResponse.json({ error: "Muitos pedidos enviados deste aparelho na última hora. Tente de novo mais tarde ou fale direto com a Manutenção." }, { status: 429 });
  }

  const ss = await criarSolicitacao({
    empresaId: ativo.empresaId,
    ativoId: ativo.id,
    descricao,
    ativoParado: b.ativoParado,
    prioridade,
    solicitanteId: null,
    solicitanteNome: `${nome}${contato ? ` (${contato})` : ""} — via QR`,
    origem: "QR",
    origemId: ipId,
  }, prismaSemEscopo);

  return NextResponse.json({ data: { numero: ss.numero } }, { status: 201 });
}
