export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getUserModulos, hasModulo } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/manutencao/consultas";

// GET /api/pcm/a/[codApl] — o que a página do QR do ativo (celular) mostra.
// Session-only de propósito: o QR fica colado na máquina e QUALQUER usuário
// logado abre a SS por ele. Quem não é da Manutenção vê só o básico (sem
// medidores e sem link para a OS).
export async function GET(_req: NextRequest, { params }: { params: { codApl: string } }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const codApl = Number(params.codApl);
  if (!Number.isInteger(codApl) || codApl <= 0) return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  const pcm = hasModulo(await getUserModulos(auth.session.sub), "pcm");

  const ativo = await prisma.manutAtivo.findUnique({
    where: { codApl },
    select: { id: true, codApl: true, tag: true, nome: true, tipo: true, status: true, ativo: true, localizacao: true, paiId: true, fabricante: true, modelo: true },
  });
  if (!ativo) return NextResponse.json({ error: "Equipamento não encontrado nesta empresa. Confira a empresa ativa." }, { status: 404 });

  // Caminho na árvore (Área › Linha › …), do topo até o pai.
  const caminho: string[] = [];
  let paiId = ativo.paiId;
  for (let i = 0; paiId && i < 12; i++) {
    const pai = await prisma.manutAtivo.findUnique({ where: { id: paiId }, select: { nome: true, paiId: true } });
    if (!pai) break;
    caminho.unshift(pai.nome);
    paiId = pai.paiId;
  }

  const [ordens, solicitacoes, medidores] = await Promise.all([
    prisma.manutOrdem.findMany({
      where: { ativoId: ativo.id, status: { in: STATUS_ABERTOS } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, numero: true, status: true, prioridade: true, descricao: true, createdAt: true, paradaInicio: true, paradaFim: true, tipo: { select: { sigla: true } } },
    }),
    // SS ainda sem triagem — evita abrir a mesma coisa duas vezes.
    prisma.manutSolicitacao.findMany({
      where: { ativoId: ativo.id, status: "ABERTA" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, numero: true, descricao: true, ativoParado: true, createdAt: true, solicitanteNome: true },
    }),
    pcm
      ? prisma.manutMedidor.findMany({
          where: { ativoId: ativo.id, ativo: true },
          orderBy: { nome: "asc" },
          select: { id: true, nome: true, unidade: true, acumulado: true, leituras: { orderBy: { data: "desc" }, take: 1, select: { data: true, valor: true } } },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    data: {
      id: ativo.id, codApl: ativo.codApl, tag: ativo.tag, nome: ativo.nome, tipo: ativo.tipo, status: ativo.status, ativo: ativo.ativo,
      localizacao: ativo.localizacao, fabricante: ativo.fabricante, modelo: ativo.modelo,
      caminho: caminho.join(" › "),
      ordens,
      solicitacoes,
      medidores: medidores.map((m) => ({ id: m.id, nome: m.nome, unidade: m.unidade, acumulado: Number(m.acumulado), ultimaLeitura: m.leituras[0] ? { data: m.leituras[0].data, valor: Number(m.leituras[0].valor) } : null })),
    },
    pcm,
  });
}
