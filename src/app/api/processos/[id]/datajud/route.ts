export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { carregarProcesso, podeEditar } from "@/lib/processos";
import { consultarDatajud } from "@/lib/processos-datajud";

type Ctx = { params: { id: string } };

// POST — "Atualizar agora": consulta o DataJud deste processo e grava os andamentos novos.
// Não notifica (quem clicou já está vendo a tela).
export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModulo("processos");
  if (!auth.ok) return auth.response;
  if (!(await podeEditar(auth.session))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const p = await carregarProcesso(auth.session, params.id);
  if (!p) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const r = await consultarDatajud(p.id, { notificar: false });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });
  return NextResponse.json({ data: r });
}
