export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo, EMPRESA_PADRAO_ID } from "@/lib/prisma";
import { nivelNoProjeto, podeEditarTarefas, registrarAtividade } from "@/lib/projetos";
import { criarOrdem, ErroOS } from "@/lib/manutencao/ordem";

const parseData = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);

// POST /api/projetos/tarefas/[tarefaId]/ordem-servico — abre uma OS da Manutenção
// a partir da tarefa (reforma, melhoria…) já com os materiais previstos.
// Body: ativoId, tipoId, descricao, prioridade?, equipeId?, responsavelId?,
// programadaPara?, prazo?, materiais?: [{ itemId, quantidade }]
// Exige o módulo pcm E acesso de edição à tarefa. A OS nasce na empresa ativa
// do usuário (Projetos não é escopado); o vínculo fica em ManutOrdem.tarefaId.
export async function POST(req: NextRequest, { params }: { params: { tarefaId: string } }) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const tarefa = await prismaSemEscopo.tarefa.findUnique({ where: { id: params.tarefaId }, select: { id: true, titulo: true, projetoId: true } });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  const acesso = await nivelNoProjeto(auth.session, tarefa.projetoId);
  if (!acesso || !podeEditarTarefas(acesso.nivel)) return NextResponse.json({ error: "Sem permissão neste projeto." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.ativoId) return NextResponse.json({ error: "Escolha o ativo." }, { status: 400 });
  if (!b.tipoId) return NextResponse.json({ error: "Escolha o tipo de manutenção." }, { status: 400 });
  if (!String(b.descricao ?? "").trim()) return NextResponse.json({ error: "Descreva o serviço." }, { status: 400 });

  // Materiais previstos: mesmo produto repetido soma; quantidade inválida é recusada.
  const porItem = new Map<string, number>();
  for (const m of Array.isArray(b.materiais) ? b.materiais : []) {
    if (!m?.itemId) continue;
    const q = typeof m.quantidade === "string" ? Number(m.quantidade.replace(",", ".")) : Number(m.quantidade);
    if (!Number.isFinite(q) || q <= 0) return NextResponse.json({ error: "Informe a quantidade de cada material." }, { status: 400 });
    porItem.set(m.itemId, (porItem.get(m.itemId) ?? 0) + q);
  }
  const itens = porItem.size
    ? await prismaSemEscopo.item.findMany({ where: { id: { in: Array.from(porItem.keys()) } }, select: { id: true, descricao: true, unidade: { select: { sigla: true } } } })
    : [];
  if (itens.length !== porItem.size) return NextResponse.json({ error: "Há material que não existe mais no cadastro de produtos." }, { status: 404 });

  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;
  try {
    const ordem = await criarOrdem({
      empresaId, ativoId: b.ativoId, tipoId: b.tipoId, descricao: b.descricao, prioridade: b.prioridade,
      equipeId: b.equipeId, responsavelId: b.responsavelId,
      programadaPara: parseData(b.programadaPara), prazo: parseData(b.prazo),
      tarefaId: tarefa.id, usuario: auth.session.nome, origem: `Tarefa ${tarefa.titulo} (Projetos)`,
    }, prismaSemEscopo);
    if (itens.length) {
      await prismaSemEscopo.manutOrdemMaterial.createMany({
        data: itens.map((i) => ({ ordemId: ordem.id, itemId: i.id, descricao: i.descricao, quantidade: porItem.get(i.id)!, unidade: i.unidade?.sigla ?? null, origem: "PREVISTO" })),
      });
    }
    await registrarAtividade({ projetoId: tarefa.projetoId, tarefaId: tarefa.id, autorId: auth.session.sub, tipo: "OS_CRIADA", detalhe: { numero: ordem.numero, ordemId: ordem.id, materiais: itens.length } });
    return NextResponse.json({ data: { id: ordem.id, numero: ordem.numero } }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroOS) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
