"use client";

// Ficha SST do colaborador: função vigente, pendências, EPIs (entregar /
// trocar / devolver com termo e saída de estoque), ASOs e exames.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, HardHat, Stethoscope, Trash2, Plus, Printer, GraduationCap } from "lucide-react";
import { ListaPendencias, Semaforo, UploadAnexo, DocLink, fmtData, hojeISO, useLookups, TIPO_ASO, RESULTADO_ASO, TIPO_ENTREGA, type Pendencia } from "@/components/sst/comum";

type Ficha = {
  id: string; nome: string; ativo: boolean; cargo: string | null; matricula: string | null; dataAdmissao: string | null; dataDemissao: string | null;
  setor: { nome: string } | null;
  sstFuncoes: { id: string; inicio: string; fim: string | null; funcao: { id: string; nome: string; requisitosExame: { periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[]; requisitosTreinamento: { treinamentoTipo: { id: string; nome: string; validadeMeses: number | null } }[] } }[];
  sstTreinamentos: { validade: string | null; aprovado: boolean; certificadoDocumentoId: string | null; treinamento: { id: string; tipoId: string; data: string; instrutor: string | null; cargaHoraria: number | null; tipo: { nome: string; norma: string | null } } }[];
  sstEpiEntregas: { id: string; epiId: string; tipo: string; data: string; vencimentoUso: string | null; quantidade: number; motivo: string | null; documentoId: string | null; movimentacaoEstoqueId: string | null; epi: { nome: string; ca: string | null } }[];
  sstAsos: { id: string; tipo: string; data: string; validade: string | null; resultado: string; restricoes: string | null; medico: string | null; crm: string | null; documentoId: string | null; exames: { exameTipoId: string; data: string; resultado: string | null; exameTipo: { nome: string } }[] }[];
  pendencias: Pendencia[];
  episStatus: { epi: { id: string; nome: string; vidaUtilDias: number | null; ca: string | null }; obrigatorio: boolean; quantidade: number; entregaVigente: { data: string; vencimentoUso: string | null } | null }[];
};
type Funcao = { id: string; nome: string; ativo: boolean };
type Epi = { id: string; nome: string; ca: string | null; itemId: string | null; ativo: boolean };
type ExameTipo = { id: string; nome: string };

export default function SstFichaPage() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [exameTipos, setExameTipos] = useState<ExameTipo[]>([]);
  const lk = useLookups();
  useTabTitle(f ? `SST · ${f.nome}` : "SST");

  const load = useCallback(async () => {
    const j = await fetch(`/api/sst/colaboradores/${id}`).then((r) => r.json()).catch(() => null);
    setF(j?.data ?? null); setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sst/funcoes").then((r) => r.json()).then((j) => setFuncoes(j.data ?? []));
    fetch("/api/sst/epis").then((r) => r.json()).then((j) => setEpis(j.data ?? []));
    fetch("/api/sst/exames-tipos").then((r) => r.json()).then((j) => setExameTipos(j.data ?? []));
  }, []);

  // ── Função ──
  const [dlgFuncao, setDlgFuncao] = useState(false);
  const [fFuncaoId, setFFuncaoId] = useState("");
  const [fInicio, setFInicio] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  async function salvarFuncao() {
    setSalvando(true); setErro("");
    const res = await fetch(`/api/sst/colaboradores/${id}/funcao`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funcaoId: fFuncaoId || null, inicio: fInicio }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgFuncao(false); load();
  }

  // ── Entrega de EPI ──
  const [dlgEpi, setDlgEpi] = useState(false);
  const [eEpiId, setEEpiId] = useState("");
  const [eTipo, setETipo] = useState("ENTREGA");
  const [eQtd, setEQtd] = useState("1");
  const [eData, setEData] = useState(hojeISO());
  const [eMotivo, setEMotivo] = useState("");
  const [eLocal, setELocal] = useState("");
  const [eDoc, setEDoc] = useState<string | null>(null);
  function abrirEntrega(epiId = "", tipo = "ENTREGA") {
    setEEpiId(epiId); setETipo(tipo); setEQtd("1"); setEData(hojeISO()); setEMotivo(""); setEDoc(null); setErro(""); setDlgEpi(true);
  }
  const epiSel = epis.find((e) => e.id === eEpiId);
  async function salvarEntrega() {
    if (!eEpiId) { setErro("Escolha o EPI."); return; }
    setSalvando(true); setErro("");
    const res = await fetch("/api/sst/entregas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: id, epiId: eEpiId, tipo: eTipo, quantidade: Number(eQtd) || 1, data: eData, motivo: eMotivo || null, documentoId: eDoc, localEstoqueId: eLocal || null }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgEpi(false); load();
  }

  // ── ASO ──
  const [dlgAso, setDlgAso] = useState(false);
  const [aTipo, setATipo] = useState("PERIODICO");
  const [aData, setAData] = useState(hojeISO());
  const [aValidade, setAValidade] = useState("");
  const [aResultado, setAResultado] = useState("APTO");
  const [aRestricoes, setARestricoes] = useState("");
  const [aMedico, setAMedico] = useState("");
  const [aCrm, setACrm] = useState("");
  const [aDoc, setADoc] = useState<string | null>(null);
  const [aExames, setAExames] = useState<Record<string, boolean>>({});
  function abrirAso() {
    setATipo("PERIODICO"); setAData(hojeISO()); setAValidade(""); setAResultado("APTO"); setARestricoes(""); setAMedico(""); setACrm(""); setADoc(null); setErro("");
    // pré-marca os exames exigidos pela função
    const exigidos = f?.sstFuncoes.find((v) => !v.fim)?.funcao.requisitosExame.map((r) => r.exameTipo.id) ?? [];
    setAExames(Object.fromEntries(exigidos.map((e) => [e, true])));
    setDlgAso(true);
  }
  async function salvarAso() {
    setSalvando(true); setErro("");
    const exames = Object.entries(aExames).filter(([, v]) => v).map(([exameTipoId]) => ({ exameTipoId, data: aData }));
    const res = await fetch("/api/sst/asos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: id, tipo: aTipo, data: aData, validade: aValidade || null, resultado: aResultado, restricoes: aRestricoes || null, medico: aMedico || null, crm: aCrm || null, documentoId: aDoc, exames }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgAso(false); load();
  }

  // ── Exclusões ──
  const [excluir, setExcluir] = useState<{ tipo: "entrega" | "aso"; id: string } | null>(null);
  async function confirmarExclusao() {
    if (!excluir) return;
    setSalvando(true);
    const url = excluir.tipo === "entrega" ? `/api/sst/entregas?id=${excluir.id}` : `/api/sst/asos/${excluir.id}`;
    await fetch(url, { method: "DELETE" }).catch(() => {});
    setSalvando(false); setExcluir(null); load();
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!f) return <p className="px-8 py-8 text-sm text-danger">Colaborador não encontrado.</p>;
  const vinculo = f.sstFuncoes.find((v) => !v.fim) ?? null;
  const semaforo = f.pendencias.some((p) => p.severidade === "CRITICA" || p.severidade === "ALTA") ? "CRITICO" : f.pendencias.length ? "ATENCAO" : "OK";

  return (
    <div>
      <PageHeader
        title={f.nome}
        subtitle={[f.cargo, f.setor?.nome, f.matricula ? `matrícula ${f.matricula}` : null, f.dataAdmissao ? `admitido em ${fmtData(f.dataAdmissao)}` : null].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Colaboradores", href: "/sst/colaboradores" }, { label: f.nome }]}
        action={<div className="flex items-center gap-2"><Semaforo s={semaforo} /><Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="w-3.5 h-3.5" /> Ficha</Button></div>}
      />
      <div className="px-8 pb-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Função */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Função SST</h2>
              <Button size="sm" variant="outline" onClick={() => { setFFuncaoId(vinculo?.funcao.id ?? ""); setFInicio(hojeISO()); setErro(""); setDlgFuncao(true); }}>{vinculo ? "Mudar função" : "Atribuir função"}</Button>
            </div>
            <div className="p-4 text-sm">
              {vinculo ? <>
                <p className="text-foreground font-medium">{vinculo.funcao.nome} <span className="text-xs text-muted-foreground font-normal">desde {fmtData(vinculo.inicio)}</span></p>
                {vinculo.funcao.requisitosExame.length > 0 && <p className="text-xs text-muted-foreground mt-1">Exames exigidos: {vinculo.funcao.requisitosExame.map((r) => `${r.exameTipo.nome} (${r.periodicidadeMeses}m)`).join(", ")}</p>}
              </> : <p className="text-muted-foreground italic">Sem função atribuída — sem função não há requisitos de EPI/exames para cobrar.</p>}
              {f.sstFuncoes.filter((v) => v.fim).length > 0 && (
                <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Histórico de funções</summary>
                  <ul className="mt-1 space-y-0.5">{f.sstFuncoes.filter((v) => v.fim).map((v) => <li key={v.id}>{v.funcao.nome}: {fmtData(v.inicio)} → {fmtData(v.fim)}</li>)}</ul>
                </details>
              )}
            </div>
          </section>

          {/* EPIs */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><HardHat className="w-4 h-4" /> EPIs (NR-06)</h2>
              <Button size="sm" onClick={() => abrirEntrega()} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Entrega</Button>
            </div>
            {f.episStatus.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Exigido pela função</th><th className="text-left px-3 py-1.5 font-semibold">Situação</th><th className="text-left px-3 py-1.5 font-semibold">Última entrega</th><th className="text-left px-3 py-1.5 font-semibold">Troca prevista</th><th className="px-3 py-1.5"></th></tr></thead>
                <tbody>
                  {f.episStatus.map((s) => {
                    const v = s.entregaVigente;
                    const vencido = v?.vencimentoUso ? new Date(v.vencimentoUso).getTime() < Date.now() : false;
                    return (
                      <tr key={s.epi.id} className="border-t border-border/60">
                        <td className="px-4 py-2 text-foreground">{s.epi.nome}{s.epi.ca ? <span className="text-xs text-muted-foreground"> · CA {s.epi.ca}</span> : null}{!s.obrigatorio && <span className="text-xs text-muted-foreground"> (opcional)</span>}</td>
                        <td className="px-3 py-2">{!v ? <span className="text-xs font-medium text-danger">não entregue</span> : vencido ? <span className="text-xs font-medium text-danger">vencido</span> : <span className="text-xs font-medium text-success">em uso</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v ? fmtData(v.data) : "—"}</td>
                        <td className={cn("px-3 py-2", vencido ? "text-danger" : "text-muted-foreground")}>{v?.vencimentoUso ? fmtData(v.vencimentoUso) : "—"}</td>
                        <td className="px-3 py-2 text-right"><button onClick={() => abrirEntrega(s.epi.id, v ? "TROCA" : "ENTREGA")} className="text-xs text-info hover:underline">{v ? "Trocar" : "Entregar"}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="px-4 py-2 border-t border-border/60">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Ficha de entregas</p>
              {f.sstEpiEntregas.length === 0 ? <p className="text-sm text-muted-foreground italic">Nenhuma entrega registrada.</p> : (
                <ul className="divide-y divide-border/60">
                  {f.sstEpiEntregas.map((e) => (
                    <li key={e.id} className="py-1.5 flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground w-20">{fmtData(e.data)}</span>
                      <span className={cn("text-[11px] px-1.5 rounded border", e.tipo === "DEVOLUCAO" ? "border-border text-muted-foreground" : "border-info/30 text-info bg-info/5")}>{TIPO_ENTREGA[e.tipo]}</span>
                      <span className="text-foreground flex-1 truncate">{e.quantidade}× {e.epi.nome}{e.motivo ? <span className="text-xs text-muted-foreground"> — {e.motivo}</span> : null}</span>
                      {e.movimentacaoEstoqueId && <span className="text-[10px] text-muted-foreground">estoque</span>}
                      <DocLink id={e.documentoId} label="termo" />
                      <button onClick={() => setExcluir({ tipo: "entrega", id: e.id })} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Treinamentos */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Treinamentos</h2>
              <Link href="/sst/treinamentos" className="text-xs text-info hover:underline">nova turma</Link>
            </div>
            {vinculo && vinculo.funcao.requisitosTreinamento.length > 0 && (
              <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-border/60">
                {vinculo.funcao.requisitosTreinamento.map((r) => {
                  const parts = f.sstTreinamentos.filter((t) => t.aprovado && t.treinamento.tipoId === r.treinamentoTipo.id);
                  const ult = parts[0];
                  const vencido = ult?.validade ? new Date(ult.validade).getTime() < Date.now() : false;
                  return <span key={r.treinamentoTipo.id} className={cn("text-xs px-2 py-0.5 rounded-full border", !ult ? "border-danger/30 text-danger bg-danger/5" : vencido ? "border-danger/30 text-danger" : "border-success/30 text-success bg-success/5")}>{r.treinamentoTipo.nome}: {!ult ? "faltando" : vencido ? "vencido" : "ok"}</span>;
                })}
              </div>
            )}
            {f.sstTreinamentos.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhum treinamento registrado.</p> : (
              <ul className="divide-y divide-border/60 px-4">
                {f.sstTreinamentos.map((t) => (
                  <li key={t.treinamento.id} className="py-2 text-sm flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20">{fmtData(t.treinamento.data)}</span>
                    <span className="text-foreground flex-1">{t.treinamento.tipo.nome}{t.treinamento.tipo.norma ? <span className="text-xs text-muted-foreground"> · {t.treinamento.tipo.norma}</span> : null}{t.treinamento.cargaHoraria ? <span className="text-xs text-muted-foreground"> · {t.treinamento.cargaHoraria}h</span> : null}{!t.aprovado && <span className="text-xs text-danger"> · reprovado</span>}</span>
                    <span className={cn("text-xs", t.validade && new Date(t.validade).getTime() < Date.now() ? "text-danger font-medium" : "text-muted-foreground")}>{t.validade ? `válido até ${fmtData(t.validade)}` : "não vence"}</span>
                    <DocLink id={t.certificadoDocumentoId} label="certificado" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ASOs */}
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2"><Stethoscope className="w-4 h-4" /> ASO e exames (NR-07)</h2>
              <Button size="sm" onClick={abrirAso} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Lançar ASO</Button>
            </div>
            {f.sstAsos.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhum ASO registrado.</p> : (
              <ul className="divide-y divide-border/60 px-4">
                {f.sstAsos.map((a) => {
                  const vencido = a.validade ? new Date(a.validade).getTime() < Date.now() : false;
                  return (
                    <li key={a.id} className="py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20">{fmtData(a.data)}</span>
                        <span className="font-medium text-foreground">{TIPO_ASO[a.tipo] ?? a.tipo}</span>
                        <span className={cn("text-[11px] px-1.5 py-0.5 rounded", RESULTADO_ASO[a.resultado]?.cls)}>{RESULTADO_ASO[a.resultado]?.label ?? a.resultado}</span>
                        <span className={cn("text-xs ml-auto", vencido ? "text-danger font-medium" : "text-muted-foreground")}>{a.validade ? `válido até ${fmtData(a.validade)}` : ""}</span>
                        <DocLink id={a.documentoId} label="ASO" />
                        <button onClick={() => setExcluir({ tipo: "aso", id: a.id })} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      {(a.medico || a.exames.length > 0 || a.restricoes) && (
                        <p className="text-xs text-muted-foreground mt-0.5 pl-[92px]">
                          {a.medico && <>Dr(a). {a.medico}{a.crm ? ` CRM ${a.crm}` : ""} · </>}
                          {a.exames.length > 0 && <>Exames: {a.exames.map((e) => e.exameTipo.nome).join(", ")}</>}
                          {a.restricoes && <> · Restrições: {a.restricoes}</>}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Pendências */}
        <aside className="space-y-6">
          <section className="bg-card rounded-xl border border-border">
            <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Pendências</h2></div>
            <div className="px-4"><ListaPendencias itens={f.pendencias} vazio="Tudo regular para este colaborador." /></div>
          </section>
        </aside>
      </div>

      {/* Dialog função */}
      <Dialog open={dlgFuncao} onOpenChange={setDlgFuncao}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{vinculo ? "Mudar função SST" : "Atribuir função SST"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Função</Label><SelectMenu value={fFuncaoId} onChange={setFFuncaoId} placeholder="Selecionar…" options={[{ value: "", label: "— Sem função —" }, ...funcoes.filter((x) => x.ativo).map((x) => ({ value: x.id, label: x.nome }))]} /></div>
            <div><Label>Início</Label><DatePicker value={fInicio} onChange={setFInicio} /></div>
            {vinculo && <p className="text-xs text-muted-foreground">Mudar de função encerra o vínculo atual e passa a exigir exame de mudança de risco e os EPIs/exames da nova função.</p>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgFuncao(false)}>Cancelar</Button><Button onClick={salvarFuncao} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog entrega de EPI */}
      <Dialog open={dlgEpi} onOpenChange={setDlgEpi}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Entrega de EPI</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>EPI</Label><SelectMenu value={eEpiId} onChange={setEEpiId} placeholder="Selecionar…" options={epis.filter((e) => e.ativo).map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} /></div>
            <div className="grid grid-cols-[1fr_90px_1fr] gap-3">
              <div><Label>Tipo</Label><SelectMenu value={eTipo} onChange={setETipo} options={Object.entries(TIPO_ENTREGA).map(([value, label]) => ({ value, label }))} /></div>
              <div><Label>Quantidade</Label><Input type="number" min={1} value={eQtd} onChange={(e) => setEQtd(e.target.value)} /></div>
              <div><Label>Data</Label><DatePicker value={eData} onChange={setEData} /></div>
            </div>
            <div><Label>Motivo</Label><Input value={eMotivo} onChange={(e) => setEMotivo(e.target.value)} placeholder="Periódica, desgaste, perda, dano…" /></div>
            {epiSel?.itemId && eTipo !== "DEVOLUCAO" && (
              <div><Label>Baixar do estoque (local)</Label><SelectMenu value={eLocal} onChange={setELocal} options={[{ value: "", label: "— Não baixar estoque —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} />
                <p className="text-xs text-muted-foreground mt-1">Este EPI está ligado a um item do almoxarifado: escolhendo o local, a entrega dá saída de estoque (sem saldo, bloqueia).</p></div>
            )}
            <div><Label>Termo de entrega assinado</Label><UploadAnexo tipo="termo-epi" titulo={`Termo de EPI — ${f.nome} — ${epiSel?.nome ?? ""}`} colaboradorId={id} value={eDoc} onChange={setEDoc} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgEpi(false)}>Cancelar</Button><Button onClick={salvarEntrega} disabled={salvando}>{salvando ? "Salvando…" : "Registrar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ASO */}
      <Dialog open={dlgAso} onOpenChange={setDlgAso}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Lançar ASO</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={aTipo} onChange={setATipo} options={Object.entries(TIPO_ASO).map(([value, label]) => ({ value, label }))} /></div>
              <div><Label>Data do exame</Label><DatePicker value={aData} onChange={setAData} /></div>
              <div><Label>Válido até</Label><DatePicker value={aValidade} onChange={setAValidade} /><p className="text-[11px] text-muted-foreground mt-0.5">Vazio: calcula pela periodicidade da função (ou 12 meses).</p></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Resultado</Label><SelectMenu value={aResultado} onChange={setAResultado} options={Object.entries(RESULTADO_ASO).map(([value, v]) => ({ value, label: v.label }))} /></div>
              <div><Label>Médico</Label><Input value={aMedico} onChange={(e) => setAMedico(e.target.value)} /></div>
              <div><Label>CRM</Label><Input value={aCrm} onChange={(e) => setACrm(e.target.value)} /></div>
            </div>
            {aResultado === "APTO_RESTRICOES" && <div><Label>Restrições</Label><Input value={aRestricoes} onChange={(e) => setARestricoes(e.target.value)} /></div>}
            {exameTipos.length > 0 && (
              <div><Label>Exames complementares realizados</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {exameTipos.map((t) => (
                    <label key={t.id} className={cn("inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border cursor-pointer", aExames[t.id] ? "border-info bg-info/10 text-info" : "border-border text-foreground")}>
                      <input type="checkbox" className="rounded" checked={!!aExames[t.id]} onChange={(e) => setAExames({ ...aExames, [t.id]: e.target.checked })} />{t.nome}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div><Label>ASO digitalizado (confidencial)</Label><UploadAnexo tipo="aso" titulo={`ASO ${TIPO_ASO[aTipo]} — ${f.nome}`} colaboradorId={id} validade={aValidade || null} value={aDoc} onChange={setADoc} /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgAso(false)}>Cancelar</Button><Button onClick={salvarAso} disabled={salvando}>{salvando ? "Salvando…" : "Lançar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)} title={excluir?.tipo === "entrega" ? "Excluir entrega de EPI?" : "Excluir ASO?"} description={excluir?.tipo === "entrega" ? "A saída de estoque (se houve) é estornada. O registro vai para a lixeira." : "O registro vai para a lixeira."} onConfirm={confirmarExclusao} loading={salvando} confirmLabel="Excluir" />
    </div>
  );
}
