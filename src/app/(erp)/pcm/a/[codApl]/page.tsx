"use client";

// Página do QR colado na máquina (celular primeiro): quem é o equipamento, se
// está parado, as OS abertas e — o principal — abrir uma Solicitação de Serviço
// em poucos toques. Quem é da Manutenção também lança a leitura do horímetro.
// Qualquer usuário logado acessa (rota /api/pcm/a/[codApl] é session-only).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTabTitle } from "@/lib/tabs-context";
import SelectMenu from "@/components/shared/SelectMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronRight, Gauge, Loader2, Wrench } from "lucide-react";
import { OPCOES_PRIORIDADE, PrioridadeTxt, StatusOSBadge, api, fmtData, fmtDataHora } from "@/components/manutencao/comum";

type Dados = {
  id: string; codApl: number; tag: string; nome: string; tipo: string; status: string; ativo: boolean;
  localizacao: string | null; fabricante: string | null; modelo: string | null; caminho: string;
  ordens: { id: string; numero: string; status: string; prioridade: string; descricao: string; createdAt: string; paradaInicio: string | null; paradaFim: string | null; tipo: { sigla: string } }[];
  solicitacoes: { id: string; numero: string; descricao: string; ativoParado: boolean; createdAt: string; solicitanteNome: string | null }[];
  medidores: { id: string; nome: string; unidade: string; acumulado: number; ultimaLeitura: { data: string; valor: number } | null }[];
};

const fmtNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function AtivoQrPage() {
  const { codApl } = useParams<{ codApl: string }>();
  const [d, setD] = useState<Dados | null>(null);
  const [pcm, setPcm] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  useTabTitle(d ? `${d.tag} — ${d.nome}` : "Equipamento");

  const load = useCallback(async () => {
    const res = await fetch(`/api/pcm/a/${codApl}`).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res?.ok) setErro(j?.error || "Não foi possível carregar o equipamento.");
    else { setD(j.data); setPcm(!!j.pcm); setErro(""); }
    setLoading(false);
  }, [codApl]);
  useEffect(() => { load(); }, [load]);

  // ── Solicitação de serviço ────────────────────────────────────────────────
  const [ss, setSs] = useState<{ descricao: string; ativoParado: boolean | null; prioridade: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroSs, setErroSs] = useState("");
  const [enviada, setEnviada] = useState<string | null>(null);
  async function enviarSs() {
    if (!d || !ss) return;
    if (!ss.descricao.trim()) { setErroSs("Conte o que está acontecendo."); return; }
    if (ss.ativoParado === null) { setErroSs("Diga se a máquina parou."); return; }
    setEnviando(true); setErroSs("");
    const r = await api<{ numero: string }>("/api/pcm/solicitacoes", "POST", { ativoId: d.id, descricao: ss.descricao.trim(), ativoParado: ss.ativoParado, prioridade: ss.prioridade || null });
    setEnviando(false);
    if (!r.ok) { setErroSs(r.error || "Não foi possível enviar."); return; }
    setEnviada(r.data?.numero ?? "");
    setSs(null);
    load();
  }

  // ── Leitura de medidor (só Manutenção) ────────────────────────────────────
  const [leit, setLeit] = useState<{ medidorId: string; valor: string; troca: boolean } | null>(null);
  const [erroLeit, setErroLeit] = useState("");
  const [okLeit, setOkLeit] = useState("");
  async function enviarLeitura() {
    if (!leit) return;
    const bruto = leit.valor.trim();
    // "1.234,5" (pt-BR) ou "1234.5"
    const valor = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
    if (!bruto || !Number.isFinite(valor)) { setErroLeit("Informe a leitura."); return; }
    setEnviando(true); setErroLeit("");
    const r = await api("/api/pcm/medidores", "POST", { acao: "leitura", medidorId: leit.medidorId, valor, trocaMedidor: leit.troca });
    setEnviando(false);
    if (!r.ok) { setErroLeit(r.error || "Não foi possível lançar."); return; }
    const m = d?.medidores.find((x) => x.id === leit.medidorId);
    setOkLeit(`Leitura de ${fmtNum(valor)} ${m?.unidade ?? ""} lançada.`);
    setLeit(null);
    load();
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!d) return <div className="max-w-md mx-auto px-4 py-10"><p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erro || "Equipamento não encontrado."}</p></div>;

  const parado = d.status === "PARADO";
  const medidor = leit ? d.medidores.find((m) => m.id === leit.medidorId) : null;

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4">
      {/* Identificação */}
      <div className={cn("rounded-2xl border p-4", parado ? "border-danger/40 bg-danger/5" : "border-border bg-card")}>
        {d.caminho && <p className="text-xs text-muted-foreground">{d.caminho}</p>}
        <p className="font-mono text-3xl font-bold text-foreground leading-tight mt-0.5 break-all">{d.tag}</p>
        <h1 className="text-lg font-semibold text-foreground leading-snug">{d.nome}</h1>
        {(d.localizacao || d.fabricante || d.modelo) && (
          <p className="text-xs text-muted-foreground mt-1">{[d.localizacao, [d.fabricante, d.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
        )}
        <div className="mt-3">
          {!d.ativo ? (
            <span className="rounded-full px-3 py-1 text-sm font-medium bg-muted text-muted-foreground">Inativo</span>
          ) : parado ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-danger/15 text-danger"><AlertTriangle className="w-4 h-4" /> Parado</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium bg-success/10 text-success"><CheckCircle2 className="w-4 h-4" /> Operando</span>
          )}
        </div>
      </div>

      {enviada !== null && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Solicitação {enviada} enviada. A Manutenção foi avisada.
          <Link href="/pcm/solicitacoes" className="block text-xs underline mt-1">Acompanhar minhas solicitações</Link>
        </div>
      )}

      {/* Abrir SS */}
      {!ss ? (
        <Button onClick={() => { setEnviada(null); setErroSs(""); setSs({ descricao: "", ativoParado: null, prioridade: "" }); }} className="w-full h-14 text-base gap-2 bg-blue-600 hover:bg-blue-700">
          <Wrench className="w-5 h-5" /> Abrir solicitação de manutenção
        </Button>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <h2 className="font-semibold text-foreground">Solicitação de manutenção</h2>
          <div>
            <Label>O que está acontecendo?</Label>
            <Textarea rows={4} autoFocus value={ss.descricao} onChange={(e) => setSs({ ...ss, descricao: e.target.value })} placeholder="Barulho, vazamento, não liga, peça quebrada…" className="text-base mt-1" />
          </div>
          <div>
            <Label>A máquina parou?</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setSs({ ...ss, ativoParado: true })} className={cn("h-12 rounded-xl border text-base font-medium", ss.ativoParado === true ? "border-danger bg-danger text-white" : "border-border bg-card text-foreground")}>Sim, parou</button>
              <button type="button" onClick={() => setSs({ ...ss, ativoParado: false })} className={cn("h-12 rounded-xl border text-base font-medium", ss.ativoParado === false ? "border-success bg-success text-white" : "border-border bg-card text-foreground")}>Não, está rodando</button>
            </div>
          </div>
          <div>
            <Label>Urgência</Label>
            <SelectMenu value={ss.prioridade} onChange={(v) => setSs({ ...ss, prioridade: v })} options={[{ value: "", label: "Deixar a Manutenção decidir" }, ...OPCOES_PRIORIDADE]} className="mt-1" />
          </div>
          {erroSs && <p className="text-sm text-danger">{erroSs}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => setSs(null)}>Cancelar</Button>
            <Button className="h-12 text-base" disabled={enviando} onClick={enviarSs}>{enviando ? "Enviando…" : "Enviar"}</Button>
          </div>
        </div>
      )}

      {/* Leitura do medidor */}
      {pcm && d.medidores.length > 0 && (
        !leit ? (
          <Button variant="outline" onClick={() => { setOkLeit(""); setErroLeit(""); setLeit({ medidorId: d.medidores[0].id, valor: "", troca: false }); }} className="w-full h-12 text-base gap-2">
            <Gauge className="w-5 h-5" /> Lançar leitura do {d.medidores.length === 1 ? d.medidores[0].nome.toLowerCase() : "medidor"}
          </Button>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Gauge className="w-4 h-4" /> Leitura do medidor</h2>
            {d.medidores.length > 1 && (
              <SelectMenu value={leit.medidorId} onChange={(v) => setLeit({ ...leit, medidorId: v })} options={d.medidores.map((m) => ({ value: m.id, label: `${m.nome} (${m.unidade})` }))} />
            )}
            {medidor && (
              <p className="text-xs text-muted-foreground">
                Atual: <b className="text-foreground">{fmtNum(medidor.acumulado)} {medidor.unidade}</b>
                {medidor.ultimaLeitura ? ` · última leitura em ${fmtData(medidor.ultimaLeitura.data)}` : " · sem leitura"}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Input autoFocus inputMode="decimal" value={leit.valor} onChange={(e) => setLeit({ ...leit, valor: e.target.value })} placeholder="Leitura" className="h-12 text-lg tabular-nums" />
              <span className="text-sm text-muted-foreground">{medidor?.unidade}</span>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={leit.troca} onChange={(e) => setLeit({ ...leit, troca: e.target.checked })} /> O medidor foi trocado (recomeça do zero)</label>
            {erroLeit && <p className="text-sm text-danger">{erroLeit}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => setLeit(null)}>Cancelar</Button>
              <Button className="h-12 text-base" disabled={enviando} onClick={enviarLeitura}>{enviando ? "Lançando…" : "Lançar"}</Button>
            </div>
          </div>
        )
      )}
      {okLeit && <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{okLeit}</p>}

      {/* SS aguardando triagem */}
      {d.solicitacoes.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Já solicitado — aguardando a Manutenção</h2>
          <ul className="space-y-2">
            {d.solicitacoes.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{s.numero}</span>
                  {s.ativoParado && <span className="rounded px-1.5 py-0.5 bg-danger/10 text-danger">máquina parada</span>}
                  <span className="ml-auto">{fmtDataHora(s.createdAt)}</span>
                </div>
                <p className="text-sm text-foreground mt-1 line-clamp-3">{s.descricao}</p>
                {s.solicitanteNome && <p className="text-[11px] text-muted-foreground mt-0.5">por {s.solicitanteNome}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* OS abertas */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ordens de serviço abertas ({d.ordens.length})</h2>
        {d.ordens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma OS aberta para este equipamento.</p>
        ) : (
          <ul className="space-y-2">
            {d.ordens.map((o) => {
              const corpo = (
                <div className="rounded-xl border border-border bg-card px-3 py-2.5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-foreground">{o.numero}</span>
                      <span className="text-xs text-muted-foreground">{o.tipo.sigla}</span>
                      <StatusOSBadge s={o.status} />
                      <PrioridadeTxt p={o.prioridade} />
                    </div>
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{o.descricao}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      aberta em {fmtData(o.createdAt)}
                      {o.paradaInicio && !o.paradaFim && <span className="text-danger"> · parada desde {fmtDataHora(o.paradaInicio)}</span>}
                    </p>
                  </div>
                  {pcm && <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />}
                </div>
              );
              return <li key={o.id}>{pcm ? <Link href={`/pcm/os/${o.id}`}>{corpo}</Link> : corpo}</li>;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
