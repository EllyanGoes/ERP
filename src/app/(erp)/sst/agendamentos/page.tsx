"use client";

// Agendamento de exames com a clínica (NR-07): o sistema sugere quem precisa ir
// (ASO vencido/vencendo, sem ASO, retorno, exame pendente) e quais exames pedir;
// distribui por dia + período (manhã/tarde), gera a lista do lote e as guias de
// encaminhamento, e o ASO registrado no retorno fecha o agendamento.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import InfoHint from "@/components/shared/InfoHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { CalendarCheck, CalendarPlus, Check, Building2, Loader2, Pencil, Plus, Printer, Search, Stethoscope, UserX, X, Ban, CalendarClock } from "lucide-react";
import { AcoesLinha, DocLink, TIPO_ASO, UploadAnexo, hojeISO } from "@/components/sst/comum";
import MedicoSelect from "@/components/sst/MedicoSelect";
import { distribuir, sugerir, type ColabAgenda, type TipoExame } from "@/components/sst/agendamento/sugestoes";
import { htmlGuias, imprimirHtml, PERIODO_LABEL, type AgendamentoGuia } from "@/components/sst/agendamento/guia";

type Clinica = {
  id: string; nome: string; fornecedorId: string | null; cnpj: string | null; endereco: string | null; telefone: string | null; email: string | null;
  contato: string | null; observacoes: string | null; ativo: boolean; precos: { exameTipoId: string; preco: string }[]; _count: { agendamentos: number };
};
type Agendamento = AgendamentoGuia & { aso: { id: string; tipo: string; data: string; resultado: string; documentoId: string | null } | null };
type Linha = { sel: boolean; tipoAso: string; exames: string[]; data: string; periodo: "MANHA" | "TARDE" };

const STATUS: Record<string, { label: string; cls: string }> = {
  AGENDADO: { label: "Agendado", cls: "border-info/30 bg-info/10 text-info" },
  CONFIRMADO: { label: "Confirmado", cls: "border-violet-300 bg-violet-50 text-violet-700" },
  REALIZADO: { label: "Realizado", cls: "border-success/30 bg-success/10 text-success" },
  FALTOU: { label: "Faltou", cls: "border-danger/30 bg-danger/10 text-danger" },
  CANCELADO: { label: "Cancelado", cls: "border-border bg-muted text-muted-foreground" },
};
const FILTROS_STATUS: Record<string, string[]> = { abertos: ["AGENDADO", "CONFIRMADO"], realizados: ["REALIZADO"], faltas: ["FALTOU", "CANCELADO"], todos: [] };
const TIPOS_ASO_OPC = ["ADMISSIONAL", "PERIODICO", "RETORNO", "MUDANCA_FUNCAO", "MUDANCA_RISCO", "DEMISSIONAL"].map((v) => ({ value: v, label: TIPO_ASO[v] }));
const PERIODO_OPC = [{ value: "MANHA", label: "Manhã" }, { value: "TARDE", label: "Tarde" }];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const diaSemana = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });

export default function SstAgendamentosPage() {
  useTabTitle("SST — Agendamento de exames");
  const [aba, setAba] = usePersistedState<"agenda" | "agendar" | "clinicas">("sst:agendamentos:aba", "agenda");
  const [clinicas, setClinicas] = useState<Clinica[]>([]);
  const [tipos, setTipos] = useState<TipoExame[]>([]);
  const [colabs, setColabs] = useState<ColabAgenda[]>([]);
  const [ags, setAgs] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarAgs = useCallback(() => fetch("/api/sst/agendamentos").then((r) => r.json()).then((j) => setAgs(j.data ?? [])), []);
  const carregarClinicas = useCallback(() => fetch("/api/sst/clinicas?todas=1").then((r) => r.json()).then((j) => setClinicas(j.data ?? [])), []);
  const carregarColabs = useCallback(() => fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setColabs(j.data ?? [])), []);
  useEffect(() => {
    Promise.all([carregarAgs(), carregarClinicas(), carregarColabs(), fetch("/api/sst/exames-tipos").then((r) => r.json()).then((j) => setTipos(j.data ?? []))]).finally(() => setLoading(false));
  }, [carregarAgs, carregarClinicas, carregarColabs]);

  const clinicasAtivas = clinicas.filter((c) => c.ativo);
  const abertos = ags.filter((a) => a.status === "AGENDADO" || a.status === "CONFIRMADO");

  return (
    <div>
      <PageHeader title="Agendamento de exames" subtitle="Quem precisa ir à clínica, quando e quais exames — guias de encaminhamento e retorno do ASO"
        breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Agendamento de exames" }]} />
      <div className="px-8 pb-10 space-y-4">
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-sm">
          {([["agenda", `Agenda${abertos.length ? ` (${abertos.length})` : ""}`, CalendarCheck], ["agendar", "Agendar", CalendarPlus], ["clinicas", "Clínicas", Building2]] as const).map(([k, rot, Icon]) => (
            <button key={k} type="button" onClick={() => setAba(k)} className={cn("px-3 py-1.5 rounded-md inline-flex items-center gap-1.5", aba === k ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}>
              <Icon className="w-4 h-4" /> {rot}
            </button>
          ))}
        </div>
        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          : aba === "agenda" ? <Agenda ags={ags} tipos={tipos} recarregar={() => { carregarAgs(); carregarColabs(); }} />
          : aba === "agendar" ? <Agendar colabs={colabs} tipos={tipos} clinicas={clinicasAtivas} abertos={abertos} onAgendado={async () => { await carregarAgs(); setAba("agenda"); }} />
          : <Clinicas clinicas={clinicas} tipos={tipos} recarregar={carregarClinicas} />}
      </div>
    </div>
  );
}

// ── Agendar: sugestões + distribuição por dia/período ─────────────────────────
function Agendar({ colabs, tipos, clinicas, abertos, onAgendado }: { colabs: ColabAgenda[]; tipos: TipoExame[]; clinicas: Clinica[]; abertos: Agendamento[]; onAgendado: () => void }) {
  const [janela, setJanela] = usePersistedState("sst:agendar:janela", "60");
  const [busca, setBusca] = useState("");
  const [clinicaId, setClinicaId] = usePersistedState("sst:agendar:clinica", "");
  const [inicio, setInicio] = useState(hojeISO());
  const [porPeriodo, setPorPeriodo] = usePersistedState("sst:agendar:porPeriodo", "8");
  const [periodos, setPeriodos] = usePersistedState("sst:agendar:periodos", "AMBOS");
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { if (!clinicaId && clinicas.length === 1) setClinicaId(clinicas[0].id); }, [clinicas, clinicaId, setClinicaId]);
  const jaAgendado = useMemo(() => new Map(abertos.map((a) => [a.colaborador.id, a])), [abertos]);
  const sugestoes = useMemo(() => sugerir(colabs, tipos, Number(janela)).filter((s) => !jaAgendado.has(s.colab.id)), [colabs, tipos, janela, jaAgendado]);
  // Linha nova ganha o sugerido; as já mexidas mantêm a edição.
  useEffect(() => {
    setLinhas((prev) => {
      const out = { ...prev };
      for (const s of sugestoes) if (!out[s.colab.id]) out[s.colab.id] = { sel: false, tipoAso: s.tipoAso, exames: s.exames, data: "", periodo: "MANHA" };
      return out;
    });
  }, [sugestoes]);

  const clinica = clinicas.find((c) => c.id === clinicaId);
  const preco = useCallback((id: string) => {
    const p = clinica?.precos.find((x) => x.exameTipoId === id)?.preco ?? tipos.find((t) => t.id === id)?.preco;
    return Number(p ?? 0);
  }, [clinica, tipos]);
  const nomeExame = useMemo(() => new Map(tipos.map((t) => [t.id, t.nome])), [tipos]);
  const visiveis = sugestoes.filter((s) => { const t = norm(busca).split(/\s+/).filter(Boolean); const alvo = norm(`${s.colab.nome} ${s.colab.funcao?.nome ?? ""} ${s.motivo}`); return t.every((x) => alvo.includes(x)); });
  const selecionadas = sugestoes.filter((s) => linhas[s.colab.id]?.sel);
  const set = (id: string, p: Partial<Linha>) => setLinhas((l) => ({ ...l, [id]: { ...l[id], ...p } }));
  const custo = (id: string) => (linhas[id]?.exames ?? []).reduce((s, e) => s + preco(e), 0);
  const totalCusto = selecionadas.reduce((s, x) => s + custo(x.colab.id), 0);
  const totalExames = selecionadas.reduce((s, x) => s + (linhas[x.colab.id]?.exames.length ?? 0), 0);

  function distribuirDatas() {
    const per = (periodos === "MANHA" ? ["MANHA"] : periodos === "TARDE" ? ["TARDE"] : ["MANHA", "TARDE"]) as ("MANHA" | "TARDE")[];
    const slots = distribuir(selecionadas.length, inicio, Number(porPeriodo) || 1, per);
    setLinhas((l) => { const out = { ...l }; selecionadas.forEach((s, i) => { out[s.colab.id] = { ...out[s.colab.id], data: slots[i].data, periodo: slots[i].periodo }; }); return out; });
  }

  async function agendar() {
    setErro("");
    if (!clinicaId) { setErro("Escolha a clínica."); return; }
    if (selecionadas.length === 0) { setErro("Marque quem vai à clínica."); return; }
    const semData = selecionadas.filter((s) => !linhas[s.colab.id].data);
    if (semData.length) { setErro(`Defina a data de ${semData.length} colaborador(es) — use "Distribuir datas" ou escolha na linha.`); return; }
    const semExame = selecionadas.filter((s) => linhas[s.colab.id].exames.length === 0);
    if (semExame.length) { setErro(`${semExame[0].colab.nome} está sem exame.`); return; }
    setSalvando(true);
    const res = await fetch("/api/sst/agendamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      clinicaId, observacoes: obs, itens: selecionadas.map((s) => { const l = linhas[s.colab.id]; return { colaboradorId: s.colab.id, data: l.data, periodo: l.periodo, tipoAso: l.tipoAso, exames: l.exames }; }),
    }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setSalvando(false); setErro(j.error || "Erro ao agendar"); return; }
    const lote = await fetch(`/api/sst/agendamentos?loteId=${j.data.loteId}`).then((r) => r.json());
    setSalvando(false);
    setLinhas({}); setObs("");
    if (lote.data?.length) imprimirHtml(htmlGuias(lote.data));
    onAgendado();
  }

  if (clinicas.length === 0) return <p className="text-sm text-muted-foreground">Cadastre a clínica na aba <b>Clínicas</b> para agendar.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
      <section className="bg-card rounded-xl border border-border min-w-0">
        <div className="px-4 py-2.5 border-b border-border bg-muted flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-sm text-foreground mr-auto inline-flex items-center gap-1.5">Quem precisa ir à clínica
            <InfoHint side="right">Sugestão a partir do SST: retorno de afastamento, sem ASO, ASO vencido ou vencendo na janela, e exames da função nunca feitos ou vencendo. A consulta clínica entra sempre. Quem já tem agendamento em aberto não aparece.</InfoHint>
          </h2>
          <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8 h-8 w-48 text-sm" /></div>
          <span className="text-xs text-muted-foreground">vencendo em</span>
          <SelectMenu value={janela} onChange={setJanela} className="w-28" options={[{ value: "30", label: "30 dias" }, { value: "60", label: "60 dias" }, { value: "90", label: "90 dias" }, { value: "365", label: "1 ano" }]} />
          <Button size="sm" variant="outline" className="h-8" onClick={() => setLinhas((l) => { const out = { ...l }; for (const s of visiveis) if (s.urgencia <= 2) out[s.colab.id] = { ...out[s.colab.id], sel: true }; return out; })}>Marcar urgentes</Button>
        </div>
        {visiveis.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground text-center">Ninguém precisa de exame nessa janela{jaAgendado.size ? ` (${jaAgendado.size} já agendado(s))` : ""}.</p> : (
          <div className="max-h-[66vh] overflow-y-auto divide-y divide-border/60">
            {visiveis.map((s) => {
              const l = linhas[s.colab.id]; if (!l) return null;
              const extras = tipos.filter((t) => t.ativo && !l.exames.includes(t.id));
              return (
                <div key={s.colab.id} className={cn("px-4 py-2.5", l.sel && "bg-info/5")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 rounded" checked={l.sel} onChange={(e) => set(s.colab.id, { sel: e.target.checked })} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground"><Link href={`/sst/colaboradores/${s.colab.id}`} className="font-medium hover:text-info">{s.colab.nome}</Link>
                        <span className="text-xs text-muted-foreground"> · {s.colab.funcao?.nome.split(" — ")[0] ?? "sem função"}</span></p>
                      <p className={cn("text-[11px]", s.urgencia <= 2 ? "text-danger font-medium" : "text-warning")}>{s.motivo}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {l.exames.map((e) => (
                          <span key={e} className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground">
                            {nomeExame.get(e) ?? "exame"}{preco(e) > 0 && <span className="text-muted-foreground">{brl(preco(e))}</span>}
                            <button type="button" title="Tirar" onClick={() => set(s.colab.id, { exames: l.exames.filter((x) => x !== e) })} className="text-muted-foreground hover:text-danger"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                        {extras.length > 0 && <SelectMenu value="" onChange={(v) => v && set(s.colab.id, { exames: [...l.exames, v] })} placeholder="+ exame" triggerClassName="h-6 text-[11px] px-2" menuClassName="min-w-[240px]" options={extras.map((t) => ({ value: t.id, label: t.nome }))} />}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <SelectMenu value={l.tipoAso} onChange={(v) => set(s.colab.id, { tipoAso: v })} triggerClassName="h-8 w-[150px] text-xs" options={TIPOS_ASO_OPC} />
                      <span className="text-xs tabular-nums text-muted-foreground">{brl(custo(s.colab.id))}</span>
                    </div>
                    {l.sel && (
                      <div className="shrink-0 flex flex-col gap-1.5 w-[150px]">
                        <DatePicker value={l.data} onChange={(v) => set(s.colab.id, { data: v })} triggerClassName="h-8 text-xs" invalid={!l.data} />
                        <SelectMenu value={l.periodo} onChange={(v) => set(s.colab.id, { periodo: v as "MANHA" | "TARDE" })} triggerClassName="h-8 text-xs" options={PERIODO_OPC} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {jaAgendado.size > 0 && <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">{jaAgendado.size} colaborador(es) já com agendamento em aberto — veja na aba Agenda.</p>}
      </section>

      <aside className="bg-card rounded-xl border border-border p-4 space-y-3 lg:sticky lg:top-4">
        <div><Label>Clínica</Label><SelectMenu value={clinicaId} onChange={setClinicaId} placeholder="Escolher clínica" options={clinicas.map((c) => ({ value: c.id, label: c.nome }))} /></div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Distribuir datas</p>
          <div><Label className="text-xs">A partir de</Label><DatePicker value={inicio} onChange={setInicio} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Pessoas por período</Label><Input type="number" min={1} value={porPeriodo} onChange={(e) => setPorPeriodo(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Períodos</Label><SelectMenu value={periodos} onChange={setPeriodos} options={[{ value: "AMBOS", label: "Manhã e tarde" }, { value: "MANHA", label: "Só manhã" }, { value: "TARDE", label: "Só tarde" }]} /></div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={distribuirDatas} disabled={selecionadas.length === 0}>Distribuir {selecionadas.length || ""} marcado(s)</Button>
          <p className="text-[11px] text-muted-foreground">Pula sábado e domingo. Depois dá para ajustar a data e o período em cada linha.</p>
        </div>
        <div><Label className="text-xs">Observações do lote</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Opcional — sai na lista enviada à clínica" /></div>
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm space-y-0.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Colaboradores</span><b>{selecionadas.length}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Exames</span><b>{totalExames}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Custo previsto</span><b>{brl(totalCusto)}</b></div>
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <Button className="w-full gap-1.5" onClick={agendar} disabled={salvando || selecionadas.length === 0}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Agendar e imprimir guias
        </Button>
      </aside>
    </div>
  );
}

// ── Agenda: por dia/período, status, remarcar, registrar o ASO ────────────────
function Agenda({ ags, tipos, recarregar }: { ags: Agendamento[]; tipos: TipoExame[]; recarregar: () => void }) {
  const [filtro, setFiltro] = usePersistedState("sst:agenda:filtro", "abertos");
  const [busca, setBusca] = useState("");
  const [remarcar, setRemarcar] = useState<Agendamento | null>(null);
  const [registrar, setRegistrar] = useState<Agendamento | null>(null);

  const lista = useMemo(() => {
    const st = FILTROS_STATUS[filtro] ?? [];
    const t = norm(busca).split(/\s+/).filter(Boolean);
    return ags.filter((a) => !st.length || st.includes(a.status))
      .filter((a) => { const alvo = norm(`${a.colaborador.nome} ${a.colaborador.sstFuncoes[0]?.funcao.nome ?? ""} ${a.clinica.nome}`); return t.every((x) => alvo.includes(x)); })
      .sort((a, b) => (filtro === "realizados" ? b.data.localeCompare(a.data) : a.data.localeCompare(b.data)) || a.periodo.localeCompare(b.periodo) || a.colaborador.nome.localeCompare(b.colaborador.nome, "pt-BR"));
  }, [ags, filtro, busca]);
  const grupos = useMemo(() => {
    const m = new Map<string, Agendamento[]>();
    for (const a of lista) { const k = `${a.data.slice(0, 10)}|${a.periodo}`; m.set(k, [...(m.get(k) ?? []), a]); }
    return Array.from(m.entries());
  }, [lista]);

  async function patch(a: Agendamento, body: Record<string, unknown>) {
    const res = await fetch(`/api/sst/agendamentos/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erro"); }
    recarregar();
  }
  async function imprimirLote(a: Agendamento) {
    if (!a.lote) return;
    const j = await fetch(`/api/sst/agendamentos?loteId=${a.lote.id}`).then((r) => r.json()).catch(() => null);
    imprimirHtml(htmlGuias(j?.data?.length ? j.data : ags.filter((x) => x.lote?.id === a.lote?.id)));
  }
  const hoje = hojeISO();

  return (
    <section className="bg-card rounded-xl border border-border">
      <div className="px-4 py-2.5 border-b border-border bg-muted flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-sm text-foreground mr-auto">Agenda da clínica <span className="font-normal text-muted-foreground">({lista.length})</span></h2>
        <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8 h-8 w-48 text-sm" /></div>
        <SelectMenu value={filtro} onChange={setFiltro} className="w-44" options={[{ value: "abertos", label: "Em aberto" }, { value: "realizados", label: "Realizados" }, { value: "faltas", label: "Faltas e cancelados" }, { value: "todos", label: "Todos" }]} />
        {lista.length > 0 && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => imprimirHtml(htmlGuias(lista))} title="Lista + guias do que está filtrado"><Printer className="w-4 h-4" /> Imprimir</Button>}
      </div>
      {lista.length === 0 ? <p className="px-4 py-10 text-sm text-muted-foreground text-center">Nenhum agendamento {filtro === "abertos" ? "em aberto. Use a aba Agendar." : "neste filtro."}</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr>
            <th className="text-left px-4 py-1.5 font-semibold">Colaborador</th><th className="text-left px-3 py-1.5 font-semibold">ASO</th>
            <th className="text-left px-3 py-1.5 font-semibold">Exames</th><th className="text-left px-3 py-1.5 font-semibold">Lote</th>
            <th className="text-left px-3 py-1.5 font-semibold">Situação</th><th className="w-10" />
          </tr></thead>
          <tbody>
            {grupos.map(([k, linhas]) => {
              const [data, periodo] = k.split("|");
              const passado = data < hoje && linhas.some((a) => a.status === "AGENDADO" || a.status === "CONFIRMADO");
              return (
                <Fragment key={k}>
                  <tr className="border-t border-border bg-muted/50"><td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-foreground">
                    <span className="capitalize">{diaSemana(data)}</span>, {dataBR(data)} — {PERIODO_LABEL[periodo]} <span className="font-normal text-muted-foreground">· {linhas.length} · {linhas[0].clinica.nome}</span>
                    {passado && <span className="ml-2 font-normal text-warning">data passou — registre o ASO ou marque a falta</span>}
                  </td></tr>
                  {linhas.map((a) => {
                    const aberto = a.status === "AGENDADO" || a.status === "CONFIRMADO";
                    return (
                      <tr key={a.id} className="border-t border-border/60 hover:bg-muted/40 align-top">
                        <td className="px-4 py-2"><Link href={`/sst/colaboradores/${a.colaborador.id}`} className="font-medium text-foreground hover:text-info">{a.colaborador.nome}</Link>
                          <span className="block text-[11px] text-muted-foreground">{a.colaborador.sstFuncoes[0]?.funcao.nome.split(" — ")[0] ?? "—"}</span></td>
                        <td className="px-3 py-2 text-xs">{TIPO_ASO[a.tipoAso] ?? a.tipoAso}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[360px]">{a.exames.map((e) => e.exameTipo.nome).join(", ")}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{a.lote ? `nº ${String(a.lote.numero).padStart(4, "0")}` : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full border", STATUS[a.status]?.cls)}>{STATUS[a.status]?.label ?? a.status}</span>
                          {a.aso && <span className="block mt-1"><DocLink id={a.aso.documentoId} label="ASO" /></span>}
                        </td>
                        <td className="px-2 py-2">
                          <AcoesLinha acoes={[
                            ...(aberto ? [{ label: "Registrar ASO (retorno)", icon: <Stethoscope className="w-4 h-4 mr-2" />, onClick: () => setRegistrar(a) }] : []),
                            ...(a.status === "AGENDADO" ? [{ label: "Clínica confirmou", icon: <Check className="w-4 h-4 mr-2" />, onClick: () => patch(a, { status: "CONFIRMADO" }) }] : []),
                            ...(a.status !== "REALIZADO" ? [{ label: "Remarcar", icon: <CalendarClock className="w-4 h-4 mr-2" />, onClick: () => setRemarcar(a) }] : []),
                            { label: "Imprimir guia", icon: <Printer className="w-4 h-4 mr-2" />, onClick: () => imprimirHtml(htmlGuias([a], { lista: false })), separadorAntes: true },
                            ...(a.lote ? [{ label: `Imprimir lote nº ${String(a.lote.numero).padStart(4, "0")}`, icon: <Printer className="w-4 h-4 mr-2" />, onClick: () => imprimirLote(a) }] : []),
                            ...(aberto ? [
                              { label: "Faltou", icon: <UserX className="w-4 h-4 mr-2" />, onClick: () => patch(a, { status: "FALTOU" }), separadorAntes: true },
                              { label: "Cancelar agendamento", icon: <Ban className="w-4 h-4 mr-2" />, onClick: () => patch(a, { status: "CANCELADO" }), danger: true },
                            ] : []),
                          ]} />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      <RemarcarDialog ag={remarcar} onClose={() => setRemarcar(null)} onSalvo={() => { setRemarcar(null); recarregar(); }} />
      <RegistrarAsoDialog ag={registrar} tipos={tipos} onClose={() => setRegistrar(null)} onSalvo={() => { setRegistrar(null); recarregar(); }} />
    </section>
  );
}

function RemarcarDialog({ ag, onClose, onSalvo }: { ag: Agendamento | null; onClose: () => void; onSalvo: () => void }) {
  const [data, setData] = useState(""); const [periodo, setPeriodo] = useState("MANHA"); const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => { if (ag) { setData(ag.data.slice(0, 10)); setPeriodo(ag.periodo); setObs(ag.observacoes ?? ""); setErro(""); } }, [ag]);
  async function salvar() {
    if (!ag || !data) { setErro("Informe a data."); return; }
    setSalvando(true);
    const res = await fetch(`/api/sst/agendamentos/${ag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data, periodo, observacoes: obs }) });
    const j = await res.json().catch(() => ({})); setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    onSalvo();
  }
  return (
    <Dialog open={!!ag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Remarcar — {ag?.colaborador.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Data</Label><DatePicker value={data} onChange={setData} /></div>
          <div><Label>Período</Label><SelectMenu value={periodo} onChange={setPeriodo} options={PERIODO_OPC} /></div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Remarcar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Retorno da clínica: lança o ASO (com os exames feitos) e fecha o agendamento.
function RegistrarAsoDialog({ ag, tipos, onClose, onSalvo }: { ag: Agendamento | null; tipos: TipoExame[]; onClose: () => void; onSalvo: () => void }) {
  const [data, setData] = useState(""); const [resultado, setResultado] = useState("APTO"); const [restricoes, setRestricoes] = useState("");
  const [validade, setValidade] = useState(""); const [medicoId, setMedicoId] = useState(""); const [doc, setDoc] = useState<string | null>(null);
  const [feitos, setFeitos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  const complementares = (ag?.exames ?? []).filter((e) => !e.exameTipo.clinico);
  useEffect(() => {
    if (!ag) return;
    setData(ag.data.slice(0, 10)); setResultado("APTO"); setRestricoes(""); setValidade(""); setMedicoId(""); setDoc(null); setErro("");
    setFeitos(Object.fromEntries(ag.exames.filter((e) => !e.exameTipo.clinico).map((e) => [e.exameTipoId, true])));
  }, [ag]);
  async function salvar() {
    if (!ag) return;
    if (!data) { setErro("Informe a data do ASO."); return; }
    setSalvando(true); setErro("");
    const exames = Object.entries(feitos).filter(([, v]) => v).map(([exameTipoId]) => ({ exameTipoId }));
    const res = await fetch("/api/sst/asos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      colaboradorId: ag.colaborador.id, tipo: ag.tipoAso, data, validade: validade || null, resultado, restricoes: resultado === "APTO" ? null : restricoes || null, medicoId: medicoId || null, documentoId: doc, exames,
    }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setSalvando(false); setErro(j.error || "Erro ao lançar o ASO"); return; }
    const r2 = await fetch(`/api/sst/agendamentos/${ag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asoId: j.data.id }) });
    setSalvando(false);
    if (!r2.ok) { setErro("ASO lançado, mas não foi possível fechar o agendamento — marque como realizado."); return; }
    onSalvo();
  }
  const nomeTipo = (id: string) => tipos.find((t) => t.id === id)?.nome ?? "exame";
  return (
    <Dialog open={!!ag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>ASO {ag ? (TIPO_ASO[ag.tipoAso] ?? ag.tipoAso).toLowerCase() : ""} — {ag?.colaborador.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Data do exame</Label><DatePicker value={data} onChange={setData} /></div>
          <div><Label>Resultado</Label><SelectMenu value={resultado} onChange={setResultado} options={[{ value: "APTO", label: "Apto" }, { value: "APTO_RESTRICOES", label: "Apto com restrições" }, { value: "INAPTO", label: "Inapto" }]} /></div>
          {resultado !== "APTO" && <div className="col-span-2"><Label>Restrições / observações do médico</Label><Textarea value={restricoes} onChange={(e) => setRestricoes(e.target.value)} rows={2} /></div>}
          <div><Label className="inline-flex items-center gap-1">Validade <InfoHint>Em branco: calculada pela periodicidade da função (como no lançamento de ASO da ficha).</InfoHint></Label><DatePicker value={validade} onChange={setValidade} /></div>
          <div><Label>Médico examinador</Label><MedicoSelect value={medicoId} onChange={(m) => setMedicoId(m?.id ?? "")} /></div>
          {complementares.length > 0 && (
            <div className="col-span-2"><Label>Exames realizados</Label>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {complementares.map((e) => (
                  <label key={e.exameTipoId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!feitos[e.exameTipoId]} onChange={(ev) => setFeitos((f) => ({ ...f, [e.exameTipoId]: ev.target.checked }))} />{nomeTipo(e.exameTipoId)}</label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Desmarque o que a clínica não fez — continua pendente para o próximo agendamento.</p>
            </div>
          )}
          {ag && <div className="col-span-2"><Label>ASO digitalizado (confidencial)</Label><UploadAnexo tipo="aso" titulo={`ASO ${TIPO_ASO[ag.tipoAso] ?? ag.tipoAso} — ${ag.colaborador.nome}`} colaboradorId={ag.colaborador.id} validade={validade || null} value={doc} onChange={setDoc} /></div>}
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Lançar ASO e concluir"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Clínicas: cadastro + tabela de preços ─────────────────────────────────────
function Clinicas({ clinicas, tipos, recarregar }: { clinicas: Clinica[]; tipos: TipoExame[]; recarregar: () => void }) {
  const [edit, setEdit] = useState<Clinica | "nova" | null>(null);
  return (
    <section className="bg-card rounded-xl border border-border">
      <div className="px-4 py-2.5 border-b border-border bg-muted flex items-center">
        <h2 className="font-semibold text-sm text-foreground mr-auto">Clínicas de medicina do trabalho</h2>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setEdit("nova")}><Plus className="w-4 h-4" /> Nova clínica</Button>
      </div>
      <ul className="divide-y divide-border/60">
        {clinicas.map((c) => (
          <li key={c.id} className={cn("px-4 py-3 flex items-start gap-3", !c.ativo && "opacity-50")}>
            <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium text-foreground">{c.nome}{!c.ativo && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}</p>
              <p className="text-xs text-muted-foreground">{[c.cnpj && `CNPJ ${c.cnpj}`, c.telefone, c.email, c.contato && `contato: ${c.contato}`].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
              {c.endereco && <p className="text-xs text-muted-foreground">{c.endereco}</p>}
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.precos.length ? `${c.precos.length} preço(s) próprio(s)` : "Usa os preços de referência dos exames"} · {c._count.agendamentos} agendamento(s)</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEdit(c)}><Pencil className="w-3.5 h-3.5" /> Editar</Button>
          </li>
        ))}
        {clinicas.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground italic">Nenhuma clínica cadastrada.</li>}
      </ul>
      <ClinicaDialog clinica={edit} tipos={tipos} onClose={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />
    </section>
  );
}

function ClinicaDialog({ clinica, tipos, onClose, onSalvo }: { clinica: Clinica | "nova" | null; tipos: TipoExame[]; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ nome: "", fornecedorId: "", cnpj: "", telefone: "", email: "", contato: "", endereco: "", observacoes: "", ativo: true });
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [fornecedores, setFornecedores] = useState<{ value: string; label: string }[]>([]);
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => {
    if (!clinica) return;
    const c = clinica === "nova" ? null : clinica;
    setF({ nome: c?.nome ?? "", fornecedorId: c?.fornecedorId ?? "", cnpj: c?.cnpj ?? "", telefone: c?.telefone ?? "", email: c?.email ?? "", contato: c?.contato ?? "", endereco: c?.endereco ?? "", observacoes: c?.observacoes ?? "", ativo: c?.ativo ?? true });
    setPrecos(Object.fromEntries((c?.precos ?? []).map((p) => [p.exameTipoId, String(Number(p.preco)).replace(".", ",")])));
    setErro("");
    fetch("/api/suprimentos/fornecedores?ativo=1").then((r) => r.json()).then((j) => {
      const lista: { id: string; razaoSocial: string; nomeFantasia: string | null }[] = Array.isArray(j) ? j : j.data ?? [];
      setFornecedores(lista.map((x) => ({ value: x.id, label: x.nomeFantasia ? `${x.nomeFantasia} — ${x.razaoSocial}` : x.razaoSocial })));
    }).catch(() => {});
  }, [clinica]);
  const c = clinica && clinica !== "nova" ? clinica : null;
  async function salvar() {
    if (!f.nome.trim()) { setErro("Informe o nome."); return; }
    setSalvando(true); setErro("");
    const body = { ...f, precos: Object.entries(precos).filter(([, v]) => v.trim()).map(([exameTipoId, preco]) => ({ exameTipoId, preco })) };
    const res = await fetch(c ? `/api/sst/clinicas/${c.id}` : "/api/sst/clinicas", { method: c ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({})); setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    onSalvo();
  }
  const campo = (k: keyof typeof f, rot: string, ph = "") => <div><Label>{rot}</Label><Input value={String(f[k] ?? "")} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} /></div>;
  return (
    <Dialog open={!!clinica} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{c ? `Clínica — ${c.nome}` : "Nova clínica"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{campo("nome", "Nome", "Saúde Integrada")}</div>
          <div className="col-span-2"><Label className="inline-flex items-center gap-1">Fornecedor <InfoHint>Liga a clínica ao fornecedor do ERP (para o Contas a Pagar das notas da clínica).</InfoHint></Label>
            <ComboboxWithCreate value={f.fornecedorId} onChange={(v) => setF((x) => ({ ...x, fornecedorId: v }))} options={fornecedores} placeholder="Buscar fornecedor…" noneLabel="Sem vínculo" menuMinWidth={360} /></div>
          {campo("cnpj", "CNPJ")}{campo("telefone", "Telefone / WhatsApp")}
          {campo("email", "E-mail")}{campo("contato", "Pessoa de contato")}
          <div className="col-span-2">{campo("endereco", "Endereço")}</div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={f.observacoes} onChange={(e) => setF((x) => ({ ...x, observacoes: e.target.value }))} rows={2} placeholder="Ex.: atende por ordem de chegada; levar documento com foto; jejum para exames de sangue" /></div>
          {c && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={(e) => setF((x) => ({ ...x, ativo: e.target.checked }))} /> Clínica ativa</label>}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground mt-2">Tabela de preços da clínica</p>
          <p className="text-[11px] text-muted-foreground mb-2">Em branco = usa o preço de referência do exame (mostrado em cinza).</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {tipos.filter((t) => t.ativo).map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-foreground truncate" title={t.nome}>{t.nome}{t.clinico && <span className="text-[10px] text-muted-foreground"> (consulta)</span>}</span>
                <Input inputMode="decimal" value={precos[t.id] ?? ""} onChange={(e) => setPrecos((p) => ({ ...p, [t.id]: e.target.value }))} placeholder={t.preco ? String(Number(t.preco)).replace(".", ",") : "0,00"} className="h-8 w-24 text-right text-sm" />
              </div>
            ))}
          </div>
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
