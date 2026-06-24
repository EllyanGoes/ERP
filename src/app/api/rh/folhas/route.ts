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
  return NextResponse.json({ data });
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
    blob = await put(`rh/folhas/${empresaId}/${Date.now()}-${file.name}`, file, { access: "public" });
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
      empresaId, competencia: new Date(), status: "EM_REVISAO",
      arquivoUrl: blob.url, arquivoNome: file.name, criadoPor: auth.session.sub,
    },
    select: { id: true },
  });
  return NextResponse.json({ data: folha }, { status: 201 });
}
