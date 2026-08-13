export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { arquivoExiste, driveAtivo } from "@/lib/drive";

/**
 * Cron semanal: confere se os arquivos das versões vigentes ainda existem no
 * Drive (alguém pode ter movido/apagado por fora). Marca Documento.arquivoOk.
 * Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!driveAtivo()) return NextResponse.json({ ok: true, pulado: "drive inativo" });

  const docs = await prismaSemEscopo.documento.findMany({
    where: { versaoVigente: { provider: "DRIVE", driveFileId: { not: null } } },
    select: { id: true, arquivoOk: true, versaoVigente: { select: { driveFileId: true } } },
  });

  let alterados = 0;
  for (const d of docs) {
    const ok = await arquivoExiste(d.versaoVigente!.driveFileId!);
    if (ok !== d.arquivoOk) {
      await prismaSemEscopo.documento.update({ where: { id: d.id }, data: { arquivoOk: ok } });
      alterados++;
    }
  }
  return NextResponse.json({ ok: true, verificados: docs.length, alterados });
}
