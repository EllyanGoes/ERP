export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prisma, prismaSemEscopo } from "@/lib/prisma";
import { CONTRATO_SELECT, fimVigente, registrarEvento, sincronizarEventosProjetados, somaMeses } from "@/lib/contratos";

// POST /api/contratos/[id]/acoes — { acao: ATIVAR | SUSPENDER | REATIVAR | RENOVAR | RESCINDIR | ENCERRAR | ASSINAR | OBSERVACAO, ... }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("contratos");
  if (!auth.ok) return auth.response;
  const b = await req.json().catch(() => ({}));
  const c = await prisma.contrato.findUnique({ where: { id: params.id }, select: CONTRATO_SELECT });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const uid = auth.session.sub; const nome = auth.session.nome;
  const hoje = new Date();
  const dt = (v: unknown) => (v ? new Date(String(v)) : null);

  try {
    await prismaSemEscopo.$transaction(async (tx) => {
      const upd = (data: Record<string, unknown>) => tx.contrato.update({ where: { id: c.id }, data: { ...data, atualizadoPor: nome } });
      switch (String(b.acao)) {
        case "ATIVAR": {
          if (!["MINUTA", "EM_APROVACAO"].includes(c.status)) throw new Error("Só minuta pode ser ativada.");
          await upd({ status: "VIGENTE" });
          await registrarEvento(tx, c.id, "ATIVADO", `Ativado por ${nome}`, uid);
          break;
        }
        case "ASSINAR": {
          const d = dt(b.data) ?? hoje;
          await upd({ assinadoEm: d });
          await registrarEvento(tx, c.id, "ASSINADO", `Assinado em ${d.toLocaleDateString("pt-BR")}`, uid);
          break;
        }
        case "SUSPENDER": {
          if (!["VIGENTE", "EM_RENOVACAO"].includes(c.status)) throw new Error("Só contrato vigente pode ser suspenso.");
          await upd({ status: "SUSPENSO" });
          await registrarEvento(tx, c.id, "SUSPENSO", String(b.motivo || "Suspenso"), uid);
          break;
        }
        case "REATIVAR": {
          if (c.status !== "SUSPENSO") throw new Error("Contrato não está suspenso.");
          await upd({ status: "VIGENTE" });
          await registrarEvento(tx, c.id, "REATIVADO", String(b.motivo || "Reativado"), uid);
          break;
        }
        case "RENOVAR": {
          // Aditivo de prazo: novoFim informado ou fim + renovacaoMeses.
          const fimAtual = fimVigente(c);
          const novoFim = dt(b.novoFim) ?? (fimAtual ? somaMeses(fimAtual, c.renovacaoMeses ?? 12) : null);
          if (!novoFim) throw new Error("Informe a nova data de fim.");
          const n = c.aditivos.length + 1;
          await tx.contratoAditivo.create({ data: { contratoId: c.id, numero: n, tipo: "PRAZO", efeitoEm: fimAtual ?? hoje, descricao: String(b.descricao || `Renovação até ${novoFim.toLocaleDateString("pt-BR")}`), novoFim, novoValor: b.novoValor ? Number(b.novoValor) : null, aplicadoEm: hoje, criadoPor: nome } });
          await upd({ status: "VIGENTE", fim: novoFim, ...(b.novoValor ? { valor: Number(b.novoValor) } : {}) });
          await registrarEvento(tx, c.id, "RENOVADO", `Renovado até ${novoFim.toLocaleDateString("pt-BR")} (${n}º aditivo)`, uid);
          break;
        }
        case "RESCINDIR": {
          const d = dt(b.data) ?? hoje;
          await upd({ status: "RESCINDIDO", encerradoEm: d, motivoEncerramento: String(b.motivo || "Rescisão") });
          await registrarEvento(tx, c.id, "RESCINDIDO", `Rescindido em ${d.toLocaleDateString("pt-BR")}: ${b.motivo || "sem motivo informado"}`, uid, b.multa ? { multa: String(b.multa) } : undefined);
          break;
        }
        case "ENCERRAR": {
          const d = dt(b.data) ?? fimVigente(c) ?? hoje;
          await upd({ status: "ENCERRADO", encerradoEm: d, motivoEncerramento: String(b.motivo || "Fim da vigência") });
          await registrarEvento(tx, c.id, "ENCERRADO", `Encerrado em ${d.toLocaleDateString("pt-BR")}: ${b.motivo || "fim da vigência"}`, uid);
          break;
        }
        case "OBSERVACAO": {
          if (!b.texto) throw new Error("Informe o texto.");
          await registrarEvento(tx, c.id, "OBSERVACAO", String(b.texto), uid);
          break;
        }
        default: throw new Error("Ação inválida.");
      }
      const atual = await tx.contrato.findUnique({ where: { id: c.id }, select: CONTRATO_SELECT });
      if (atual) {
        if (["ENCERRADO", "RESCINDIDO"].includes(atual.status)) await tx.contratoEvento.deleteMany({ where: { contratoId: c.id, projetado: true } });
        else await sincronizarEventosProjetados(tx, atual, hoje);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
