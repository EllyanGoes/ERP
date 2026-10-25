"use client";

// Edição do plano: bloco compacto "Dados do plano" (expande para editar) e abas
// no padrão da OS — Ativos e gatilho · Checklist · Kit de materiais · Histórico
// de OS. A aplicação a cada ativo (repetição de calendário / medidor / o que
// vencer primeiro) é editada no PlanoAplicacaoDialog. Cada atividade do
// checklist pode ter seus itens (produto + qtd); a aba Kit mostra o total.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, CalendarClock, ChevronDown, ChevronUp, Loader2, Package, Plus, Trash2, X, Zap } from "lucide-react";
import { StatusOSBadge, api, fmtData, useManutLookups } from "@/components/manutencao/comum";
import PlanoAplicacaoDialog, { descreverGeracao, type AplicacaoEdicao, type Geracao } from "@/components/manutencao/PlanoAplicacaoDialog";
import { descreverGatilho, fmtDia, fmtNum, type Previsao } from "@/lib/manutencao/gatilho";

type Medidor = { id: string; nome: string; unidade: string; acumulado: string; ritmoDia?: number | null };
type Aplicacao = AplicacaoEdicao & {
  ativo: boolean;
  ativoRef: { id: string; tag: string; nome: string; medidores: Medidor[] }; medidor: Medidor | null;
  previsao: Previsao; osAberta: { id: string; numero: string; status: string } | null;
};
type Plano = {
  id: string; codigo: string; nome: string; tipoId: string; equipeId: string | null; horasEstimadas: string | null; exigeParada: boolean;
  antecedenciaDias: number; toleranciaPct: number; observacoes: string | null; ativo: boolean;
  tipo: { sigla: string; nome: string }; equipe: { id: string; nome: string } | null;
  tarefas: { id: string; descricao: string; tipoResposta: string; faixaMin: string | null; faixaMax: string | null; servicoId: string | null; ativoId: string | null }[];
  // tarefaId: item que pertence a uma atividade do checklist (null = kit geral)
  materiais: { itemId: string; quantidade: string; tarefaId: string | null; item: { codigo: string; descricao: string } }[];
  ativos: Aplicacao[];
  ordens: { id: string; numero: string; status: string; createdAt: string; programadaPara: string | null; concluidaEm: string | null; ativo: { tag: string } | null }[];
};
type Mat = { itemId: string; quantidade: string; rotulo: string };
type Tarefa = { descricao: string; tipoResposta: string; faixaMin: string; faixaMax: string; servicoId: string; ativoId: string; materiais: Mat[] };

const RESPOSTAS = [{ value: "OK_NOK", label: "OK / NOK" }, { value: "NUMERO", label: "Medição (número)" }, { value: "TEXTO", label: "Texto" }, { value: "NENHUMA", label: "Título / sem resposta" }];
const ABAS = ["ativos", "checklist", "kit", "historico"] as const;
type Aba = (typeof ABAS)[number];

export default function PlanoEdicaoPage() {
  const { id } = useParams<{ id: string }>();
  const lk = useManutLookups();
  const [p, setP] = useState<Plano | null>(null);
  useTabTitle(p ? `Plano ${p.codigo}` : "Plano");
  const [cab, setCab] = useState<Record<string, string | boolean>>({});
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [itens, setItens] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(""); const [saving, setSaving] = useState(false);
  const [abaSalva, setAba] = usePersistedState<Aba>("pcm:plano:aba", "ativos");
  const aba: Aba = ABAS.includes(abaSalva) ? abaSalva : "ativos";
  const [dadosAbertos, setDadosAbertos] = useState(false);
  const dadosRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const j = await fetch(`/api/pcm/planos-cadastro/${id}`).then((r) => r.json()).catch(() => ({}));
    const d: Plano | undefined = j.data;
    if (!d) { setMsg(j.error || "Plano não encontrado."); return; }
    setP(d);
    setCab({ codigo: d.codigo, nome: d.nome, tipoId: d.tipoId, equipeId: d.equipeId ?? "", horasEstimadas: d.horasEstimadas ?? "", exigeParada: d.exigeParada,
      antecedenciaDias: String(d.antecedenciaDias), toleranciaPct: String(d.toleranciaPct), observacoes: d.observacoes ?? "", ativo: d.ativo });
    const mat = (m: Plano["materiais"][number]): Mat => ({ itemId: m.itemId, quantidade: String(Number(m.quantidade)), rotulo: `${m.item.codigo} — ${m.item.descricao}` });
    setTarefas(d.tarefas.map((t) => ({ descricao: t.descricao, tipoResposta: t.tipoResposta, faixaMin: t.faixaMin ?? "", faixaMax: t.faixaMax ?? "", servicoId: t.servicoId ?? "", ativoId: t.ativoId ?? "",
      materiais: d.materiais.filter((m) => m.tarefaId === t.id).map(mat) })));
    setMats(d.materiais.filter((m) => !m.tarefaId).map(mat));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/itens?limit=3000").then((r) => r.json()).then((j) => setItens(j.data ?? [])).catch(() => {}); }, []);

  async function salvar() {
    setSaving(true); setMsg(""); setOk("");
    const r = await api(`/api/pcm/planos-cadastro/${id}`, "PATCH", { ...cab, tarefas, materiais: mats });
    setSaving(false);
    if (!r.ok) { setMsg(r.error!); return; }
    setOk("Plano salvo."); load();
  }
  const mover = (i: number, d: number) => { const t = [...tarefas]; const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; setTarefas(t); };

  // ── aplicação a ativos ──────────────────────────────────────────────────────
  const [dialogApl, setDialogApl] = useState<{ open: boolean; aplicacao: Aplicacao | null }>({ open: false, aplicacao: null });
  const [gerando, setGerando] = useState<string | null>(null);
  const abrirApl = (a?: Aplicacao) => setDialogApl({ open: true, aplicacao: a ?? null });
  async function alternarApl(a: Aplicacao) { await api(`/api/pcm/planos-cadastro/${id}/ativos`, "PATCH", { paId: a.id, ativo: !a.ativo }); load(); }
  async function removerApl(a: Aplicacao) {
    if (!confirm(`Remover a aplicação do plano em ${a.ativoRef.tag}? O histórico de OS continua.`)) return;
    await api(`/api/pcm/planos-cadastro/${id}/ativos?paId=${a.id}`, "DELETE"); load();
  }
  async function gerarAgora(a: Aplicacao) {
    setGerando(a.id); setMsg(""); setOk("");
    const r = await api<{ geracao?: Geracao }>(`/api/pcm/planos-cadastro/${id}/ativos`, "PATCH", { paId: a.id, gerarAgora: true });
    setGerando(null);
    if (!r.ok) { setMsg(r.error!); return; }
    const aviso = descreverGeracao(r.data?.geracao);
    if (r.data?.geracao?.gerada) setOk(aviso ?? ""); else setMsg(aviso ?? "");
    load();
  }
  function irParaDadosDoPlano() {
    setDialogApl({ open: false, aplicacao: null });
    setDadosAbertos(true);
    setTimeout(() => dadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // Regras do plano como estão no FORMULÁRIO (o dialog mostra o que vai valer, mesmo antes de salvar).
  const regras = useMemo(() => ({
    antecedenciaDias: Math.max(0, Math.round(Number(cab.antecedenciaDias)) || 0),
    toleranciaPct: Math.max(0, Math.round(Number(cab.toleranciaPct)) || 0),
  }), [cab.antecedenciaDias, cab.toleranciaPct]);

  // Itens do kit: os de cada atividade + os gerais; um produto só entra uma vez no plano.
  const itensUsados = useMemo(() => new Set([...tarefas.flatMap((t) => t.materiais.map((m) => m.itemId)), ...mats.map((m) => m.itemId)]), [tarefas, mats]);
  const totalKit = itensUsados.size;
  const opcoesItens = useMemo(() => itens.map((x) => ({ value: x.id, label: `${x.codigo} — ${x.descricao}` })), [itens]);
  const addItem = (lista: Mat[], v: string): Mat[] | null => {
    const it = itens.find((x) => x.id === v);
    if (!it || itensUsados.has(v)) return null;
    return [...lista, { itemId: v, quantidade: "1", rotulo: `${it.codigo} — ${it.descricao}` }];
  };
  const setTarefa = (i: number, patch: Partial<Tarefa>) => setTarefas((cur) => cur.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  if (!p) return msg ? <div className="p-8 text-sm text-danger">{msg}</div> : <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const atrasadas = p.ativos.filter((a) => a.ativo && a.previsao.atrasada).length;
  const abas: { id: Aba; label: string; n: string | number | null; alerta: boolean }[] = [
    { id: "ativos", label: "Ativos e gatilho", n: p.ativos.length, alerta: p.ativos.length === 0 || atrasadas > 0 },
    { id: "checklist", label: "Checklist", n: tarefas.length, alerta: false },
    { id: "kit", label: "Kit de materiais", n: totalKit, alerta: false },
    { id: "historico", label: "Histórico de OS", n: p.ordens.length || null, alerta: false },
  ];
  const equipeNome = lk.equipes.find((e) => e.id === String(cab.equipeId ?? ""))?.nome ?? p.equipe?.nome;
  const tipoSel = lk.tipos.find((t) => t.id === String(cab.tipoId ?? ""));
  const resumoDados = [
    tipoSel ? `${tipoSel.sigla} — ${tipoSel.nome}` : `${p.tipo.sigla} — ${p.tipo.nome}`,
    equipeNome ? `equipe ${equipeNome}` : "sem equipe",
    cab.horasEstimadas ? `${fmtNum(String(cab.horasEstimadas), 1)} h estimadas` : null,
    `OS ${regras.antecedenciaDias} dias antes`, `tolerância ${regras.toleranciaPct}%`,
    cab.exigeParada ? "exige parada" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader title={`${p.codigo} — ${p.nome}`} subtitle={p.ativo ? "Plano ativo" : "Plano inativo (não gera OS)"} breadcrumbs={[{ label: "Manutenção" }, { label: "Planos", href: "/pcm/planos/cadastro" }, { label: p.codigo }]}
        action={<Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar plano"}</Button>} />
      <div className="px-8 pb-10 space-y-4">
        {msg && <p className="text-sm text-danger">{msg}</p>}
        {ok && <p className="text-sm text-success">{ok}</p>}

        {/* Dados do plano — compacto; expande para editar */}
        <div ref={dadosRef} className="bg-card border border-border rounded-xl">
          <button type="button" onClick={() => setDadosAbertos((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">Dados do plano {!cab.ativo && <span className="text-[11px] font-normal text-danger border border-danger/30 rounded-full px-2">inativo</span>}</div>
              {!dadosAbertos && <p className="text-xs text-muted-foreground truncate">{resumoDados}</p>}
            </div>
            <span className="text-xs text-info inline-flex items-center gap-1">{dadosAbertos ? <>recolher <ChevronUp className="w-3.5 h-3.5" /></> : <>editar <ChevronDown className="w-3.5 h-3.5" /></>}</span>
          </button>
          {dadosAbertos && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-t border-border/60 pt-3">
              <div><Label>Código</Label><Input value={String(cab.codigo ?? "")} onChange={(e) => setCab({ ...cab, codigo: e.target.value })} /></div>
              <div className="md:col-span-3"><Label>Nome</Label><Input value={String(cab.nome ?? "")} onChange={(e) => setCab({ ...cab, nome: e.target.value })} /></div>
              <div><Label>Tipo</Label><SelectMenu value={String(cab.tipoId ?? "")} onChange={(v) => setCab({ ...cab, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
              <div><Label>Equipe</Label><SelectMenu value={String(cab.equipeId ?? "")} onChange={(v) => setCab({ ...cab, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
              <div><Label>Horas estimadas</Label><Input inputMode="decimal" value={String(cab.horasEstimadas ?? "")} onChange={(e) => setCab({ ...cab, horasEstimadas: e.target.value })} /></div>
              <div><Label>Gerar OS com antecedência (dias)</Label><Input inputMode="numeric" value={String(cab.antecedenciaDias ?? "")} onChange={(e) => setCab({ ...cab, antecedenciaDias: e.target.value })} /></div>
              <div><Label>Tolerância p/ aderência (%)</Label><Input inputMode="numeric" value={String(cab.toleranciaPct ?? "")} onChange={(e) => setCab({ ...cab, toleranciaPct: e.target.value })} /></div>
              <p className="md:col-span-2 text-[11px] text-muted-foreground pt-5">Quando a próxima execução é agendada (sempre / só após concluir) e o prazo da OS ficam na aplicação de cada ativo.</p>
              <label className="flex items-center gap-2 text-sm pt-5"><input type="checkbox" className="rounded" checked={!!cab.exigeParada} onChange={(e) => setCab({ ...cab, exigeParada: e.target.checked })} /> Exige parar o ativo</label>
              <label className="flex items-center gap-2 text-sm pt-5"><input type="checkbox" className="rounded" checked={!!cab.ativo} onChange={(e) => setCab({ ...cab, ativo: e.target.checked })} /> Plano ativo</label>
              <div className="md:col-span-4"><Label>Observações</Label><Textarea rows={2} value={String(cab.observacoes ?? "")} onChange={(e) => setCab({ ...cab, observacoes: e.target.value })} /></div>
              <p className="md:col-span-4 text-[11px] text-muted-foreground">As mudanças aqui, no checklist e no kit entram com “Salvar plano”. A aplicação aos ativos salva na hora, pelo próprio dialog.</p>
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={cn("text-sm px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-1.5", aba === a.id ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {a.label}
              {a.n != null && <span className={cn("text-[11px] rounded-full px-1.5 tabular-nums", a.alerta ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{a.n}</span>}
            </button>
          ))}
        </div>

        {/* Ativos e gatilho */}
        {aba === "ativos" && (
          <div className="bg-card border border-border rounded-xl p-4">
            {p.ativos.length === 0 ? (
              <EmptyState icon={<CalendarClock className="w-10 h-10" />} title="Nenhum ativo aplicado" description="O plano só gera OS depois de aplicado a um ativo, com o gatilho (calendário, medidor ou os dois)."
                action={<Button className="gap-1" onClick={() => abrirApl()}><Plus className="w-4 h-4" /> Aplicar a um ativo</Button>} className="py-10" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Ativos e gatilho {atrasadas > 0 && <span className="ml-2 text-[11px] font-normal text-danger">{atrasadas} atrasada(s)</span>}</h3>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirApl()}><Plus className="w-3.5 h-3.5" /> Aplicar a um ativo</Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Ativo</th><th className="text-left py-1">Gatilho</th><th className="text-left py-1">Última</th><th className="text-left py-1">Próxima</th><th /></tr></thead>
                  <tbody>{p.ativos.map((a) => {
                    const pv = a.previsao;
                    return (
                      <tr key={a.id} className={cn("border-t border-border/60 align-top", !a.ativo && "opacity-50")}>
                        <td className="py-1.5"><div>{a.ativoRef.tag} — {a.ativoRef.nome}</div>{!a.ativo && <div className="text-[11px] text-muted-foreground">{pv.encerrada ? "plano encerrado" : "aplicação pausada"}</div>}{a.responsavelIds?.length > 0 && <div className="text-[11px] text-muted-foreground">{a.responsavelIds.length} responsável(is)</div>}</td>
                        <td className="py-1.5 text-xs">
                          <div>{descreverGatilho(a)}</div>
                          {a.medidor && <div className="text-muted-foreground">{a.medidor.nome} · atual {fmtNum(a.medidor.acumulado, 2)} {a.medidor.unidade}{a.medidor.ritmoDia ? ` · ~${fmtNum(a.medidor.ritmoDia, 1)} ${a.medidor.unidade}/dia` : ""}</div>}
                        </td>
                        <td className="py-1.5 text-xs">{fmtDia(a.ultimaExecucao)}{a.ultimaMedida ? ` · ${fmtNum(a.ultimaMedida, 2)} ${a.medidor?.unidade ?? ""}` : ""}</td>
                        <td className="py-1.5 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn(pv.atrasada && a.ativo && "text-danger font-medium")}>{pv.resumo}</span>
                            {a.ativo && pv.atrasada && <span className="text-[11px] px-1.5 rounded-full border border-danger/30 bg-danger/10 text-danger">atrasada</span>}
                            {a.ativo && pv.vencida && !pv.atrasada && <span className="text-[11px] px-1.5 rounded-full border border-warning/30 bg-warning/10 text-warning">na janela</span>}
                            {pv.encerrada && <span className="text-[11px] px-1.5 rounded-full border border-border bg-muted text-muted-foreground">encerrada</span>}
                          </div>
                          {a.osAberta && <div className="mt-0.5 inline-flex items-center gap-1.5 text-muted-foreground"><Link href={`/pcm/os/${a.osAberta.id}`} className="text-info hover:underline">{a.osAberta.numero}</Link> <StatusOSBadge s={a.osAberta.status} /></div>}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap text-xs">
                          {a.ativo && pv.vencida && !a.osAberta && (
                            <button className="inline-flex items-center gap-1 text-warning hover:underline disabled:opacity-50" disabled={gerando === a.id} onClick={() => gerarAgora(a)} title="Gerar a OS desta aplicação agora">
                              {gerando === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} gerar agora
                            </button>
                          )}
                          <button className="ml-3 text-info hover:underline" onClick={() => abrirApl(a)}>editar</button>
                          {!pv.encerrada && <button className="ml-3 text-muted-foreground hover:underline" onClick={() => alternarApl(a)}>{a.ativo ? "pausar" : "reativar"}</button>}
                          <button className="ml-3 text-muted-foreground hover:text-danger" onClick={() => removerApl(a)} title="Remover aplicação"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                <p className="text-[11px] text-muted-foreground mt-2">A OS nasce {regras.antecedenciaDias} dias antes do vencimento (calendário) ou quando faltar a margem para o marco (medidor); o gerador roda todo dia e nunca empilha: com OS aberta, a aplicação só aparece como atrasada.</p>
              </>
            )}
          </div>
        )}

        {/* Checklist */}
        {aba === "checklist" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Checklist ({tarefas.length})</h3><Button size="sm" variant="outline" className="gap-1" onClick={() => setTarefas([...tarefas, { descricao: "", tipoResposta: "OK_NOK", faixaMin: "", faixaMax: "", servicoId: "", ativoId: "", materiais: [] }])}><Plus className="w-3.5 h-3.5" /> Item</Button></div>
            <div className="space-y-1.5">
              {tarefas.map((t, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}</span>
                  <Input className={cn("flex-1 min-w-[16rem] h-8 text-sm", t.tipoResposta === "NENHUMA" && "font-semibold")} value={t.descricao} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, descricao: e.target.value }; setTarefas(n); }} placeholder="Verificar / trocar / medir…" />
                  <SelectMenu value={t.tipoResposta} onChange={(v) => { const n = [...tarefas]; n[i] = { ...t, tipoResposta: v }; setTarefas(n); }} options={RESPOSTAS} triggerClassName="h-8 text-xs w-40" />
                  {t.tipoResposta === "NUMERO" && <>
                    <Input className="h-8 w-20 text-xs" placeholder="mín" value={t.faixaMin} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, faixaMin: e.target.value }; setTarefas(n); }} />
                    <Input className="h-8 w-20 text-xs" placeholder="máx" value={t.faixaMax} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, faixaMax: e.target.value }; setTarefas(n); }} />
                  </>}
                  <button onClick={() => mover(i, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => mover(i, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setTarefas(tarefas.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                  {/* Itens da atividade: produto + quantidade (vão para a OS ligados a esta linha) */}
                  <div className="basis-full pl-8 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Package className="w-3 h-3" /> Itens{t.materiais.length ? ` (${t.materiais.length})` : ""}</span>
                      {t.materiais.map((m, k) => (
                        <span key={m.itemId} className="inline-flex items-center gap-1 text-xs rounded-md border border-border bg-muted/30 pl-2 pr-1 py-0.5">
                          <span className="max-w-[18rem] truncate" title={m.rotulo}>{m.rotulo}</span>
                          <Input className="h-6 w-14 text-[11px] px-1" inputMode="decimal" value={m.quantidade} onChange={(e) => setTarefa(i, { materiais: t.materiais.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)) })} />
                          <button onClick={() => setTarefa(i, { materiais: t.materiais.filter((_, j) => j !== k) })} className="text-muted-foreground hover:text-danger"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      <ComboboxWithCreate value="" onChange={(v) => { const n = addItem(t.materiais, v); if (n) setTarefa(i, { materiais: n }); }} options={opcoesItens} disabledValues={Array.from(itensUsados)} placeholder="+ item" triggerClassName="h-6 text-[11px] w-40" menuMinWidth={380} />
                    </div>
                  </div>
                </div>
              ))}
              {tarefas.length === 0 && <p className="text-xs text-muted-foreground">Sem checklist — a OS gerada vem só com a descrição do plano.</p>}
              <p className="text-[11px] text-muted-foreground pt-1">O checklist vira as linhas da OS gerada. Entra com “Salvar plano”.</p>
            </div>
          </div>
        )}

        {/* Kit */}
        {aba === "kit" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Kit de materiais previstos ({totalKit})</h3></div>
            <div className="space-y-1.5">
              {tarefas.some((t) => t.materiais.length > 0) && (
                <div className="rounded-md border border-border/60 bg-muted/20 p-2 mb-2 space-y-1">
                  <p className="text-[11px] text-muted-foreground">Itens das atividades do checklist (edite na aba Checklist):</p>
                  {tarefas.flatMap((t, i) => t.materiais.map((m) => (
                    <div key={m.itemId} className="flex items-center gap-2 text-sm"><span className="flex-1">{m.rotulo}</span><span className="text-xs text-muted-foreground">{m.quantidade} · atividade {i + 1}{t.descricao ? ` — ${t.descricao.slice(0, 40)}` : ""}</span></div>
                  )))}
                </div>
              )}
              {mats.length > 0 && tarefas.some((t) => t.materiais.length > 0) && <p className="text-[11px] text-muted-foreground">Kit geral (sem atividade):</p>}
              {mats.map((m, i) => (
                <div key={m.itemId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{m.rotulo}</span>
                  <Input className="h-8 w-24 text-xs" inputMode="decimal" value={m.quantidade} onChange={(e) => { const n = [...mats]; n[i] = { ...m, quantidade: e.target.value }; setMats(n); }} />
                  <button onClick={() => setMats(mats.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="w-full max-w-md"><ComboboxWithCreate value="" onChange={(v) => { const n = addItem(mats, v); if (n) setMats(n); }} options={opcoesItens} disabledValues={Array.from(itensUsados)} placeholder="Adicionar produto ao kit geral…" /></div>
              <p className="text-[11px] text-muted-foreground">O kit aparece na OS como “previsto”; a baixa real é pela requisição vinculada à OS. Entra com “Salvar plano”.</p>
            </div>
          </div>
        )}

        {/* Histórico de OS */}
        {aba === "historico" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Histórico de OS do plano</h3>
            {p.ordens.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma OS gerada ainda.</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">OS</th><th className="text-left py-1">Ativo</th><th className="text-left py-1">Programada</th><th className="text-left py-1">Concluída</th><th className="text-left py-1">Status</th></tr></thead>
                <tbody>{p.ordens.map((o) => (
                  <tr key={o.id} className="border-t border-border/60">
                    <td className="py-1.5"><Link href={`/pcm/os/${o.id}`} className="text-info hover:underline">{o.numero}</Link></td>
                    <td className="py-1.5 text-xs">{o.ativo?.tag ?? "—"}</td>
                    <td className="py-1.5 text-xs">{fmtData(o.programadaPara ?? o.createdAt)}</td>
                    <td className="py-1.5 text-xs">{fmtData(o.concluidaEm)}</td>
                    <td className="py-1.5"><StatusOSBadge s={o.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {p.ordens.length >= 30 && <p className="text-[11px] text-muted-foreground mt-2">Mostrando as 30 mais recentes.</p>}
          </div>
        )}
      </div>

      <PlanoAplicacaoDialog
        planoId={id} regras={regras} aplicacao={dialogApl.aplicacao} ativos={lk.ativos} open={dialogApl.open}
        onClose={() => setDialogApl({ open: false, aplicacao: null })}
        onSaved={(aviso) => { setDialogApl({ open: false, aplicacao: null }); setMsg(""); setOk(aviso ? `Aplicação salva. ${aviso}` : "Aplicação salva."); load(); }}
        onAjustarPlano={irParaDadosDoPlano}
      />
    </div>
  );
}
