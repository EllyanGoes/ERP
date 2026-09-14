export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prismaSemEscopo } from "@/lib/prisma";
import { tokenFeedAgendaValido } from "@/lib/projetos";

// GET /api/projetos/agenda/ics?u=<usuarioId>&t=<hmac> — feed iCalendar com as
// datas finais das tarefas abertas do usuário (projetos onde é dono/membro).
// Rota PÚBLICA no middleware: apps de calendário não têm cookie de sessão;
// a autenticação é o token HMAC da própria URL (ver tokenFeedAgenda).
// Eventos de dia inteiro na data do prazo; o app reconsulta sozinho (TTL 1h).

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

const TZ = "America/Sao_Paulo";

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!u || !t || !tokenFeedAgendaValido(u, t)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const tarefas = await prismaSemEscopo.tarefa.findMany({
    where: {
      arquivada: false,
      concluidaEm: null,
      prazo: { not: null },
      projeto: { status: "ATIVO", OR: [{ donoId: u }, { membros: { some: { usuarioId: u } } }] },
    },
    select: {
      id: true, titulo: true, prazo: true, prazoHora: true, updatedAt: true,
      projeto: { select: { id: true, nome: true } },
    },
    orderBy: { prazo: "asc" },
  });

  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ERP//Projetos Agenda//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Agenda — Projetos",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // Eventos com hora usam o fuso local do grupo (Brasil, sem horário de verão).
    "BEGIN:VTIMEZONE",
    `TZID:${TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const tf of tarefas) {
    const inicio = tf.prazo!;
    const fim = new Date(inicio.getTime() + 86400000); // dia inteiro: DTEND exclusivo
    const url = `${req.nextUrl.origin}/projetos/${tf.projeto.id}?tarefa=${tf.id}`;
    // Com hora: evento de 1h no fuso local (DTSTART;TZID=...). Sem hora: dia inteiro.
    let dtstart = `DTSTART;VALUE=DATE:${ymd(inicio)}`;
    let dtend = `DTEND;VALUE=DATE:${ymd(fim)}`;
    if (tf.prazoHora) {
      const [h, m] = tf.prazoHora.split(":").map(Number);
      const hm = (hh: number, mm: number) => `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
      const fimH = h + 1 > 23 ? 23 : h + 1, fimM = h + 1 > 23 ? 59 : m;
      dtstart = `DTSTART;TZID=${TZ}:${ymd(inicio)}T${hm(h, m)}`;
      dtend = `DTEND;TZID=${TZ}:${ymd(inicio)}T${hm(fimH, fimM)}`;
    }
    linhas.push(
      "BEGIN:VEVENT",
      `UID:tarefa-${tf.id}@erp-projetos`,
      `DTSTAMP:${tf.updatedAt.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      dtstart,
      dtend,
      `SUMMARY:${esc(`${tf.titulo} — ${tf.projeto.nome}`)}`,
      `DESCRIPTION:${esc(url)}`,
      `URL:${url}`,
      "END:VEVENT",
    );
  }
  linhas.push("END:VCALENDAR");

  return new NextResponse(linhas.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda-projetos.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
