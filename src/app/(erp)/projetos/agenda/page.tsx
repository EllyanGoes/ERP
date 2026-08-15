"use client";

// Agenda — datas finais (prazos) das atividades de todos os projetos do
// usuário, agrupadas por urgência, com feed ICS assinável no Calendário do
// Mac e no Google Agenda (o app reconsulta o feed sozinho).
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertTriangle, CalendarDays, CalendarClock, Inbox, Check,
  Link as LinkIcon, Apple, CalendarPlus, List, ChevronLeft, ChevronRight,
} from "lucide-react";
import { AvatarUsuario, PrioridadeBadge } from "@/components/projetos/comum";
import { prazoInfo, diaPrazo } from "@/components/projetos/tipos";

type TarefaAgendaDTO = {
  id: string;
  titulo: string;
  prazo: string;
  prioridade: string;
  projeto: { id: string; nome: string; cor: string | null };
  coluna: { nome: string };
  membros: { id: string; nome: string }[];
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Grade mensal estilo Google Agenda: eventos como chips na cor do projeto,
// arrastar para outro dia muda o prazo.
function AgendaCalendario({
  tarefas, onAbrir, onMudarPrazo,
}: {
  tarefas: TarefaAgendaDTO[];
  onAbrir: (t: TarefaAgendaDTO) => void;
  onMudarPrazo: (id: string, novaData: string) => void;
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

  const porDia = new Map<string, TarefaAgendaDTO[]>();
  for (const t of tarefas) {
    const k = chaveDia(diaPrazo(t.prazo));
    porDia.set(k, [...(porDia.get(k) ?? []), t]);
  }

  function navegar(delta: number) {
    const d = new Date(ano, mes + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth());
  }

  const chaveHoje = chaveDia(hoje);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => navegar(-1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
        <span className="font-semibold text-foreground capitalize min-w-40 text-center">
          {new Date(ano, mes).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => navegar(1)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
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
                    title={`${t.titulo} — ${t.projeto.nome}`}
                  >
                    {t.titulo}
                  </div>
                ))}
                {lista.length > 4 && <p className="text-[10px] text-muted-foreground px-1">+{lista.length - 4}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda: um chip por projeto com evento no período */}
      <div className="flex items-center gap-3 flex-wrap mt-3">
        {Array.from(new Map(tarefas.map((t) => [t.projeto.id, t.projeto])).values()).map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor ?? "#64748b" }} /> {p.nome}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const router = useRouter();
  const { user } = useSession();
  useTabTitle("Agenda");

  const [tarefas, setTarefas] = useState<TarefaAgendaDTO[]>([]);
  const [icsUrl, setIcsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [soMinhas, setSoMinhas] = usePersistedState<boolean>("projetos:agenda:sominhas", false);
  const [visao, setVisao] = usePersistedState<"calendario" | "lista">("projetos:agenda:visao", "calendario");
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

  // Arrastar na grade: muda o prazo otimista e persiste em segundo plano.
  async function mudarPrazo(id: string, novaData: string) {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, prazo: novaData } : t)));
    await fetch(`/api/projetos/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prazo: novaData }),
    }).catch(() => {});
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
  const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() + 7);
  const dia = (iso: string) => diaPrazo(iso);

  const grupos: { titulo: string; icone: React.ReactNode; cls?: string; lista: TarefaAgendaDTO[] }[] = [
    { titulo: "Atrasadas", icone: <AlertTriangle className="w-4 h-4" />, cls: "text-danger", lista: visiveis.filter((t) => dia(t.prazo) < hoje) },
    { titulo: "Hoje", icone: <CalendarDays className="w-4 h-4" />, cls: "text-warning", lista: visiveis.filter((t) => dia(t.prazo).getTime() === hoje.getTime()) },
    { titulo: "Amanhã", icone: <CalendarClock className="w-4 h-4" />, lista: visiveis.filter((t) => dia(t.prazo).getTime() === amanha.getTime()) },
    { titulo: "Esta semana", icone: <CalendarDays className="w-4 h-4" />, lista: visiveis.filter((t) => { const d = dia(t.prazo); return d > amanha && d <= fimSemana; }) },
    { titulo: "Mais adiante", icone: <Inbox className="w-4 h-4" />, lista: visiveis.filter((t) => dia(t.prazo) > fimSemana) },
  ];

  return (
    <div>
      <PageHeader title="Agenda" breadcrumbs={[{ label: "Projetos", href: "/projetos" }, { label: "Agenda" }]} />
      <div className={cn("px-8 pb-8 space-y-6", visao === "calendario" ? "max-w-6xl" : "max-w-4xl")}>
        {/* Visão + assinatura nos calendários externos */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setVisao("calendario")}
              title="Calendário"
              className={cn("px-3 py-1.5 inline-flex items-center transition-colors", visao === "calendario" ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              onClick={() => setVisao("lista")}
              title="Lista"
              className={cn("px-3 py-1.5 inline-flex items-center transition-colors", visao === "lista" ? "bg-info/10 text-info" : "text-muted-foreground hover:bg-muted")}
            >
              <List className="w-4 h-4" />
            </button>
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
          Assine uma vez e os prazos aparecem como eventos de dia inteiro — o calendário atualiza o feed sozinho (~1h).
        </p>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : visao === "calendario" ? (
          <AgendaCalendario
            tarefas={visiveis}
            onAbrir={(t) => router.push(`/projetos/${t.projeto.id}?tarefa=${t.id}`)}
            onMudarPrazo={mudarPrazo}
          />
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
                    const prazo = prazoInfo(t.prazo, false);
                    return (
                      <button
                        key={t.id}
                        onClick={() => router.push(`/projetos/${t.projeto.id}?tarefa=${t.id}`)}
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
