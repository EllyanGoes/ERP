"use client";

// Ficha SST do colaborador: função vigente, pendências, EPIs (entregar /
// trocar / devolver com termo e saída de estoque), ASOs e exames.
// Usada na página /sst/colaboradores/[id] e como aba "Saúde e Segurança" do
// cadastro em /empresa/colaboradores/[id] (embutido = sem cabeçalho/margens).
import { useCallback, useEffect, useState } from "react";
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
import { Loader2, HardHat, Stethoscope, Trash2, Plus, Printer, GraduationCap, FileText } from "lucide-react";
import { Semaforo, SeloAfastado, UploadAnexo, DocLink, AcoesLinha, fmtData, hojeISO, useLookups, TIPO_ASO, RESULTADO_ASO, TIPO_ENTREGA, type Pendencia } from "@/components/sst/comum";
import EntregaEpiDialog from "@/components/sst/EntregaEpiDialog";
import CautelaEpi from "@/components/sst/CautelaEpi";
import MedicoSelect, { crmCompleto } from "@/components/sst/MedicoSelect";

type Ficha = {
  id: string; nome: string; ativo: boolean; cargo: string | null; matricula: string | null; dataAdmissao: string | null; dataDemissao: string | null;
  afastamento: { desde: string; ate: string | null; motivo: string | null } | null;
  setor: { nome: string } | null;
  sstFuncoes: { id: string; inicio: string; fim: string | null; funcao: { id: string; nome: string; requisitosExame: { periodicidadeMeses: number; exameTipo: { id: string; nome: string } }[]; requisitosTreinamento: { treinamentoTipo: { id: string; nome: string; validadeMeses: number | null } }[] } }[];
  sstTreinamentos: { validade: string | null; aprovado: boolean; certificadoDocumentoId: string | null; treinamento: { id: string; tipoId: string; data: string; instrutor: string | null; cargaHoraria: number | null; tipo: { nome: string; norma: string | null } } }[];
  sstEpiEntregas: { id: string; epiId: string; tipo: string; data: string; vencimentoUso: string | null; quantidade: number; tamanho: string | null; motivo: string | null; documentoId: string | null; movimentacaoEstoqueId: string | null; epi: { nome: string; ca: string | null }; ficha: { id: string; numero: number; documentoId: string | null } | null }[];
  sstExames: { id: string; exameTipoId: string; data: string; resultado: string | null; observacao: string | null; documentoId: string | null; asoId: string | null; exameTipo: { nome: string }; aso: { tipo: string; data: string } | null }[];
  sstAsos: { id: string; tipo: string; data: string; validade: string | null; resultado: string; restricoes: string | null; medico: string | null; crm: string | null; documentoId: string | null; exames: { exameTipoId: string; data: string; resultado: string | null; exameTipo: { nome: string } }[] }[];
  pendencias: Pendencia[];
  episStatus: { epi: { id: string; nome: string; vidaUtilDias: number | null; ca: string | null }; obrigatorio: boolean; quantidade: number; entregaVigente: { data: string; vencimentoUso: string | null } | null }[];
};
type Funcao = { id: string; nome: string; ativo: boolean };
type Epi = { id: string; nome: string; ca: string | null; vidaUtilDias: number | null; itemId: string | null; ativo: boolean };
type ExameTipo = { id: string; nome: string; ativo?: boolean };

/** Cartão das faixas da ficha (exigência à esquerda, registro à direita). */
function Card({ icon, titulo, acao, children }: { icon: React.ReactNode; titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-xl border border-border h-full min-w-0 flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between gap-2 rounded-t-xl">
        <h2 className="font-semibold text-sm text-foreground inline-flex items-center gap-2">{icon} {titulo}</h2>
        {acao}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export default function FichaSstColaborador({ id, embutido = false }: { id: string; embutido?: boolean }) {
  const [f, setF] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [exameTipos, setExameTipos] = useState<ExameTipo[]>([]);
  const lk = useLookups();
  useTabTitle(embutido ? null : f ? `SST · ${f.nome}` : "SST");

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

  // ── Entrega de EPI (diálogo compartilhado: vários EPIs → ficha p/ assinar) ──
  const [dlgEpi, setDlgEpi] = useState(false);
  const [epiInicial, setEpiInicial] = useState<string | null>(null);
  function abrirEntrega(epiId = "") { setEpiInicial(epiId || null); setDlgEpi(true); }

  // ── ASO ──
  const [dlgAso, setDlgAso] = useState(false);
  // Lançar exame avulso (com vínculo opcional a um ASO já lançado).
  const [dlgExame, setDlgExame] = useState(false);
  const [eData, setEData] = useState(hojeISO());
  const [eSel, setESel] = useState<Record<string, boolean>>({});
  const [eResultado, setEResultado] = useState("");
  const [eObs, setEObs] = useState("");
  const [eAsoId, setEAsoId] = useState("");
  const [eDoc, setEDoc] = useState<string | null>(null);
  const [aTipo, setATipo] = useState("PERIODICO");
  const [aData, setAData] = useState(hojeISO());
  const [aValidade, setAValidade] = useState("");
  const [aResultado, setAResultado] = useState("APTO");
  const [aRestricoes, setARestricoes] = useState("");
  const [aMedico, setAMedico] = useState("");
  const [aCrm, setACrm] = useState("");
  const [aMedicoId, setAMedicoId] = useState("");
  const [aDoc, setADoc] = useState<string | null>(null);
  const [aExames, setAExames] = useState<Record<string, boolean>>({});
  function abrirAso() {
    setATipo("PERIODICO"); setAData(hojeISO()); setAValidade(""); setAResultado("APTO"); setARestricoes(""); setAMedico(""); setACrm(""); setAMedicoId(""); setADoc(null); setErro("");
    // pré-marca os exames exigidos pela função
    const exigidos = f?.sstFuncoes.find((v) => !v.fim)?.funcao.requisitosExame.map((r) => r.exameTipo.id) ?? [];
    setAExames(Object.fromEntries(exigidos.map((e) => [e, true])));
    setDlgAso(true);
  }
  async function salvarAso() {
    setSalvando(true); setErro("");
    const exames = Object.entries(aExames).filter(([, v]) => v).map(([exameTipoId]) => ({ exameTipoId, data: aData }));
    const res = await fetch("/api/sst/asos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: id, tipo: aTipo, data: aData, validade: aValidade || null, resultado: aResultado, restricoes: aRestricoes || null, medicoId: aMedicoId || null, medico: aMedico || null, crm: aCrm || null, documentoId: aDoc, exames }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgAso(false); load();
  }
  function abrirExame() {
    setEData(hojeISO()); setEResultado(""); setEObs(""); setEDoc(null); setErro("");
    // Pré-marca os exames exigidos que estão pendentes (nunca feitos ou vencidos).
    const pend = f?.pendencias.filter((p) => p.tipo === "EXAME_PENDENTE" && p.referenciaId).map((p) => p.referenciaId!) ?? [];
    setESel(Object.fromEntries(pend.map((x) => [x, true])));
    setEAsoId(f?.sstAsos[0]?.id ?? "");
    setDlgExame(true);
  }
  async function salvarExame() {
    const exames = Object.entries(eSel).filter(([, v]) => v).map(([exameTipoId]) => ({ exameTipoId, resultado: eResultado || null }));
    if (exames.length === 0) { setErro("Selecione ao menos um exame."); return; }
    setSalvando(true); setErro("");
    const res = await fetch("/api/sst/exames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: id, data: eData, asoId: eAsoId || null, documentoId: eDoc, observacao: eObs || null, exames }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgExame(false); load();
  }

  // ── Exclusões ──
  const [excluir, setExcluir] = useState<{ tipo: "entrega" | "aso" | "ficha" | "exame"; id: string } | null>(null);
  const [cautelaAberta, setCautelaAberta] = useState<string | null>(null);
  async function confirmarExclusao() {
    if (!excluir) return;
    setSalvando(true);
    const url = excluir.tipo === "entrega" ? `/api/sst/entregas?id=${excluir.id}` : excluir.tipo === "ficha" ? `/api/sst/entregas/fichas/${excluir.id}` : excluir.tipo === "exame" ? `/api/sst/exames/${excluir.id}` : `/api/sst/asos/${excluir.id}`;
    await fetch(url, { method: "DELETE" }).catch(() => {});
    setSalvando(false); setExcluir(null); load();
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!f) return <p className={cn("text-sm text-danger", !embutido && "px-8 py-8")}>Colaborador não encontrado.</p>;
  const vinculo = f.sstFuncoes.find((v) => !v.fim) ?? null;
  const semaforo = f.pendencias.some((p) => p.severidade === "CRITICA" || p.severidade === "ALTA") ? "CRITICO" : f.pendencias.length ? "ATENCAO" : "OK";

  return (
    <div>
      {embutido ? (
        <div className="flex items-center justify-end gap-2 mb-4">{f.afastamento ? <SeloAfastado a={f.afastamento} /> : <Semaforo s={semaforo} />}<Link href={`/sst/colaboradores/${f.id}`} className="text-xs text-info hover:underline">abrir no módulo SST</Link><Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="w-3.5 h-3.5" /> Ficha</Button></div>
      ) : (
      <PageHeader
        title={f.nome}
        subtitle={[f.cargo, f.setor?.nome, f.matricula ? `matrícula ${f.matricula}` : null, f.dataAdmissao ? `admitido em ${fmtData(f.dataAdmissao)}` : null].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "Colaboradores", href: "/sst/colaboradores" }, { label: f.nome }]}
        action={<div className="flex items-center gap-2">{f.afastamento ? <SeloAfastado a={f.afastamento} /> : <Semaforo s={semaforo} />}<Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="w-3.5 h-3.5" /> Ficha</Button></div>}
      />
      )}
      <div className={cn(!embutido && "px-8 pb-8")}>
        {/* Função no topo (largura toda); abaixo, duas colunas: EPIs à esquerda,
            ASO + treinamentos à direita. Abaixo de xl volta a uma coluna. */}
        <div className="space-y-6">
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

          {/* Exigências da função à esquerda, o que foi entregue/registrado à direita —
              em faixas pareadas (EPIs | entregas, exames | ASOs, treinamentos | turmas). */}
          {(() => {
            const nEntregas = f.sstEpiEntregas.length;
            return (
              <div className="space-y-6">
                <div className="hidden xl:grid grid-cols-2 gap-6 -mb-3 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que a função exige</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Entregas e registros</p>
                </div>

                {/* EPIs */}
                <div className="grid xl:grid-cols-2 gap-6 items-stretch">
                  <Card icon={<HardHat className="w-4 h-4" />} titulo="EPIs exigidos (NR-06)">
                    {f.episStatus.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">{vinculo ? "A função não exige EPI." : "Sem função — nada a cobrar."}</p> : (
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
                        <td className="px-3 py-2 text-right"><button onClick={() => abrirEntrega(s.epi.id)} className="text-xs text-info hover:underline">{v ? "Trocar" : "Entregar"}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                    )}
                  </Card>
                  <Card icon={<HardHat className="w-4 h-4" />} titulo={`Entregas de EPI${nEntregas ? ` · ${nEntregas}` : ""}`}
                    acao={<Button size="sm" onClick={() => abrirEntrega()} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Entrega</Button>}>
              {f.sstEpiEntregas.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhuma entrega registrada.</p> : (() => {
                // Uma linha por cautela (ficha); entregas em lote/avulsas ficam uma por linha.
                type Ent = Ficha["sstEpiEntregas"][number];
                const grupos: { chave: string; data: string; ficha: Ent["ficha"]; itens: Ent[] }[] = [];
                for (const e of f.sstEpiEntregas) {
                  const chave = e.ficha ? `f:${e.ficha.id}` : `e:${e.id}`;
                  const g = grupos.find((x) => x.chave === chave);
                  if (g) g.itens.push(e); else grupos.push({ chave, data: e.data, ficha: e.ficha, itens: [e] });
                }
                return (
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground bg-muted/50"><tr>
                      <th className="text-left px-4 py-1.5 font-semibold">Data</th><th className="text-left px-3 py-1.5 font-semibold">Cautela</th><th className="text-left px-3 py-1.5 font-semibold">EPIs</th><th className="text-left px-3 py-1.5 font-semibold">Termo</th><th className="px-2 py-1.5"></th>
                    </tr></thead>
                    <tbody>
                      {grupos.map((g) => {
                        const termo = g.ficha?.documentoId ?? g.itens.find((i) => i.documentoId)?.documentoId ?? null;
                        return (
                          <tr key={g.chave} className="border-t border-border/60 align-top">
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtData(g.data)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {g.ficha
                                ? <button onClick={() => setCautelaAberta(g.ficha!.id)} className="inline-flex items-center gap-1 text-xs font-medium text-info hover:underline"><FileText className="w-3.5 h-3.5" /> nº {String(g.ficha.numero).padStart(4, "0")}</button>
                                : <span className="text-xs text-muted-foreground/70">{g.itens[0].movimentacaoEstoqueId ? "lote/avulsa · estoque" : "lote/avulsa"}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <ul className="space-y-0.5">
                                {g.itens.map((e) => {
                                  const vencida = e.vencimentoUso ? new Date(e.vencimentoUso).getTime() < Date.now() : false;
                                  return (
                                    <li key={e.id} className="text-sm text-foreground leading-snug">
                                      {e.quantidade > 1 && <span className="tabular-nums text-muted-foreground">{e.quantidade}× </span>}
                                      {e.epi.nome}
                                      {e.tamanho && <span className="ml-1 text-[11px] px-1 rounded border border-border text-muted-foreground">tam. {e.tamanho}</span>}
                                      {e.tipo !== "ENTREGA" && <span className={cn("ml-1 text-[11px] px-1 rounded border", e.tipo === "DEVOLUCAO" ? "border-border text-muted-foreground" : "border-warning/30 text-warning bg-warning/5")}>{TIPO_ENTREGA[e.tipo]}</span>}
                                      <span className="text-[11px] text-muted-foreground">{e.epi.ca ? ` · CA ${e.epi.ca}` : ""}{e.vencimentoUso && <> · troca <span className={cn(vencida && "text-danger font-medium")}>{fmtData(e.vencimentoUso)}</span></>}</span>
                                      {e.motivo && <span className="block text-[11px] text-muted-foreground">{e.motivo}</span>}
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                            <td className="px-3 py-2"><DocLink id={termo} label="assinado" /></td>
                            <td className="px-2 py-2 text-right"><AcoesLinha acoes={g.ficha ? [
                              { label: "Ver cautela", icon: <FileText className="w-4 h-4 mr-2" />, onClick: () => setCautelaAberta(g.ficha!.id) },
                              { label: "Imprimir cautela", icon: <Printer className="w-4 h-4 mr-2" />, href: `/sst/epis/fichas/${g.ficha.id}` },
                              { label: "Excluir cautela", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setExcluir({ tipo: "ficha", id: g.ficha!.id }), danger: true, separadorAntes: true },
                            ] : [
                              { label: "Excluir entrega", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setExcluir({ tipo: "entrega", id: g.itens[0].id }), danger: true },
                            ]} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                );
              })()}

                  </Card>
                </div>

                {/* Exames */}
                <div className="grid xl:grid-cols-2 gap-6 items-stretch">
                  <Card icon={<Stethoscope className="w-4 h-4" />} titulo="Exames exigidos (NR-07)">
            {(() => {
              const asoPend = f.pendencias.filter((p) => p.tipo.startsWith("ASO"));
              const exigidos = vinculo?.funcao.requisitosExame ?? [];
              if (asoPend.length === 0 && exigidos.length === 0) return <p className="px-4 py-3 text-sm text-muted-foreground italic">{vinculo ? "A função não exige exames complementares." : "Sem função — nada a cobrar."}</p>;
              const feitos = f.sstExames;
              return (
                <div>
                  {asoPend.length > 0 && (
                    <div className="px-4 py-2 flex flex-wrap gap-1.5">
                      {asoPend.map((p, i) => <span key={i} className={cn("text-xs px-2 py-0.5 rounded-full border", p.severidade === "CRITICA" ? "border-danger/30 text-danger bg-danger/5" : "border-warning/30 text-warning bg-warning/5")}>{p.titulo}{p.vence ? ` · ${fmtData(p.vence)}` : ""}</span>)}
                    </div>
                  )}
                  {exigidos.length > 0 && (
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Exame exigido pela função</th><th className="text-left px-3 py-1.5 font-semibold">Situação</th><th className="text-left px-3 py-1.5 font-semibold">Último</th><th className="text-left px-3 py-1.5 font-semibold">Próximo</th></tr></thead>
                      <tbody>
                        {/* Em dia no topo, depois vencendo, vencidos e, por fim, nunca realizados. */}
                        {exigidos.map((r) => {
                          const doTipo = feitos.filter((e) => e.exameTipoId === r.exameTipo.id).sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime());
                          const ult = doTipo[0] ?? null;
                          const prox = ult ? new Date(new Date(ult.data).setMonth(new Date(ult.data).getMonth() + r.periodicidadeMeses)) : null;
                          const dias = prox ? Math.ceil((prox.getTime() - Date.now()) / 86_400_000) : null;
                          const st = !ult ? { t: "nunca realizado", cls: "text-danger", ordem: 3 } : dias! < 0 ? { t: "vencido", cls: "text-danger", ordem: 2 } : dias! <= 30 ? { t: `vence em ${dias} d`, cls: "text-warning", ordem: 1 } : { t: "em dia", cls: "text-success", ordem: 0 };
                          return { r, ult, prox, dias, st };
                        }).sort((a, b) => a.st.ordem - b.st.ordem).map(({ r, ult, prox, dias, st }) => (
                          <tr key={r.exameTipo.id} className="border-t border-border/60">
                            <td className="px-4 py-1.5 text-foreground">{r.exameTipo.nome} <span className="text-xs text-muted-foreground">· a cada {r.periodicidadeMeses} m</span></td>
                            <td className={cn("px-3 py-1.5 text-xs font-medium", st.cls)}>{st.t}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{ult ? fmtData(ult.data) : "—"}</td>
                            <td className={cn("px-3 py-1.5", dias !== null && dias < 0 ? "text-danger" : "text-muted-foreground")}>{prox ? fmtData(prox) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
                  </Card>
                  <Card icon={<Stethoscope className="w-4 h-4" />} titulo="ASOs e exames realizados"
                    acao={<div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={abrirExame} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Exame</Button>
                      <Button size="sm" onClick={abrirAso} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Lançar ASO</Button>
                    </div>}>
            <p className="px-4 pt-2 text-xs font-semibold text-muted-foreground">ASOs</p>
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
            {/* Exames vivem sozinhos: podem vir com o ASO ou depois dele (o médico
                deu apto e pediu exames novos). */}
            <p className="px-4 pt-3 text-xs font-semibold text-muted-foreground border-t border-border/60 mt-1">Exames complementares</p>
            {f.sstExames.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">Nenhum exame registrado.</p> : (
              <ul className="divide-y divide-border/60 px-4 pb-1">
                {f.sstExames.map((e) => (
                  <li key={e.id} className="py-1.5 text-sm flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{fmtData(e.data)}</span>
                    <span className="flex-1 min-w-0 text-foreground">{e.exameTipo.nome}
                      {e.resultado && <span className="text-xs text-muted-foreground"> · {e.resultado}</span>}
                      <span className="block text-[11px] text-muted-foreground">{e.aso ? `com o ASO ${(TIPO_ASO[e.aso.tipo] ?? e.aso.tipo).toLowerCase()} de ${fmtData(e.aso.data)}` : "avulso (sem ASO)"}{e.observacao ? ` · ${e.observacao}` : ""}</span>
                    </span>
                    <DocLink id={e.documentoId} label="laudo" />
                    <button onClick={() => setExcluir({ tipo: "exame", id: e.id })} className="text-muted-foreground hover:text-danger shrink-0" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
                  </Card>
                </div>

                {/* Treinamentos */}
                <div className="grid xl:grid-cols-2 gap-6 items-stretch">
                  <Card icon={<GraduationCap className="w-4 h-4" />} titulo="Treinamentos exigidos">
                    {!vinculo || vinculo.funcao.requisitosTreinamento.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">{vinculo ? "A função não exige treinamento." : "Sem função — nada a cobrar."}</p> : (
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Treinamento</th><th className="text-left px-3 py-1.5 font-semibold">Situação</th><th className="text-left px-3 py-1.5 font-semibold">Último</th><th className="text-left px-3 py-1.5 font-semibold">Válido até</th></tr></thead>
                        <tbody>
                          {vinculo.funcao.requisitosTreinamento.map((r) => {
                            const ult = f.sstTreinamentos.find((t) => t.aprovado && t.treinamento.tipoId === r.treinamentoTipo.id);
                            const vencido = ult?.validade ? new Date(ult.validade).getTime() < Date.now() : false;
                            return { r, ult, vencido, ordem: !ult ? 2 : vencido ? 1 : 0 };
                          }).sort((a, b) => a.ordem - b.ordem).map(({ r, ult, vencido }) => (
                            <tr key={r.treinamentoTipo.id} className="border-t border-border/60">
                              <td className="px-4 py-1.5 text-foreground">{r.treinamentoTipo.nome}</td>
                              <td className={cn("px-3 py-1.5 text-xs font-medium", !ult || vencido ? "text-danger" : "text-success")}>{!ult ? "faltando" : vencido ? "vencido" : "em dia"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{ult ? fmtData(ult.treinamento.data) : "—"}</td>
                              <td className={cn("px-3 py-1.5", vencido ? "text-danger" : "text-muted-foreground")}>{ult ? (ult.validade ? fmtData(ult.validade) : "não vence") : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                  <Card icon={<GraduationCap className="w-4 h-4" />} titulo="Treinamentos realizados"
                    acao={<Link href="/sst/treinamentos" className="text-xs text-info hover:underline">nova turma</Link>}>
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
                  </Card>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Dialog função */}
      <Dialog open={dlgFuncao} onOpenChange={setDlgFuncao}>
        <DialogContent className="sm:max-w-xl">
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
      {f && <EntregaEpiDialog open={dlgEpi} onOpenChange={setDlgEpi} epis={epis} colabs={[]} lk={lk} colaboradorFixo={{ id: f.id, nome: f.nome }} epiInicialId={epiInicial} onSaved={load} />}

      {/* Dialog ASO */}
      <Dialog open={dlgAso} onOpenChange={setDlgAso}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Lançar ASO</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={aTipo} onChange={setATipo} options={Object.entries(TIPO_ASO).map(([value, label]) => ({ value, label }))} /></div>
              <div><Label>Data do exame</Label><DatePicker value={aData} onChange={setAData} /></div>
              <div><Label>Válido até</Label><DatePicker value={aValidade} onChange={setAValidade} /><p className="text-[11px] text-muted-foreground mt-0.5">Vazio: calcula pela periodicidade da função (ou 12 meses).</p></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Resultado</Label><SelectMenu value={aResultado} onChange={setAResultado} options={Object.entries(RESULTADO_ASO).map(([value, v]) => ({ value, label: v.label }))} /></div>
              <div><Label>Médico</Label><MedicoSelect value={aMedicoId} onChange={(m) => { setAMedicoId(m?.id ?? ""); setAMedico(m?.nome ?? ""); setACrm(m ? crmCompleto(m) : ""); }} /></div>
              <div><Label>CRM</Label><Input value={aCrm} readOnly={!!aMedicoId} onChange={(e) => setACrm(e.target.value)} className={cn(aMedicoId && "bg-muted text-muted-foreground")} placeholder="preenchido pelo médico" /></div>
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

      {/* Dialog exame avulso */}
      <Dialog open={dlgExame} onOpenChange={setDlgExame}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Lançar exame</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Exames feitos fora do ASO — por exemplo, pedidos pelo médico depois de um ASO apto. Contam para a periodicidade exigida pela função.</p>
            <div><Label>Exames realizados</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {exameTipos.filter((t) => t.ativo !== false).map((t) => (
                  <label key={t.id} className={cn("inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border cursor-pointer", eSel[t.id] ? "border-info bg-info/10 text-info" : "border-border text-foreground")}>
                    <input type="checkbox" className="rounded" checked={!!eSel[t.id]} onChange={(ev) => setESel({ ...eSel, [t.id]: ev.target.checked })} />{t.nome}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data do exame</Label><DatePicker value={eData} onChange={setEData} /></div>
              <div><Label>Referente ao ASO (opcional)</Label>
                <SelectMenu value={eAsoId} onChange={setEAsoId} options={[{ value: "", label: "— Sem ASO (avulso) —" }, ...(f?.sstAsos ?? []).map((a) => ({ value: a.id, label: `${TIPO_ASO[a.tipo] ?? a.tipo} · ${fmtData(a.data)}` }))]} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Resultado</Label><Input value={eResultado} onChange={(ev) => setEResultado(ev.target.value)} placeholder="Ex.: normal, alterado…" /></div>
              <div><Label>Observação</Label><Input value={eObs} onChange={(ev) => setEObs(ev.target.value)} placeholder="Opcional" /></div>
            </div>
            <div><Label>Laudo (confidencial)</Label>{f && <UploadAnexo tipo="exame" titulo={`Exame — ${f.nome}`} colaboradorId={id} value={eDoc} onChange={setEDoc} />}</div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgExame(false)}>Cancelar</Button><Button onClick={salvarExame} disabled={salvando}>{salvando ? "Salvando…" : "Lançar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup da cautela */}
      <Dialog open={!!cautelaAberta} onOpenChange={(o) => !o && setCautelaAberta(null)}>
        <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cautela de EPI</DialogTitle></DialogHeader>
          {cautelaAberta && <div className="overflow-x-auto rounded-lg border border-border"><CautelaEpi id={cautelaAberta} emDialog /></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCautelaAberta(null)}>Fechar</Button>
            {cautelaAberta && <Link href={`/sst/epis/fichas/${cautelaAberta}`} target="_blank"><Button className="gap-1.5"><Printer className="w-4 h-4" /> Imprimir</Button></Link>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)} title={excluir?.tipo === "entrega" ? "Excluir entrega de EPI?" : excluir?.tipo === "ficha" ? "Excluir cautela?" : excluir?.tipo === "exame" ? "Excluir exame?" : "Excluir ASO?"} description={excluir?.tipo === "aso" ? "O registro vai para a lixeira. Os exames lançados com ele continuam registrados." : excluir?.tipo === "exame"  ? "O registro vai para a lixeira." : excluir?.tipo === "ficha" ? "Todas as entregas da cautela são excluídas e as saídas de estoque estornadas. Vai para a lixeira." : "A saída de estoque (se houve) é estornada. O registro vai para a lixeira."} onConfirm={confirmarExclusao} loading={salvando} confirmLabel="Excluir" />
    </div>
  );
}
