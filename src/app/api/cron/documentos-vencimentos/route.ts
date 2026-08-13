export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { notificarUsuario } from "@/lib/notificacoes";
import { statusDerivado } from "@/lib/documentos";
import { sendTelegramMessage, escMD } from "@/lib/telegram";

/**
 * Cron diário: recomputa status por validade, notifica responsáveis em marcos
 * (diasAlerta, 7d, 1d, vencimento e toda segunda depois de vencido) e manda o
 * resumo dos críticos no Telegram. Protegido por CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await prismaSemEscopo.documento.findMany({
    where: { validade: { not: null }, status: { notIn: ["ARQUIVADO"] } },
    include: { categoria: true },
  });
  const empresas = await prismaSemEscopo.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } });
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let notificados = 0;
  const criticos: string[] = [];

  for (const d of docs) {
    const diasAlerta = d.diasAlerta ?? d.categoria.diasAlerta;
    const novoStatus = statusDerivado(d.status, d.validade, diasAlerta);
    if (novoStatus !== d.status) {
      await prismaSemEscopo.documento.update({ where: { id: d.id }, data: { status: novoStatus } });
    }
    if (novoStatus !== "VENCE_EM_BREVE" && novoStatus !== "VENCIDO") continue;

    const v = new Date(d.validade!);
    v.setHours(0, 0, 0, 0);
    const dias = Math.round((v.getTime() - hoje.getTime()) / 86_400_000);
    const empresaNome = nomeEmpresa.get(d.empresaId) ?? "";

    // Marcos: exatamente diasAlerta/7/1/0; vencido → toda segunda-feira
    const marco = dias === diasAlerta || dias === 7 || dias === 1 || dias === 0 || (dias < 0 && hoje.getDay() === 1);
    if (!marco) {
      if (dias <= 7) criticos.push(`• ${d.titulo} (${empresaNome}) — ${dias < 0 ? `vencido há ${-dias}d` : dias === 0 ? "vence HOJE" : `vence em ${dias}d`}`);
      continue;
    }

    if (d.responsavelId) {
      await notificarUsuario({
        usuarioId: d.responsavelId,
        tipo: "DOCUMENTO_VENCIMENTO",
        titulo: dias < 0 ? `Documento vencido: ${d.titulo}` : `Documento vence ${dias === 0 ? "hoje" : `em ${dias} dia${dias > 1 ? "s" : ""}`}`,
        mensagem: `${d.titulo}${d.numero ? ` (${d.numero})` : ""} — ${empresaNome}. Validade: ${v.toLocaleDateString("pt-BR")}.`,
        link: `/documentos/${d.id}`,
      });
      notificados++;
    }
    criticos.push(`• ${d.titulo} (${empresaNome}) — ${dias < 0 ? `vencido há ${-dias}d` : dias === 0 ? "vence HOJE" : `vence em ${dias}d`}`);
  }

  if (criticos.length > 0) {
    await sendTelegramMessage({
      text: `📄 *Documentos — vencimentos*\n${escMD(Array.from(new Set(criticos)).slice(0, 20).join("\n"))}`,
    }).catch((e) => console.warn("[documentos] telegram falhou:", e));
  }

  return NextResponse.json({ ok: true, avaliados: docs.length, notificados, criticos: criticos.length });
}
