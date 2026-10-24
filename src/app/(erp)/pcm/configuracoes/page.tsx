"use client";

// Configurações da Manutenção: tipos de OS, catálogo técnico (sintoma/causa/serviço),
// equipes (membros e custo-hora), leituras de medidores e o de-para de materiais.
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search, X } from "lucide-react";
import { api, brl, fmtDataHora, useManutLookups } from "@/components/manutencao/comum";

const ABAS = [
  { id: "tipos", label: "Tipos de OS" },
  { id: "catalogo", label: "Catálogo de falhas" },
  { id: "equipes", label: "Equipes" },
  { id: "medidores", label: "Medidores" },
  { id: "materiais", label: "Materiais → produtos" },
];
const NATUREZAS = ["CORRETIVA", "PREVENTIVA", "PREDITIVA", "INSPECAO", "LUBRIFICACAO", "MELHORIA", "OUTROS"].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase().replace("inspecao", "inspeção").replace("lubrificacao", "lubrificação") }));
const TIPOS_CAT = [{ value: "SINTOMA", label: "Sintomas (defeitos)" }, { value: "CAUSA", label: "Causas" }, { value: "SERVICO", label: "Serviços" }];

export default function ManutencaoConfigPage() {
  useTabTitle("Manutenção — Configurações");
  const [aba, setAba] = usePersistedState<string>("pcm:config:aba", "tipos");
  return (
    <div>
      <PageHeader title="Configurações da Manutenção" subtitle="Cadastros de apoio usados nas OS, planos e indicadores" breadcrumbs={[{ label: "Manutenção" }, { label: "Configurações" }]} />
      <div className="px-8 pb-8 space-y-4">
        <div className="flex flex-wrap gap-1 border-b border-border">
          {ABAS.map((a) => <button key={a.id} onClick={() => setAba(a.id)} className={cn("text-sm px-3 py-2 -mb-px border-b-2", aba === a.id ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{a.label}</button>)}
        </div>
        {aba === "tipos" && <Tipos />}
        {aba === "catalogo" && <Catalogo />}
        {aba === "equipes" && <Equipes />}
        {aba === "medidores" && <Medidores />}
        {aba === "materiais" && <Materiais />}
      </div>
    </div>
  );
}

function useCadastro<T>(entidade: string) {
  const [lista, setLista] = useState<T[] | null>(null);
  const load = useCallback(async () => { const j = await fetch(`/api/pcm/cadastros/${entidade}`).then((r) => r.json()).catch(() => ({})); setLista(j.data ?? []); }, [entidade]);
  useEffect(() => { load(); }, [load]);
  return { lista, load };
}

const Carregando = () => <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tipo = { id: string; sigla: string; nome: string; natureza: string; contaComoFalha: boolean; prioridade: number; ativo: boolean; _count: { ordens: number } };
function Tipos() {
  const { lista, load } = useCadastro<Tipo>("tipos");
  const [f, setF] = useState<{ id?: string; sigla: string; nome: string; natureza: string; contaComoFalha: boolean; ativo: boolean } | null>(null);
  const [erro, setErro] = useState("");
  async function salvar() {
    if (!f) return;
    const r = await api(`/api/pcm/cadastros/tipos`, f.id ? "PATCH" : "POST", f);
    if (!r.ok) { setErro(r.error!); return; }
    setF(null); load();
  }
  if (!lista) return <Carregando />;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><p className="text-xs text-muted-foreground">“Conta como falha” define quais OS entram no MTBF/MTTR e no FMEA (quando têm sintoma).</p><Button size="sm" onClick={() => { setErro(""); setF({ sigla: "", nome: "", natureza: "CORRETIVA", contaComoFalha: false, ativo: true }); }} className="gap-1"><Plus className="w-3.5 h-3.5" /> Tipo</Button></div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Sigla</th><th className="text-left px-3 py-2">Nome</th><th className="text-left px-3 py-2">Natureza</th><th className="text-left px-3 py-2">Conta como falha</th><th className="text-right px-4 py-2">OS</th></tr></thead>
          <tbody>{lista.map((t) => (
            <tr key={t.id} onClick={() => { setErro(""); setF({ id: t.id, sigla: t.sigla, nome: t.nome, natureza: t.natureza, contaComoFalha: t.contaComoFalha, ativo: t.ativo }); }} className={cn("border-t border-border/60 hover:bg-muted/40 cursor-pointer", !t.ativo && "opacity-50")}>
              <td className="px-4 py-2 font-medium">{t.sigla}</td><td className="px-3 py-2">{t.nome}</td><td className="px-3 py-2 text-xs text-muted-foreground">{t.natureza}</td>
              <td className="px-3 py-2 text-xs">{t.contaComoFalha ? <span className="text-danger font-medium">sim</span> : "—"}</td><td className="px-4 py-2 text-right text-xs text-muted-foreground">{t._count.ordens}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Dialog open={!!f} onOpenChange={(v) => !v && setF(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{f?.id ? "Editar tipo" : "Novo tipo"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3"><div><Label>Sigla</Label><Input value={f.sigla} onChange={(e) => setF({ ...f, sigla: e.target.value.toUpperCase() })} /></div><div className="col-span-2"><Label>Nome</Label><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div></div>
            <div><Label>Natureza</Label><SelectMenu value={f.natureza} onChange={(v) => setF({ ...f, natureza: v })} options={NATUREZAS} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.contaComoFalha} onChange={(e) => setF({ ...f, contaComoFalha: e.target.checked })} /> Conta como falha (MTBF/MTTR)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setF(null)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Catálogo ──────────────────────────────────────────────────────────────────
type Cat = { id: string; tipo: string; descricao: string; ativo: boolean };
function Catalogo() {
  const { lista, load } = useCadastro<Cat>("catalogo");
  const [tipo, setTipo] = usePersistedState<string>("pcm:config:cat", "SINTOMA");
  const [busca, setBusca] = useState(""); const [nova, setNova] = useState(""); const [erro, setErro] = useState("");
  const visiveis = useMemo(() => (lista ?? []).filter((c) => c.tipo === tipo && (!busca || c.descricao.toLowerCase().includes(busca.toLowerCase()))), [lista, tipo, busca]);
  async function adicionar() {
    if (!nova.trim()) return;
    const r = await api(`/api/pcm/cadastros/catalogo`, "POST", { tipo, descricao: nova });
    if (!r.ok) { setErro(r.error!); return; }
    setNova(""); setErro(""); load();
  }
  async function alternar(c: Cat) { await api(`/api/pcm/cadastros/catalogo`, "PATCH", { id: c.id, ativo: !c.ativo }); load(); }
  async function renomear(c: Cat, descricao: string) { if (descricao.trim() && descricao !== c.descricao) { await api(`/api/pcm/cadastros/catalogo`, "PATCH", { id: c.id, descricao }); load(); } }
  if (!lista) return <Carregando />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS_CAT.map((t) => <button key={t.value} onClick={() => setTipo(t.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", tipo === t.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{t.label} ({lista.filter((c) => c.tipo === t.value && c.ativo).length})</button>)}
        <div className="relative ml-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card w-56" /></div>
      </div>
      <div className="flex gap-2 max-w-xl"><Input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="Novo item…" /><Button onClick={adicionar} className="gap-1"><Plus className="w-3.5 h-3.5" /> Adicionar</Button></div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="bg-card border border-border rounded-xl divide-y divide-border/60">
        {visiveis.map((c) => (
          <div key={c.id} className={cn("flex items-center gap-2 px-3 py-1.5", !c.ativo && "opacity-50")}>
            <input defaultValue={c.descricao} onBlur={(e) => renomear(c, e.target.value)} className="flex-1 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
            <button onClick={() => alternar(c)} className="text-xs text-muted-foreground hover:underline">{c.ativo ? "desativar" : "reativar"}</button>
          </div>
        ))}
        {visiveis.length === 0 && <p className="text-xs text-muted-foreground px-3 py-4">Nada aqui.</p>}
      </div>
    </div>
  );
}

// ── Equipes ───────────────────────────────────────────────────────────────────
type Equipe = { id: string; nome: string; externa: boolean; custoHora: string | null; ativo: boolean; membros: { colaborador: { id: string; nome: string } }[]; _count: { ordens: number } };
function Equipes() {
  const { lista, load } = useCadastro<Equipe>("equipes");
  const lk = useManutLookups();
  const [f, setF] = useState<{ id?: string; nome: string; externa: boolean; custoHora: string; ativo: boolean; membros: string[] } | null>(null);
  const [erro, setErro] = useState("");
  async function salvar() {
    if (!f) return;
    const r = await api(`/api/pcm/cadastros/equipes`, f.id ? "PATCH" : "POST", { ...f, custoHora: f.custoHora.replace(",", ".") });
    if (!r.ok) { setErro(r.error!); return; }
    setF(null); load();
  }
  if (!lista) return <Carregando />;
  const nomeColab = (id: string) => lk.colaboradores.find((c) => c.id === id)?.nome ?? lista.flatMap((e) => e.membros).find((m) => m.colaborador.id === id)?.colaborador.nome ?? "—";
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><p className="text-xs text-muted-foreground">O custo-hora da equipe é congelado em cada apontamento e compõe o custo de mão de obra da OS.</p><Button size="sm" onClick={() => { setErro(""); setF({ nome: "", externa: false, custoHora: "", ativo: true, membros: [] }); }} className="gap-1"><Plus className="w-3.5 h-3.5" /> Equipe</Button></div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Equipe</th><th className="text-left px-3 py-2">Membros</th><th className="text-left px-3 py-2">Custo-hora</th><th className="text-right px-4 py-2">OS</th></tr></thead>
          <tbody>{lista.map((e) => (
            <tr key={e.id} onClick={() => { setErro(""); setF({ id: e.id, nome: e.nome, externa: e.externa, custoHora: e.custoHora ?? "", ativo: e.ativo, membros: e.membros.map((m) => m.colaborador.id) }); }} className={cn("border-t border-border/60 hover:bg-muted/40 cursor-pointer", !e.ativo && "opacity-50")}>
              <td className="px-4 py-2">{e.nome}{e.externa && <span className="ml-1 text-[10px] text-muted-foreground">(externa)</span>}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{e.membros.map((m) => m.colaborador.nome.split(" ")[0]).join(", ") || "—"}</td>
              <td className="px-3 py-2 text-xs">{e.custoHora ? brl(e.custoHora) : <span className="text-warning">não definido</span>}</td>
              <td className="px-4 py-2 text-right text-xs text-muted-foreground">{e._count.ordens}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Dialog open={!!f} onOpenChange={(v) => !v && setF(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{f?.id ? "Editar equipe" : "Nova equipe"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3">
            <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div><Label>Custo-hora (R$)</Label><Input inputMode="decimal" value={f.custoHora} onChange={(e) => setF({ ...f, custoHora: e.target.value })} placeholder="ex.: 18,75" /></div>
            <div><Label>Membros</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">{f.membros.map((m) => <span key={m} className="text-xs bg-muted rounded-full px-2 py-0.5 inline-flex items-center gap-1">{nomeColab(m)}<button onClick={() => setF({ ...f, membros: f.membros.filter((x) => x !== m) })}><X className="w-3 h-3" /></button></span>)}</div>
              <ComboboxWithCreate value="" onChange={(v) => v && !f.membros.includes(v) && setF({ ...f, membros: [...f.membros, v] })} options={lk.colaboradores.map((c) => ({ value: c.id, label: c.nome }))} disabledValues={f.membros} placeholder="Adicionar colaborador…" />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.externa} onChange={(e) => setF({ ...f, externa: e.target.checked })} /> Equipe externa (terceiros)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativa</label>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setF(null)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Medidores ─────────────────────────────────────────────────────────────────
type Med = { id: string; nome: string; unidade: string; acumulado: string; ativoRef: { tag: string; nome: string }; leituras: { data: string; valor: string }[]; planos: { proximaMedida: string | null; plano: { nome: string } }[] };
function Medidores() {
  const [lista, setLista] = useState<Med[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [troca, setTroca] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const load = useCallback(async () => { const j = await fetch("/api/pcm/medidores").then((r) => r.json()).catch(() => ({})); setLista(j.data ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function lancar(m: Med) {
    const v = (valores[m.id] ?? "").replace(",", ".");
    if (!v) return;
    const r = await api("/api/pcm/medidores", "POST", { acao: "leitura", medidorId: m.id, valor: Number(v), trocaMedidor: !!troca[m.id] });
    setMsg({ ...msg, [m.id]: r.ok ? "ok" : r.error! });
    if (r.ok) { setValores({ ...valores, [m.id]: "" }); setTroca({ ...troca, [m.id]: false }); load(); }
  }
  if (!lista) return <Carregando />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Lance as leituras de horímetro/odômetro. Os planos por medidor geram a OS quando a leitura chega a 90% do próximo marco. Medidores novos são criados no plano (aplicação por medidor).</p>
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Ativo</th><th className="text-left px-3 py-2">Medidor</th><th className="text-right px-3 py-2">Atual</th><th className="text-left px-3 py-2">Última leitura</th><th className="text-left px-3 py-2">Próximo marco</th><th className="text-left px-3 py-2">Nova leitura</th></tr></thead>
          <tbody>{lista.map((m) => (
            <tr key={m.id} className="border-t border-border/60">
              <td className="px-4 py-2">{m.ativoRef.tag} — {m.ativoRef.nome}</td>
              <td className="px-3 py-2 text-xs">{m.nome}</td>
              <td className="px-3 py-2 text-right">{Number(m.acumulado)} {m.unidade}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{m.leituras[0] ? fmtDataHora(m.leituras[0].data) : "—"}</td>
              <td className="px-3 py-2 text-xs">{m.planos.filter((p) => p.proximaMedida).map((p, i) => <div key={i}>{Number(p.proximaMedida)} {m.unidade} <span className="text-muted-foreground">{p.plano.nome}</span></div>)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Input className="h-8 w-24 text-xs" inputMode="decimal" value={valores[m.id] ?? ""} onChange={(e) => setValores({ ...valores, [m.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && lancar(m)} />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => lancar(m)}>Lançar</Button>
                  <label className="text-[11px] text-muted-foreground flex items-center gap-1"><input type="checkbox" className="rounded" checked={!!troca[m.id]} onChange={(e) => setTroca({ ...troca, [m.id]: e.target.checked })} /> troca</label>
                </div>
                {msg[m.id] && msg[m.id] !== "ok" && <p className="text-[11px] text-danger mt-1">{msg[m.id]}</p>}
              </td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum medidor cadastrado.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Materiais do Engeman → produtos do ERP ──────────────────────────────────
type Sug = { id: string; codigo: string; descricao: string; nota: number };
type MatLeg = {
  codMat: number; tag: string | null; descricao: string; unidade: string | null; usos: number; situacao: string; confirmadoPor: string | null;
  item: { id: string; codigo: string; descricao: string } | null; sugestoes: Sug[]; _count: { kits: number; pecas: number };
};
const FILTROS_MAT = [{ value: "PENDENTES", label: "Sem produto" }, { value: "LIGADOS", label: "Ligados" }, { value: "SEM_PRODUTO", label: "Sem equivalente" }, { value: "TODOS", label: "Todos" }];
function Materiais() {
  const [filtro, setFiltro] = usePersistedState<string>("pcm:config:mat", "PENDENTES");
  const [lista, setLista] = useState<MatLeg[] | null>(null);
  const [contagem, setContagem] = useState<{ situacao: string; _count: number }[]>([]);
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  const [msg, setMsg] = useState(""); const [rodando, setRodando] = useState(false);
  const load = useCallback(async () => {
    setLista(null);
    const j = await fetch(`/api/pcm/materiais?situacao=${filtro}`).then((r) => r.json()).catch(() => ({}));
    setLista(j.data ?? []); setContagem(j.contagem ?? []);
  }, [filtro]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/itens?limit=3000").then((r) => r.json()).then((j) => setItens(j.data ?? [])).catch(() => {}); }, []);
  const visiveis = useMemo(() => (lista ?? []).filter((m) => !busca || `${m.descricao} ${m.item?.descricao ?? ""} ${m.item?.codigo ?? ""}`.toLowerCase().includes(busca.toLowerCase())), [lista, busca]);
  const total = (sits: string[]) => contagem.filter((c) => sits.includes(c.situacao)).reduce((s, c) => s + c._count, 0);
  async function ligar(codMat: number, body: Record<string, unknown>) {
    const r = await api("/api/pcm/materiais", "POST", { codMat, ...body });
    if (!r.ok) { setMsg(r.error!); return; }
    setMsg(""); load();
  }
  async function confirmarTodas() {
    const cods = visiveis.filter((m) => !m.item && m.sugestoes[0] && m.sugestoes[0].nota >= 0.75).map((m) => m.codMat);
    if (!cods.length) return;
    setRodando(true);
    const r = await api<{ ligados: number }>("/api/pcm/materiais", "POST", { acao: "confirmarSugestoes", codMats: cods });
    setRodando(false); setMsg(r.ok ? `${r.data!.ligados} material(is) ligado(s) pela sugestão.` : r.error!); load();
  }
  const fortes = visiveis.filter((m) => !m.item && m.sugestoes[0] && m.sugestoes[0].nota >= 0.75).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground max-w-4xl">A Manutenção usa só o estoque do ERP. Ligue cada material que veio do Engeman ao produto equivalente: o histórico de material das OS, os kits dos planos e os sobressalentes dos ativos passam a apontar para o produto (e os kits viram itens da requisição).</p>
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS_MAT.map((f) => <button key={f.value} onClick={() => setFiltro(f.value)} className={cn("text-xs px-2.5 py-1 rounded-full border", filtro === f.value ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground hover:bg-muted")}>{f.label}{f.value === "PENDENTES" ? ` (${total(["PENDENTE", "SUGERIDO"])})` : f.value === "LIGADOS" ? ` (${total(["EXATO", "MANUAL"])})` : f.value === "SEM_PRODUTO" ? ` (${total(["SEM_PRODUTO"])})` : ""}</button>)}
        <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card w-56" /></div>
        <div className="ml-auto flex gap-2">
          {filtro === "PENDENTES" && fortes > 0 && <Button size="sm" variant="outline" disabled={rodando} onClick={confirmarTodas}>Aceitar {fortes} sugestões fortes (≥ 75%)</Button>}
        </div>
      </div>
      {msg && <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">{msg}</p>}
      {!lista ? <Carregando /> : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2">Material (histórico)</th><th className="text-right px-3 py-2">Usos</th><th className="text-left px-3 py-2 w-[46%]">Produto do ERP</th><th className="px-3 py-2" /></tr></thead>
            <tbody>{visiveis.map((m) => (
              <tr key={m.codMat} className="border-t border-border/60 align-top">
                <td className="px-4 py-2">{m.descricao}<div className="text-[11px] text-muted-foreground">{m.tag ? `${m.tag} · ` : ""}{m.unidade ?? ""}{m._count.kits ? ` · em ${m._count.kits} plano(s)` : ""}{m._count.pecas ? ` · sobressalente de ${m._count.pecas} ativo(s)` : ""}</div></td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">{m.usos}</td>
                <td className="px-3 py-2">
                  {m.item ? (
                    <div className="text-sm"><span className="text-xs text-muted-foreground">{m.item.codigo}</span> {m.item.descricao}<div className="text-[11px] text-muted-foreground">{m.situacao === "EXATO" ? "ligado automaticamente" : `ligado por ${m.confirmadoPor ?? "—"}`}</div></div>
                  ) : m.situacao === "SEM_PRODUTO" ? <span className="text-xs text-muted-foreground">sem produto equivalente no ERP</span> : (
                    <div className="space-y-1.5">
                      {m.sugestoes.map((s) => (
                        <button key={s.id} onClick={() => ligar(m.codMat, { itemId: s.id })} className="w-full text-left text-xs border border-border rounded-lg px-2 py-1 hover:bg-info/10 hover:border-info/40 flex items-center gap-2">
                          <span className={cn("tabular-nums w-9 shrink-0", s.nota >= 0.75 ? "text-success font-medium" : "text-muted-foreground")}>{Math.round(s.nota * 100)}%</span>
                          <span className="text-muted-foreground">{s.codigo}</span><span className="truncate">{s.descricao}</span>
                        </button>
                      ))}
                      <ComboboxWithCreate value="" onChange={(v) => v && ligar(m.codMat, { itemId: v })} options={itens.map((i) => ({ value: i.id, label: `${i.codigo} — ${i.descricao}` }))} placeholder={m.sugestoes.length ? "Outro produto…" : "Escolher produto…"} menuMinWidth={420} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                  {m.item || m.situacao === "SEM_PRODUTO"
                    ? <button className="text-muted-foreground hover:underline" onClick={() => ligar(m.codMat, { desfazer: true })}>desfazer</button>
                    : <button className="text-muted-foreground hover:underline" onClick={() => ligar(m.codMat, { semProduto: true })}>não tem no ERP</button>}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">{filtro === "PENDENTES" ? "Nenhum material pendente." : "Nada aqui."}</td></tr>}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
