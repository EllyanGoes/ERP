"use client";

// Página pública do processo (advogado/despachante) — celular primeiro, visual limpo no padrão
// das páginas públicas da Manutenção (/os, /ativo). Lê os dados prontos do servidor; registrar
// andamento (com PDF) e marcar prazo cumprido vão pelas APIs /api/publico/processo/<token>/*.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import DatePicker from "@/components/shared/DatePicker";
import SelectMenu from "@/components/shared/SelectMenu";
import { CalendarClock, Check, CheckCircle2, FileText, Gavel, Landmark, Loader2, Paperclip, Plus, Scale, X } from "lucide-react";
import { SITUACOES, TIPOS_ANDAMENTO, TIPOS_PROCESSO } from "@/lib/processos-tipos";
import type { DadosProcessoExterno } from "@/lib/processos-externo";

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const diaUtc = (iso: string) => { const d = new Date(iso); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const diasAte = (iso: string) => { const h = new Date(); return Math.round((diaUtc(iso) - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / 86_400_000); };
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TIPOS_EXTERNO = ["MOVIMENTACAO", "PROTOCOLO", "MANIFESTACAO", "EXIGENCIA", "DECISAO", "AUDIENCIA", "VISTORIA", "PAGAMENTO", "OUTRO"];
const MAX = 4.5 * 1024 * 1024;

export function LinkInvalido() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-5"><Scale className="w-7 h-7 text-muted-foreground" /></div>
        <h1 className="text-xl font-semibold text-foreground">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">Este link de acompanhamento não está mais ativo — ele pode ter vencido ou sido revogado. Peça um novo a quem enviou.</p>
      </div>
    </main>
  );
}

export default function ProcessoExterno({ token, dados }: { token: string; dados: DadosProcessoExterno }) {
  const router = useRouter();
  const { processo: p } = dados;
  const pendentes = dados.prazos.filter((x) => x.status === "PENDENTE");
  const cumpridos = dados.prazos.filter((x) => x.status !== "PENDENTE");
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function cumprir(prazoId: string, descricao: string) {
    if (!confirm(`Marcar como cumprido: "${descricao}"?`)) return;
    setMsg(null);
    const r = await fetch(`/api/publico/processo/${token}/prazo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prazoId }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) { setMsg({ tipo: "erro", texto: j?.error ?? "Não foi possível registrar." }); return; }
    setMsg({ tipo: "ok", texto: "Prazo marcado como cumprido. O responsável foi avisado." });
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10 space-y-5">
        <header className="space-y-1">
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5" /> {p.empresa} · acompanhamento externo</div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground leading-tight">{p.titulo}</h1>
          <div className="text-sm text-muted-foreground">{p.codigo} · {TIPOS_PROCESSO[p.tipo] ?? p.tipo}</div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Número</div><div className="font-mono break-all">{p.numero ?? "—"}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Órgão</div><div>{p.orgao}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Situação</div><div>{SITUACOES[p.situacao]?.label ?? p.situacao}{p.fase && <span className="text-muted-foreground"> · {p.fase}</span>}</div></div>
        </section>

        <p className="text-xs text-muted-foreground">Olá, <b className="text-foreground">{dados.pessoa}</b>. {dados.podeLancar ? "Por aqui você registra andamentos (com PDF) e marca prazos cumpridos — o responsável é avisado na hora." : "Este link é só de consulta."}{dados.validoAte && ` Link válido até ${new Date(dados.validoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`}</p>

        {msg && <div className={cn("rounded-xl px-3 py-2 text-sm border", msg.tipo === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>{msg.texto}</div>}

        {dados.podeLancar && (form
          ? <FormAndamento token={token} onFechar={() => setForm(false)} onOk={(aviso) => { setForm(false); setMsg({ tipo: aviso ? "erro" : "ok", texto: aviso ?? "Andamento registrado. O responsável foi avisado." }); router.refresh(); }} />
          : <button onClick={() => { setMsg(null); setForm(true); }} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-3 inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Registrar andamento</button>)}

        {/* Prazos */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold inline-flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Prazos</h2>
          {pendentes.length === 0 && cumpridos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum prazo em aberto.</p> : (
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border/60">
              {pendentes.map((x) => {
                const d = diasAte(x.vence);
                return (
                  <li key={x.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{x.descricao}</div>
                      <div className={cn("text-xs", d < 0 ? "text-danger font-semibold" : d <= 5 ? "text-warning font-semibold" : "text-muted-foreground")}>{fmtData(x.vence)} · {d < 0 ? `vencido há ${-d} dia(s)` : d === 0 ? "vence hoje" : `em ${d} dia(s)`}</div>
                    </div>
                    {dados.podeLancar && <button onClick={() => cumprir(x.id, x.descricao)} className="shrink-0 text-xs rounded-lg border border-success/40 text-success px-2.5 py-1.5 inline-flex items-center gap-1 hover:bg-success/10"><Check className="w-3.5 h-3.5" /> Cumprido</button>}
                  </li>
                );
              })}
              {cumpridos.map((x) => (
                <li key={x.id} className="px-4 py-3 flex items-start gap-3 opacity-60">
                  <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
                  <div className="text-sm line-through">{x.descricao}<span className="no-underline text-xs text-muted-foreground"> · cumprido {fmtData(x.cumpridoEm)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Documentos compartilhados */}
        {dados.documentos.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Documentos</h2>
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border/60">
              {dados.documentos.map((d) => (
                <li key={d.id}>
                  <a href={`/api/publico/processo/${token}/documento/${d.id}`} target="_blank" rel="noreferrer" className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0"><div className="text-sm truncate text-info">{d.titulo}</div><div className="text-[11px] text-muted-foreground">{d.emissao ? fmtData(d.emissao) : ""}{d.tamanho ? ` · ${(d.tamanho / 1024 / 1024).toFixed(1)} MB` : ""}</div></div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Linha do tempo */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Linha do tempo</h2>
          {dados.andamentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum andamento ainda.</p> : (
            <ol className="relative border-l border-border ml-2 space-y-4">
              {dados.andamentos.map((a) => (
                <li key={a.id} className="ml-4">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-info" />
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2"><b className="text-foreground">{TIPOS_ANDAMENTO[a.tipo] ?? a.tipo}</b> · {fmtData(a.data)}
                    {a.autor && <span className="inline-flex items-center gap-1">{a.autor.startsWith("Tribunal") && <Landmark className="w-3 h-3" />} · {a.autor}</span>}</div>
                  <div className="text-sm whitespace-pre-wrap">{a.resumo ?? a.descricao}</div>
                  {a.resumo && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{a.descricao}</div>}
                  {a.documentoId && <a href={`/api/publico/processo/${token}/documento/${a.documentoId}`} target="_blank" rel="noreferrer" className="text-xs text-info hover:underline inline-flex items-center gap-1"><Paperclip className="w-3 h-3" /> anexo</a>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="pt-6 text-[11px] text-muted-foreground text-center">Link pessoal e intransferível. Tudo o que você registrar fica identificado com o seu nome.</footer>
      </div>
    </main>
  );
}

function FormAndamento({ token, onFechar, onOk }: { token: string; onFechar: () => void; onOk: (aviso: string | null) => void }) {
  const [data, setData] = useState(hojeIso());
  const [tipo, setTipo] = useState("MOVIMENTACAO");
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    setErro("");
    if (!descricao.trim()) { setErro("Descreva o que aconteceu."); return; }
    if (!data) { setErro("Informe a data."); return; }
    if (arquivo && arquivo.size > MAX) { setErro("O PDF passa de 4,5 MB."); return; }
    setEnviando(true);
    const fd = new FormData();
    fd.set("descricao", descricao.trim()); fd.set("data", data); fd.set("tipo", tipo);
    if (arquivo) fd.set("file", arquivo);
    const r = await fetch(`/api/publico/processo/${token}/andamento`, { method: "POST", body: fd }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setEnviando(false);
    if (!r?.ok) { setErro(j?.error ?? "Não foi possível enviar. Tente de novo."); return; }
    onOk(j?.aviso ?? null);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Registrar andamento</h2><button onClick={onFechar} className="text-muted-foreground hover:text-foreground" title="Fechar"><X className="w-4 h-4" /></button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Data</label><DatePicker value={data} onChange={(v) => setData(v ?? "")} max={hojeIso()} allowClear={false} /></div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Tipo</label><SelectMenu value={tipo} onChange={setTipo} options={TIPOS_EXTERNO.map((value) => ({ value, label: TIPOS_ANDAMENTO[value] ?? value }))} /></div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">O que aconteceu</label>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} maxLength={4000} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex.: protocolada a manifestação sobre a exigência do órgão" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Anexo em PDF (opcional, até 4,5 MB)</label>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="text-sm rounded-lg border border-border px-3 py-2 inline-flex items-center gap-1.5 hover:bg-muted"><Paperclip className="w-4 h-4" /> {arquivo ? "Trocar PDF" : "Escolher PDF"}</button>
          {arquivo && <span className="text-xs text-muted-foreground truncate">{arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(1)} MB <button onClick={() => { setArquivo(null); if (inputRef.current) inputRef.current.value = ""; }} className="ml-1 hover:text-danger"><X className="w-3 h-3 inline" /></button></span>}
        </div>
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <button onClick={enviar} disabled={enviando} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 inline-flex items-center justify-center gap-2">
        {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : "Enviar"}
      </button>
    </section>
  );
}
