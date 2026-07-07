import { NextRequest } from "next/server";
import { gerarSnippet } from "@/lib/tracking/snippet";

// GET /api/t/s.js — serve o snippet de tracking (público, liberado no
// middleware pelo prefixo /api/t). Não valida nada: o script em si não expõe
// dados — a ingestão (/api/t/e) é quem valida siteId + Origin (fail-closed).
// Cache de 1h: o snippet muda raramente e é buscado por todo visitante.
export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;
  return new Response(gerarSnippet(baseUrl), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
