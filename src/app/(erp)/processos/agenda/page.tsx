"use client";

// Agenda de prazos dos processos externos (fase 2): pendentes agrupados (vencidos, hoje, esta
// semana, este mês, mais adiante) + assinatura no Calendário do Mac / Google Agenda pelo feed
// ICS próprio do módulo (separado da Agenda do Projetos, que é standalone por decisão do dono).
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { AlertTriangle, Apple, CalendarClock, CalendarDays, CalendarPlus, Check, Gavel, Inbox, Link as LinkIcon, Loader2, Lock } from "lucide-react";
import { diasAte, fmtData } from "@/components/processos/comum";

type PrazoAgenda = {
  id: string; descricao: string; vence: string; avisoDias: number;
  processo: { id: string; codigo: string; titulo: string; orgao: string; confidencial: boolean; responsavel: { nome: string } | null };
};

export default function AgendaProcessosPage() {
  useTabTitle("Agenda de prazos");
  const [soMeus, setSoMeus] = usePersistedState<boolean>("processos:agenda:meus", false);
  const [prazos, setPrazos] = useState<PrazoAgenda[]>([]);
  const [ics, setIcs] = useState({ todos: "", meus: "" });
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/processos/agenda${soMeus ? "?meus=1" : ""}`).then((r) => r.json())
      .then((j) => { setPrazos(j.data ?? []); setIcs({ todos: j.icsUrl ?? "", meus: j.icsUrlMeus ?? "" }); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [soMeus]);

  // O feed assinado segue o filtro "só os meus" da tela.
  const icsUrl = soMeus ? ics.meus : ics.todos;
  const webcal = icsUrl.replace(/^https?:\/\//, "webcal://");
  async function copiar() { try { await navigator.clipboard.writeText(icsUrl); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ } }

  const grupos: { titulo: string; icone: React.ReactNode; cls?: string; lista: PrazoAgenda[] }[] = [
    { titulo: "Vencidos", icone: <AlertTriangle className="w-4 h-4" />, cls: "text-danger", lista: prazos.filter((p) => diasAte(p.vence) < 0) },
    { titulo: "Hoje", icone: <CalendarDays className="w-4 h-4" />, cls: "text-warning", lista: prazos.filter((p) => diasAte(p.vence) === 0) },
    { titulo: "Próximos 7 dias", icone: <CalendarClock className="w-4 h-4" />, lista: prazos.filter((p) => { const d = diasAte(p.vence); return d > 0 && d <= 7; }) },
    { titulo: "Próximos 30 dias", icone: <CalendarDays className="w-4 h-4" />, lista: prazos.filter((p) => { const d = diasAte(p.vence); return d > 7 && d <= 30; }) },
    { titulo: "Mais adiante", icone: <Inbox className="w-4 h-4" />, lista: prazos.filter((p) => diasAte(p.vence) > 30) },
  ];

  return (
    <div>
      <PageHeader title="Agenda de prazos" subtitle="Prazos pendentes dos processos abertos" breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Agenda" }]} />
      <div className="px-4 sm:px-8 pb-10 space-y-5 max-w-4xl">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={() => { window.location.href = webcal; }}><Apple className="w-3.5 h-3.5" /> Calendário do Mac</Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={() => window.open(`https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(icsUrl)}`, "_blank")}><CalendarPlus className="w-3.5 h-3.5" /> Google Agenda</Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!icsUrl} onClick={copiar}>{copiado ? <Check className="w-3.5 h-3.5 text-success" /> : <LinkIcon className="w-3.5 h-3.5" />} {copiado ? "Copiado!" : "Copiar link do feed"}</Button>
          <div className="ml-auto inline-flex rounded-lg border border-border p-0.5 text-xs">
            {([false, true] as const).map((m) => (
              <button key={String(m)} onClick={() => setSoMeus(m)} className={cn("px-2.5 py-1 rounded-md", soMeus === m ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>{m ? "Só os meus" : "Todos"}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Assine uma vez e os prazos aparecem no calendário como eventos de dia inteiro, com lembrete na antecedência de aviso de cada prazo. O calendário atualiza sozinho (~1h).
          Processo confidencial aparece só com o código. O link é pessoal — não compartilhe.
        </p>

        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          : prazos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-16">Nenhum prazo pendente{soMeus ? " seu" : ""}.</p>
          : grupos.filter((g) => g.lista.length > 0).map((g) => (
            <section key={g.titulo} className="space-y-2">
              <h2 className={cn("text-sm font-semibold inline-flex items-center gap-1.5", g.cls)}>{g.icone} {g.titulo} <span className="text-xs text-muted-foreground font-normal">({g.lista.length})</span></h2>
              <ul className="bg-card border border-border rounded-xl divide-y divide-border/60">
                {g.lista.map((p) => {
                  const d = diasAte(p.vence);
                  return (
                    <li key={p.id}>
                      <Link href={`/processos/${p.processo.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                        <Gavel className="w-4 h-4 mt-0.5 text-violet-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{p.descricao}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            <span className="font-mono">{p.processo.codigo}</span>
                            {p.processo.confidencial && <Lock className="w-3 h-3 inline ml-1 -mt-0.5" />} · {p.processo.titulo} · {p.processo.orgao}
                            {p.processo.responsavel && ` · ${p.processo.responsavel.nome}`}
                          </div>
                        </div>
                        <div className={cn("text-xs whitespace-nowrap text-right", d < 0 ? "text-danger font-semibold" : d <= p.avisoDias ? "text-warning font-semibold" : "text-muted-foreground")}>
                          {fmtData(p.vence)}<div className="text-[10px]">{d < 0 ? `vencido há ${-d}d` : d === 0 ? "hoje" : `em ${d}d`}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
