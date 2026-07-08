"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { cn, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Loader2, Plus, Trash2, Save, Printer, Lock, LockOpen, X, Users, Upload, FileCheck2, Rows3, List } from "lucide-react";

type ItemRow = { _key: string; colaboradorId: string; manha: string; tarde: string; horasExcedente: string; servico: string; valor: string };
type GrupoRow = { _key: string; tipo: string; setor: string; turno: string; itens: ItemRow[] };

const TURNOS = [{ v: "DIA", l: "Dia" }, { v: "NOITE", l: "Noite" }];
const key = () => Math.random().toString(36).slice(2);
// Escala padrão já preenchida (substituída pela escala vigente do colaborador
// quando ele é escolhido; o usuário ajusta quando diferir).
const DEF_MANHA = "08:00 - 12:00";
const DEF_TARDE = "13:00 - 17:00";
const novoItem = (): ItemRow => ({ _key: key(), colaboradorId: "", manha: DEF_MANHA, tarde: DEF_TARDE, horasExcedente: "", servico: "", valor: "" });
// O bloco é POR SETOR: quem está dentro dele estava nesse setor nessa diária.
// tipo segue no modelo (default DIVERSAS) mas não é mais editável na tela.
const novoGrupo = (): GrupoRow => ({ _key: key(), tipo: "DIVERSAS", setor: "", turno: "DIA", itens: [novoItem()] });
// pt-BR: vírgula decimal, ponto de milhar opcional; aceita ponto puro também.
const num = (v: string) => {
  const s = (v || "").trim();
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};

// Máscara progressiva do horário: digitar "10001400" vira "10:00 - 14:00".
const mascaraHora = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  if (d.length <= 6) return `${d.slice(0, 2)}:${d.slice(2, 4)} - ${d.slice(4)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)} - ${d.slice(4, 6)}:${d.slice(6)}`;
};

// Minutos de uma faixa "HH:MM - HH:MM" (vira o dia quando a final é menor).
const faixaMin = (s: string): number | null => {
  const m = (s || "").match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  const ini = +m[1] * 60 + +m[2], fim = +m[3] * 60 + +m[4];
  return (fim - ini + 1440) % 1440;
};
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Jornada padrão (8h) quando o colaborador não tem escala cadastrada.
const JORNADA_PADRAO_MIN = 8 * 60;

// Minutos do campo Duração: aceita "HH:MM" ou horas simples ("2", "7,5").
const duracaoMin = (s: string): number => {
  const t = (s || "").trim();
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/^(\d+(?:[.,]\d+)?)$/);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
  return 0;
};

export default function DiariaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useTabTitle("Folha de Diárias");

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState("");
  const [turnoFolha, setTurnoFolha] = useState<"DIA" | "NOITE">("DIA");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState("ABERTA");
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [colabs, setColabs] = useState<ComboboxOption[]>([]);
  const [setores, setSetores] = useState<ComboboxOption[]>([]);
  // Setor do cadastro de cada colaborador (p/ posicionar a pessoa no bloco certo
  // quando adicionada pela visualização em lista).
  const [setorPorColab, setSetorPorColab] = useState<Map<string, string>>(new Map());
  // Valor base da diária do cadastro (pré-preenche o valor ao escolher a pessoa).
  const [valorPorColab, setValorPorColab] = useState<Map<string, number>>(new Map());
  // Vigências da escala de trabalho por colaborador (ordenadas desc por data).
  type EscalaCli = { data: string; faixas: { horaInicial: string; horaFinal: string }[] };
  const [escalasPorColab, setEscalasPorColab] = useState<Map<string, EscalaCli[]>>(new Map());
  // Visualização: lista corrida (setor como coluna, padrão) ou agrupada por setor.
  const [agruparPorSetor, setAgruparPorSetor] = usePersistedState("diarias.folha.agruparPorSetor", false);
  // Folha assinada escaneada (upload após a coleta de assinaturas)
  const [arquivoAssinado, setArquivoAssinado] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [rf, rc, rs] = await Promise.all([
      fetch(`/api/rh/diaristas/${id}`),
      fetch("/api/empresa/colaboradores?ativo=true&comEscala=1"),
      fetch("/api/empresa/setores"),
    ]);
    if (rf.ok) {
      const { data: f } = await rf.json();
      setData(f.data?.slice(0, 10) ?? "");
      setTurnoFolha(f.turno === "NOITE" ? "NOITE" : "DIA");
      setObservacoes(f.observacoes ?? "");
      setStatus(f.status ?? "ABERTA");
      setCriadoPor(f.criadoPor ?? null);
      setArquivoAssinado(f.arquivoAssinadoNome ?? null);
      setGrupos(
        (f.grupos ?? []).map((g: { tipo: string; setor: string | null; turno: string; itens: { colaboradorId: string; servico: string | null; manha: string | null; tarde: string | null; horasExcedente: string | null; valor: string }[] }) => ({
          _key: key(), tipo: g.tipo, setor: g.setor ?? "", turno: g.turno,
          itens: (g.itens ?? []).map((it) => ({
            _key: key(), colaboradorId: it.colaboradorId,
            manha: it.manha ?? "", tarde: it.tarde ?? "", horasExcedente: it.horasExcedente ?? "",
            // valor em pt-BR nos campos de edição ("10.75" → "10,75")
            servico: it.servico ?? "", valor: String(it.valor ?? "").replace(".", ","),
          })),
        })),
      );
    }
    if (rc.ok) {
      const jc = await rc.json();
      const lista: {
        id: string; nome: string; cargo?: string | null; setor?: { nome: string } | null; valorHora?: string | number | null;
        escalas?: { data: string; horario: { faixas: { horaInicial: string; horaFinal: string }[] } }[];
      }[] = jc.data ?? jc ?? [];
      setColabs(lista.map((c) => ({ value: c.id, label: c.nome })));
      setSetorPorColab(new Map(lista.filter((c) => c.setor?.nome).map((c) => [c.id, c.setor!.nome])));
      setValorPorColab(new Map(lista.filter((c) => c.valorHora != null && Number(c.valorHora) > 0).map((c) => [c.id, Number(c.valorHora)])));
      setEscalasPorColab(new Map(lista.map((c) => [c.id, (c.escalas ?? []).map((e) => ({ data: e.data.slice(0, 10), faixas: e.horario?.faixas ?? [] }))])));
    }
    if (rs.ok) {
      const js = await rs.json();
      const lista: { id: string; nome: string; ativo: boolean }[] = Array.isArray(js) ? js : (js.data ?? []);
      // O valor do bloco é o NOME do setor (DiariaGrupo.setor é texto).
      setSetores(lista.filter((s) => s.ativo).map((s) => ({ value: s.nome, label: s.nome })));
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const bloqueado = status === "FECHADA";

  const totalPessoas = useMemo(() => grupos.reduce((s, g) => s + g.itens.filter((it) => it.colaboradorId).length, 0), [grupos]);

  // Opções de setor da coluna (cadastro + setores em texto livre de folhas antigas).
  const setorOptions = useMemo(() => {
    const extras = Array.from(new Set(grupos.map((g) => g.setor).filter((s) => s && !setores.some((o) => o.value === s))));
    return [...extras.map((s) => ({ value: s, label: s })), ...setores];
  }, [grupos, setores]);

  function upGrupo(gk: string, patch: Partial<GrupoRow>) { setGrupos((gs) => gs.map((g) => (g._key === gk ? { ...g, ...patch } : g))); }
  function upItem(gk: string, ik: string, patch: Partial<ItemRow>) {
    setGrupos((gs) => gs.map((g) => (g._key === gk ? { ...g, itens: g.itens.map((it) => (it._key === ik ? { ...it, ...patch } : it)) } : g)));
  }

  // Lista corrida: mover a pessoa p/ o bloco do setor escolhido (cria o bloco
  // se não existir; blocos que ficarem vazios somem).
  function moverItemParaSetor(gk: string, ik: string, setorNome: string) {
    setGrupos((gs) => {
      const origem = gs.find((g) => g._key === gk);
      const item = origem?.itens.find((it) => it._key === ik);
      if (!origem || !item || origem.setor === setorNome) return gs;
      let saida = gs.map((g) => (g._key === gk ? { ...g, itens: g.itens.filter((it) => it._key !== ik) } : g));
      const destino = saida.find((g) => g.setor === setorNome);
      if (destino) {
        saida = saida.map((g) => (g._key === destino._key ? { ...g, itens: [...g.itens, item] } : g));
      } else {
        saida = [...saida, { _key: key(), tipo: "DIVERSAS", setor: setorNome, turno: turnoFolha, itens: [item] }];
      }
      return saida.filter((g) => g.itens.length > 0);
    });
  }

  // Lista corrida: nova pessoa entra num bloco "sem setor" (define depois na coluna).
  function addItemLista() {
    setGrupos((gs) => {
      const semSetor = gs.find((g) => !g.setor);
      if (semSetor) return gs.map((g) => (g._key === semSetor._key ? { ...g, itens: [...g.itens, novoItem()] } : g));
      return [...gs, { _key: key(), tipo: "DIVERSAS", setor: "", turno: turnoFolha, itens: [novoItem()] }];
    });
  }

  // Escala vigente do colaborador na data da folha (faixa 1 = manhã, 2 = tarde).
  function escalaVigente(colaboradorId: string) {
    const escs = escalasPorColab.get(colaboradorId) ?? [];
    return escs.find((e) => !data || e.data <= data) ?? escs[0] ?? null;
  }

  function faixasVigentes(colaboradorId: string): { manha?: string; tarde?: string } {
    const vig = escalaVigente(colaboradorId);
    if (!vig || vig.faixas.length === 0) return {};
    const fmt = (f: { horaInicial: string; horaFinal: string }) => `${f.horaInicial} - ${f.horaFinal}`;
    return { manha: fmt(vig.faixas[0]), ...(vig.faixas[1] ? { tarde: fmt(vig.faixas[1]) } : {}) };
  }

  // Jornada base (minutos) da escala vigente; sem escala, 8h do padrão.
  function jornadaBaseMin(colaboradorId: string): number {
    const vig = escalaVigente(colaboradorId);
    if (!vig || vig.faixas.length === 0) return JORNADA_PADRAO_MIN;
    return vig.faixas.reduce((a, f) => a + (faixaMin(`${f.horaInicial} - ${f.horaFinal}`) ?? 0), 0);
  }

  // Diária final = valor hora × horas trabalhadas — proporcional p/ MAIS e p/
  // MENOS (saiu mais cedo, recebe menos). Sem horários preenchidos, vale a
  // Duração digitada à mão; sem nada, a jornada da escala.
  function calcTotalItem(it: ItemRow): number {
    const valorHora = num(it.valor);
    if (valorHora <= 0) return 0;
    const trabalhado = (faixaMin(it.manha) ?? 0) + (faixaMin(it.tarde) ?? 0);
    const horasMin = trabalhado > 0 ? trabalhado : (duracaoMin(it.horasExcedente) || jornadaBaseMin(it.colaboradorId));
    return Math.round(valorHora * (horasMin / 60) * 100) / 100;
  }

  const totalGeral = grupos.reduce((s, g) => s + g.itens.reduce((a, it) => a + (it.colaboradorId ? calcTotalItem(it) : 0), 0), 0);

  // Duração = horas trabalhadas (manhã + tarde), em HH:MM.
  function calcDuracao(manha: string, tarde: string): string {
    const trabalhado = (faixaMin(manha) ?? 0) + (faixaMin(tarde) ?? 0);
    return trabalhado > 0 ? fmtMin(trabalhado) : "";
  }

  // Patch de manhã/tarde com a duração recalculada a partir do par resultante.
  function patchHora(it: ItemRow, patch: Partial<ItemRow>): Partial<ItemRow> {
    const manha = patch.manha ?? it.manha;
    const tarde = patch.tarde ?? it.tarde;
    return { ...patch, horasExcedente: calcDuracao(manha, tarde) };
  }

  // Ao escolher o colaborador: preenche o valor com a diária base do cadastro e
  // os horários com a escala vigente (só onde a linha ainda está no padrão/vazia).
  function patchColab(it: ItemRow, colaboradorId: string): Partial<ItemRow> {
    // Valor hora vem direto do cadastro do colaborador (editável na linha).
    const valorHora = valorPorColab.get(colaboradorId) ?? null;
    const esc = faixasVigentes(colaboradorId);
    const manhaPadrao = !it.manha || it.manha === DEF_MANHA;
    const tardePadrao = !it.tarde || it.tarde === DEF_TARDE;
    const manha = esc.manha && manhaPadrao ? esc.manha : it.manha;
    const tarde = esc.manha && tardePadrao ? (esc.tarde ?? "") : it.tarde;
    return {
      colaboradorId,
      ...(!num(it.valor) && valorHora ? { valor: String(valorHora).replace(".", ",") } : {}),
      manha, tarde,
      horasExcedente: calcDuracao(manha, tarde),
    };
  }

  // Lista corrida: ao escolher o colaborador, se a linha ainda não tem setor,
  // move p/ o setor do cadastro dele (mesma regra da criação pelo popup).
  function aoEscolherColabLista(gk: string, it: ItemRow, colaboradorId: string, setorAtual: string) {
    upItem(gk, it._key, patchColab(it, colaboradorId));
    if (!setorAtual) {
      const s = setorPorColab.get(colaboradorId);
      if (s) moverItemParaSetor(gk, it._key, s);
    }
  }

  // Upload do escaneado assinado pelos diaristas (substitui o anterior).
  async function enviarAssinada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoArquivo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/rh/diaristas/${id}/arquivo`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Falha ao enviar o arquivo"); return; }
      setArquivoAssinado(file.name);
    } finally {
      setEnviandoArquivo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar(novoStatus?: string) {
    setSalvando(true);
    const body = {
      data, turno: turnoFolha, observacoes, status: novoStatus ?? status,
      grupos: grupos.map((g) => ({
        tipo: g.tipo, setor: g.setor, turno: g.turno,
        itens: g.itens.filter((it) => it.colaboradorId).map((it) => ({
          colaboradorId: it.colaboradorId, servico: it.servico, valor: num(it.valor),
          valorTotal: calcTotalItem(it),
          manha: it.manha, tarde: it.tarde, horasExcedente: it.horasExcedente,
        })),
      })),
    };
    const res = await fetch(`/api/rh/diaristas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSalvando(false);
    if (res.ok && novoStatus) setStatus(novoStatus);
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader
        title="Folha de Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Diárias", href: "/rh/diaristas" }, { label: data ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR") : "Folha" }]}
        actions={
          <div className="flex items-center gap-2">
            <span className={cn("text-[11px] font-medium px-2 py-1 rounded-full", bloqueado ? "bg-success/15 text-success" : "bg-info/15 text-info")}>{bloqueado ? "Fechada" : "Aberta"}</span>
            <Button variant="outline" onClick={() => router.push(`/rh/diaristas/${id}/imprimir`)} className="gap-2"><Printer className="h-4 w-4" /> Baixar PDF</Button>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={enviarAssinada} />
            {arquivoAssinado && (
              <a href={`/api/rh/diaristas/${id}/arquivo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-success hover:underline" title={arquivoAssinado}>
                <FileCheck2 className="h-4 w-4" /> Assinada
              </a>
            )}
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={enviandoArquivo} className="gap-2" title="Subir a folha escaneada com as assinaturas dos diaristas">
              {enviandoArquivo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {arquivoAssinado ? "Substituir assinada" : "Enviar assinada"}
            </Button>
            {!bloqueado ? (
              <>
                <Button variant="outline" onClick={() => salvar()} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                <Button onClick={() => salvar("FECHADA")} disabled={salvando} className="gap-2"><Lock className="h-4 w-4" /> Fechar folha</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => salvar("ABERTA")} disabled={salvando} className="gap-2"><LockOpen className="h-4 w-4" /> Reabrir</Button>
            )}
          </div>
        }
      />

      <div className="px-8 pb-10 space-y-5">
        {/* Alternância de visualização — logo abaixo dos botões do header */}
        <div className="flex justify-end -mt-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setAgruparPorSetor(false)}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium", !agruparPorSetor ? "bg-info/15 text-info" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              <List className="h-3.5 w-3.5" /> Lista corrida
            </button>
            <button
              onClick={() => setAgruparPorSetor(true)}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-border", agruparPorSetor ? "bg-info/15 text-info" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              <Rows3 className="h-3.5 w-3.5" /> Por setor
            </button>
          </div>
        </div>

        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
            <DatePicker value={data} disabled={bloqueado} onChange={(v) => setData(v)} className="w-48" triggerClassName="h-10" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Turno</label>
            <select
              value={turnoFolha}
              disabled={bloqueado}
              onChange={(e) => setTurnoFolha(e.target.value as "DIA" | "NOITE")}
              className="h-10 w-32 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-60"
            >
              <option value="DIA">Dia</option>
              <option value="NOITE">Noite</option>
            </select>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Total geral · {totalPessoas} pessoa{totalPessoas !== 1 ? "s" : ""}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatBRL(totalGeral)}</p>
          </div>
        </div>

        {/* Lista corrida: todas as pessoas numa tabela só, setor como coluna. */}
        {!agruparPorSetor && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              <div className="grid grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_7.5rem_5rem_minmax(0,1fr)_5.5rem_6.5rem_2rem] gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                <span>#</span><span>Nome</span><span>Setor</span><span>Manhã</span><span>Tarde</span><span>Duração</span><span>Serviço</span><span className="text-right">Valor hora</span><span className="text-right">Diária</span><span />
              </div>
              {grupos.flatMap((g) => g.itens.map((it) => ({ g, it }))).map(({ g, it }, i) => (
                <div key={it._key} className="grid grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_7.5rem_5rem_minmax(0,1fr)_5.5rem_6.5rem_2rem] gap-2 px-4 py-2 items-center">
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0"><ComboboxWithCreate value={it.colaboradorId} onChange={(v) => aoEscolherColabLista(g._key, it, v, g.setor)} options={colabs} allowNone={false} disabled={bloqueado} placeholder="Colaborador..." menuMinWidth={320} triggerClassName="h-9 rounded-lg" /></div>
                  <div className="min-w-0"><ComboboxWithCreate value={g.setor} onChange={(v) => moverItemParaSetor(g._key, it._key, v)} options={setorOptions} disabled={bloqueado} placeholder="Setor..." noneLabel="— sem setor —" menuMinWidth={260} triggerClassName={cn("h-9 rounded-lg", !g.setor && "border-warning/50")} /></div>
                  <Input value={it.manha} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, patchHora(it, { manha: mascaraHora(e.target.value) }))} placeholder="08:00 - 12:00" className="h-9 border-border text-center min-w-0" />
                  <Input value={it.tarde} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, patchHora(it, { tarde: mascaraHora(e.target.value) }))} placeholder="13:00 - 17:00" className="h-9 border-border text-center min-w-0" />
                  <Input value={it.horasExcedente} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { horasExcedente: e.target.value })} placeholder="08:00" className="h-9 border-border text-center min-w-0" />
                  <Input value={it.servico} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { servico: e.target.value })} placeholder="Serviço (ex.: MOTORISTA 120/8*8)" className="h-9 border-border min-w-0" />
                  <Input value={it.valor} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { valor: e.target.value })} inputMode="decimal" placeholder="0,00" className="h-9 text-right tabular-nums border-border min-w-0" />
                  <span className="text-sm font-semibold tabular-nums text-right" title="Valor hora × horas trabalhadas">{formatBRL(calcTotalItem(it))}</span>
                  {!bloqueado && <button onClick={() => setGrupos((gs) => gs.map((x) => (x._key === g._key ? { ...x, itens: x.itens.filter((y) => y._key !== it._key) } : x)).filter((x) => x.itens.length > 0))} className="text-muted-foreground hover:text-danger flex justify-center"><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              {grupos.every((g) => g.itens.length === 0) && grupos.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma pessoa lançada.</div>
              )}
            </div>
            {!bloqueado && (
              <div className="px-4 py-2 border-t border-border">
                <button onClick={addItemLista} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="h-3.5 w-3.5" /> Adicionar pessoa</button>
              </div>
            )}
          </div>
        )}

        {/* Agrupado por setor: um bloco por setor. */}
        {agruparPorSetor && grupos.map((g) => {
          const subtotal = g.itens.reduce((a, it) => a + (it.colaboradorId ? calcTotalItem(it) : 0), 0);
          return (
            <div key={g._key} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted border-b border-border">
                <div className="flex-1 min-w-[220px]">
                  <ComboboxWithCreate
                    value={g.setor}
                    onChange={(v) => upGrupo(g._key, { setor: v })}
                    // Folhas antigas têm setor em texto livre — mantém o valor visível.
                    options={g.setor && !setores.some((s) => s.value === g.setor) ? [{ value: g.setor, label: g.setor }, ...setores] : setores}
                    disabled={bloqueado}
                    placeholder="Setor do bloco..."
                    noneLabel="— selecionar setor —"
                    menuMinWidth={280}
                    triggerClassName="h-9 rounded-lg font-medium"
                  />
                </div>
                <select value={g.turno} disabled={bloqueado} onChange={(e) => upGrupo(g._key, { turno: e.target.value })} className="h-9 rounded-lg border border-border bg-card px-2 text-sm">
                  {TURNOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{formatBRL(subtotal)}</span>
                {!bloqueado && <button onClick={() => setGrupos((gs) => gs.filter((x) => x._key !== g._key))} className="text-muted-foreground hover:text-danger" title="Remover bloco"><X className="h-4 w-4" /></button>}
              </div>

              {/* Mesmas colunas da planilha impressa (menos Assinatura). */}
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[2rem_minmax(0,1.5fr)_7.5rem_7.5rem_5rem_minmax(0,1.2fr)_5.5rem_6.5rem_2rem] gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>#</span><span>Nome</span><span>Manhã</span><span>Tarde</span><span>Duração</span><span>Serviço</span><span className="text-right">Valor hora</span><span className="text-right">Diária</span><span />
                </div>
                {g.itens.map((it, i) => (
                  <div key={it._key} className="grid grid-cols-[2rem_minmax(0,1.5fr)_7.5rem_7.5rem_5rem_minmax(0,1.2fr)_5.5rem_6.5rem_2rem] gap-2 px-4 py-2 items-center">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0"><ComboboxWithCreate value={it.colaboradorId} onChange={(v) => upItem(g._key, it._key, patchColab(it, v))} options={colabs} allowNone={false} disabled={bloqueado} placeholder="Colaborador..." menuMinWidth={320} triggerClassName="h-9 rounded-lg" /></div>
                    <Input value={it.manha} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, patchHora(it, { manha: mascaraHora(e.target.value) }))} placeholder="08:00 - 12:00" className="h-9 border-border text-center min-w-0" />
                    <Input value={it.tarde} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, patchHora(it, { tarde: mascaraHora(e.target.value) }))} placeholder="13:00 - 17:00" className="h-9 border-border text-center min-w-0" />
                    <Input value={it.horasExcedente} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { horasExcedente: e.target.value })} placeholder="08:00" className="h-9 border-border text-center min-w-0" />
                    <Input value={it.servico} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { servico: e.target.value })} placeholder="Serviço (ex.: MOTORISTA 120/8*8)" className="h-9 border-border min-w-0" />
                    <Input value={it.valor} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { valor: e.target.value })} inputMode="decimal" placeholder="0,00" className="h-9 text-right tabular-nums border-border min-w-0" />
                    <span className="text-sm font-semibold tabular-nums text-right" title="Valor hora × horas trabalhadas">{formatBRL(calcTotalItem(it))}</span>
                    {!bloqueado && <button onClick={() => setGrupos((gs) => gs.map((x) => (x._key === g._key ? { ...x, itens: x.itens.length > 1 ? x.itens.filter((y) => y._key !== it._key) : x.itens } : x)))} className="text-muted-foreground hover:text-danger flex justify-center"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
              {!bloqueado && (
                <div className="px-4 py-2 border-t border-border">
                  <button onClick={() => upGrupo(g._key, { itens: [...g.itens, novoItem()] })} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="h-3.5 w-3.5" /> Adicionar pessoa</button>
                </div>
              )}
            </div>
          );
        })}

        {agruparPorSetor && !bloqueado && (
          <Button variant="outline" onClick={() => setGrupos((gs) => [...gs, novoGrupo()])} className="gap-2 border-dashed"><Plus className="h-4 w-4" /> Adicionar bloco</Button>
        )}
        {agruparPorSetor && grupos.length === 0 && (
          <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />Nenhum bloco. Clique em &quot;Adicionar bloco&quot; para começar.
          </div>
        )}

        <Autoria criadoPor={criadoPor} />
      </div>
    </div>
  );
}
