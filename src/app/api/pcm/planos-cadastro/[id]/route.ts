export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { preverAplicacao, ritmoMedio } from "@/lib/manutencao/gatilho";

type Ctx = { params: Promise<{ id: string }> };

const RESPOSTAS = ["NENHUMA", "OK_NOK", "NUMERO", "TEXTO"];
/** "A cada N execuções" (revisão escalonada): 1 a 12. */
const multiploValido = (v: unknown) => Math.min(12, Math.max(1, Math.round(Number(v)) || 1));

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const p = await prisma.manutPlano.findUnique({
    where: { id },
    include: {
      tipo: true,
      equipe: { select: { id: true, nome: true } },
      tarefas: { orderBy: { seq: "asc" }, include: { ativo: { select: { tag: true, nome: true } } } },
      // materiais.tarefaId: item do kit que pertence a uma atividade do checklist (null = kit geral do plano)
      materiais: { include: { item: { select: { id: true, codigo: true, descricao: true } } } },
      ativos: {
        include: {
          ativoRef: { select: { id: true, tag: true, nome: true, medidores: { where: { ativo: true }, select: { id: true, nome: true, unidade: true, acumulado: true } } } },
          medidor: { select: { id: true, nome: true, unidade: true, acumulado: true, leituras: { orderBy: { data: "desc" }, take: 12, select: { data: true, valor: true } } } },
        },
        orderBy: { proximoVencimento: "asc" },
      },
      ordens: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, numero: true, status: true, createdAt: true, programadaPara: true, concluidaEm: true, ativo: { select: { tag: true } } } },
    },
  });
  if (!p) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  // Previsão por aplicação: próxima data (no medidor, estimada pelo ritmo das últimas
  // leituras), se já venceu/entrou na janela e a OS aberta deste plano×ativo, se houver.
  const abertas = p.ativos.length
    ? await prismaSemEscopo.manutOrdem.findMany({
        where: {
          OR: [{ planoAtivoId: { in: p.ativos.map((a) => a.id) } }, { planoAtivosRota: { hasSome: p.ativos.map((a) => a.id) } }],
          status: { notIn: ["CONCLUIDA", "CANCELADA"] },
        },
        select: { id: true, numero: true, status: true, planoAtivoId: true, planoAtivosRota: true }, orderBy: { createdAt: "desc" },
      })
    : [];
  const ativos = p.ativos.map((a) => {
    const { leituras, ...medidor } = a.medidor ?? { leituras: [] as { data: Date; valor: Prisma.Decimal }[] };
    const ritmoDia = ritmoMedio(leituras);
    const previsao = preverAplicacao(a, { antecedenciaDias: p.antecedenciaDias, ritmoDia });
    return { ...a, medidor: a.medidor ? { ...medidor, ritmoDia } : null, previsao, osAberta: abertas.find((o) => o.planoAtivoId === a.id || o.planoAtivosRota.includes(a.id)) ?? null };
  });
  return NextResponse.json({ data: { ...p, ativos } });
}

// PATCH — cabeçalho e, se vierem, substitui o checklist (tarefas) e o kit (materiais).
// tarefas: [{ descricao, tipoResposta, faixaMin?, faixaMax?, servicoId?, ativoId?, materiais?: [{ itemId, quantidade }] }]
//   → os materiais dentro da atividade viram ManutPlanoMaterial.tarefaId = a tarefa criada.
// materiais: [{ itemId, quantidade }] — kit geral (sem atividade). Um produto só entra uma vez no plano
//   (@@unique planoId+itemId): o primeiro vence (atividade antes do kit geral).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const atual = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true } });
  if (!atual) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const data: Prisma.ManutPlanoUncheckedUpdateInput = {};
  for (const k of ["codigo", "nome"] as const) if (typeof b[k] === "string" && b[k].trim()) data[k] = b[k].trim();
  if (b.tipoId) data.tipoId = b.tipoId;
  if ("equipeId" in b) data.equipeId = b.equipeId || null;
  if ("horasEstimadas" in b) data.horasEstimadas = b.horasEstimadas === "" || b.horasEstimadas == null ? null : Number(b.horasEstimadas);
  for (const k of ["antecedenciaDias", "toleranciaPct"] as const) if (k in b && b[k] !== "" && b[k] != null) data[k] = Math.max(0, Math.round(Number(b[k])));
  for (const k of ["exigeParada", "baseNaConclusao", "ativo"] as const) if (k in b) data[k] = !!b[k];
  if ("observacoes" in b) data.observacoes = b.observacoes?.trim() || null;
  if ("rota" in b) data.rota = typeof b.rota === "string" && b.rota.trim() ? b.rota.trim() : null;
  try {
    await prismaSemEscopo.$transaction(async (tx) => {
      await tx.manutPlano.update({ where: { id }, data });
      // Materiais a (re)criar: os de cada atividade (com tarefaId) + o kit geral. Um itemId só uma vez.
      const mats: { itemId: string; quantidade: number; tarefaId: string | null; multiplo: number }[] = [];
      const addMat = (m: Record<string, unknown>, tarefaId: string | null) => {
        if (!m.itemId || !(Number(m.quantidade) > 0) || mats.some((x) => x.itemId === String(m.itemId))) return;
        mats.push({ itemId: String(m.itemId), quantidade: Number(m.quantidade), tarefaId, multiplo: tarefaId ? 1 : multiploValido(m.multiplo) });
      };
      if (Array.isArray(b.tarefas)) {
        await tx.manutPlanoTarefa.deleteMany({ where: { planoId: id } });
        const tarefas = (b.tarefas as Record<string, unknown>[]).filter((t) => String(t.descricao ?? "").trim());
        for (let i = 0; i < tarefas.length; i++) {
          const t = tarefas[i];
          const criada = await tx.manutPlanoTarefa.create({
            data: {
              planoId: id, seq: i + 1, descricao: String(t.descricao).trim(),
              tipoResposta: RESPOSTAS.includes(String(t.tipoResposta)) ? String(t.tipoResposta) : "OK_NOK",
              faixaMin: t.faixaMin === "" || t.faixaMin == null ? null : Number(t.faixaMin),
              faixaMax: t.faixaMax === "" || t.faixaMax == null ? null : Number(t.faixaMax),
              servicoId: (t.servicoId as string) || null, ativoId: (t.ativoId as string) || null,
              multiplo: multiploValido(t.multiplo),
            },
            select: { id: true },
          });
          if (Array.isArray(t.materiais)) for (const m of t.materiais as Record<string, unknown>[]) addMat(m, criada.id);
        }
      }
      if (Array.isArray(b.materiais)) for (const m of b.materiais as Record<string, unknown>[]) addMat(m, null);
      if (Array.isArray(b.tarefas) || Array.isArray(b.materiais)) {
        // Sem a lista de tarefas, preserva os materiais de atividade já gravados (só o kit geral é substituído).
        if (!Array.isArray(b.tarefas)) {
          const deAtividade = await tx.manutPlanoMaterial.findMany({ where: { planoId: id, tarefaId: { not: null } }, select: { itemId: true } });
          const presos = new Set(deAtividade.map((m) => m.itemId));
          await tx.manutPlanoMaterial.deleteMany({ where: { planoId: id, tarefaId: null } });
          await tx.manutPlanoMaterial.createMany({ data: mats.filter((m) => !presos.has(m.itemId)).map((m) => ({ planoId: id, ...m })), skipDuplicates: true });
        } else {
          await tx.manutPlanoMaterial.deleteMany({ where: { planoId: id } });
          await tx.manutPlanoMaterial.createMany({ data: mats.map((m) => ({ planoId: id, ...m })), skipDuplicates: true });
        }
      }
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Já existe plano com esse código." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

// DELETE — plano com OS no histórico é só desativado.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("pcm");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const p = await prisma.manutPlano.findUnique({ where: { id }, select: { id: true, _count: { select: { ordens: true } } } });
  if (!p) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  if (p._count.ordens > 0) {
    await prisma.manutPlano.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ data: { desativado: true } });
  }
  await prisma.manutPlano.delete({ where: { id } });
  return NextResponse.json({ data: { excluido: true } });
}
