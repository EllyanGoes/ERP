export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import {
  MAX_BODY_BYTES,
  dentroDoRateLimit,
  hostnameDoOrigin,
  hostnamePermitido,
  ingestSchema,
  normalizarPath,
} from "@/lib/tracking/ingest";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/t/e — ingestão de eventos do snippet (PRD seção 3.3).
//
// Rota pública (prefixo /api/t liberado no middleware) e SEM sessão de usuário
// → usa prismaSemEscopo (o proxy com escopo lê cookie e não funciona aqui).
//
// Segurança fail-closed: só aceita se o site existe/está ativo E o hostname do
// Origin está na allowlist de domínios do site. Sem Origin → 403 (browsers
// sempre mandam Origin em POST cross-origin; requests sem Origin são bots ou
// chamadas diretas, que não nos interessam).
// ─────────────────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export async function POST(req: NextRequest) {
  // 1. Cap de payload: lê como texto (o snippet manda text/plain para evitar
  //    preflight no sendBeacon) e rejeita acima de 10KB.
  const texto = await req.text();
  if (new TextEncoder().encode(texto).length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // 2. Parse + validação Zod (inclui o cap de 20 eventos).
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = ingestSchema.safeParse(bruto);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const dados = parsed.data;

  // 3. Site ativo + Origin na allowlist (fail-closed: sem Origin, rejeita).
  const origin = req.headers.get("origin");
  const hostname = hostnameDoOrigin(origin);
  if (!origin || !hostname) return new NextResponse(null, { status: 403 });

  const site = await prismaSemEscopo.siteRastreado.findFirst({
    where: { id: dados.site, ativo: true },
    select: { id: true, dominios: true },
  });
  if (!site || !hostnamePermitido(hostname, site.dominios)) {
    return new NextResponse(null, { status: 403 });
  }
  const cors = corsHeaders(origin);

  // 4. Rate limit em memória por ip:site. O IP (primeiro item do
  //    x-forwarded-for) é usado SÓ como chave do limitador — não é armazenado.
  const ip = (req.headers.get("x-forwarded-for") ?? "?").split(",")[0].trim();
  if (!dentroDoRateLimit(`${ip}:${site.id}`)) {
    return new NextResponse(null, { status: 429, headers: cors });
  }

  const agora = new Date();

  // 5. Visitante + sessão.
  await prismaSemEscopo.trackingVisitante.upsert({
    where: { id: dados.vid },
    create: { id: dados.vid },
    update: { ultimoEm: agora },
  });

  // Sessão via upsert (dois beacons simultâneos da mesma sessão nova não podem
  // estourar o unique do id). `novaSessao` só vem no 1º payload da sessão —
  // referrer/UTMs/campanha ficam no create e nunca são sobrescritos no update.
  const ns = dados.novaSessao;
  const utm = ns?.utm;

  // Resolve a campanha: pelo ?cid= do link oficial ou por utm_campaign
  // (case-insensitive) — só quando o payload traz novaSessao.
  let campanhaId: string | null = null;
  if (ns?.cid) {
    const porCid = await prismaSemEscopo.campanha.findFirst({
      where: { id: ns.cid, ativo: true },
      select: { id: true },
    });
    campanhaId = porCid?.id ?? null;
  }
  if (!campanhaId && utm?.campaign) {
    const porUtm = await prismaSemEscopo.campanha.findFirst({
      where: { utmCampaign: { equals: utm.campaign, mode: "insensitive" }, ativo: true },
      select: { id: true },
    });
    campanhaId = porUtm?.id ?? null;
  }

  // Dispositivo derivado do user-agent do request — o UA cru é DESCARTADO
  // (privacidade: não armazenamos IP nem UA, só "mobile"/"desktop").
  const ua = req.headers.get("user-agent") ?? "";
  const dispositivo = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";

  await prismaSemEscopo.trackingSessao.upsert({
    where: { id: dados.sid },
    update: { ultimoEm: agora },
    create: {
      id: dados.sid,
      visitanteId: dados.vid,
      siteId: site.id,
      referrer: ns?.ref ? ns.ref.slice(0, 1000) : null,
      utmSource: utm?.source?.slice(0, 200) ?? null,
      utmMedium: utm?.medium?.slice(0, 200) ?? null,
      utmCampaign: utm?.campaign?.slice(0, 200) ?? null,
      utmTerm: utm?.term?.slice(0, 200) ?? null,
      utmContent: utm?.content?.slice(0, 200) ?? null,
      campanhaId,
      dispositivo,
    },
  });

  // 6. Eventos do batch.
  if (dados.eventos.length > 0) {
    await prismaSemEscopo.trackingEvento.createMany({
      data: dados.eventos.map((e) => ({
        sessaoId: dados.sid,
        visitanteId: dados.vid,
        siteId: site.id,
        tipo: e.tipo,
        nome: e.nome ? e.nome.slice(0, 100) : null,
        path: normalizarPath(e.path),
      })),
    });
  }

  // 7. identify: casa Lead por email (insensitive) e amarra visitante↔lead.
  if (dados.identify?.email) {
    const lead = await prismaSemEscopo.lead.findFirst({
      where: { email: { equals: dados.identify.email, mode: "insensitive" }, ativo: true },
      select: { id: true, visitanteId: true },
    });
    if (lead) {
      await prismaSemEscopo.trackingVisitante.update({
        where: { id: dados.vid },
        data: { leadId: lead.id },
      });
      if (!lead.visitanteId) {
        await prismaSemEscopo.lead.update({
          where: { id: lead.id },
          data: { visitanteId: dados.vid },
        });
      }
    }
  }

  // 8. 204 com CORS dinâmico (origin já validado contra a allowlist).
  return new NextResponse(null, { status: 204, headers: cors });
}

// Preflight CORS do fetch fallback (content-type application/json dispara
// preflight). Valida o Origin contra os domínios de ALGUM site ativo; origin
// desconhecido responde 204 sem os headers CORS (o browser bloqueia sozinho).
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const hostname = hostnameDoOrigin(origin);
  if (origin && hostname) {
    const sites = await prismaSemEscopo.siteRastreado.findMany({
      where: { ativo: true },
      select: { dominios: true },
    });
    const permitido = sites.some((s) => hostnamePermitido(hostname, s.dominios));
    if (permitido) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
  }
  return new NextResponse(null, { status: 204 });
}
