"use client";

// Dialog "Aplicar plano a um ativo / Editar aplicação" — modelo da tela "Cadastrar
// Novo Plano" da Tractian: abas segmentadas Diária / Semanal / Mensal / Anual /
// Personalizada / Por medidor, frase viva ("Repete toda segunda e quinta"), chips
// D S T Q Q S S, iniciar plano (+ horário), encerrar plano, agendar a próxima,
// vencimento da OS gerada, lembrete e responsáveis. O calendário pode somar o
// medidor ("o que vencer primeiro" = gatilho AMBOS). Resumo vivo no rodapé.
import { useCallback, useEffect, useMemo, useState } from "react";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import TimePicker from "@/components/shared/TimePicker";
import InfoHint from "@/components/shared/InfoHint";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Bell, CalendarDays, Clock, Gauge, Loader2, Plus, X } from "lucide-react";
import {
  AGENDAMENTOS, DIAS_SEMANA, FINS, REPETICOES, UNIDADES_INTERVALO, descreverRecorrencia, fmtDia, fmtNum, inicioDoDia, intervaloEmDias, isoDia,
  margemEfetiva, parseDia, preverAplicacao, proximaOcorrencia, type AgendarProxima, type FimTipo, type Repeticao, type UnidadeIntervalo,
} from "@/lib/manutencao/gatilho";
import { AtivoCombobox, api, type AtivoLookup } from "@/components/manutencao/comum";

export type MedidorDoAtivo = { id: string; nome: string; unidade: string; acumulado: string | number; ritmoDia?: number | null };

/** Aplicação existente (p/ edição) — subconjunto do que o GET do plano devolve. */
export type AplicacaoEdicao = {
  id: string; gatilho: string;
  repeticao: string | null; intervaloDias: number | null; unidadeIntervalo: string; diasSemana: number[]; diaMes: number | null; horario: string | null; inicio: string | null;
  fimTipo: string; fimData: string | null; fimOcorrencias: number | null; ocorrencias: number; agendarProxima: string;
  vencimentoDias: number | null; lembreteDias: number | null; responsavelIds: string[];
  intervaloMedida: string | null; margemMedida: string | null; medidorId: string | null;
  ultimaExecucao: string | null; ultimaMedida: string | null; proximoVencimento: string | null; proximaMedida: string | null;
  ativoRef: { id: string; tag: string; nome: string };
};

export type RegrasPlano = { antecedenciaDias: number; toleranciaPct: number };

/** Resultado do "gerar agora" devolvido pela rota de aplicações. */
export type Geracao = { gerada: { numero: string } | null; aviso: string | null };
export const descreverGeracao = (g: Geracao | null | undefined): string | null => (g ? (g.gerada ? `OS ${g.gerada.numero} gerada.` : g.aviso) : null);

type Modo = Repeticao | "MEDIDOR";
type Ancora = "ultima" | "proxima";
type Form = {
  ativoId: string; modo: Modo; comMedidor: boolean;
  intervaloN: string; unidade: UnidadeIntervalo; diasSemana: number[]; diaMes: string;
  inicio: string; horario: string; comHorario: boolean;
  fimTipo: FimTipo; fimData: string; fimOcorrencias: string;
  agendarProxima: AgendarProxima;
  medidorId: string; intervaloMedida: string; ultimaMedida: string; proximaMedida: string; ancoraMed: Ancora; margemMedida: string;
  comVencimento: boolean; vencimentoDias: string; comLembrete: boolean; lembreteDias: string; responsavelIds: string[];
  gerarAgora: boolean;
};
type Usuario = { id: string; nome: string };

const MODOS: { value: Modo; label: string }[] = [...REPETICOES, { value: "MEDIDOR", label: "Por medidor" }];
const numOuNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

export default function PlanoAplicacaoDialog({ planoId, regras, aplicacao, ativos, open, onClose, onSaved, onAjustarPlano }: {
  planoId: string; regras: RegrasPlano; aplicacao: AplicacaoEdicao | null; ativos: AtivoLookup[];
  open: boolean; onClose: () => void;
  /** Chamado após salvar; `aviso` traz o resultado do "gerar agora" (OS gerada ou por que não). */
  onSaved: (aviso: string | null) => void;
  /** Leva o usuário ao cabeçalho do plano (antecedência/tolerância). */
  onAjustarPlano: () => void;
}) {
  const [f, setF] = useState<Form | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [medidores, setMedidores] = useState<MedidorDoAtivo[]>([]);
  const [novoMed, setNovoMed] = useState<{ nome: string; unidade: string; acumulado: string } | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  const carregarMedidores = useCallback(async (ativoId: string): Promise<MedidorDoAtivo[]> => {
    if (!ativoId) { setMedidores([]); return []; }
    const j = await fetch("/api/pcm/medidores").then((r) => r.json()).catch(() => ({}));
    const lista: MedidorDoAtivo[] = (j.data ?? []).filter((m: { ativoRef: { id: string } }) => m.ativoRef.id === ativoId);
    setMedidores(lista);
    return lista;
  }, []);

  // Monta o formulário ao abrir. Novo: semanal, iniciando hoje. Legado (sem repeticao): Personalizada.
  useEffect(() => {
    if (!open) { setF(null); return; }
    setErro(""); setNovoMed(null);
    fetch("/api/usuarios").then((r) => r.json()).then((j) => setUsuarios(j.data ?? [])).catch(() => {});
    const hoje = isoDia(new Date());
    if (aplicacao) {
      const a = aplicacao;
      const modo: Modo = a.gatilho === "MEDIDOR" ? "MEDIDOR" : ((a.repeticao as Repeticao) || "PERSONALIZADA");
      setF({
        ativoId: a.ativoRef.id, modo, comMedidor: a.gatilho === "AMBOS",
        intervaloN: a.intervaloDias ? String(a.intervaloDias) : "1", unidade: (a.unidadeIntervalo as UnidadeIntervalo) || "DIAS",
        diasSemana: a.diasSemana ?? [], diaMes: a.diaMes ? String(a.diaMes) : "",
        // Legado sem início: ancora no próximo vencimento gravado (preserva a cadência atual).
        inicio: a.inicio?.slice(0, 10) ?? (a.repeticao ? hoje : a.proximoVencimento?.slice(0, 10) ?? hoje),
        horario: a.horario ?? "", comHorario: !!a.horario,
        fimTipo: (a.fimTipo as FimTipo) || "NUNCA", fimData: a.fimData?.slice(0, 10) ?? "", fimOcorrencias: a.fimOcorrencias ? String(a.fimOcorrencias) : "",
        agendarProxima: (a.agendarProxima as AgendarProxima) || "SEMPRE",
        medidorId: a.medidorId ?? "", intervaloMedida: a.intervaloMedida ? String(Number(a.intervaloMedida)) : "", ultimaMedida: a.ultimaMedida ? String(Number(a.ultimaMedida)) : "",
        proximaMedida: a.proximaMedida ? String(Number(a.proximaMedida)) : "", ancoraMed: a.proximaMedida ? "proxima" : "ultima",
        margemMedida: a.margemMedida ? String(Number(a.margemMedida)) : "",
        comVencimento: a.vencimentoDias != null, vencimentoDias: a.vencimentoDias != null ? String(a.vencimentoDias) : "",
        comLembrete: a.lembreteDias != null, lembreteDias: a.lembreteDias != null ? String(a.lembreteDias) : "",
        responsavelIds: a.responsavelIds ?? [], gerarAgora: false,
      });
      carregarMedidores(a.ativoRef.id);
    } else {
      setF({
        ativoId: "", modo: "SEMANAL", comMedidor: false, intervaloN: "1", unidade: "SEMANAS", diasSemana: [1], diaMes: "",
        inicio: hoje, horario: "", comHorario: false, fimTipo: "NUNCA", fimData: "", fimOcorrencias: "", agendarProxima: "SEMPRE",
        medidorId: "", intervaloMedida: "", ultimaMedida: "", proximaMedida: "", ancoraMed: "ultima", margemMedida: "",
        comVencimento: false, vencimentoDias: "", comLembrete: false, lembreteDias: "", responsavelIds: [], gerarAgora: false,
      });
      setMedidores([]);
    }
  }, [open, aplicacao, carregarMedidores]);

  const medidor = useMemo(() => medidores.find((m) => m.id === f?.medidorId) ?? null, [medidores, f?.medidorId]);
  const set = (patch: Partial<Form>) => setF((cur) => (cur ? { ...cur, ...patch } : cur));

  const usaCal = !!f && f.modo !== "MEDIDOR";
  const usaMed = !!f && (f.modo === "MEDIDOR" || f.comMedidor);
  const gatilho = !f ? "CALENDARIO" : f.modo === "MEDIDOR" ? "MEDIDOR" : f.comMedidor ? "AMBOS" : "CALENDARIO";

  // ── recorrência a partir do formulário ─────────────────────────────────────
  const rec = useMemo(() => f && usaCal ? {
    repeticao: f.modo as Repeticao, intervaloDias: f.modo === "PERSONALIZADA" ? (Math.round(Number(f.intervaloN)) || null) : null,
    unidadeIntervalo: f.unidade, diasSemana: f.modo === "SEMANAL" || (f.modo === "PERSONALIZADA" && f.unidade === "SEMANAS") ? f.diasSemana : [],
    diaMes: f.modo === "MENSAL" ? (numOuNull(f.diaMes) ?? null) : null, inicio: f.inicio || null,
  } : null, [f, usaCal]);

  // A regra mudou em relação à gravada? (edição) — se não, mantém o próximo vencimento atual.
  const regraMudou = useMemo(() => {
    if (!aplicacao || !rec) return true;
    const a = aplicacao;
    return a.repeticao !== rec.repeticao || (a.intervaloDias ?? null) !== (rec.intervaloDias ?? null) || a.unidadeIntervalo !== rec.unidadeIntervalo
      || (a.diasSemana ?? []).join(",") !== (rec.diasSemana ?? []).join(",") || (a.diaMes ?? null) !== (rec.diaMes ?? null) || (a.inicio?.slice(0, 10) ?? "") !== (rec.inicio ?? "");
  }, [aplicacao, rec]);

  // Próximo vencimento do calendário: novo = 1ª ocorrência desde o início; edição com regra alterada =
  // 1ª ocorrência de hoje em diante (sem criar atraso retroativo); sem alteração = o gravado.
  const proximoVencimento = useMemo(() => {
    if (!rec) return null;
    const hoje = inicioDoDia(new Date());
    if (aplicacao && !regraMudou && aplicacao.proximoVencimento) return parseDia(aplicacao.proximoVencimento);
    const ini = parseDia(rec.inicio);
    const base = aplicacao ? (ini && ini > hoje ? ini : hoje) : (ini ?? hoje);
    return proximaOcorrencia(rec, base);
  }, [rec, aplicacao, regraMudou]);

  // ── medidor ────────────────────────────────────────────────────────────────
  function recalcMed(c: Form, ancora: Ancora = c.ancoraMed): Form {
    const iv = numOuNull(c.intervaloMedida);
    if (iv == null || iv <= 0) return c;
    if (ancora === "ultima") { const u = numOuNull(c.ultimaMedida); return { ...c, ancoraMed: ancora, proximaMedida: u != null ? String(u + iv) : c.proximaMedida }; }
    const p = numOuNull(c.proximaMedida);
    return { ...c, ancoraMed: ancora, ultimaMedida: p != null ? String(Math.max(0, p - iv)) : c.ultimaMedida };
  }
  async function escolherAtivo(ativoId: string) {
    const lista = await carregarMedidores(ativoId);
    setF((cur) => cur ? { ...cur, ativoId, medidorId: lista.length === 1 ? lista[0].id : "", ultimaMedida: "", proximaMedida: "" } : cur);
  }
  function escolherMedidor(id: string) {
    const m = medidores.find((x) => x.id === id);
    // Leitura da última execução parte da leitura atual (o ciclo começa agora).
    setF((cur) => cur ? recalcMed({ ...cur, medidorId: id, ultimaMedida: cur.ultimaMedida || (m ? String(Number(m.acumulado)) : "") }, "ultima") : cur);
  }
  async function criarMedidor() {
    if (!f?.ativoId || !novoMed) return;
    const r = await api<{ id: string }>("/api/pcm/medidores", "POST", { acao: "criar", ativoId: f.ativoId, nome: novoMed.nome || "Horímetro", unidade: novoMed.unidade || "h", acumulado: Number(novoMed.acumulado) || 0 });
    if (!r.ok) { setErro(r.error!); return; }
    const lista = await carregarMedidores(f.ativoId);
    const m = lista.find((x) => x.id === r.data!.id);
    setNovoMed(null);
    setF((cur) => cur ? recalcMed({ ...cur, medidorId: r.data!.id, ultimaMedida: m ? String(Number(m.acumulado)) : cur.ultimaMedida }, "ultima") : cur);
  }

  // ── previsão viva ───────────────────────────────────────────────────────────
  const prev = useMemo(() => {
    if (!f) return null;
    const temCal = usaCal && !!proximoVencimento;
    const temMed = usaMed && !!medidor && Number(f.intervaloMedida) > 0;
    if (!temCal && !temMed) return null;
    return preverAplicacao({
      gatilho, ...(rec ?? { intervaloDias: null }), proximoVencimento: temCal ? proximoVencimento : null, horario: f.comHorario ? f.horario : null,
      fimTipo: f.fimTipo, fimData: f.fimData || null, fimOcorrencias: numOuNull(f.fimOcorrencias), ocorrencias: aplicacao?.ocorrencias ?? 0,
      intervaloMedida: temMed ? Number(f.intervaloMedida) : null, margemMedida: numOuNull(f.margemMedida),
      proximaMedida: temMed ? (numOuNull(f.proximaMedida) ?? (numOuNull(f.ultimaMedida) ?? Number(medidor!.acumulado)) + Number(f.intervaloMedida)) : null,
      medidor: temMed ? { unidade: medidor!.unidade, acumulado: medidor!.acumulado } : null,
    }, { antecedenciaDias: regras.antecedenciaDias, ritmoDia: medidor?.ritmoDia ?? null });
  }, [f, usaCal, usaMed, gatilho, rec, proximoVencimento, medidor, regras.antecedenciaDias, aplicacao?.ocorrencias]);

  async function salvar() {
    if (!f) return;
    setErro("");
    if (!f.ativoId) { setErro("Escolha o ativo."); return; }
    const body = {
      paId: aplicacao?.id, ativoId: f.ativoId, gatilho,
      repeticao: usaCal ? f.modo : null, intervaloDias: f.modo === "PERSONALIZADA" ? f.intervaloN : null, unidadeIntervalo: f.unidade,
      diasSemana: rec?.diasSemana ?? [], diaMes: f.modo === "MENSAL" ? f.diaMes : null, inicio: f.inicio || null, horario: f.comHorario ? f.horario || null : null,
      fimTipo: f.fimTipo, fimData: f.fimTipo === "DATA" ? f.fimData || null : null, fimOcorrencias: f.fimTipo === "OCORRENCIAS" ? f.fimOcorrencias : null,
      agendarProxima: f.agendarProxima, proximoVencimento: usaCal && proximoVencimento ? isoDia(proximoVencimento) : null,
      medidorId: usaMed ? f.medidorId || null : null, intervaloMedida: f.intervaloMedida, ultimaMedida: f.ultimaMedida, proximaMedida: f.proximaMedida, margemMedida: f.margemMedida,
      vencimentoDias: f.comVencimento ? f.vencimentoDias : null, lembreteDias: f.comLembrete ? f.lembreteDias : null, responsavelIds: f.responsavelIds,
      gerarAgora: f.gerarAgora && !!prev?.vencida,
    };
    setSalvando(true);
    const r = await api<{ geracao?: Geracao }>(`/api/pcm/planos-cadastro/${planoId}/ativos`, aplicacao ? "PATCH" : "POST", body);
    setSalvando(false);
    if (!r.ok) { setErro(r.error!); return; }
    onSaved(descreverGeracao(r.data?.geracao));
  }

  const unMed = medidor?.unidade ?? "h";
  const frase = rec ? descreverRecorrencia(rec, { horario: f?.comHorario ? f.horario : null }) : null;
  const toleranciaDias = rec && f ? Math.round((rec.repeticao === "PERSONALIZADA" ? intervaloEmDias(Number(f.intervaloN) || 0, f.unidade) : rec.repeticao === "DIARIA" ? 1 : rec.repeticao === "SEMANAL" ? 7 : rec.repeticao === "MENSAL" ? 30 : 365) * regras.toleranciaPct / 100) : null;
  const mostrarChips = f && (f.modo === "SEMANAL" || (f.modo === "PERSONALIZADA" && f.unidade === "SEMANAS"));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{aplicacao ? `Editar aplicação — ${aplicacao.ativoRef.tag}` : "Aplicar plano a um ativo"}</DialogTitle></DialogHeader>
        {f && (
          <div className="space-y-4">
            <div>
              <Label>Ativo</Label>
              <AtivoCombobox ativos={ativos} value={f.ativoId} disabled={!!aplicacao} onChange={escolherAtivo} />
            </div>

            {/* Repetição: abas segmentadas */}
            <div>
              <Label>Repetição</Label>
              <div className="mt-1 inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
                {MODOS.map((m) => (
                  <button key={m.value} type="button" onClick={() => set({ modo: m.value, ...(m.value === "PERSONALIZADA" && f.modo !== "PERSONALIZADA" ? { intervaloN: "2", unidade: "SEMANAS" as UnidadeIntervalo } : {}) })}
                    className={cn("px-3 py-1.5 text-xs rounded-md inline-flex items-center gap-1", f.modo === m.value ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                    {m.value === "MEDIDOR" && <Gauge className="w-3.5 h-3.5" />}{m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendário */}
            {usaCal && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2"><CalendarDays className="w-4 h-4 text-info" /> {frase}</p>

                {f.modo === "PERSONALIZADA" && (
                  <div className="grid grid-cols-2 sm:grid-cols-[6rem_9rem_1fr] gap-3 items-end">
                    <div><Label>A cada</Label><Input inputMode="numeric" value={f.intervaloN} onChange={(e) => set({ intervaloN: e.target.value })} /></div>
                    <div><Label className="sr-only">Unidade</Label><SelectMenu value={f.unidade} onChange={(v) => set({ unidade: v as UnidadeIntervalo })} options={UNIDADES_INTERVALO.map((u) => ({ value: u.value, label: u.label }))} /></div>
                    <p className="text-[11px] text-muted-foreground pb-2 col-span-2 sm:col-span-1">{f.unidade === "MESES" ? "Meses somam no calendário (31/01 + 1 mês = 28/02)." : f.unidade === "SEMANAS" ? "Marque os dias da semana em que repete." : "Dias corridos a partir do início."}</p>
                  </div>
                )}
                {mostrarChips && (
                  <div>
                    <Label>Dias da semana</Label>
                    <div className="flex gap-1.5 mt-1">
                      {DIAS_SEMANA.map((d) => {
                        const on = f.diasSemana.includes(d.value);
                        return <button key={d.value} type="button" title={d.nome} aria-pressed={on} onClick={() => set({ diasSemana: on ? f.diasSemana.filter((x) => x !== d.value) : [...f.diasSemana, d.value].sort() })}
                          className={cn("w-8 h-8 rounded-full text-xs font-medium border transition-colors", on ? "bg-info text-white border-info" : "border-border text-muted-foreground hover:bg-muted")}>{d.chip}</button>;
                      })}
                    </div>
                  </div>
                )}
                {f.modo === "MENSAL" && (
                  <div className="w-40"><Label>Dia do mês</Label><Input inputMode="numeric" value={f.diaMes} onChange={(e) => set({ diaMes: e.target.value })} placeholder="1 a 31" />
                    <p className="text-[11px] text-muted-foreground mt-1">Dia 31 em mês curto cai no último dia.</p></div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="inline-flex items-center gap-1">Iniciar plano <InfoHint>A partir desta data a regra vale. {f.modo === "ANUAL" ? "A repetição anual usa este dia e mês." : "A primeira OS cai na primeira data da regra a partir daqui."}</InfoHint></Label>
                    <div className="flex gap-2 items-center">
                      <DatePicker value={f.inicio} onChange={(v) => set({ inicio: v })} allowClear className="flex-1" />
                      {f.comHorario ? (
                        <div className="flex items-center gap-1"><TimePicker value={f.horario} onChange={(v) => set({ horario: v })} className="w-24" /><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => set({ comHorario: false, horario: "" })} title="Remover horário"><X className="w-3.5 h-3.5" /></button></div>
                      ) : (
                        <button type="button" className="text-xs text-info hover:underline inline-flex items-center gap-1 whitespace-nowrap" onClick={() => set({ comHorario: true, horario: "08:00" })}><Clock className="w-3.5 h-3.5" /> Adicionar horário</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Encerrar plano</Label>
                    <div className="flex gap-2">
                      <SelectMenu value={f.fimTipo} onChange={(v) => set({ fimTipo: v as FimTipo })} options={FINS} className="flex-1" />
                      {f.fimTipo === "DATA" && <DatePicker value={f.fimData} onChange={(v) => set({ fimData: v })} className="w-40" />}
                      {f.fimTipo === "OCORRENCIAS" && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Input inputMode="numeric" className="w-16" value={f.fimOcorrencias} onChange={(e) => set({ fimOcorrencias: e.target.value })} /> execuções</div>}
                    </div>
                    {aplicacao && f.fimTipo === "OCORRENCIAS" && <p className="text-[11px] text-muted-foreground mt-1">{aplicacao.ocorrencias} já gerada(s).</p>}
                  </div>
                </div>

                <div>
                  <Label className="inline-flex items-center gap-1">Agendar a próxima execução <InfoHint>{AGENDAMENTOS.map((a) => `${a.label}: ${a.descricao}`).join(" ")}</InfoHint></Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {AGENDAMENTOS.map((a) => (
                      <button key={a.value} type="button" onClick={() => set({ agendarProxima: a.value })} className={cn("text-left rounded-md border px-3 py-2", f.agendarProxima === a.value ? "border-info bg-info/5 ring-1 ring-info/40" : "border-border hover:bg-muted/60")}>
                        <div className="text-sm">{a.label}</div><div className="text-[11px] text-muted-foreground">{a.descricao}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm pt-1"><input type="checkbox" className="rounded" checked={f.comMedidor} onChange={(e) => set({ comMedidor: e.target.checked })} /> Também por medidor — o que vencer primeiro <InfoHint>Soma um gatilho de horímetro/odômetro: a OS nasce no primeiro marco que chegar (data ou leitura). Ao concluir, os dois recomeçam.</InfoHint></label>
              </div>
            )}

            {/* Medidor */}
            {usaMed && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Gauge className="w-4 h-4 text-muted-foreground" /> Medidor</div>
                {!f.ativoId ? <p className="text-xs text-muted-foreground">Escolha o ativo para ver os medidores dele.</p> : (
                  <>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[14rem]">
                        <Label>Medidor do ativo</Label>
                        <SelectMenu value={f.medidorId} onChange={escolherMedidor} placeholder={medidores.length ? "Escolha…" : "Ativo sem medidor — crie um ao lado"}
                          options={medidores.map((m) => ({ value: m.id, label: `${m.nome} · atual ${fmtNum(m.acumulado, 2)} ${m.unidade}` }))} disabled={!medidores.length} />
                      </div>
                      {!novoMed && <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setNovoMed({ nome: "Horímetro", unidade: "h", acumulado: "0" })}><Plus className="w-3.5 h-3.5" /> Novo medidor</Button>}
                    </div>
                    {novoMed && (
                      <div className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2 items-end rounded-md bg-muted/40 p-2">
                        <div><Label className="text-xs">Nome</Label><Input className="h-8 text-sm" value={novoMed.nome} onChange={(e) => setNovoMed({ ...novoMed, nome: e.target.value })} placeholder="Horímetro" /></div>
                        <div><Label className="text-xs">Unidade</Label><Input className="h-8 text-sm" value={novoMed.unidade} onChange={(e) => setNovoMed({ ...novoMed, unidade: e.target.value })} placeholder="h, km…" /></div>
                        <div><Label className="text-xs">Leitura atual</Label><Input className="h-8 text-sm" inputMode="decimal" value={novoMed.acumulado} onChange={(e) => setNovoMed({ ...novoMed, acumulado: e.target.value })} /></div>
                        <div className="flex gap-1"><Button type="button" size="sm" onClick={criarMedidor}>Criar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setNovoMed(null)}>Cancelar</Button></div>
                      </div>
                    )}
                    {medidor && (
                      <p className="text-xs text-muted-foreground">
                        Leitura atual: <b className="text-foreground">{fmtNum(medidor.acumulado, 2)} {unMed}</b>
                        {medidor.ritmoDia ? <> · ritmo médio {fmtNum(medidor.ritmoDia, 1)} {unMed}/dia (pelas últimas leituras)</> : <> · sem leituras suficientes para estimar o ritmo</>}
                      </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><Label>A cada ({unMed})</Label><Input inputMode="decimal" value={f.intervaloMedida} onChange={(e) => setF((c) => c ? recalcMed({ ...c, intervaloMedida: e.target.value }) : c)} placeholder="250" /></div>
                      <div>
                        <Label className="inline-flex items-center gap-1 whitespace-nowrap">Leitura na última <InfoHint>Leitura do medidor quando o serviço foi feito pela última vez. O próximo marco = esta leitura + intervalo.</InfoHint></Label>
                        <Input inputMode="decimal" value={f.ultimaMedida} onChange={(e) => setF((c) => c ? recalcMed({ ...c, ultimaMedida: e.target.value }, "ultima") : c)} placeholder={medidor ? String(Number(medidor.acumulado)) : "0"} />
                      </div>
                      <div>
                        <Label className="inline-flex items-center gap-1 whitespace-nowrap">Próximo marco <InfoHint>Em que leitura a manutenção vence. Ao mudar aqui, a “Leitura na última” é recalculada.</InfoHint></Label>
                        <Input inputMode="decimal" value={f.proximaMedida} onChange={(e) => setF((c) => c ? recalcMed({ ...c, proximaMedida: e.target.value }, "proxima") : c)} />
                      </div>
                      <div>
                        <Label className="inline-flex items-center gap-1 whitespace-nowrap">Gerar quando faltar <InfoHint>Margem: a OS nasce quando faltar esta quantidade para o marco, para dar tempo de programar. Vazio = 10% do intervalo.</InfoHint></Label>
                        <Input inputMode="decimal" value={f.margemMedida} onChange={(e) => set({ margemMedida: e.target.value })} placeholder={Number(f.intervaloMedida) > 0 ? String(margemEfetiva(Number(f.intervaloMedida), null)) : "10%"} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* OS gerada: vencimento, lembrete, responsáveis */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="text-sm font-medium">OS gerada</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="inline-flex items-center gap-1">Vencimento da OS <InfoHint>Prazo da OS gerada: N dias depois da data programada. Sem isso, o prazo é a própria data programada.</InfoHint></Label>
                  {f.comVencimento ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Input inputMode="numeric" className="w-20" value={f.vencimentoDias} onChange={(e) => set({ vencimentoDias: e.target.value })} /> dias após a data programada <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => set({ comVencimento: false, vencimentoDias: "" })} title="Remover"><X className="w-3.5 h-3.5" /></button></div>
                  ) : <button type="button" className="text-xs text-info hover:underline inline-flex items-center gap-1 h-9" onClick={() => set({ comVencimento: true, vencimentoDias: "2" })}><Plus className="w-3.5 h-3.5" /> Adicionar data de vencimento</button>}
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1">Lembrete <InfoHint>Notifica os responsáveis N dias antes do vencimento (só no gatilho de calendário).</InfoHint></Label>
                  <label className="flex items-center gap-2 text-sm h-9"><input type="checkbox" className="rounded" checked={f.comLembrete} onChange={(e) => set({ comLembrete: e.target.checked, lembreteDias: e.target.checked ? f.lembreteDias || "1" : "" })} /> Habilitar lembrete
                    {f.comLembrete && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bell className="w-3.5 h-3.5" /><Input inputMode="numeric" className="w-14 h-7 text-xs" value={f.lembreteDias} onChange={(e) => set({ lembreteDias: e.target.value })} /> dias antes</span>}
                  </label>
                </div>
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">Responsáveis <InfoHint>Recebem o lembrete; o primeiro com colaborador vinculado vira o responsável da OS gerada.</InfoHint></Label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {f.responsavelIds.map((uid) => <span key={uid} className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-muted/40 pl-2 pr-1 py-0.5">{usuarios.find((u) => u.id === uid)?.nome ?? "…"}<button type="button" onClick={() => set({ responsavelIds: f.responsavelIds.filter((x) => x !== uid) })} className="text-muted-foreground hover:text-danger"><X className="w-3 h-3" /></button></span>)}
                </div>
                <ComboboxWithCreate value="" onChange={(v) => v && !f.responsavelIds.includes(v) && set({ responsavelIds: [...f.responsavelIds, v] })} options={usuarios.filter((u) => !f.responsavelIds.includes(u.id)).map((u) => ({ value: u.id, label: u.nome }))} placeholder="Adicionar responsável…" className="max-w-sm" />
              </div>
            </div>

            {/* Regras do plano (somente leitura) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
              <span>Regras do plano:</span>
              <span>OS gerada <b className="text-foreground">{regras.antecedenciaDias} {regras.antecedenciaDias === 1 ? "dia" : "dias"} antes</b></span>
              <span>· tolerância de aderência <b className="text-foreground">{regras.toleranciaPct}%</b></span>
              <button type="button" className="text-info hover:underline ml-auto" onClick={onAjustarPlano}>ajustar no cabeçalho do plano</button>
            </div>

            {/* Resumo vivo */}
            <div className={cn("rounded-lg border p-3 text-sm space-y-1", prev?.encerrada ? "border-border bg-muted/40" : prev?.atrasada ? "border-danger/40 bg-danger/5" : prev?.vencida ? "border-warning/40 bg-warning/5" : "border-border bg-card")}>
              {!prev ? <p className="text-muted-foreground text-xs">{usaCal && f.modo === "SEMANAL" && !f.diasSemana.length ? "Marque os dias da semana para ver a previsão." : "Preencha o gatilho para ver a previsão da próxima OS."}</p> : (
                <>
                  {prev.encerrada && <p className="text-muted-foreground">Plano encerrado — {prev.motivo}. {f.fimTipo === "OCORRENCIAS" && "Aumente o nº de execuções ou mude o encerramento para voltar a gerar."}</p>}
                  {!prev.encerrada && prev.calendario && (
                    <p>
                      <span className="text-muted-foreground">Próxima OS:</span> <b>{fmtDia(prev.calendario.vencimento)}{f.comHorario && f.horario ? ` às ${f.horario}` : ""}</b>
                      <span className="text-muted-foreground"> {prev.calendario.diasAte < 0 ? `(venceu há ${-prev.calendario.diasAte} dias)` : prev.calendario.diasAte === 0 ? "(hoje)" : `(em ${prev.calendario.diasAte} dias)`} · gerada {regras.antecedenciaDias} dias antes{f.comVencimento && f.vencimentoDias ? ` · prazo +${f.vencimentoDias} dias` : ""}{toleranciaDias ? ` · tolerância ${toleranciaDias} dias (${regras.toleranciaPct}%)` : ""}{f.comLembrete && f.lembreteDias ? ` · lembrete ${f.lembreteDias} dia(s) antes` : ""}</span>
                    </p>
                  )}
                  {!prev.encerrada && prev.medidor && (
                    <p>
                      <span className="text-muted-foreground">Próximo marco:</span> <b>{fmtNum(prev.medidor.alvo, 2)} {prev.medidor.unidade}</b>
                      <span className="text-muted-foreground"> · {prev.medidor.faltam <= 0 ? `passou ${fmtNum(-prev.medidor.faltam, 2)} ${prev.medidor.unidade}` : `faltam ${fmtNum(prev.medidor.faltam, 2)} ${prev.medidor.unidade}`}
                        {prev.medidor.dataPrevista && prev.medidor.faltam > 0 ? ` · ~${fmtDia(prev.medidor.dataPrevista)} ao ritmo de ${fmtNum(prev.medidor.ritmoDia, 1)} ${prev.medidor.unidade}/dia` : ""}
                        {" "}· OS nasce aos {fmtNum(prev.medidor.alvo - prev.medidor.margem, 2)} {prev.medidor.unidade} ({fmtNum(prev.medidor.margem, 2)} {prev.medidor.unidade} antes)</span>
                    </p>
                  )}
                  {!prev.encerrada && gatilho === "AMBOS" && <p className="text-[11px] text-muted-foreground">Vale o que chegar primeiro; ao concluir a OS, os dois marcos recomeçam.</p>}
                  {!prev.encerrada && f.fimTipo !== "NUNCA" && <p className="text-[11px] text-muted-foreground">Encerra {f.fimTipo === "DATA" ? `em ${fmtDia(f.fimData)}` : `após ${f.fimOcorrencias || "?"} execuções${aplicacao ? ` (${aplicacao.ocorrencias} geradas)` : ""}`}.</p>}
                  {prev.vencida && (
                    <div className="pt-1 space-y-1">
                      <p className={cn("text-xs inline-flex items-center gap-1", prev.atrasada ? "text-danger" : "text-warning")}><AlertTriangle className="w-3.5 h-3.5" /> {prev.atrasada ? "Já venceu" : "Já está na janela de geração"} — {prev.motivo}.</p>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.gerarAgora} onChange={(e) => set({ gerarAgora: e.target.checked })} /> {aplicacao ? "Gerar a OS agora ao salvar" : "Gerar a primeira OS agora ao salvar"}</label>
                    </div>
                  )}
                </>
              )}
            </div>

            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !f}>{salvando ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Salvando…</> : aplicacao ? "Salvar aplicação" : "Aplicar ao ativo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
