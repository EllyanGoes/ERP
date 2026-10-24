"use client";

// Página pública do ativo (etiqueta QR) — celular primeiro, no espírito Tractian:
// status por cor no topo, números grandes com contexto, listas curtas e um
// botão fixo no rodapé para pedir manutenção. Nada de custos nem nomes de
// pessoas (a API já não manda). Datas sempre no fuso de Brasília para o HTML do
// servidor bater com o do navegador.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ClipboardList, Clock, Cog, History,
  Loader2, MapPin, OctagonX, Send, ShieldCheck, Wrench, Gauge,
} from "lucide-react";
import type { DadosAtivoPublico, SaudePeriodo } from "@/lib/manutencao/publico";

const TZ = "America/Sao_Paulo";
const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ }) : "—");
const fmtDataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtNum = (v: number, dec = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: dec });
const fmtPct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v >= 0.995 && v < 1 ? 2 : 1 })}%`);
/** Horas → "35 min" / "4,5 h" / "12 dias". */
function fmtDuracao(h: number | null): string {
  if (h == null) return "—";
  if (h === 0) return "0 h";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 72) return `${fmtNum(h)} h`;
  return `${fmtNum(h / 24, 0)} dias`;
}
/** "há 3 h" / "há 2 dias" relativo a `agora` (vem do servidor → sem divergência na hidratação). */
function haQuanto(iso: string, agora: number): string {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

const PRIORIDADE: Record<string, { label: string; cls: string }> = {
  EMERGENCIA: { label: "Emergência", cls: "bg-danger/15 text-danger" },
  ALTA: { label: "Alta", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  MEDIA: { label: "Média", cls: "bg-muted text-foreground" },
  BAIXA: { label: "Baixa", cls: "bg-muted text-muted-foreground" },
};

const STATUS_VISUAL = {
  PARADO: { Icone: OctagonX, card: "border-danger/40 bg-danger/10", texto: "text-danger", bolinha: "bg-danger" },
  MANUTENCAO: { Icone: Wrench, card: "border-info/40 bg-info/10", texto: "text-info", bolinha: "bg-info" },
  ATENCAO: { Icone: AlertTriangle, card: "border-warning/40 bg-warning/10", texto: "text-warning", bolinha: "bg-warning" },
  OPERANDO: { Icone: CheckCircle2, card: "border-success/40 bg-success/10", texto: "text-success", bolinha: "bg-success" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────

export function EtiquetaInvalida() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Etiqueta inválida ou desativada</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Este código não corresponde a nenhum equipamento ativo. A etiqueta pode ter sido substituída por uma nova.
          Procure a equipe de Manutenção para trocar a etiqueta ou abrir o pedido.
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

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>;
}

// ── Saúde ───────────────────────────────────────────────────────────────────

function classificacao(s: SaudePeriodo): { label: string; cls: string } {
  if (s.falhas === 0) return { label: "Excelente", cls: "bg-success/15 text-success" };
  const r = s.confiabilidade30d ?? 0;
  if (r >= 0.8) return { label: "Boa", cls: "bg-success/15 text-success" };
  if (r >= 0.5) return { label: "Regular", cls: "bg-warning/15 text-warning" };
  return { label: "Crítica", cls: "bg-danger/15 text-danger" };
}

function Kpi({ valor, rotulo, contexto, destaque }: { valor: string; rotulo: string; contexto: string; destaque?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn("text-2xl font-bold tabular-nums leading-tight mt-0.5", destaque ?? "text-foreground")}>{valor}</p>
      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{contexto}</p>
    </div>
  );
}

function Saude({ saude }: { saude: DadosAtivoPublico["saude"] }) {
  const [periodo, setPeriodo] = useState<"d90" | "m12">("d90");
  const s = saude[periodo];
  const cl = classificacao(s);
  const nomePeriodo = periodo === "d90" ? "nos últimos 90 dias" : "nos últimos 12 meses";
  const maxFalhas = Math.max(1, ...saude.meses.map((m) => m.falhas));
  const dispCor = s.disponibilidade == null ? undefined : s.disponibilidade >= 0.98 ? "text-success" : s.disponibilidade >= 0.9 ? "text-warning" : "text-danger";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", cl.cls)}>Saúde {cl.label.toLowerCase()}</span>
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {([["d90", "90 dias"], ["m12", "12 meses"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPeriodo(v)}
              className={cn("rounded-md px-2.5 py-1 transition-colors", periodo === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {s.falhas === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-success/10 px-3 py-3">
          <ShieldCheck className="w-8 h-8 text-success shrink-0" />
          <div>
            <p className="font-semibold text-success">Sem falhas no período</p>
            <p className="text-xs text-muted-foreground">Nenhuma quebra registrada {nomePeriodo}.</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Kpi rotulo="Disponibilidade" valor={fmtPct(s.disponibilidade)} contexto="do tempo de operação sem parada por falha" destaque={dispCor} />
        <Kpi rotulo="Confiabilidade (30 dias)" valor={s.confiabilidade30d == null ? "—" : fmtPct(s.confiabilidade30d)}
          contexto={s.confiabilidade30d == null ? "sem falhas para estimar" : "chance de rodar 30 dias sem falhar"} />
        <Kpi rotulo="Falhas" valor={String(s.falhas)} contexto={nomePeriodo} destaque={s.falhas > 0 ? "text-danger" : "text-success"} />
        <Kpi rotulo="Horas paradas" valor={fmtDuracao(s.horasParada)} contexto="por falha no período" />
        <Kpi rotulo="MTBF" valor={fmtDuracao(s.mtbf)} contexto="tempo médio entre falhas" />
        <Kpi rotulo="MTTR" valor={fmtDuracao(s.mttr)} contexto="tempo médio para voltar a operar" />
      </div>

      {/* Falhas por mês (12 meses) */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Falhas por mês</p>
        <div className="flex items-end gap-1 h-16" role="img" aria-label={`Falhas por mês: ${saude.meses.map((m) => `${m.label} ${m.falhas}`).join(", ")}`}>
          {saude.meses.map((m) => (
            <div key={m.label} className="flex-1 flex flex-col items-center justify-end h-full" title={`${m.label}: ${m.falhas} falha(s), ${fmtDuracao(m.horasParada)} parado`}>
              {m.falhas > 0 && <span className="text-[10px] tabular-nums text-muted-foreground leading-none mb-0.5">{m.falhas}</span>}
              <div className={cn("w-full rounded-sm", m.falhas > 0 ? "bg-danger/70" : "bg-muted")}
                style={{ height: m.falhas > 0 ? `${Math.max(12, (m.falhas / maxFalhas) * 100)}%` : "3px" }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {saude.meses.map((m) => <span key={m.label} className="flex-1 text-center text-[9px] text-muted-foreground">{m.label.slice(0, 1)}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Formulário de solicitação ───────────────────────────────────────────────

type Form = { descricao: string; ativoParado: boolean | null; prioridade: string; nome: string; contato: string };
const FORM_VAZIO: Form = { descricao: "", ativoParado: null, prioridade: "", nome: "", contato: "" };
const URGENCIAS = [
  { value: "", label: "Não sei" },
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
  { value: "EMERGENCIA", label: "Emergência" },
];
const CHAVE_NOME = "ativo-publico.solicitante";

function Solicitar({ token, dados, agora, onFechar, onEnviada }: {
  token: string; dados: DadosAtivoPublico; agora: number; onFechar: () => void; onEnviada: (numero: string) => void;
}) {
  const abertas = dados.solicitacoesAbertas;
  const [etapa, setEtapa] = useState<"conferir" | "form">(abertas.length > 0 ? "conferir" : "form");
  const [f, setF] = useState<Form>(FORM_VAZIO);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Lembra nome/setor neste aparelho (conveniência; falha silenciosa em modo privado).
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_NOME) ?? "null");
      if (s && typeof s.nome === "string") setF((x) => ({ ...x, nome: s.nome, contato: typeof s.contato === "string" ? s.contato : "" }));
    } catch { /* sem storage */ }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar, enviando]);

  async function enviar() {
    if (!f.descricao.trim()) { setErro("Conte o que está acontecendo."); return; }
    if (f.ativoParado === null) { setErro("Diga se a máquina parou."); return; }
    if (!f.nome.trim()) { setErro("Informe seu nome."); return; }
    setEnviando(true); setErro("");
    try {
      const res = await fetch(`/api/publico/ativo/${token}/solicitacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: f.descricao.trim(), ativoParado: f.ativoParado, prioridade: f.prioridade || null, nome: f.nome.trim(), contato: f.contato.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setErro(j?.error || "Não foi possível enviar. Tente de novo."); return; }
      try { localStorage.setItem(CHAVE_NOME, JSON.stringify({ nome: f.nome.trim(), contato: f.contato.trim() })); } catch { /* sem storage */ }
      onEnviada(j?.data?.numero ?? "");
    } catch {
      setErro("Sem conexão. Confira a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const campo = "w-full rounded-xl border border-border bg-card px-3.5 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-info/50";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" role="dialog" aria-modal="true" aria-label="Solicitar manutenção">
      <div className="max-w-lg mx-auto px-4 pb-32">
        <div className="sticky top-0 bg-background/95 backdrop-blur py-3 flex items-center gap-2 border-b border-border -mx-4 px-4">
          <button type="button" onClick={onFechar} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="Voltar"><ChevronLeft className="w-5 h-5" /></button>
          <div className="min-w-0">
            <p className="font-semibold text-foreground leading-tight">Solicitar manutenção</p>
            <p className="text-xs text-muted-foreground truncate">{dados.ativo.tag} · {dados.ativo.nome}</p>
          </div>
        </div>

        {etapa === "conferir" ? (
          <div className="pt-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Já existe um pedido aberto para isso?</h2>
              <p className="text-sm text-muted-foreground mt-1">Estes pedidos já chegaram à Manutenção e aguardam atendimento. Se o problema for o mesmo, não precisa pedir de novo.</p>
            </div>
            <ul className="space-y-2">
              {abertas.map((s) => (
                <li key={s.numero} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{s.numero}</span>
                    {s.ativoParado && <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 font-medium">máquina parada</span>}
                    <span className="ml-auto">{haQuanto(s.createdAt, agora)}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5 leading-snug">{s.descricao}</p>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 pt-2">
              <button type="button" onClick={onFechar} className="h-12 rounded-xl border border-border bg-card text-base font-medium text-foreground">É o mesmo problema — já está pedido</button>
              <button type="button" onClick={() => setEtapa("form")} className="h-12 rounded-xl bg-info text-info-foreground text-base font-semibold">É outro problema — continuar</button>
            </div>
          </div>
        ) : (
          <div className="pt-5 space-y-5">
            <div>
              <label htmlFor="ss-desc" className="text-sm font-medium text-foreground">O que está acontecendo? <span className="text-danger">*</span></label>
              <textarea id="ss-desc" rows={4} autoFocus maxLength={2000} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })}
                placeholder="Barulho estranho, vazamento, não liga, peça quebrada…" className={cn(campo, "mt-1.5 resize-none")} />
              <p className="text-[11px] text-muted-foreground text-right mt-0.5">{f.descricao.length}/2000</p>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">A máquina parou? <span className="text-danger">*</span></p>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button type="button" onClick={() => setF({ ...f, ativoParado: true })}
                  className={cn("h-12 rounded-xl border text-base font-medium", f.ativoParado === true ? "border-danger bg-danger text-danger-foreground" : "border-border bg-card text-foreground")}>
                  Sim, parou
                </button>
                <button type="button" onClick={() => setF({ ...f, ativoParado: false })}
                  className={cn("h-12 rounded-xl border text-base font-medium", f.ativoParado === false ? "border-success bg-success text-success-foreground" : "border-border bg-card text-foreground")}>
                  Não, está rodando
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">Urgência</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {URGENCIAS.map((u) => (
                  <button key={u.value} type="button" onClick={() => setF({ ...f, prioridade: u.value })}
                    className={cn("h-10 px-3.5 rounded-full border text-sm font-medium",
                      f.prioridade === u.value
                        ? u.value === "EMERGENCIA" ? "border-danger bg-danger text-danger-foreground" : "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground")}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <label htmlFor="ss-nome" className="text-sm font-medium text-foreground">Seu nome <span className="text-danger">*</span></label>
                <input id="ss-nome" maxLength={80} autoComplete="name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={cn(campo, "mt-1.5")} />
              </div>
              <div>
                <label htmlFor="ss-contato" className="text-sm font-medium text-foreground">Setor ou telefone <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <input id="ss-contato" maxLength={80} value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} placeholder="Ex.: Prensagem · ramal 214" className={cn(campo, "mt-1.5")} />
              </div>
            </div>

            {erro && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{erro}</p>}
          </div>
        )}
      </div>

      {etapa === "form" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
          <div className="max-w-lg mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={enviar} disabled={enviando}
              className="w-full h-14 rounded-2xl bg-info text-info-foreground text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Confirmacao({ numero, dados, onFechar }: { numero: string; dados: DadosAtivoPublico; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex items-center justify-center px-6" role="dialog" aria-modal="true" aria-label="Pedido enviado">
      <div className="max-w-sm w-full text-center py-10">
        <div className="mx-auto w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-9 h-9 text-success" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Pedido enviado</h1>
        <p className="text-sm text-muted-foreground mt-1">A Manutenção já foi avisada.</p>
        <div className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Número da solicitação</p>
          <p className="font-mono text-3xl font-bold text-foreground mt-1">{numero || "—"}</p>
          <p className="text-xs text-muted-foreground mt-2">{dados.ativo.tag} · {dados.ativo.nome}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-4">Guarde o número para acompanhar com a equipe de Manutenção.</p>
        <button type="button" onClick={onFechar} className="mt-6 w-full h-12 rounded-xl border border-border bg-card text-base font-medium text-foreground">Voltar ao equipamento</button>
      </div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export type MedidorInterno = { id: string; nome: string; unidade: string; acumulado: number; ultimaLeitura: string | null };

export default function AtivoPublico({ token, dados: d, agoraIso, medidores }: { token: string; dados: DadosAtivoPublico; agoraIso: string; medidores?: MedidorInterno[] | null }) {
  const router = useRouter();
  const agora = new Date(agoraIso).getTime();
  const [solicitando, setSolicitando] = useState(false);
  const [enviada, setEnviada] = useState<string | null>(null);
  const st = STATUS_VISUAL[d.status.codigo];
  const ficha = [
    d.ativo.fabricante && ["Fabricante", d.ativo.fabricante],
    d.ativo.modelo && ["Modelo", d.ativo.modelo],
    d.ativo.numeroSerie && ["Nº de série", d.ativo.numeroSerie],
    d.ativo.anoFabricacao && ["Ano", String(d.ativo.anoFabricacao)],
  ].filter(Boolean) as [string, string][];

  // Trava o scroll da página por trás do formulário/confirmação.
  useEffect(() => {
    if (!solicitando && enviada === null) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [solicitando, enviada]);

  return (
    <main className="min-h-screen bg-background">
      {/* Cabeçalho da empresa */}
      <header className="border-b border-border bg-card">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0"><Cog className="w-4 h-4" /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{d.empresa || "Manutenção"}</p>
            <p className="text-[11px] text-muted-foreground leading-none">Manutenção · ficha do equipamento</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-6">
        {medidores && medidores.length > 0 && <LeituraMedidores medidores={medidores} onLancou={() => router.refresh()} />}
        {/* Identificação + status */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4">
            {d.ativo.caminho.length > 0 && (
              <p className="text-xs text-muted-foreground leading-snug">{d.ativo.caminho.join(" › ")}</p>
            )}
            <p className="font-mono text-4xl font-extrabold tracking-tight text-foreground leading-none mt-1.5 break-all">{d.ativo.tag}</p>
            <h1 className="text-lg font-semibold text-foreground leading-snug mt-1.5">{d.ativo.nome}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">{d.ativo.tipo}</span>
              {d.ativo.criticidade && <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">Criticidade {d.ativo.criticidade}</span>}
              {d.ativo.localizacao && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{d.ativo.localizacao}</span>}
            </div>
            {ficha.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-border">
                {ficha.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="text-sm text-foreground truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className={cn("border-t px-4 py-3.5 flex items-center gap-3", st.card)}>
            <st.Icone className={cn("w-8 h-8 shrink-0", st.texto)} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-lg font-bold leading-tight flex items-center gap-2", st.texto)}>
                <span className={cn("w-2 h-2 rounded-full", st.bolinha, d.status.codigo !== "OPERANDO" && "animate-pulse")} />
                {d.status.titulo}
                {d.status.desde && <span className="text-sm font-medium">desde {fmtDataHora(d.status.desde)}</span>}
              </p>
              {d.status.detalhe && <p className="text-xs text-foreground/80 mt-0.5">{d.status.detalhe}</p>}
              {d.status.desde && <p className="text-[11px] text-muted-foreground">{haQuanto(d.status.desde, agora).replace("há", "parado há")}</p>}
            </div>
          </div>
        </div>

        {/* Saúde */}
        <Secao titulo="Saúde do ativo" icone={Activity}>
          <Saude saude={d.saude} />
        </Secao>

        {/* OS abertas */}
        <Secao titulo="Ordens de serviço abertas" icone={Wrench} contador={d.ordensAbertas.length}>
          {d.ordensAbertas.length === 0 ? <Vazio>Nenhuma ordem de serviço aberta.</Vazio> : (
            <ul className="space-y-2">
              {d.ordensAbertas.map((o) => (
                <li key={o.numero} className={cn("rounded-2xl border bg-card px-4 py-3", o.atrasada ? "border-danger/40" : "border-border")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold text-foreground">{o.numero}</span>
                    <span className="text-xs text-muted-foreground">{o.tipoSigla} · {o.tipoNome}</span>
                    <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORIDADE[o.prioridade]?.cls ?? "bg-muted text-foreground")}>
                      {PRIORIDADE[o.prioridade]?.label ?? o.prioridade}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mt-1.5 leading-snug line-clamp-3">{o.descricao}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                    <span className={cn("rounded-full px-2 py-0.5 font-medium",
                      o.status === "EM_EXECUCAO" ? "bg-info/15 text-info" : o.status === "ENCERRADA" ? "bg-success/15 text-success" : "bg-muted text-foreground")}>
                      {o.statusLabel}
                    </span>
                    {o.paradaDesde && <span className="text-danger font-medium">parada desde {fmtDataHora(o.paradaDesde)}</span>}
                    {(o.prazo || o.programadaPara) && (
                      <span className={cn("inline-flex items-center gap-1", o.atrasada ? "text-danger font-semibold" : "text-muted-foreground")}>
                        <CalendarClock className="w-3.5 h-3.5" />
                        {o.prazo ? `prazo ${fmtData(o.prazo)}` : `programada ${fmtData(o.programadaPara)}`}
                        {o.atrasada && " · atrasada"}
                      </span>
                    )}
                    {!o.prazo && !o.programadaPara && <span className="text-muted-foreground">aberta {haQuanto(o.abertaEm, agora)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Planos */}
        <Secao titulo="Planos de manutenção" icone={CalendarClock} contador={d.planos.length}>
          {d.planos.length === 0 ? <Vazio>Nenhum plano preventivo cadastrado para este equipamento.</Vazio> : (
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
              {d.planos.map((p, i) => (
                <li key={`${p.nome}-${i}`} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground leading-snug">{p.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.tipoSigla} · {p.tipoNome} · {p.gatilho}</p>
                    </div>
                    {p.vencido && <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 text-[11px] font-semibold shrink-0">Vencido</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Última execução</p>
                      <p className="text-foreground">{p.ultimaExecucao ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Próxima</p>
                      <p className={cn(p.vencido ? "text-danger font-semibold" : "text-foreground")}>{p.proxima}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {/* Histórico */}
        <Secao titulo="Últimas manutenções" icone={History}>
          {d.ultimas.length === 0 ? <Vazio>Nenhuma manutenção concluída registrada.</Vazio> : (
            <ol className="relative ml-2 border-l border-border space-y-4">
              {d.ultimas.map((o) => (
                <li key={o.numero} className="ml-4">
                  <span className={cn("absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-background", o.falhas.length > 0 ? "bg-danger" : "bg-success")} />
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{fmtData(o.data)}</span>
                    <span>·</span>
                    <span>{o.tipoSigla} · {o.tipoNome}</span>
                    <span className="font-mono ml-auto">{o.numero}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1 leading-snug line-clamp-3">{o.descricao}</p>
                  {o.servicos.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {o.servicos.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-px" />{s}</li>
                      ))}
                    </ul>
                  )}
                  {o.falhas.map((f, i) => (
                    <p key={i} className="text-xs mt-1">
                      {f.sintoma && <><span className="text-muted-foreground">Falha: </span><span className="text-foreground">{f.sintoma}</span></>}
                      {f.sintoma && f.causa && <span className="text-muted-foreground"> · </span>}
                      {f.causa && <><span className="text-muted-foreground">Causa: </span><span className="text-foreground">{f.causa}</span></>}
                    </p>
                  ))}
                  {o.horasParada > 0 && (
                    <p className="text-xs text-danger mt-1 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {fmtDuracao(o.horasParada)} parado</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Secao>

        <p className="text-center text-[11px] text-muted-foreground pt-2">
          Indicadores calculados pelas ordens de serviço · regime de {fmtNum(d.ativo.horasPorDia, 1)} h/dia · atualizado {fmtDataHora(agoraIso)}
        </p>
      </div>

      {/* Botão fixo: pedir manutenção */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="max-w-lg mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {d.solicitacoesAbertas.length > 0 && (
            <p className="text-[11px] text-muted-foreground text-center mb-1.5">
              {d.solicitacoesAbertas.length} pedido{d.solicitacoesAbertas.length > 1 ? "s" : ""} aguardando a Manutenção
            </p>
          )}
          <button type="button" onClick={() => setSolicitando(true)}
            className="w-full h-14 rounded-2xl bg-info text-info-foreground text-base font-semibold inline-flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-transform">
            <Wrench className="w-5 h-5" /> Solicitar manutenção
          </button>
        </div>
      </div>

      {solicitando && (
        <Solicitar token={token} dados={d} agora={agora} onFechar={() => setSolicitando(false)}
          onEnviada={(n) => { setSolicitando(false); setEnviada(n); router.refresh(); }} />
      )}
      {enviada !== null && <Confirmacao numero={enviada} dados={d} onFechar={() => setEnviada(null)} />}
    </main>
  );
}

/** Lançamento de leitura (horímetro/odômetro) — só aparece para a equipe de Manutenção logada. */
function LeituraMedidores({ medidores, onLancou }: { medidores: MedidorInterno[]; onLancou: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [troca, setTroca] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  async function lancar(m: MedidorInterno) {
    const v = Number((valores[m.id] ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || (valores[m.id] ?? "") === "") { setMsg({ ...msg, [m.id]: { ok: false, texto: "Informe a leitura." } }); return; }
    setEnviando(m.id);
    const res = await fetch("/api/pcm/medidores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "leitura", medidorId: m.id, valor: v, trocaMedidor: !!troca[m.id] }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setEnviando(null);
    if (!res?.ok) { setMsg({ ...msg, [m.id]: { ok: false, texto: j?.error || "Não foi possível lançar." } }); return; }
    setMsg({ ...msg, [m.id]: { ok: true, texto: `Leitura de ${v} ${m.unidade} lançada.` } });
    setValores({ ...valores, [m.id]: "" }); setTroca({ ...troca, [m.id]: false });
    onLancou();
  }
  return (
    <section className="rounded-2xl border border-info/30 bg-info/5 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Gauge className="w-4 h-4 text-info" /> Lançar leitura</h2>
        <p className="text-[11px] text-muted-foreground">Visível só para a equipe de Manutenção logada.</p>
      </div>
      {medidores.map((m) => (
        <div key={m.id} className="rounded-xl bg-card border border-border p-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{m.nome}</span>
            <span className="text-xs text-muted-foreground">atual <b className="text-foreground tabular-nums">{m.acumulado.toLocaleString("pt-BR")} {m.unidade}</b>{m.ultimaLeitura ? ` · ${new Date(m.ultimaLeitura).toLocaleDateString("pt-BR")}` : ""}</span>
          </div>
          <div className="flex gap-2">
            <input inputMode="decimal" value={valores[m.id] ?? ""} onChange={(e) => setValores({ ...valores, [m.id]: e.target.value })} placeholder={`Nova leitura (${m.unidade})`} className="flex-1 min-w-0 h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-info" />
            <button onClick={() => lancar(m)} disabled={enviando === m.id} className="h-11 px-4 rounded-lg bg-info text-white text-sm font-semibold disabled:opacity-60">{enviando === m.id ? "…" : "Lançar"}</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="rounded" checked={!!troca[m.id]} onChange={(e) => setTroca({ ...troca, [m.id]: e.target.checked })} /> Medidor foi trocado (leitura menor que a atual)</label>
          {msg[m.id] && <p className={cn("text-xs", msg[m.id].ok ? "text-success" : "text-danger")}>{msg[m.id].texto}</p>}
        </div>
      ))}
    </section>
  );
}
