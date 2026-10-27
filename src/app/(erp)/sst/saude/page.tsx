"use client";

// ASO e exames: agenda de vencimentos (quem precisa de exame nos próximos
// dias) + tipos de exame complementar.
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, Search, FileSpreadsheet } from "lucide-react";
import { fmtData, type Pendencia, AcoesLinha, participaSst } from "@/components/sst/comum";
import { exportarPlanilhaExames, type ColabPlanilha } from "@/components/sst/planilhaExames";

type Colab = ColabPlanilha & { ativo: boolean; afastamento?: unknown | null; pendencias: Pendencia[] };
type ExameTipo = { id: string; nome: string; periodicidadeMeses: number | null; ativo: boolean; preco: string | null; clinico: boolean; _count: { requisitos: number; exames: number } };
type Linha = Pendencia & { colaboradorNome: string; setor: string | null; funcao?: string };

const TIPOS_SAUDE = ["ASO_INEXISTENTE", "ASO_VENCIDO", "ASO_VENCE_EM_BREVE", "ASO_INAPTO", "ASO_DEMISSIONAL_PENDENTE", "ASO_RETORNO_PENDENTE", "EXAME_PENDENTE"];

// Agrupamentos da agenda. A chave é o que junta as linhas; o rótulo abre o grupo.
const AGRUPAMENTOS: Record<string, { label: string; chave: (l: Linha) => string; rotulo?: (chave: string, primeira: Linha) => string }> = {
  colaborador: { label: "Colaborador", chave: (l) => l.colaboradorId ?? l.colaboradorNome, rotulo: (_, l) => l.colaboradorNome + (l.setor ? ` · ${l.setor}` : "") },
  funcao: { label: "Função", chave: (l) => l.funcao ?? "Sem função" },
  setor: { label: "Setor", chave: (l) => l.setor ?? "Sem setor" },
  pendencia: { label: "Tipo de pendência", chave: (l) => l.titulo },
  nenhum: { label: "Sem agrupamento", chave: () => "" },
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SstSaudePage() {
  useTabTitle("SST — ASO e exames");
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [tipos, setTipos] = useState<ExameTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [janela, setJanela] = usePersistedState("sst:saude:janela", "60");
  const [busca, setBusca] = usePersistedState("sst:saude:busca", "");
  const [agrupar, setAgrupar] = usePersistedState("sst:saude:agrupar", "colaborador");
  async function load() {
    const [c, t] = await Promise.all([fetch("/api/sst/colaboradores").then((r) => r.json()), fetch("/api/sst/exames-tipos").then((r) => r.json())]);
    setColabs(c.data ?? []); setTipos(t.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  // Agrupamento salvo que deixou de existir (ex.: severidade) volta ao padrão.
  useEffect(() => { if (!AGRUPAMENTOS[agrupar]) setAgrupar("colaborador"); }, [agrupar, setAgrupar]);

  const agenda = useMemo<Linha[]>(() => {
    const lim = Date.now() + Number(janela) * 86_400_000;
    // Busca por termos em qualquer ordem ("audiometria carla" acha "Carla … Audiometria").
    const termos = norm(busca).split(/\s+/).filter(Boolean);
    return colabs.filter(participaSst).flatMap((c) => c.pendencias.filter((p) => TIPOS_SAUDE.includes(p.tipo)).filter((p) => !p.vence || new Date(p.vence).getTime() <= lim).map((p) => ({ ...p, colaboradorId: c.id, colaboradorNome: c.nome, setor: c.setor, funcao: c.funcao?.nome })))
      .filter((l) => { const alvo = norm([l.colaboradorNome, l.setor ?? "", l.funcao ?? "", l.titulo, l.detalhe ?? ""].join(" ")); return termos.every((t) => alvo.includes(t)); })
      .sort((a, b) => (a.vence ? new Date(a.vence).getTime() : 0) - (b.vence ? new Date(b.vence).getTime() : 0));
  }, [colabs, janela, busca]);

  // Grupos em ordem alfabética; dentro do grupo, por vencimento.
  const grupos = useMemo(() => {
    const def = AGRUPAMENTOS[agrupar] ?? AGRUPAMENTOS.colaborador;
    const mapa = new Map<string, { rotulo: string; linhas: Linha[] }>();
    for (const l of agenda) {
      const k = def.chave(l);
      if (!mapa.has(k)) mapa.set(k, { rotulo: def.rotulo ? def.rotulo(k, l) : k, linhas: [] });
      mapa.get(k)!.linhas.push(l);
    }
    const lista = Array.from(mapa.entries()).map(([chave, g]) => ({ chave, ...g }));
    if (agrupar !== "nenhum") lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
    return lista;
  }, [agenda, agrupar]);
  const semGrupo = agrupar === "nenhum";

  // Planilha "Exames a realizar": ASO + exames exigidos + feitos sem exigência
  // (uma aba por colaborador × exame) e custo previsto por função. Respeita a
  // busca da tela; a janela define o que conta como "vence em breve".
  const [exportando, setExportando] = useState(false);
  async function exportarXlsx() {
    const termos = norm(busca).split(/\s+/).filter(Boolean);
    const nomes = new Map(tipos.map((t) => [t.id, t.nome]));
    const alvo = colabs.filter(participaSst).filter((c) => {
      const texto = norm([c.nome, c.setor ?? "", c.funcao?.nome ?? "", ...c.exigidos.map((r) => r.nome), ...c.exames.map((e) => nomes.get(e.exameTipoId) ?? "")].join(" "));
      return termos.every((t) => texto.includes(t));
    });
    setExportando(true);
    try { await exportarPlanilhaExames(alvo, tipos, Number(janela)); } finally { setExportando(false); }
  }

  // tipos de exame
  const [open, setOpen] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [per, setPer] = useState(""); const [preco, setPreco] = useState(""); const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(t?: ExameTipo) { setEditId(t?.id ?? null); setNome(t?.nome ?? ""); setPer(t?.periodicidadeMeses ? String(t.periodicidadeMeses) : ""); setPreco(t?.preco ? String(Number(t.preco)).replace(".", ",") : ""); setErro(""); setOpen(true); }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/exames-tipos/${editId}` : "/api/sst/exames-tipos", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, periodicidadeMeses: per || null, preco: preco || null }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<ExameTipo | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/exames-tipos/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDel(null); load(); }

  return (
    <div>
      <PageHeader title="ASO e exames" subtitle="Saúde ocupacional (NR-07) — agenda de vencimentos e tipos de exame" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "ASO e exames" }]}
        action={<Button onClick={() => abrir()} variant="outline" className="gap-1.5"><Plus className="w-4 h-4" /> Tipo de exame</Button>} />
      <div className="px-8 pb-8 grid lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2 bg-card rounded-xl border border-border">
          <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between gap-3">
            <h2 className="font-semibold text-sm text-foreground shrink-0">Agenda — quem precisa de ASO/exame</h2>
            <span className="text-xs text-muted-foreground">{agenda.length} pendência(s){!semGrupo && ` · ${grupos.length} ${agrupar === "colaborador" ? "colaborador(es)" : "grupo(s)"}`}</span>
          </div>
          <div className="px-4 py-2 border-b border-border/60 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colaborador, setor, função ou exame…" className="pl-8 h-8 text-sm" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">agrupar por <SelectMenu value={agrupar} onChange={setAgrupar} className="w-40" options={Object.entries(AGRUPAMENTOS).map(([value, a]) => ({ value, label: a.label }))} /></div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">próximos <SelectMenu value={janela} onChange={setJanela} className="w-28" options={[{ value: "30", label: "30 dias" }, { value: "60", label: "60 dias" }, { value: "90", label: "90 dias" }, { value: "3650", label: "todos" }]} /></div>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={exportarXlsx} disabled={loading || exportando} title="Exames a realizar (ASO, exigidos e feitos) e custo por função, em Excel">{exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel</Button>
          </div>
          {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : agenda.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">{busca ? "Nada encontrado para a busca no período." : "Ninguém com ASO/exame pendente ou vencendo no período."}</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr>
                {(semGrupo || agrupar !== "colaborador") && <th className="text-left px-4 py-1.5 font-semibold">Colaborador</th>}
                {agrupar !== "funcao" && <th className="text-left px-3 py-1.5 font-semibold">Função</th>}
                <th className="text-left px-3 py-1.5 font-semibold">Pendência</th>
                <th className="text-left px-3 py-1.5 font-semibold">Vence</th>
              </tr></thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.chave || "_"}>
                    {!semGrupo && (
                      <tr className="border-t border-border bg-muted/50">
                        <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-foreground">
                          {agrupar === "colaborador" ? <Link href={g.linhas[0].link} className="hover:text-info">{g.rotulo}</Link> : g.rotulo}
                          <span className="ml-2 font-normal text-muted-foreground">{g.linhas.length}</span>
                        </td>
                      </tr>
                    )}
                    {g.linhas.map((p, i) => (
                      <tr key={i} className="border-t border-border/60 hover:bg-muted/40">
                        {(semGrupo || agrupar !== "colaborador") && <td className="px-4 py-2"><Link href={p.link} className="text-foreground hover:text-info">{p.colaboradorNome}</Link><span className="text-xs text-muted-foreground"> {p.setor ? `· ${p.setor}` : ""}</span></td>}
                        {agrupar !== "funcao" && <td className={cn("px-3 py-2 text-muted-foreground", agrupar === "colaborador" && "pl-8")}>{p.funcao ?? "—"}</td>}
                        <td className="px-3 py-2 text-foreground">{p.titulo}{p.detalhe && <span className="text-xs text-muted-foreground"> — {p.detalhe}</span>}</td>
                        <td className={cn("px-3 py-2 text-xs", p.vence && new Date(p.vence).getTime() < Date.now() ? "text-danger font-medium" : "text-muted-foreground")}>{p.vence ? fmtData(p.vence) : "—"}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="bg-card rounded-xl border border-border">
          <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Tipos de exame e preços</h2></div>
          <ul className="divide-y divide-border/60">
            {tipos.map((t) => (
              <li key={t.id} className={cn("px-4 py-2 flex items-center gap-2 text-sm", !t.ativo && "opacity-50")}>
                <span className="flex-1 text-foreground">{t.nome}</span>
                <span className="text-xs text-muted-foreground">{t.clinico ? "consulta do ASO" : t.periodicidadeMeses ? `${t.periodicidadeMeses} m` : ""}</span>
                <span className="text-xs tabular-nums text-foreground w-20 text-right">{t.preco ? Number(t.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-muted-foreground/60">sem preço</span>}</span>
                <AcoesLinha acoes={[{ label: "Editar", icon: <Pencil className="w-4 h-4 mr-2" />, onClick: () => abrir(t) }, { label: "Excluir", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDel(t), danger: true, separadorAntes: true }]} />
              </li>
            ))}
            {tipos.length === 0 && <li className="px-4 py-4 text-sm text-muted-foreground italic">Nenhum tipo. Ex.: Clínico, Audiometria, Espirometria, Hemograma, Raio-X de tórax.</li>}
          </ul>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/60">A periodicidade por função é definida em Configurações → Funções.</p>
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editId ? "Editar tipo de exame" : "Novo tipo de exame"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Audiometria" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Periodicidade padrão (meses)</Label><Input type="number" min={1} value={per} onChange={(e) => setPer(e.target.value)} placeholder="12" /></div>
              <div><Label>Preço (R$)</Label><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" /></div>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir tipo de exame?" description={del?.nome ?? ""} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
