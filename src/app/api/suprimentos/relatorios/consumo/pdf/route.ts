export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { buildRelatorioConsumo } from "@/lib/relatorio-consumo";

export const maxDuration = 60;

export async function GET() {
  const { pdfBuffer } = await buildRelatorioConsumo();

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).replace(/\//g, "-");

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="consumo-${dateStr}.pdf"`,
    },
  });
}
