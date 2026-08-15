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
      id: true, titulo: true, prazo: true, updatedAt: true,
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
  ];
  for (const tf of tarefas) {
    const inicio = tf.prazo!;
    const fim = new Date(inicio.getTime() + 86400000); // dia inteiro: DTEND exclusivo
    const url = `${req.nextUrl.origin}/projetos/${tf.projeto.id}?tarefa=${tf.id}`;
    linhas.push(
      "BEGIN:VEVENT",
      `UID:tarefa-${tf.id}@erp-projetos`,
      `DTSTAMP:${tf.updatedAt.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${ymd(inicio)}`,
      `DTEND;VALUE=DATE:${ymd(fim)}`,
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
