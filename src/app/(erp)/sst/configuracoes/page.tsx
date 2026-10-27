"use client";

// Funções SST e seus requisitos (EPIs obrigatórios, exames e periodicidade).
import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import { AcoesLinha } from "@/components/sst/comum";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, X, Search, Copy, Power, Layers } from "lucide-react";
import { cargoDe } from "@/lib/sst-funcao";

type TreinTipo = { id: string; nome: string; norma: string | null; ativo: boolean };
type Funcao = { id: string; nome: string; ghe: string | null; cbo: string | null; grauRisco: number | null; ativo: boolean; requisitosTreinamento: { treinamentoTipoId: string; treinamentoTipo: { id: string; nome: string } }[]; requisitosEpi: { epiId: string; obrigatorio: boolean; quantidade: number; epi: { id: string; nome: string; ca: string | null } }[]; requisitosExame: { exameTipoId: string; periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[]; _count: { colaboradores: number }; colaboradores: { colaborador: { id: string; nome: string; ativo: boolean } }[] };
type ColabOpt = { id: string; nome: string; ativo: boolean; funcao: { id: string; nome: string } | null };
type Epi = { id: string; nome: string; ca: string | null; ativo: boolean };
type ExameTipo = { id: string; nome: string; periodicidadeMeses: number | null; ativo: boolean; preco: string | null; clinico: boolean };

/** Coluna do cadastro de função: título + contagem, lista com rolagem e o "adicionar" fixo embaixo. */
function Coluna({ titulo, n, rodape, children }: { titulo: string; n: number; rodape: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border flex flex-col min-w-0 bg-card">
      <div className="px-3 py-2 border-b border-border bg-muted rounded-t-lg flex items-center justify-between">
        <Label className="text-sm">{titulo}</Label><span className="text-xs text-muted-foreground tabular-nums">{n}</span>
      </div>
      <div className="p-2 space-y-1.5 overflow-y-auto h-[46vh] min-h-[220px]">{children}</div>
      <div className="p-2 border-t border-border/60">{rodape}</div>
    </div>
  );
}

export default function SstConfigPage() {
  useTabTitle("SST — Funções e requisitos");
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [tipos, setTipos] = useState<ExameTipo[]>([]);
  const [treinos, setTreinos] = useState<TreinTipo[]>([]);
  const [rTreinos, setRTreinos] = useState<string[]>([]);
  const [rColabs, setRColabs] = useState<string[]>([]);
  // Desligados (inativos) ainda vinculados: não aparecem na coluna, mas seguem no
  // save — esconder não pode tirar a função do histórico deles.
  const [rColabsInativos, setRColabsInativos] = useState<string[]>([]);
  const [colabs, setColabs] = useState<ColabOpt[]>([]);
  const [loading, setLoading] = useState(true);
  // Só a 1ª carga mostra o spinner: recarregar depois de salvar/excluir troca os
  // dados por trás, sem desmontar a lista (a rolagem fica onde estava).
  async function load() {
    const [f, e, t, tr, c] = await Promise.all([fetch("/api/sst/funcoes").then((r) => r.json()), fetch("/api/sst/epis").then((r) => r.json()), fetch("/api/sst/exames-tipos").then((r) => r.json()), fetch("/api/sst/treinamentos-tipos").then((r) => r.json()), fetch("/api/sst/colaboradores").then((r) => r.json())]);
    setFuncoes(f.data ?? []); setEpis(e.data ?? []); setTipos(t.data ?? []); setTreinos(tr.data ?? []); setColabs(c.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [ghe, setGhe] = useState(""); const [gheNovo, setGheNovo] = useState(false); const [aplicarNoGhe, setAplicarNoGhe] = useState(false); const [cbo, setCbo] = useState(""); const [grau, setGrau] = useState("");
  const [rEpis, setREpis] = useState<{ epiId: string; obrigatorio: boolean; quantidade: number }[]>([]);
  const [rExames, setRExames] = useState<{ exameTipoId: string; periodicidadeMeses: number }[]>([]);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [copiarModo, setCopiarModo] = useState<"somar" | "substituir">("somar");
  /** Copia EPIs/exames/treinamentos de outra função p/ o formulário. "substituir" troca
   *  tudo (e o grau de risco); "somar" só acrescenta o que falta — no exame repetido
   *  fica a menor periodicidade. */
  function copiarRequisitos(id: string, modo: "somar" | "substituir" = "substituir") {
    setCopiarDe(id);
    const f = funcoes.find((x) => x.id === id); if (!f) return;
    const epis = f.requisitosEpi.map((r) => ({ epiId: r.epiId, obrigatorio: r.obrigatorio, quantidade: r.quantidade }));
    const exames = f.requisitosExame.map((r) => ({ exameTipoId: r.exameTipoId, periodicidadeMeses: r.periodicidadeMeses }));
    const treinos = f.requisitosTreinamento.map((r) => r.treinamentoTipoId);
    if (modo === "substituir") {
      setGrau(f.grauRisco ? String(f.grauRisco) : "");
      setREpis(epis); setRExames(exames); setRTreinos(treinos);
      return;
    }
    if (!grau && f.grauRisco) setGrau(String(f.grauRisco));
    setREpis((atual) => [...atual, ...epis.filter((e) => !atual.some((a) => a.epiId === e.epiId))]);
    setRExames((atual) => [
      ...atual.map((a) => { const o = exames.find((e) => e.exameTipoId === a.exameTipoId); return o ? { ...a, periodicidadeMeses: Math.min(a.periodicidadeMeses, o.periodicidadeMeses) } : a; }),
      ...exames.filter((e) => !atual.some((a) => a.exameTipoId === e.exameTipoId)),
    ]);
    setRTreinos((atual) => [...atual, ...treinos.filter((t) => !atual.includes(t))]);
  }
  /** Nova função a partir de outra (nome "Cópia de …", mesmos requisitos). */
  function duplicar(f: Funcao) { abrir(); copiarRequisitos(f.id); setNome(`${cargoDe(f.nome)} (cópia)`); setGhe(f.ghe ?? ""); setCbo(f.cbo ?? ""); }
  function abrir(f?: Funcao) {
    setCopiarDe(""); setCopiarModo("somar");
    setEditId(f?.id ?? null); setNome(f ? cargoDe(f.nome) : ""); setGhe(f?.ghe ?? ""); setGheNovo(false); setAplicarNoGhe(false); setCbo(f?.cbo ?? ""); setGrau(f?.grauRisco ? String(f.grauRisco) : "");
    setREpis(f?.requisitosEpi.map((r) => ({ epiId: r.epiId, obrigatorio: r.obrigatorio, quantidade: r.quantidade })) ?? []);
    setRExames(f?.requisitosExame.map((r) => ({ exameTipoId: r.exameTipoId, periodicidadeMeses: r.periodicidadeMeses })) ?? []);
    setRTreinos(f?.requisitosTreinamento.map((r) => r.treinamentoTipoId) ?? []);
    setRColabs(f?.colaboradores.filter((v) => v.colaborador.ativo).map((v) => v.colaborador.id) ?? []);
    setRColabsInativos(f?.colaboradores.filter((v) => !v.colaborador.ativo).map((v) => v.colaborador.id) ?? []);
    setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome da função."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/funcoes/${editId}` : "/api/sst/funcoes", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargo: nome, ghe: ghe || null, cbo: cbo || null, grauRisco: grau || null, epis: rEpis, exames: rExames, treinamentos: rTreinos.map((treinamentoTipoId) => ({ treinamentoTipoId })), colaboradores: [...rColabs, ...rColabsInativos], aplicarNoGhe: !!editId && aplicarNoGhe }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    if (j.aplicadas) setAviso(`Requisitos aplicados também a ${j.aplicadas} outra(s) função(ões) do ${ghe}.`);
    setOpen(false); load();
  }
  const [aviso, setAviso] = useState("");
  // GHEs existentes (campo próprio da função) — filtro, seletor e "aplicar ao GHE".
  const ghes = useMemo(() => Array.from(new Set(funcoes.map((f) => f.ghe).filter((g): g is string => !!g))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })), [funcoes]);
  const irmasNoGhe = useMemo(() => (ghe ? funcoes.filter((f) => f.ghe === ghe && f.id !== editId) : []), [funcoes, ghe, editId]);
  // Filtros da tabela (persistem por usuário).
  const [busca, setBusca] = usePersistedState("sst:funcoes:busca", "");
  const [fEpi, setFEpi] = usePersistedState("sst:funcoes:epi", "");
  const [fExame, setFExame] = usePersistedState("sst:funcoes:exame", "");
  const [fTreino, setFTreino] = usePersistedState("sst:funcoes:treino", "");
  const [fAtivo, setFAtivo] = usePersistedState("sst:funcoes:ativo", "ativas");
  const [fGhe, setFGhe] = usePersistedState("sst:funcoes:ghe", "");
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcoes.filter((f) =>
      (fAtivo === "todas" || (fAtivo === "ativas") === f.ativo) &&
      (!q || f.nome.toLowerCase().includes(q) || (f.cbo ?? "").toLowerCase().includes(q)) &&
      (!fGhe || (fGhe === "__sem" ? !f.ghe : f.ghe === fGhe)) &&
      (!fEpi || f.requisitosEpi.some((r) => r.epiId === fEpi)) &&
      (!fExame || f.requisitosExame.some((r) => r.exameTipoId === fExame)) &&
      (!fTreino || f.requisitosTreinamento.some((r) => r.treinamentoTipoId === fTreino)),
    ).sort((x, y) => (x.ghe ?? "~").localeCompare(y.ghe ?? "~", "pt-BR", { numeric: true }) || x.nome.localeCompare(y.nome));
  }, [funcoes, busca, fEpi, fExame, fTreino, fAtivo, fGhe]);
  // Custo estimado de um ASO completo da função: consulta clínica + exames exigidos.
  const custoAso = (f: Funcao) => {
    const preco = (id: string) => Number(tipos.find((t) => t.id === id)?.preco ?? 0);
    const clinico = Number(tipos.find((t) => t.clinico)?.preco ?? 0);
    return clinico + f.requisitosExame.reduce((s, r) => s + preco(r.exameTipoId), 0);
  };
  const [del, setDel] = useState<Funcao | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/funcoes/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDel(null); load(); }
  async function alternarAtivo(f: Funcao) { await fetch(`/api/sst/funcoes/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !f.ativo }) }); load(); }

  return (
    <div>
      <PageHeader title="Funções e requisitos" subtitle="O que cada função exige: EPIs, exames e periodicidade" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Configurações" }]}
        action={<Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Nova função</Button>} />
      <div className="px-8 pb-8 space-y-3">
        {aviso && <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{aviso}<button onClick={() => setAviso("")} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button></div>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar função, GHE ou CBO…" className="pl-8 h-8 w-64 text-sm" /></div>
          <SelectMenu value={fGhe} onChange={setFGhe} className="w-52" triggerClassName="h-8 text-xs" options={[{ value: "", label: "GHE: todos" }, ...ghes.map((g) => ({ value: g, label: g })), { value: "__sem", label: "Sem GHE" }]} />
          <SelectMenu value={fEpi} onChange={setFEpi} className="w-56" triggerClassName="h-8 text-xs" options={[{ value: "", label: "EPI exigido: todos" }, ...epis.map((e) => ({ value: e.id, label: e.nome }))]} />
          <SelectMenu value={fExame} onChange={setFExame} className="w-56" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Exame exigido: todos" }, ...tipos.map((t) => ({ value: t.id, label: t.nome }))]} />
          <SelectMenu value={fTreino} onChange={setFTreino} className="w-56" triggerClassName="h-8 text-xs" options={[{ value: "", label: "Treinamento: todos" }, ...treinos.map((t) => ({ value: t.id, label: t.nome }))]} />
          <SelectMenu value={fAtivo} onChange={setFAtivo} className="w-32" triggerClassName="h-8 text-xs" options={[{ value: "ativas", label: "Ativas" }, { value: "inativas", label: "Inativas" }, { value: "todas", label: "Todas" }]} />
          {(busca || fGhe || fEpi || fExame || fTreino || fAtivo !== "ativas") && <button onClick={() => { setBusca(""); setFGhe(""); setFEpi(""); setFExame(""); setFTreino(""); setFAtivo("ativas"); }} className="text-xs text-muted-foreground hover:text-foreground">limpar</button>}
          <span className="ml-auto text-xs text-muted-foreground">{filtradas.length} de {funcoes.length} função(ões)</span>
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : funcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma função SST. Comece pelas funções do chão de fábrica (operador de máquina, forneiro, eletricista…) e defina os EPIs e exames de cada uma.</p>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">Função</th>
                <th className="text-left px-3 py-2 font-semibold">EPIs</th>
                <th className="text-left px-3 py-2 font-semibold">Exames</th>
                <th className="text-left px-3 py-2 font-semibold">Treinamentos</th>
                <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Colaboradores</th>
                <th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {filtradas.map((f) => {
                  const cargo = cargoDe(f.nome); const gheF = f.ghe;
                  return (
                    <tr key={f.id} className={cn("border-t border-border/60 align-top hover:bg-muted/30", !f.ativo && "opacity-50")}>
                      <td className="px-4 py-2 min-w-[220px]">
                        <p className="font-medium text-foreground">{cargo}</p>
                        <p className="text-xs text-muted-foreground">{gheF && <button onClick={() => setFGhe(gheF)} className="hover:text-info hover:underline" title="Filtrar por este GHE">{gheF}</button>}{f.cbo && <span> · CBO {f.cbo}</span>}{f.grauRisco && <span> · risco {f.grauRisco}</span>}{!f.ativo && <span className="text-danger"> · inativa</span>}</p>
                      </td>
                      <td className="px-3 py-2">{f.requisitosEpi.length === 0 ? <span className="text-xs text-muted-foreground italic">nenhum</span> : <div className="flex flex-wrap gap-1">{f.requisitosEpi.map((r) => <span key={r.epiId} className={cn("text-[11px] px-1.5 py-0.5 rounded-full border", r.obrigatorio ? "border-info/30 bg-info/5 text-info" : "border-border text-muted-foreground")}>{r.quantidade > 1 ? `${r.quantidade}× ` : ""}{r.epi.nome}{!r.obrigatorio && " (opc.)"}</span>)}</div>}</td>
                      <td className="px-3 py-2">{f.requisitosExame.length === 0 ? <span className="text-xs text-muted-foreground italic">só ASO clínico (12m)</span> : <div className="flex flex-wrap gap-1">{f.requisitosExame.map((r) => <span key={r.exameTipoId} className="text-[11px] px-1.5 py-0.5 rounded-full border border-border text-foreground">{r.exameTipo.nome} · {r.periodicidadeMeses}m</span>)}</div>}
                        {custoAso(f) > 0 && <p className="text-[11px] text-muted-foreground mt-1" title="Consulta do ASO + exames exigidos, pela tabela de preços (ASO e exames)">≈ {custoAso(f).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por ASO completo</p>}</td>
                      <td className="px-3 py-2">{f.requisitosTreinamento.length === 0 ? <span className="text-xs text-muted-foreground italic">nenhum</span> : <div className="flex flex-wrap gap-1">{f.requisitosTreinamento.map((r) => <span key={r.treinamentoTipoId} className="text-[11px] px-1.5 py-0.5 rounded-full border border-border text-foreground">{r.treinamentoTipo.nome.replace(/^(NR-\d+)\s.*$/, "$1")}</span>)}</div>}</td>
                      <td className="px-3 py-2 text-right tabular-nums"><Link href={`/sst/colaboradores?funcao=${f.id}`} className={cn("font-medium hover:underline", f._count.colaboradores > 0 ? "text-foreground" : "text-muted-foreground")}>{f._count.colaboradores}</Link></td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <AcoesLinha acoes={[
                          { label: "Editar", icon: <Pencil className="w-4 h-4 mr-2" />, onClick: () => abrir(f) },
                          { label: "Duplicar", icon: <Copy className="w-4 h-4 mr-2" />, onClick: () => duplicar(f) },
                          { label: f.ativo ? "Inativar" : "Ativar", icon: <Power className="w-4 h-4 mr-2" />, onClick: () => alternarAtivo(f) },
                          { label: "Excluir", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDel(f), danger: true, separadorAntes: true },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
                {filtradas.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma função com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[min(96vw,1400px)] max-h-[94vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar função" : "Nova função SST"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {funcoes.some((x) => x.id !== editId) && (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-3">
                <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-[16rem]"><Label className="text-xs">Puxar requisitos de outra função</Label>
                  <p className="text-[11px] text-muted-foreground">{editId
                    ? (copiarModo === "somar" ? "Acrescenta os EPIs, exames e treinamentos que faltam — os atuais continuam." : "Troca os EPIs, exames, treinamentos e grau de risco pelos da função escolhida.")
                    : "Traz EPIs, exames, treinamentos e grau de risco — depois é só ajustar."} Só vale ao salvar.</p></div>
                {editId && (
                  <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                    {(["somar", "substituir"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setCopiarModo(m)} className={cn("px-2.5 py-1.5", copiarModo === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>{m === "somar" ? "Somar aos atuais" : "Substituir"}</button>
                    ))}
                  </div>
                )}
                <ComboboxWithCreate value={copiarDe} onChange={(id) => { if (id) copiarRequisitos(id, editId ? copiarModo : "substituir"); }} allowNone={false} className="w-72" placeholder="Escolher função…" menuMinWidth={320}
                  options={funcoes.filter((x) => x.id !== editId).sort((x, y) => x.nome.localeCompare(y.nome)).map((x) => ({ value: x.id, label: x.nome }))} />
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="col-span-2"><Label>Cargo / função</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Operador de máquinas" /></div>
              <div className="col-span-2"><Label>GHE (grupo homogêneo de exposição)</Label>
                {gheNovo || (ghe && !ghes.includes(ghe))
                  ? <div className="flex gap-2"><Input value={ghe} onChange={(e) => setGhe(e.target.value)} placeholder="Ex.: GHE 17 Expedição" autoFocus />{ghes.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => { setGheNovo(false); setGhe(""); }}>lista</Button>}</div>
                  : <SelectMenu value={ghe} onChange={(v) => { if (v === "__novo") { setGheNovo(true); setGhe(""); } else setGhe(v); }} options={[{ value: "", label: "— Sem GHE —" }, ...ghes.map((g) => ({ value: g, label: g })), { value: "__novo", label: "+ Novo GHE…" }]} />}
              </div>
              <div><Label>CBO</Label><Input value={cbo} onChange={(e) => setCbo(e.target.value)} /></div>
              <div><Label>Grau de risco</Label><SelectMenu value={grau} onChange={setGrau} options={[{ value: "", label: "—" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} /></div>
            </div>
            {/* 4 colunas com rolagem própria — funções com muitos requisitos não
                esticam o formulário. */}
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Coluna titulo="EPIs exigidos" n={rEpis.length}
                rodape={<div className="flex gap-2">
                  <ComboboxWithCreate value="" onChange={(v) => { if (v && !rEpis.some((r) => r.epiId === v)) setREpis([...rEpis, { epiId: v, obrigatorio: true, quantidade: 1 }]); }} allowNone={false} placeholder="Adicionar EPI…" className="flex-1 min-w-0" menuMinWidth={340}
                    options={epis.filter((e) => e.ativo && !rEpis.some((r) => r.epiId === e.id)).map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} />
                </div>}>
                {rEpis.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum EPI.</p>}
                {rEpis.map((r, i) => { const e = epis.find((x) => x.id === r.epiId); return (
                  <div key={r.epiId} className="rounded-md border border-border/60 px-2 py-1.5">
                    <div className="flex items-start gap-1.5"><span className="flex-1 text-sm text-foreground leading-snug">{e?.nome ?? r.epiId}</span><button onClick={() => setREpis(rEpis.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger mt-0.5"><X className="w-3.5 h-3.5" /></button></div>
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="number" min={1} value={r.quantidade} onChange={(ev) => setREpis(rEpis.map((x, j) => j === i ? { ...x, quantidade: Number(ev.target.value) || 1 } : x))} className="h-7 w-14 text-xs" title="Quantidade" />
                      <label className="inline-flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" className="rounded" checked={r.obrigatorio} onChange={(ev) => setREpis(rEpis.map((x, j) => j === i ? { ...x, obrigatorio: ev.target.checked } : x))} /> obrigatório</label>
                    </div>
                  </div>); })}
              </Coluna>
              <Coluna titulo="Exames e periodicidade" n={rExames.length}
                rodape={<><div className="flex gap-2">
                  <ComboboxWithCreate value="" onChange={(v) => { const t = tipos.find((x) => x.id === v); if (t && !rExames.some((r) => r.exameTipoId === v)) setRExames([...rExames, { exameTipoId: v, periodicidadeMeses: t.periodicidadeMeses ?? 12 }]); }} allowNone={false} placeholder="Adicionar exame…" className="flex-1 min-w-0" menuMinWidth={340}
                    options={tipos.filter((t) => t.ativo && !t.clinico && !rExames.some((r) => r.exameTipoId === t.id)).map((t) => ({ value: t.id, label: t.nome }))} />
                </div><p className="text-[11px] text-muted-foreground mt-1">A menor periodicidade vira a validade padrão do ASO periódico.</p></>}>
                {rExames.length === 0 && <p className="text-xs text-muted-foreground italic">Só ASO clínico (12 meses).</p>}
                {rExames.map((r, i) => { const t = tipos.find((x) => x.id === r.exameTipoId); return (
                  <div key={r.exameTipoId} className="rounded-md border border-border/60 px-2 py-1.5">
                    <div className="flex items-start gap-1.5"><span className="flex-1 text-sm text-foreground leading-snug">{t?.nome ?? r.exameTipoId}</span><button onClick={() => setRExames(rExames.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger mt-0.5"><X className="w-3.5 h-3.5" /></button></div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">a cada
                      <Input type="number" min={1} value={r.periodicidadeMeses} onChange={(ev) => setRExames(rExames.map((x, j) => j === i ? { ...x, periodicidadeMeses: Number(ev.target.value) || 12 } : x))} className="h-7 w-14 text-xs" /> meses
                    </div>
                  </div>); })}
              </Coluna>
              <Coluna titulo="Treinamentos obrigatórios" n={rTreinos.length}
                rodape={<div className="flex gap-2">
                  <ComboboxWithCreate value="" onChange={(v) => { if (v && !rTreinos.includes(v)) setRTreinos([...rTreinos, v]); }} allowNone={false} placeholder="Adicionar treinamento…" className="flex-1 min-w-0" menuMinWidth={340}
                    options={treinos.filter((t) => t.ativo && !rTreinos.includes(t.id)).map((t) => ({ value: t.id, label: t.norma ? `${t.nome} (${t.norma})` : t.nome }))} />
                </div>}>
                {rTreinos.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum treinamento.</p>}
                {rTreinos.map((tid) => <div key={tid} className="rounded-md border border-border/60 px-2 py-1.5 flex items-start gap-1.5"><span className="flex-1 text-sm text-foreground leading-snug">{treinos.find((t) => t.id === tid)?.nome ?? tid}</span><button onClick={() => setRTreinos(rTreinos.filter((x) => x !== tid))} className="text-muted-foreground hover:text-danger mt-0.5"><X className="w-3.5 h-3.5" /></button></div>)}
              </Coluna>
              <Coluna titulo="Colaboradores" n={rColabs.length}
                rodape={<><ComboboxWithCreate value="" onChange={(v) => { if (v && !rColabs.includes(v)) setRColabs([...rColabs, v]); }} allowNone={false} placeholder="Vincular colaborador…" menuMinWidth={340}
                  options={colabs.filter((c) => c.ativo && !rColabs.includes(c.id)).map((c) => ({ value: c.id, label: c.nome, code: c.funcao ? cargoDe(c.funcao.nome) : "sem função" }))} />
                  <p className="text-[11px] text-muted-foreground mt-1">Quem já tem outra função muda para esta ao salvar; quem for removido fica sem função.</p></>}>
                {rColabs.length === 0 && <p className="text-xs text-muted-foreground italic">Ninguém nesta função.</p>}
                {rColabs.map((cid) => {
                  const c = colabs.find((x) => x.id === cid);
                  const vemDe = c?.funcao && c.funcao.id !== editId ? cargoDe(c.funcao.nome) : null;
                  return (
                    <div key={cid} className="rounded-md border border-border/60 px-2 py-1.5 flex items-start gap-1.5">
                      <span className="flex-1 text-sm text-foreground leading-snug">{c?.nome ?? funcoes.flatMap((f) => f.colaboradores).find((v) => v.colaborador.id === cid)?.colaborador.nome ?? cid}
                        {vemDe && <span className="block text-[11px] text-warning">sai de: {vemDe}</span>}</span>
                      <button onClick={() => setRColabs(rColabs.filter((x) => x !== cid))} className="text-muted-foreground hover:text-danger mt-0.5"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </Coluna>
            </div>
            {editId && irmasNoGhe.length > 0 && (
              <label className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer", aplicarNoGhe ? "border-info bg-info/5" : "border-border")}>
                <input type="checkbox" className="rounded mt-0.5" checked={aplicarNoGhe} onChange={(e) => setAplicarNoGhe(e.target.checked)} />
                <span><span className="inline-flex items-center gap-1 font-medium text-foreground"><Layers className="w-3.5 h-3.5" /> Aplicar estes EPIs, exames e treinamentos a todas as funções do {ghe}</span>
                  <span className="block text-xs text-muted-foreground">Substitui os requisitos de mais {irmasNoGhe.length} função(ões): {irmasNoGhe.map((f) => cargoDe(f.nome)).join(", ")}.</span></span>
              </label>
            )}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir função?" description={`${del?.nome ?? ""} — só é possível sem colaboradores vinculados.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
