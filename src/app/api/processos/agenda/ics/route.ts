export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prazosDaAgenda } from "@/lib/processos-agenda";
import { tokenFeedProcessosValido } from "@/lib/processos-externo";

// GET /api/processos/agenda/ics?u=<usuarioId>&t=<hmac>[&meus=1] — feed iCalendar dos prazos pendentes
// dos processos que o usuário pode ver (todas as empresas dele; confidencial só p/ quem pode).
// Rota PÚBLICA no middleware (apps de calendário não mandam cookie): a autenticação é o HMAC.
// A cada consulta revalida usuário ativo + permissão do módulo; o app reconsulta sozinho (TTL 1h).
// Processo confidencial aparece só com o código (sem título) — o calendário pode ser compartilhado.

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!u || !t || !tokenFeedProcessosValido(u, t)) return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  const prazos = await prazosDaAgenda(u, { meus: req.nextUrl.searchParams.get("meus") === "1" });
  if (!prazos) return NextResponse.json({ error: "Sem acesso ao módulo Processos." }, { status: 403 });

  const agora = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const linhas: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ERP//Processos Prazos//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Prazos — Processos", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const pr of prazos) {
    // Prazo é um DIA (meia-noite UTC): evento de dia inteiro, DTEND exclusivo.
    const fim = new Date(pr.vence.getTime() + 86_400_000);
    const url = `${req.nextUrl.origin}/processos/${pr.processo.id}`;
    const nome = pr.processo.confidencial ? `${pr.processo.codigo} (confidencial)` : `${pr.processo.codigo} — ${pr.processo.titulo}`;
    linhas.push(
      "BEGIN:VEVENT",
      `UID:prazo-${pr.id}@erp-processos`,
      `DTSTAMP:${agora}`,
      `DTSTART;VALUE=DATE:${ymd(pr.vence)}`,
      `DTEND;VALUE=DATE:${ymd(fim)}`,
      `SUMMARY:${esc(`⚖️ ${pr.descricao} — ${pr.processo.codigo}`)}`,
      `DESCRIPTION:${esc(`${nome}\n${pr.processo.confidencial ? "" : `${pr.processo.orgao}\n`}${url}`)}`,
      `URL:${url}`,
      "CATEGORIES:Processos",
      // Lembrete no próprio calendário com a antecedência de aviso do prazo.
      ...(pr.avisoDias > 0 ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Prazo: ${pr.descricao}`)}`, `TRIGGER:-P${pr.avisoDias}D`, "END:VALARM"] : []),
      "END:VEVENT",
    );
  }
  linhas.push("END:VCALENDAR");
  return new NextResponse(linhas.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="prazos-processos.ics"', "Cache-Control": "private, max-age=300" },
  });
}
