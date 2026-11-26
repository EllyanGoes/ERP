export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { prismaSemEscopo } from "@/lib/prisma";
import { ehPastaSistema } from "@/lib/documentos";

// PATCH — renomear / mover (paiId, sem ciclo) / ativar-inativar / flags de validade.
// Pasta de sistema (usada por SST/Contratos/RH) pode ser renomeada, mas não movida.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const pasta = await prismaSemEscopo.documentoCategoria.findUnique({ where: { id: params.id } });
  if (!pasta) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { nome?: string; paiId?: string | null; ativo?: boolean; exigeValidade?: boolean; diasAlerta?: number } = {};

  const destinoPai = body.paiId !== undefined ? (body.paiId ? String(body.paiId) : null) : pasta.paiId;

  if (body.paiId !== undefined && destinoPai !== pasta.paiId) {
    if (ehPastaSistema(pasta)) {
      return NextResponse.json({ error: `"${pasta.nome}" é uma pasta do sistema (usada por outros módulos) e não pode ser movida.` }, { status: 409 });
    }
    if (destinoPai) {
      // Sem ciclo: o destino não pode ser a própria pasta nem uma descendente.
      const todas = await prismaSemEscopo.documentoCategoria.findMany({ select: { id: true, paiId: true } });
      const paiDe = new Map(todas.map((t) => [t.id, t.paiId]));
      if (!paiDe.has(destinoPai)) return NextResponse.json({ error: "Pasta de destino não encontrada." }, { status: 400 });
      let cur: string | null = destinoPai;
      for (let guarda = 0; cur && guarda < 50; guarda++) {
        if (cur === pasta.id) return NextResponse.json({ error: "Não dá para mover uma pasta para dentro dela mesma." }, { status: 409 });
        cur = paiDe.get(cur) ?? null;
      }
    }
    data.paiId = destinoPai;
  }

  if (body.nome !== undefined) {
    const nome = String(body.nome).trim().replace(/\s+/g, " ");
    if (!nome) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    if (nome.length > 120) return NextResponse.json({ error: "Nome muito longo (máx. 120)." }, { status: 400 });
    data.nome = nome;
  }

  // Nome único entre irmãs (no destino final).
  if (data.nome !== undefined || data.paiId !== undefined) {
    const nomeFinal = data.nome ?? pasta.nome;
    const irma = await prismaSemEscopo.documentoCategoria.findFirst({
      where: { paiId: destinoPai, nome: { equals: nomeFinal, mode: "insensitive" }, id: { not: pasta.id } },
      select: { id: true },
    });
    if (irma) return NextResponse.json({ error: `Já existe uma pasta "${nomeFinal}" ${destinoPai ? "nesse destino" : "na raiz"}.` }, { status: 409 });
  }

  if (body.ativo !== undefined) data.ativo = !!body.ativo;
  if (body.exigeValidade !== undefined) data.exigeValidade = !!body.exigeValidade;
  if (body.diasAlerta !== undefined) {
    const n = parseInt(String(body.diasAlerta));
    if (!Number.isFinite(n) || n < 0 || n > 3650) return NextResponse.json({ error: "Dias de alerta inválido." }, { status: 400 });
    data.diasAlerta = n;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
  const atualizada = await prismaSemEscopo.documentoCategoria.update({ where: { id: pasta.id }, data });
  return NextResponse.json({ data: atualizada });
}

// DELETE — só pasta VAZIA (sem documentos de nenhuma empresa, sem subpastas,
// sem obrigação do SST apontando) e que não seja de sistema. Nada destrutivo:
// por isso não passa pela Lixeira.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireModulo("documentos");
  if (!auth.ok) return auth.response;
  const pasta = await prismaSemEscopo.documentoCategoria.findUnique({
    where: { id: params.id },
    include: { _count: { select: { documentos: true, filhas: true, sstObrigacoes: true } } },
  });
  if (!pasta) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  if (ehPastaSistema(pasta)) {
    return NextResponse.json({ error: `"${pasta.nome}" é uma pasta do sistema (usada por outros módulos) e não pode ser excluída. Você pode renomeá-la ou inativá-la.` }, { status: 409 });
  }
  const { documentos, filhas, sstObrigacoes } = pasta._count;
  if (documentos > 0 || filhas > 0 || sstObrigacoes > 0) {
    const partes = [
      documentos > 0 && `${documentos} documento${documentos > 1 ? "s" : ""}`,
      filhas > 0 && `${filhas} subpasta${filhas > 1 ? "s" : ""}`,
      sstObrigacoes > 0 && `${sstObrigacoes} obrigação(ões) do SST`,
    ].filter(Boolean).join(", ");
    return NextResponse.json({ error: `A pasta "${pasta.nome}" não está vazia (${partes}${documentos > 0 ? ", contando todas as empresas" : ""}). Mova ou exclua o conteúdo antes.` }, { status: 409 });
  }
  await prismaSemEscopo.documentoCategoria.delete({ where: { id: pasta.id } });
  return NextResponse.json({ ok: true });
}
