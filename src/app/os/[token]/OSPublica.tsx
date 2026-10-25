// Página pública da OS — celular primeiro, mesmo visual da ficha pública do ativo
// (/ativo/<token>): cartão de identificação com status por cor, seções curtas e um
// botão fixo no rodapé para quem tem login abrir a OS completa no ERP.
// Componente de SERVIDOR (só leitura, sem estado). Nada de custos; de pessoas, só
// o primeiro nome. Datas sempre no fuso de Brasília.
import { cn } from "@/lib/utils";
import {
  CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList, Clock, Cog, ExternalLink, FileText,
  MapPin, OctagonX, Package, Users, Wrench,
} from "lucide-react";
import type { DadosOSPublica, ItemOSPublico } from "@/lib/manutencao/os-publica";

const TZ = "America/Sao_Paulo";
const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—");
const fmtDataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtNum = (v: number, dec = 3) => v.toLocaleString("pt-BR", { maximumFractionDigits: dec });
/** "há 3 h" / "há 2 dias". */
function haQuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}
const numAtv = (seq: number) => String(seq * 10).padStart(3, "0");

const PRIORIDADE: Record<string, { label: string; cls: string }> = {
  EMERGENCIA: { label: "Emergência", cls: "bg-danger/15 text-danger" },
  ALTA: { label: "Alta", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  MEDIA: { label: "Média", cls: "bg-muted text-foreground" },
  BAIXA: { label: "Baixa", cls: "bg-muted text-muted-foreground" },
};

/** Cor da faixa de status do cartão. */
function visualStatus(d: DadosOSPublica) {
  if (d.status === "CANCELADA") return { Icone: OctagonX, card: "border-danger/40 bg-danger/10", texto: "text-danger" };
  if (d.status === "CONCLUIDA" || d.status === "ENCERRADA") return { Icone: CheckCircle2, card: "border-success/40 bg-success/10", texto: "text-success" };
  if (d.status === "EM_EXECUCAO") return { Icone: Wrench, card: "border-info/40 bg-info/10", texto: "text-info" };
  if (["PAUSADA", "AGUARDANDO_MATERIAL", "AGUARDANDO_TERCEIRO"].includes(d.status)) return { Icone: Clock, card: "border-warning/40 bg-warning/10", texto: "text-warning" };
  return { Icone: CalendarClock, card: "border-border bg-muted/40", texto: "text-foreground" };
}

// ─────────────────────────────────────────────────────────────────────────────

export function LinkInvalido() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Esta ordem de serviço não está mais disponível por este link — ela pode ter sido encerrada há tempo ou o link foi trocado.
          Peça à equipe de Manutenção para enviar de novo.
        </p>
      </div>
    </main>
  );
}

function Secao({ titulo, icone: Icone, contador, children }: { titulo: string; icone: typeof Wrench; contador?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        <Icone className="w-4 h-4" /> {titulo}
        {contador != null && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground normal-case tracking-normal">{contador}</span>}
      </h2>
      {children}
    </section>
  );
}

function ListaItens({ itens }: { itens: ItemOSPublico[] }) {
  return (
    <ul className="space-y-1">
      {itens.map((m, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-px" />
          <span className="flex-1 min-w-0 text-foreground leading-snug">
            {m.codigo && <span className="font-mono text-muted-foreground">{m.codigo} · </span>}{m.descricao}
          </span>
          <span className="shrink-0 tabular-nums font-semibold text-foreground">{fmtNum(m.quantidade)}{m.unidade ? ` ${m.unidade}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

function respostaTexto(a: DadosOSPublica["atividades"][number]): string | null {
  if (a.tipoResposta === "NUMERO" && (a.faixaMin != null || a.faixaMax != null)) {
    const faixa = a.faixaMin != null && a.faixaMax != null ? `${fmtNum(a.faixaMin)} a ${fmtNum(a.faixaMax)}` : a.faixaMin != null ? `mín. ${fmtNum(a.faixaMin)}` : `máx. ${fmtNum(a.faixaMax!)}`;
    return `Faixa aceitável: ${faixa}`;
  }
  return null;
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function OSPublica({ dados: d }: { dados: DadosOSPublica }) {
  const st = visualStatus(d);
  const pr = PRIORIDADE[d.prioridade] ?? { label: d.prioridade, cls: "bg-muted text-foreground" };
  const feitas = d.atividades.filter((a) => a.feita).length;
  const local = d.ativo?.localizacao ?? null;

  return (
    <main className="min-h-screen bg-background">
      {/* Cabeçalho da empresa */}
      <header className="border-b border-border bg-card">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0"><Cog className="w-4 h-4" /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{d.empresa || "Manutenção"}</p>
            <p className="text-[11px] text-muted-foreground leading-none">Manutenção · ordem de serviço</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-6">
        {/* Identificação + status */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <p className="font-mono text-3xl font-extrabold tracking-tight text-foreground leading-none">#{d.numero}</p>
              <span className={cn("ml-auto rounded-full px-2.5 py-1 text-xs font-semibold", pr.cls)}>{pr.label}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1.5">{d.tipoSigla} · {d.tipoNome}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs">
              {d.programadaPara && (
                <span className="inline-flex items-center gap-1 text-foreground"><CalendarClock className="w-3.5 h-3.5 text-muted-foreground" /> Programada {fmtDataHora(d.programadaPara)}</span>
              )}
              {d.prazo && (
                <span className={cn("inline-flex items-center gap-1", d.atrasada ? "text-danger font-semibold" : "text-foreground")}>
                  <Clock className={cn("w-3.5 h-3.5", !d.atrasada && "text-muted-foreground")} /> Prazo {fmtData(d.prazo)}{d.atrasada && " · atrasada"}
                </span>
              )}
              {!d.prazo && d.atrasada && <span className="text-danger font-semibold">atrasada</span>}
              {d.horasEstimadas != null && d.horasEstimadas > 0 && (
                <span className="text-muted-foreground">estimativa {fmtNum(d.horasEstimadas, 1)} h</span>
              )}
              {!d.programadaPara && !d.prazo && <span className="text-muted-foreground">aberta {haQuanto(d.abertaEm)}</span>}
            </div>
          </div>
          <div className={cn("border-t px-4 py-3 flex items-center gap-3", st.card)}>
            <st.Icone className={cn("w-7 h-7 shrink-0", st.texto)} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-base font-bold leading-tight", st.texto)}>{d.statusLabel}</p>
              {d.fechadaEm && <p className="text-[11px] text-muted-foreground">em {fmtDataHora(d.fechadaEm)}</p>}
            </div>
          </div>
        </div>

        {/* Máquina parada */}
        {(d.paradaDesde || d.exigeParada) && (
          <div className={cn("rounded-2xl border px-4 py-3 flex items-center gap-3", d.paradaDesde ? "border-danger/40 bg-danger/10" : "border-warning/40 bg-warning/10")}>
            <OctagonX className={cn("w-7 h-7 shrink-0", d.paradaDesde ? "text-danger" : "text-warning")} />
            <div className="min-w-0">
              {d.paradaDesde ? (
                <>
                  <p className="font-bold text-danger leading-tight">Máquina parada</p>
                  <p className="text-xs text-foreground/80">desde {fmtDataHora(d.paradaDesde)} · {haQuanto(d.paradaDesde).replace("há", "parada há")}</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-warning leading-tight">Exige parada da máquina</p>
                  <p className="text-xs text-foreground/80">Combine a parada com a operação antes de começar.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Ativo */}
        <Secao titulo="Equipamento" icone={Wrench}>
          {d.ativo ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              {d.ativo.caminho.length > 0 && <p className="text-xs text-muted-foreground leading-snug">{d.ativo.caminho.join(" › ")}</p>}
              <p className="font-mono text-2xl font-extrabold tracking-tight text-foreground leading-none mt-1 break-all">{d.ativo.tag}</p>
              <p className="text-base font-semibold text-foreground leading-snug mt-1">{d.ativo.nome}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                {local && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{local}</span>}
                {d.ativo.parado && !d.paradaDesde && <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 font-medium">ativo parado</span>}
              </div>
              {d.ativo.qrToken && (
                <a href={`/ativo/${d.ativo.qrToken}`} className="mt-3 -mx-1 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm font-medium text-foreground active:bg-muted">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Ficha do equipamento
                  <span className="text-xs font-normal text-muted-foreground">histórico e planos</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground inline-flex items-center gap-2 w-full">
              <MapPin className="w-4 h-4 text-muted-foreground" /> {d.localTexto || "Sem equipamento informado"}
            </div>
          )}
        </Secao>

        {/* O que fazer */}
        <Secao titulo="O que fazer" icone={ClipboardList}>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
          </div>
        </Secao>

        {/* Atividades */}
        {d.atividades.length > 0 && (
          <Secao titulo={`Atividades · ${feitas}/${d.atividades.length} feitas`} icone={ClipboardCheck}>
            <ol className="rounded-2xl border border-border bg-card divide-y divide-border">
              {d.atividades.map((a) => {
                const extra = respostaTexto(a);
                return (
                  <li key={a.seq} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                        a.feita ? (a.conforme === false ? "border-danger bg-danger text-danger-foreground" : "border-success bg-success text-success-foreground") : "border-border")}>
                        {a.feita && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground leading-snug"><span className="font-mono text-xs text-muted-foreground mr-1.5">{numAtv(a.seq)}</span>{a.descricao}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">{a.tipoLabel}</span>
                          {extra && <span>{extra}</span>}
                          {a.resposta && a.tipoResposta !== "NENHUMA" && (
                            <span className={cn(a.conforme === false ? "text-danger font-medium" : "text-success")}>resposta: {a.resposta}</span>
                          )}
                        </div>
                        {a.itens.length > 0 && <div className="mt-2 rounded-xl bg-muted/50 px-3 py-2"><ListaItens itens={a.itens} /></div>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Secao>
        )}

        {/* Itens gerais */}
        {d.itensGerais.length > 0 && (
          <Secao titulo="Itens da OS" icone={Package} contador={d.itensGerais.length}>
            <div className="rounded-2xl border border-border bg-card px-4 py-3"><ListaItens itens={d.itensGerais} /></div>
          </Secao>
        )}

        {/* Equipe */}
        {(d.equipe || d.responsavel) && (
          <Secao titulo="Equipe" icone={Users}>
            <dl className="rounded-2xl border border-border bg-card p-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {d.responsavel && (
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Responsável</dt>
                  <dd className="text-sm font-medium text-foreground truncate">{d.responsavel}</dd>
                </div>
              )}
              {d.equipe && (
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">Equipe</dt>
                  <dd className="text-sm font-medium text-foreground truncate">{d.equipe.nome}</dd>
                </div>
              )}
              {d.equipe && d.equipe.membros.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Integrantes</dt>
                  <dd className="text-sm text-foreground">{d.equipe.membros.join(", ")}</dd>
                </div>
              )}
            </dl>
          </Secao>
        )}

        <p className="text-center text-[11px] text-muted-foreground pt-2">Aberta em {fmtDataHora(d.abertaEm)} · atualizado {fmtDataHora(new Date().toISOString())}</p>
      </div>

      {/* Botão fixo: abrir no ERP (quem tem login cai na OS completa) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-lg mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <a href={`/pcm/os?os=${d.id}`}
            className="w-full h-14 rounded-2xl bg-info text-info-foreground text-base font-semibold inline-flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-transform">
            <ExternalLink className="w-5 h-5" /> Abrir no ERP
          </a>
          <p className="text-[11px] text-muted-foreground text-center mt-1.5">Para apontar horas e responder o checklist (precisa de login).</p>
        </div>
      </div>
    </main>
  );
}
