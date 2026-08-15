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
  Link as LinkIcon, Apple, CalendarPlus,
} from "lucide-react";
import { AvatarUsuario, PrioridadeBadge } from "@/components/projetos/comum";
import { prazoInfo } from "@/components/projetos/tipos";

type TarefaAgendaDTO = {
  id: string;
  titulo: string;
  prazo: string;
  prioridade: string;
  projeto: { id: string; nome: string; cor: string | null };
  coluna: { nome: string };
  membros: { id: string; nome: string }[];
};

export default function AgendaPage() {
  const router = useRouter();
  const { user } = useSession();
  useTabTitle("Agenda");

  const [tarefas, setTarefas] = useState<TarefaAgendaDTO[]>([]);
  const [icsUrl, setIcsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [soMinhas, setSoMinhas] = usePersistedState<boolean>("projetos:agenda:sominhas", false);
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

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
  const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() + 7);
  const dia = (iso: string) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d; };

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
      <div className="px-8 pb-8 space-y-6 max-w-4xl">
        {/* Assinatura nos calendários externos */}
        <div className="flex items-center gap-2 flex-wrap">
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
