"use client";

// Agenda — datas finais (prazos) das atividades de todos os projetos do
// usuário em três visões: mês (grade), semana (colunas com horários) e lista
// por urgência. Atividade com hora entra no horário; sem hora é "dia inteiro".
// Feed ICS assinável no Calendário do Mac e no Google Agenda.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertTriangle, CalendarDays, CalendarClock, CalendarRange, Inbox, Check,
  Link as LinkIcon, Apple, CalendarPlus, List, ChevronLeft, ChevronRight,
} from "lucide-react";
import { AvatarUsuario, PrioridadeBadge } from "@/components/projetos/comum";
import { prazoInfo, diaPrazo } from "@/components/projetos/tipos";

type TarefaAgendaDTO = {
  id: string;
  titulo: string;
  prazo: string;
  prazoHora?: string | null;
  prioridade: string;
  projeto: { id: string; nome: string; cor: string | null };
  coluna: { nome: string };
  membros: { id: string; nome: string }[];
};

type Visao = "mes" | "semana" | "lista";

// Mudança de prazo pelo arraste: hora `null` = vira dia inteiro; `undefined` = mantém.
type MudarPrazo = (id: string, novaData: string, hora?: string | null) => void;

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Ordena: dia inteiro primeiro, depois por hora.
function ordenarPorHora(a: TarefaAgendaDTO, b: TarefaAgendaDTO) {
  if (!a.prazoHora && !b.prazoHora) return 0;
  if (!a.prazoHora) return -1;
  if (!b.prazoHora) return 1;
  return a.prazoHora.localeCompare(b.prazoHora);
}

function agruparPorDia(tarefas: TarefaAgendaDTO[]) {
  const porDia = new Map<string, TarefaAgendaDTO[]>();
  for (const t of tarefas) {
    const k = chaveDia(diaPrazo(t.prazo));
    porDia.set(k, [...(porDia.get(k) ?? []), t]);
  }
  porDia.forEach((lista) => lista.sort(ordenarPorHora));
  return porDia;
}

function Legenda({ tarefas }: { tarefas: TarefaAgendaDTO[] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mt-3">
      {Array.from(new Map(tarefas.map((t) => [t.projeto.id, t.projeto])).values()).map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor ?? "#64748b" }} /> {p.nome}
        </span>
      ))}
    </div>
  );
}

function BotaoNav({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted">
      {children}
    </button>
  );
}

// ── Mês ─────────────────────────────────────────────────────────────────────
// Grade mensal estilo Google Agenda: eventos como chips na cor do projeto
// (com a hora na frente quando houver); arrastar para outro dia muda o prazo.
function AgendaMes({
  tarefas, onAbrir, onMudarPrazo,
}: {
  tarefas: TarefaAgendaDTO[];
  onAbrir: (t: TarefaAgendaDTO) => void;
  onMudarPrazo: MudarPrazo;
}) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDia, setDropDia] = useState<string | null>(null);

  const primeiro = new Date(ano, mes, 1);
  const inicioGrade = new Date(primeiro);
  inicioGrade.setDate(1 - primeiro.getDay());
  const dias: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setDate(inicioGrade.getDate() + i);
    return d;
  });

  const porDia = agruparPorDia(tarefas);

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  const chaveHoje = chaveDia(hoje);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <BotaoNav onClick={() => navegar(-1)}><ChevronLeft className="w-4 h-4" /></BotaoNav>
        <span className="font-semibold text-foreground capitalize min-w-40 text-center">
          {new Date(ano, mes).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <BotaoNav onClick={() => navegar(1)}><ChevronRight className="w-4 h-4" /></BotaoNav>
        <button onClick={() => { setAno(hoje.getFullYear()); setMes(hoje.getMonth()); }} className="text-xs text-info hover:underline">Hoje</button>
        <span className="text-xs text-muted-foreground ml-auto">Arraste um evento para mudar o prazo</span>
      </div>

      <div className="grid grid-cols-7 border border-border rounded-xl overflow-hidden bg-card">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted border-b border-border text-center">{d}</div>
        ))}
        {dias.map((dia) => {
          const k = chaveDia(dia);
          const doMes = dia.getMonth() === mes;
          const lista = porDia.get(k) ?? [];
          return (
            <div
              key={k}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropDia(k); } }}
              onDragLeave={() => { if (dropDia === k) setDropDia(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) onMudarPrazo(dragId, k); setDragId(null); setDropDia(null); }}
              className={cn(
                "min-h-28 border-b border-r border-border p-1 align-top",
                !doMes && "bg-muted/40",
                dropDia === k && "bg-info/10 ring-1 ring-inset ring-info/40"
              )}
            >
              <span className={cn(
                "inline-flex items-center justify-center text-xs w-5 h-5 rounded-full mb-0.5",
                k === chaveHoje ? "bg-blue-600 text-white font-bold" : doMes ? "text-foreground" : "text-muted-foreground/50"
              )}>
                {dia.getDate()}
              </span>
              <div className="space-y-0.5">
                {lista.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    draggable
                    // setData é obrigatório p/ o drag iniciar em alguns navegadores
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setDropDia(null); }}
                    onClick={() => onAbrir(t)}
                    className={cn(
                      "text-[11px] leading-tight px-1.5 py-1 rounded-md cursor-pointer truncate text-white font-medium",
                      dragId === t.id && "opacity-40"
                    )}
                    style={{ backgroundColor: t.projeto.cor ?? "#64748b" }}
                    title={`${t.prazoHora ? t.prazoHora + " · " : ""}${t.titulo} — ${t.projeto.nome}`}
                  >
                    {t.prazoHora && <span className="opacity-80 mr-1 tabular-nums">{t.prazoHora}</span>}
                    {t.titulo}
                  </div>
                ))}
                {lista.length > 4 && <p className="text-[10px] text-muted-foreground px-1">+{lista.length - 4}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Legenda tarefas={tarefas} />
    </div>
  );
}

// ── Semana ──────────────────────────────────────────────────────────────────
// Sete colunas com faixa "dia inteiro" no topo e grade de horas embaixo.
// Atividade com hora vira bloco na hora; arrastar para outra célula muda dia
// e hora (soltar na faixa do topo tira a hora).
const ALTURA_HORA = 48; // px por hora
const HORA_INI_PADRAO = 7, HORA_FIM_PADRAO = 19;

function AgendaSemana({
  tarefas, onAbrir, onMudarPrazo,
}: {
  tarefas: TarefaAgendaDTO[];
  onAbrir: (t: TarefaAgendaDTO) => void;
  onMudarPrazo: MudarPrazo;
}) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const domingoDe = (d: Date) => { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0, 0, 0, 0); return x; };
  const [inicio, setInicio] = useState<Date>(() => domingoDe(hoje));
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<string | null>(null); // "dia" ou "dia|hora"
  const [agora, setAgora] = useState(() => new Date());

  // Linha do "agora" anda sozinha.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
  const chaves = dias.map(chaveDia);
  const porDia = agruparPorDia(tarefas);

  // Faixa de horas: padrão 07–19, esticada p/ caber atividades fora dela.
  let hIni = HORA_INI_PADRAO, hFim = HORA_FIM_PADRAO;
  for (const k of chaves) {
    for (const t of porDia.get(k) ?? []) {
      if (!t.prazoHora) continue;
      const h = parseInt(t.prazoHora.slice(0, 2));
      if (h < hIni) hIni = h;
      if (h + 1 > hFim) hFim = Math.min(24, h + 1);
    }
  }
  const horas = Array.from({ length: hFim - hIni }, (_, i) => hIni + i);

  function navegar(deltaSemanas: number) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + 7 * deltaSemanas); setInicio(d);
  }

  const fim = dias[6];
  const mesmoMes = inicio.getMonth() === fim.getMonth();
  const titulo = mesmoMes
    ? `${inicio.getDate()} – ${fim.getDate()} de ${inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`
    : `${inicio.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${fim.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;

  const chaveHoje = chaveDia(hoje);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const topoAgora = ((minutosAgora / 60) - hIni) * ALTURA_HORA;

  function iniciarDrag(e: React.DragEvent, t: TarefaAgendaDTO) {
    e.dataTransfer.setData("text/plain", t.id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(t.id);
  }
  function finalizarDrag() { setDragId(null); setDrop(null); }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <BotaoNav onClick={() => navegar(-1)} title="Semana anterior"><ChevronLeft className="w-4 h-4" /></BotaoNav>
        <span className="font-semibold text-foreground min-w-56 text-center">{titulo}</span>
        <BotaoNav onClick={() => navegar(1)} title="Próxima semana"><ChevronRight className="w-4 h-4" /></BotaoNav>
        <button onClick={() => setInicio(domingoDe(hoje))} className="text-xs text-info hover:underline">Hoje</button>
        <span className="text-xs text-muted-foreground ml-auto">Arraste um evento para mudar dia e hora</span>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        {/* Cabeçalho dos dias */}
        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          <div className="bg-muted border-b border-border" />
          {dias.map((d, i) => (
            <div key={chaves[i]} className={cn("px-2 py-1.5 text-center bg-muted border-b border-l border-border", chaves[i] === chaveHoje && "bg-info/10")}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">{DIAS_SEMANA[d.getDay()]}</p>
              <p className={cn(
                "inline-flex items-center justify-center text-sm w-7 h-7 rounded-full font-semibold",
                chaves[i] === chaveHoje ? "bg-blue-600 text-white" : "text-foreground"
              )}>
                {d.getDate()}
              </p>
            </div>
          ))}
        </div>

        {/* Faixa "dia inteiro" (sem hora) */}
        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          <div className="text-[10px] text-muted-foreground text-right pr-2 py-1.5 border-b border-border">dia inteiro</div>
          {chaves.map((k) => {
            const lista = (porDia.get(k) ?? []).filter((t) => !t.prazoHora);
            return (
              <div
                key={k}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setDrop(k); } }}
                onDragLeave={() => { if (drop === k) setDrop(null); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) onMudarPrazo(dragId, k, null); finalizarDrag(); }}
                className={cn("min-h-8 p-1 space-y-0.5 border-b border-l border-border", drop === k && "bg-info/10 ring-1 ring-inset ring-info/40")}
              >
                {lista.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => iniciarDrag(e, t)}
                    onDragEnd={finalizarDrag}
                    onClick={() => onAbrir(t)}
                    className={cn("text-[11px] leading-tight px-1.5 py-1 rounded-md cursor-pointer truncate text-white font-medium", dragId === t.id && "opacity-40")}
                    style={{ backgroundColor: t.projeto.cor ?? "#64748b" }}
                    title={`${t.titulo} — ${t.projeto.nome}`}
                  >
                    {t.titulo}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Grade de horas */}
        <div className="grid max-h-[60vh] overflow-y-auto" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          {/* Régua */}
          <div className="relative" style={{ height: horas.length * ALTURA_HORA }}>
            {horas.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: i * ALTURA_HORA }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {chaves.map((k) => {
            const comHora = (porDia.get(k) ?? []).filter((t) => t.prazoHora);
            // Blocos na mesma hora dividem a largura da coluna.
            const porHora = new Map<number, TarefaAgendaDTO[]>();
            for (const t of comHora) {
              const h = parseInt(t.prazoHora!.slice(0, 2));
              porHora.set(h, [...(porHora.get(h) ?? []), t]);
            }
            return (
              <div key={k} className={cn("relative border-l border-border", k === chaveHoje && "bg-info/[0.03]")} style={{ height: horas.length * ALTURA_HORA }}>
                {/* Células-alvo (uma por hora) */}
                {horas.map((h, i) => {
                  const alvo = `${k}|${h}`;
                  return (
                    <div
                      key={h}
                      onDragOver={(e) => { if (dragId) { e.preventDefault(); setDrop(alvo); } }}
                      onDragLeave={() => { if (drop === alvo) setDrop(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId) {
                          // Mantém os minutos da atividade arrastada (14:30 → 16:30).
                          const arrastada = tarefas.find((t) => t.id === dragId);
                          const min = arrastada?.prazoHora ? arrastada.prazoHora.slice(3, 5) : "00";
                          onMudarPrazo(dragId, k, `${String(h).padStart(2, "0")}:${min}`);
                        }
                        finalizarDrag();
                      }}
                      className={cn("absolute inset-x-0 border-b border-border/60", drop === alvo && "bg-info/10 ring-1 ring-inset ring-info/40")}
                      style={{ top: i * ALTURA_HORA, height: ALTURA_HORA }}
                    />
                  );
                })}
                {/* Linha do agora */}
                {k === chaveHoje && topoAgora >= 0 && topoAgora <= horas.length * ALTURA_HORA && (
                  <div className="absolute inset-x-0 z-10 pointer-events-none flex items-center" style={{ top: topoAgora }}>
                    <span className="w-2 h-2 rounded-full bg-danger -ml-1" />
                    <span className="flex-1 h-px bg-danger" />
                  </div>
                )}
                {/* Blocos */}
                {comHora.map((t) => {
                  const h = parseInt(t.prazoHora!.slice(0, 2)), m = parseInt(t.prazoHora!.slice(3, 5));
                  const irmaos = porHora.get(h)!;
                  const idx = irmaos.indexOf(t), n = irmaos.length;
                  const top = ((h + m / 60) - hIni) * ALTURA_HORA;
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => iniciarDrag(e, t)}
                      onDragEnd={finalizarDrag}
                      onClick={() => onAbrir(t)}
                      className={cn(
                        "absolute z-[5] text-[11px] leading-tight px-1.5 py-1 rounded-md cursor-pointer overflow-hidden text-white font-medium shadow-sm",
                        dragId === t.id && "opacity-40"
                      )}
                      style={{
                        top: top + 1,
                        height: ALTURA_HORA - 3,
                        left: `calc(${(idx / n) * 100}% + 2px)`,
                        width: `calc(${100 / n}% - 4px)`,
                        backgroundColor: t.projeto.cor ?? "#64748b",
                      }}
                      title={`${t.prazoHora} · ${t.titulo} — ${t.projeto.nome}`}
                    >
                      <span className="opacity-80 tabular-nums">{t.prazoHora}</span> {t.titulo}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Legenda tarefas={tarefas} />
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const router = useRouter();
  const { user } = useSession();
  useTabTitle("Agenda");

  const [tarefas, setTarefas] = useState<TarefaAgendaDTO[]>([]);
  const [icsUrl, setIcsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [soMinhas, setSoMinhas] = usePersistedState<boolean>("projetos:agenda:sominhas", false);
  const [visaoRaw, setVisao] = usePersistedState<string>("projetos:agenda:visao", "mes");
  // "calendario" era o nome antigo da visão mensal.
  const visao: Visao = visaoRaw === "semana" || visaoRaw === "lista" ? visaoRaw : "mes";
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch("/api/projetos/agenda")
      .then((r) => r.json())
      .then((j) => { setTarefas(j.data ?? []); setIcsUrl(j.icsUrl ?? ""); })
      .finally(() => setLoading(false));
  }, []);

  // webcal:// dispara a assinatura direto no Calendário do Mac; o Google
  // Agenda assina a mesma URL pela tela "Adicionar por URL".
  const webcalUrl = icsUrl.replace(/^https?:\/\//, "webcal://");

  async function copiarLink() {
    try { await navigator.clipboard.writeText(icsUrl); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ }
  }

  const visiveis = soMinhas ? tarefas.filter((t) => t.membros.some((m) => m.id === user?.id)) : tarefas;

  // Arrastar: muda prazo (e hora, na semana) otimista e persiste em segundo plano.
  const mudarPrazo: MudarPrazo = async (id, novaData, hora) => {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, prazo: novaData, prazoHora: hora === undefined ? t.prazoHora : hora } : t)));
    await fetch(`/api/projetos/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hora === undefined ? { prazo: novaData } : { prazo: novaData, prazoHora: hora }),
    }).catch(() => {});
  };

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
  const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() + 7);
  const dia = (iso: string) => diaPrazo(iso);

  const grupos: { titulo: string; icone: React.ReactNode; cls?: string; lista: TarefaAgendaDTO[] }[] = [
    { titulo: "Atrasadas", icone: <AlertTriangle className="w-4 h-4" />, cls: "text-danger", lista: visiveis.filter((t) => dia(t.prazo) < hoje) },
    { titulo: "Hoje", icone: <CalendarDays className="w-4 h-4" />, cls: "text-warning", lista: visiveis.filter((t) => dia(t.prazo).getTime() === hoje.getTime()).sort(ordenarPorHora) },
    { titulo: "Amanhã", icone: <CalendarClock className="w-4 h-4" />, lista: visiveis.filter((t) => dia(t.prazo).getTime() === amanha.getTime()).sort(ordenarPorHora) },
    { titulo: "Esta semana", icone: <CalendarDays className="w-4 h-4" />, lista: visiveis.filter((t) => { const d = dia(t.prazo); return d > amanha && d <= fimSemana; }) },
    { titulo: "Mais adiante", icone: <Inbox className="w-4 h-4" />, lista: visiveis.filter((t) => dia(t.prazo) > fimSemana) },
  ];

  const abrir = (t: TarefaAgendaDTO) => router.push(`/projetos/${t.projeto.id}?tarefa=${t.id}`);

  const botoesVisao: { k: Visao; title: string; icone: React.ReactNode }[] = [
    { k: "mes", title: "Mês", icone: <CalendarDays className="w-4 h-4" /> },
    { k: "semana", title: "Semana", icone: <CalendarRange className="w-4 h-4" /> },
    { k: "lista", title: "Lista", icone: <List className="w-4 h-4" /> },
  ];

  return (
    <div>
      <PageHeader title="Agenda" breadcrumbs={[{ label: "Projetos", href: "/projetos" }, { label: "Agenda" }]} />
      <div className={cn("px-8 pb-8 space-y-6", visao === "lista" ? "max-w-4xl" : "max-w-6xl")}>
        {/* Visão + assinatura nos calendários externos */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {botoesVisao.map((b) => (
              <button
                key={b.k}
                onClick={() => setVisao(b.k)}
                title={b.title}
                className={cn("px-3 py-1.5 inline-flex items-center gap-1.5 transition-colors", visao === b.k ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
              >
                {b.icone} <span className="text-xs font-medium">{b.title}</span>
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={() => { window.location.href = webcalUrl; }}>
            <Apple className="w-3.5 h-3.5" /> Calendário do Mac
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={() => window.open(`https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(icsUrl)}`, "_blank")}>
            <CalendarPlus className="w-3.5 h-3.5" /> Google Agenda
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={copiarLink}>
            {copiado ? <Check className="w-3.5 h-3.5 text-success" /> : <LinkIcon className="w-3.5 h-3.5" />} {copiado ? "Copiado!" : "Copiar link do feed"}
          </Button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} className="accent-blue-600" />
            Só minhas tarefas
          </label>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          Assine uma vez e os prazos aparecem no calendário (com hora, quando a atividade tiver) — o app atualiza o feed sozinho (~1h).
        </p>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visao === "mes" ? (
          <AgendaMes tarefas={visiveis} onAbrir={abrir} onMudarPrazo={mudarPrazo} />
        ) : visao === "semana" ? (
          <AgendaSemana tarefas={visiveis} onAbrir={abrir} onMudarPrazo={mudarPrazo} />
        ) : visiveis.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma atividade com data final.</p>
          </div>
        ) : (
          grupos.map((g) =>
            g.lista.length === 0 ? null : (
              <div key={g.titulo}>
                <div className={cn("flex items-center gap-2 mb-2 text-sm font-semibold uppercase tracking-wide", g.cls ?? "text-muted-foreground")}>
                  {g.icone} {g.titulo} <span className="font-normal">({g.lista.length})</span>
                </div>
                <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {g.lista.map((t) => {
                    const prazo = prazoInfo(t.prazo, false, t.prazoHora);
                    return (
                      <button
                        key={t.id}
                        onClick={() => abrir(t)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.projeto.cor ?? "#64748b" }} title={t.projeto.nome} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{t.titulo}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {t.projeto.nome} · {t.coluna.nome}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex -space-x-1">
                            {t.membros.slice(0, 3).map((m) => <AvatarUsuario key={m.id} nome={m.nome} size="sm" />)}
                          </div>
                          <PrioridadeBadge prioridade={t.prioridade} small />
                          {prazo && <span className={cn("text-xs whitespace-nowrap", prazo.cls)}>{prazo.label}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
