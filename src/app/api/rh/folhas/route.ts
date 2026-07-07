export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { put } from "@vercel/blob";
import { prisma, EMPRESA_PADRAO_ID } from "@/lib/prisma";

// GET /api/rh/folhas — lista as folhas da empresa ativa.
export async function GET() {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const data = await prisma.folhaPagamento.findMany({
    orderBy: { competencia: "desc" },
    include: { _count: { select: { itens: true } } },
  });
  // Itens ainda sem vínculo de colaborador por folha (p/ a % a classificar).
  const pendentes = await prisma.folhaItem.groupBy({
    by: ["folhaId"],
    where: { folhaId: { in: data.map((f) => f.id) }, colaboradorId: null },
    _count: { _all: true },
  });
  const pendentesPorFolha = new Map(pendentes.map((p) => [p.folhaId, p._count._all]));
  return NextResponse.json({
    data: data.map((f) => ({ ...f, itensPendentes: pendentesPorFolha.get(f.id) ?? 0 })),
  });
}

// POST /api/rh/folhas — upload do PDF + cria a folha (EM_REVISAO).
export async function POST(req: NextRequest) {
  const auth = await requireModulo("rh");
  if (!auth.ok) return auth.response;
  const empresaId = auth.session.activeEmpresaId ?? EMPRESA_PADRAO_ID;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Envie o PDF da folha" }, { status: 400 });
  // Aceita por tipo OU extensão (alguns navegadores não preenchem o MIME).
  const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!ehPdf) return NextResponse.json({ error: "O arquivo deve ser PDF" }, { status: 415 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Arquivo muito grande (máx. 25 MB)" }, { status: 413 });

  let blob: { url: string };
  try {
    // Privado: a folha tem salários. Lido depois pelo SDK (token), nunca por URL pública.
    blob = await put(`rh/folhas/${empresaId}/${Date.now()}-${file.name}`, file, { access: "private", addRandomSuffix: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const semToken = /token|BLOB_READ_WRITE_TOKEN|store/i.test(msg);
    return NextResponse.json(
      { error: semToken ? "Armazenamento de arquivos não configurado (Vercel Blob). Conecte um Blob Store no projeto e refaça o deploy." : `Falha ao subir o arquivo: ${msg}` },
      { status: 500 },
    );
  }

  // Competência provisória (agora) — a extração ajusta para o 1º dia da competência real.
  const folha = await prisma.folhaPagamento.create({
    data: {
      // criadoPor fica por conta do proxy de sessão, que carimba o NOME do
      // usuário (passar session.sub aqui gravava o id e o rodapé exibia o id cru).
      empresaId, competencia: new Date(), status: "EM_REVISAO",
      arquivoUrl: blob.url, arquivoNome: file.name,
    },
    select: { id: true },
  });
  return NextResponse.json({ data: folha }, { status: 201 });
}
