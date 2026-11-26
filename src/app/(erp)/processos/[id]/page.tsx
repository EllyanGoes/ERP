"use client";

// Página do processo externo: cabeçalho (situação, números, portal), abas Linha do
// tempo · Prazos · Documentos · Partes e bens · Acesso (cofre) · Financeiro · Acesso externo · Dados. "Lançar andamento" e "Novo prazo"
// sempre à mão; exigência do órgão já oferece criar o prazo.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import DocumentoCreateDrawer from "@/components/documentos/DocumentoCreateDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Copy, ExternalLink, EyeOff, FileText, FileUp, Landmark, Loader2, Lock, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import ProcessoForm, { type ProcessoValores } from "@/components/processos/ProcessoForm";
import DocumentoProcessoDialog from "@/components/processos/DocumentoProcessoDialog";
import AbaAcesso from "@/components/processos/AbaAcesso";
import AbaFinanceiro from "@/components/processos/AbaFinanceiro";
import AbaExterno from "@/components/processos/AbaExterno";
import BensProcesso, { type BemLigado } from "@/components/processos/BensProcesso";
import { calcularVencimento, descreverContagem } from "@/lib/dias-uteis";
import {
  ESFERAS, PAPEIS_PARTE, PrazoChip, RISCOS, SITUACOES, SituacaoBadge, TIPOS_ANDAMENTO, TIPOS_PROCESSO, api, diasDesde, fmtBRL, fmtData, useLookups, type Pendencia,
} from "@/components/processos/comum";

type Andamento = { id: string; data: string; tipo: string; descricao: string; documentoId: string | null; usuario: string | null; origem: string; importancia: string; resumoIa: string | null; interno: boolean };
type Prazo = { id: string; descricao: string; vence: string; avisoDias: number; status: string; cumpridoEm: string | null; motivo: string | null; andamentoId: string | null;
  diasUteis: boolean; prazoDias: number | null; inicioContagem: string | null; suspensaoForense: boolean; fundamento: string | null };
type Parte = { id: string; papel: string; nome: string; documento: string | null; contato: string | null };
type Doc = { id: string; titulo: string; numero: string | null; emissao: string | null; confidencial: boolean; createdAt: string; categoria: { nome: string }; versaoVigente: { nome: string; tamanho: number } | null };
type Processo = {
  id: string; codigo: string; titulo: string; tipo: string; orgao: string; esfera: string | null; numero: string | null; numerosExtras: { rotulo: string; valor: string }[] | null;
  portalUrl: string | null; polo: string | null; interessadoTipo: string; interessadoNome: string | null; assunto: string | null; situacao: string; fase: string | null;
  abertoEm: string | null; encerradoEm: string | null; responsavelId: string | null; responsavel: { id: string; nome: string } | null; advogado: string | null;
  valorCausa: string | null; riscoPerda: string | null; confidencial: boolean; imovel: string | null; tags: string[]; observacoes: string | null; diasSemAndamentoAlerta: number;
  andamentos: Andamento[]; prazos: Prazo[]; partes: Parte[]; documentos: Doc[]; pendencias: Pendencia[]; bens: BemLigado[];
  _count: { credenciais: number; contasPagar: number; contasReceber: number; acessosExternos: number };
  datajudAtivo: boolean; datajudTribunal: string | null; datajudUltimaConsulta: string | null; datajudUltimoErro: string | null; datajudClasse: string | null; datajudOrgaoJulgador: string | null;
};
const SELO_IMPORTANCIA: Record<string, { label: string; cls: string }> = {
  ALTA: { label: "Importante", cls: "border-danger/30 bg-danger/10 text-danger" },
  ROTINA: { label: "Rotina", cls: "border-border bg-muted text-muted-foreground" },
};
/** Filtro "Importantes": lançamentos manuais sempre; do tribunal, só os ALTA. */
const ehImportante = (a: Andamento) => a.origem !== "DATAJUD" || a.importancia === "ALTA";
/** "há 3 h", "há 2 dias" — para "Atualizado do tribunal há X". */
function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60_000));
  if (min < 60) return min <= 1 ? "agora há pouco" : `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}
const ABAS = ["linha", "prazos", "documentos", "partes", "acesso", "financeiro", "externo", "dados"] as const;
type Aba = (typeof ABAS)[number];
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export default function ProcessoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lk = useLookups();
  const [p, setP] = useState<Processo | null>(null); const [erro, setErro] = useState(""); const [pode, setPode] = useState(false);
  const [abaSalva, setAba] = usePersistedState<Aba>("processos:aba", "linha");
  const aba: Aba = ABAS.includes(abaSalva) ? abaSalva : "linha";
  useTabTitle(p ? p.codigo : "Processo");
  // Linha do tempo: "Importantes" (padrão) esconde a rotina do tribunal (juntada, conclusão…).
  const [filtroLinha, setFiltroLinha] = usePersistedState<"importantes" | "todos">("processos:linha-filtro", "importantes");
  const [atualizando, setAtualizando] = useState(false);
  const load = useCallback(async () => {
    const j = await fetch(`/api/processos/${id}`).then((r) => r.json()).catch(() => ({}));
    if (!j.data) { setErro(j.error || "Processo não encontrado."); return; }
    setP(j.data); setPode(!!j.podeEditar);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // ── andamento ───────────────────────────────────────────────────────────────
  const [and, setAnd] = useState<{ data: string; tipo: string; descricao: string; documentoId: string; situacao: string; prazoDesc: string; prazoVence: string; prazoAviso: string; cumpre: string; interno: boolean } | null>(null);
  const [msg, setMsg] = useState(""); const [salvando, setSalvando] = useState(false);
  const novoAndamento = (tipo = "MOVIMENTACAO") => { setMsg(""); setAnd({ data: new Date().toISOString().slice(0, 10), tipo, descricao: "", documentoId: "", situacao: "__auto", prazoDesc: "", prazoVence: "", prazoAviso: "5", cumpre: "", interno: false }); };
  async function salvarAndamento() {
    if (!and) return;
    setSalvando(true); setMsg("");
    const r = await api(`/api/processos/${id}/andamentos`, "POST", {
      data: and.data, tipo: and.tipo, descricao: and.descricao, documentoId: and.documentoId || null, interno: and.interno,
      ...(and.situacao === "__auto" ? {} : { mudarSituacao: and.situacao || null }),
      ...(and.prazoDesc.trim() && and.prazoVence ? { prazo: { descricao: and.prazoDesc, vence: and.prazoVence, avisoDias: Number(and.prazoAviso) || 5 } } : {}),
      ...(and.cumpre ? { cumprePrazoId: and.cumpre } : {}),
    });
    setSalvando(false);
    if (!r.ok) { setMsg(r.error!); return; }
    setAnd(null); load();
  }
  async function alternarInterno(a: Andamento) { await api(`/api/processos/${id}/andamentos`, "PATCH", { andamentoId: a.id, interno: !a.interno }); load(); }
  async function removerAndamento(a: Andamento) { if (!confirm("Remover este andamento?")) return; await api(`/api/processos/${id}/andamentos?andamentoId=${a.id}`, "DELETE"); load(); }

  // ── prazos ──────────────────────────────────────────────────────────────────
  // Prazo por data fixa OU por contagem (início + N dias úteis/corridos — src/lib/dias-uteis.ts).
  type PrazoForm = { descricao: string; vence: string; avisoDias: string; modo: "data" | "contagem"; inicio: string; dias: string; uteis: boolean; suspensao: boolean };
  const [prazo, setPrazo] = useState<PrazoForm | null>(null);
  const [docLanc, setDocLanc] = useState(false);
  const novoPrazo = () => { setMsg(""); setPrazo({ descricao: "", vence: "", avisoDias: "5", modo: "data", inicio: new Date().toISOString().slice(0, 10), dias: "", uteis: true, suspensao: p?.tipo === "JUDICIAL" }); };
  const vencePrazo = useMemo(() => {
    if (!prazo) return null;
    if (prazo.modo === "data") return prazo.vence || null;
    if (!prazo.inicio || prazo.dias === "") return null;
    return calcularVencimento(prazo.inicio, Number(prazo.dias), { uteis: prazo.uteis, suspensaoForense: p?.tipo === "JUDICIAL" && prazo.suspensao, judicial: p?.tipo === "JUDICIAL" }).toISOString().slice(0, 10);
  }, [prazo, p?.tipo]);
  async function salvarPrazo() {
    if (!prazo) return;
    setSalvando(true); setMsg("");
    const r = await api(`/api/processos/${id}/prazos`, "POST", prazo.modo === "data"
      ? { descricao: prazo.descricao, vence: prazo.vence, avisoDias: Number(prazo.avisoDias) || 5 }
      : { descricao: prazo.descricao, inicioContagem: prazo.inicio, prazoDias: prazo.dias, diasUteis: prazo.uteis, suspensaoForense: p?.tipo === "JUDICIAL" && prazo.suspensao, avisoDias: Number(prazo.avisoDias) || 5 });
    setSalvando(false);
    if (!r.ok) { setMsg(r.error!); return; }
    setPrazo(null); load();
  }
  async function acaoPrazo(pr: Prazo, acao: "cumprir" | "dispensar" | "reabrir") {
    const motivo = acao === "dispensar" ? prompt("Motivo da dispensa:") : null;
    if (acao === "dispensar" && !motivo?.trim()) return;
    await api(`/api/processos/${id}/prazos`, "PATCH", { prazoId: pr.id, acao, motivo }); load();
  }
  async function removerPrazo(pr: Prazo) { if (!confirm("Excluir este prazo?")) return; await api(`/api/processos/${id}/prazos?prazoId=${pr.id}`, "DELETE"); load(); }

  // ── partes / documentos / situação / exclusão ────────────────────────────────
  const [parte, setParte] = useState<{ papel: string; nome: string; documento: string; contato: string } | null>(null);
  async function salvarParte() { if (!parte) return; const r = await api(`/api/processos/${id}/partes`, "POST", parte); if (!r.ok) { setMsg(r.error!); return; } setParte(null); load(); }
  async function removerParte(x: Parte) { await api(`/api/processos/${id}/partes?parteId=${x.id}`, "DELETE"); load(); }
  const [novoDoc, setNovoDoc] = useState(false);
  const [ligar, setLigar] = useState("");
  async function ligarDocumento(docId: string) { if (!docId) return; await api(`/api/processos/${id}/documentos`, "POST", { documentoIds: [docId] }); setLigar(""); load(); }
  async function desligarDocumento(d: Doc) { if (!confirm(`Desligar "${d.titulo}" do processo? O documento continua no GED.`)) return; await api(`/api/processos/${id}/documentos?documentoId=${d.id}`, "DELETE"); load(); }
  async function mudarSituacao(s: string) { await api(`/api/processos/${id}`, "PATCH", { situacao: s }); load(); }
  const [del, setDel] = useState(false); const [excluindo, setExcluindo] = useState(false);
  async function excluir() { setExcluindo(true); const r = await api(`/api/processos/${id}`, "DELETE"); setExcluindo(false); if (r.ok) router.push("/processos/lista"); else setMsg(r.error!); }

  async function atualizarTribunal() {
    setAtualizando(true); setMsg("");
    const r = await api<{ novos: number; importantes: number }>(`/api/processos/${id}/datajud`, "POST");
    setAtualizando(false);
    if (!r.ok) setMsg(r.error!);
    load();
  }
  const ocultos = useMemo(() => (p && filtroLinha === "importantes" ? p.andamentos.filter((a) => !ehImportante(a)).length : 0), [p, filtroLinha]);
  const linhaTempo = useMemo(() => {
    if (!p) return [];
    const itens: ({ k: "a"; d: string; a: Andamento } | { k: "p"; d: string; pr: Prazo })[] = [
      ...p.andamentos.filter((a) => filtroLinha === "todos" || ehImportante(a)).map((a) => ({ k: "a" as const, d: a.data, a })),
      ...p.prazos.filter((x) => x.status === "PENDENTE").map((pr) => ({ k: "p" as const, d: pr.vence, pr })),
    ];
    return itens.sort((x, y) => +new Date(y.d) - +new Date(x.d));
  }, [p, filtroLinha]);
  const docsLivres = useMemo(() => lk.documentos.map((d) => ({ value: d.id, label: d.titulo, code: d.categoria.nome })), [lk.documentos]);

  if (!p) return erro ? <div className="p-8 text-sm text-danger">{erro}</div> : <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const pendentes = p.prazos.filter((x) => x.status === "PENDENTE");
  const ultimo = p.andamentos[0];
  const inicialForm: Partial<ProcessoValores> = {
    titulo: p.titulo, tipo: p.tipo, orgao: p.orgao, esfera: p.esfera ?? "", numero: p.numero ?? "", portalUrl: p.portalUrl ?? "", polo: p.polo ?? "",
    interessadoTipo: p.interessadoTipo, interessadoNome: p.interessadoNome ?? "", assunto: p.assunto ?? "", situacao: p.situacao, fase: p.fase ?? "", abertoEm: dia(p.abertoEm),
    responsavelId: p.responsavelId ?? "", advogado: p.advogado ?? "", valorCausa: p.valorCausa ?? "", riscoPerda: p.riscoPerda ?? "", confidencial: p.confidencial,
    imovel: p.imovel ?? "", tags: p.tags.join(", "), observacoes: p.observacoes ?? "", diasSemAndamentoAlerta: String(p.diasSemAndamentoAlerta), numerosExtras: p.numerosExtras ?? [],
    datajudAtivo: p.datajudAtivo,
  };
  const abas: { id: Aba; label: string; n?: number }[] = [
    { id: "linha", label: "Linha do tempo", n: p.andamentos.length }, { id: "prazos", label: "Prazos", n: pendentes.length },
    { id: "documentos", label: "Documentos", n: p.documentos.length }, { id: "partes", label: "Partes e bens", n: p.partes.length + p.bens.length },
    { id: "acesso", label: "Acesso", n: p._count.credenciais }, { id: "financeiro", label: "Financeiro", n: p._count.contasPagar + p._count.contasReceber },
    { id: "externo", label: "Acesso externo", n: p._count.acessosExternos }, { id: "dados", label: "Dados" },
  ];
  const copiar = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

  return (
    <div>
      <PageHeader title={p.titulo} subtitle={`${p.codigo} · ${TIPOS_PROCESSO[p.tipo] ?? p.tipo} · ${p.orgao}`} breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Lista", href: "/processos/lista" }, { label: p.codigo }]}
        action={pode ? <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setDocLanc(true)} title="Sobe o PDF (intimação, notificação…) e a IA sugere o andamento e o prazo"><FileUp className="w-4 h-4" /> A partir de documento</Button>
          <Button variant="outline" className="gap-1.5" onClick={novoPrazo}><Plus className="w-4 h-4" /> Prazo</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={() => novoAndamento()}><Plus className="w-4 h-4" /> Lançar andamento</Button>
        </div> : undefined} />
      <div className="px-8 pb-10 space-y-4">
        {msg && <p className="text-sm text-danger">{msg}</p>}
        {/* Cabeçalho */}
        <div className="bg-card border border-border rounded-xl p-4 grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Situação</div>
            {pode ? <SelectMenu value={p.situacao} onChange={mudarSituacao} triggerClassName="h-8 text-xs" options={Object.entries(SITUACOES).map(([value, s]) => ({ value, label: s.label }))} /> : <SituacaoBadge s={p.situacao} />}
            {p.fase && <div className="text-xs text-muted-foreground">Fase: {p.fase}</div>}
            {p.confidencial && <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Lock className="w-3 h-3" /> confidencial</div>}
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Números</div>
            {p.numero ? <div className="flex items-center gap-1.5"><span className="font-mono">{p.numero}</span><button onClick={() => copiar(p.numero!)} title="Copiar" className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button></div> : <div className="text-muted-foreground">—</div>}
            {(p.numerosExtras ?? []).map((n, i) => <div key={i} className="text-xs flex items-center gap-1.5"><span className="text-muted-foreground">{n.rotulo || "nº"}:</span><span className="font-mono">{n.valor}</span><button onClick={() => copiar(n.valor)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" /></button></div>)}
            {p.portalUrl && <a href={p.portalUrl} target="_blank" rel="noreferrer" className="text-xs text-info hover:underline inline-flex items-center gap-1">Abrir portal <ExternalLink className="w-3 h-3" /></a>}
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pessoas</div>
            <div>Interessado: {p.interessadoTipo === "PESSOA" ? p.interessadoNome ?? "pessoa física" : p.interessadoNome || "a empresa"}</div>
            <div className="text-xs text-muted-foreground">Responsável: {p.responsavel?.nome ?? "—"}</div>
            {p.advogado && <div className="text-xs text-muted-foreground">Advogado/despachante: {p.advogado}</div>}
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Andamento</div>
            <div className="text-xs">{p.abertoEm ? `Aberto em ${fmtData(p.abertoEm)}` : "Abertura não informada"}</div>
            <div className="text-xs text-muted-foreground">{ultimo ? `Último: ${fmtData(ultimo.data)} (há ${diasDesde(ultimo.data)}d)` : "Sem andamento"}</div>
            {pendentes[0] && <div className="text-xs">Próximo prazo: <PrazoChip vence={pendentes[0].vence} avisoDias={pendentes[0].avisoDias} /></div>}
            {p.valorCausa && <div className="text-xs text-muted-foreground">Em discussão: {fmtBRL(p.valorCausa)}{p.riscoPerda ? ` · risco ${RISCOS[p.riscoPerda]?.toLowerCase()}` : ""}</div>}
          </div>
          {p.pendencias.length > 0 && <div className="md:col-span-4 flex flex-wrap gap-2">{p.pendencias.map((x, i) => <span key={i} className={cn("text-xs px-2 py-0.5 rounded-full border", x.severidade === "ALTA" ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/30 bg-warning/10 text-warning")}>{x.titulo}</span>)}</div>}
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={cn("text-sm px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-1.5", aba === a.id ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {a.label}{a.n != null && <span className="text-[11px] rounded-full px-1.5 bg-muted text-muted-foreground tabular-nums">{a.n}</span>}
            </button>
          ))}
        </div>

        {aba === "linha" && (
          <div className="bg-card border border-border rounded-xl p-4">
            {(p.datajudAtivo || p.datajudUltimaConsulta) && (
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Landmark className="w-3.5 h-3.5" />
                <span>{p.datajudUltimaConsulta ? `Atualizado do tribunal ${haQuanto(p.datajudUltimaConsulta)}` : "Ainda não consultado no tribunal"}{p.datajudTribunal && ` · ${p.datajudTribunal.toUpperCase()}`}{!p.datajudAtivo && " · acompanhamento desligado"}</span>
                {pode && <button onClick={atualizarTribunal} disabled={atualizando} className="text-info hover:underline inline-flex items-center gap-1 disabled:opacity-50">· <RefreshCw className={cn("w-3 h-3", atualizando && "animate-spin")} /> {atualizando ? "Consultando…" : "Atualizar agora"}</button>}
                {p.datajudUltimoErro && <span className="w-full text-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {p.datajudUltimoErro}</span>}
              </div>
            )}
            {(p.datajudClasse || p.datajudOrgaoJulgador) && <p className="text-xs text-muted-foreground mb-2">{[p.datajudClasse, p.datajudOrgaoJulgador].filter(Boolean).join(" · ")}</p>}
            {p.assunto && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{p.assunto}</p>}
            {p.andamentos.some((a) => a.origem === "DATAJUD") && (
              <div className="mb-4 flex items-center gap-2 text-xs">
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(["importantes", "todos"] as const).map((f) => (
                    <button key={f} onClick={() => setFiltroLinha(f)} className={cn("px-2.5 py-1 rounded-md", filtroLinha === f ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>{f === "importantes" ? "Importantes" : "Todos"}</button>
                  ))}
                </div>
                {ocultos > 0 && <span className="text-muted-foreground">{ocultos} movimento(s) de rotina ocultos</span>}
              </div>
            )}
            {linhaTempo.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhum andamento ainda.{pode && <> <button className="text-info hover:underline" onClick={() => novoAndamento("PROTOCOLO")}>Lançar o primeiro</button>.</>}</p> : (
              <ol className="relative border-l border-border ml-2 space-y-4">
                {linhaTempo.map((it) => it.k === "p" ? (
                  <li key={`p${it.pr.id}`} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-warning bg-card" />
                    <div className="text-xs"><b className="text-foreground">Prazo</b> · <PrazoChip vence={it.pr.vence} avisoDias={it.pr.avisoDias} /></div>
                    <div className="text-sm">{it.pr.descricao}</div>
                  </li>
                ) : (
                  <li key={it.a.id} className="ml-4 group">
                    <span className={cn("absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full", it.a.importancia === "ALTA" ? "bg-danger" : it.a.importancia === "ROTINA" ? "bg-muted-foreground/40" : "bg-info")} />
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2"><b className="text-foreground">{TIPOS_ANDAMENTO[it.a.tipo] ?? it.a.tipo}</b> · {fmtData(it.a.data)}
                      {it.a.origem === "DATAJUD" ? <span className="inline-flex items-center gap-1" title="Capturado automaticamente do tribunal (DataJud)"><Landmark className="w-3 h-3" /> capturado do tribunal</span> : it.a.usuario && ` · ${it.a.usuario}`}
                      {SELO_IMPORTANCIA[it.a.importancia] && <span className={cn("text-[10px] px-1.5 py-px rounded-full border", SELO_IMPORTANCIA[it.a.importancia].cls)}>{SELO_IMPORTANCIA[it.a.importancia].label}</span>}
                      {it.a.interno && <span className="text-[10px] px-1.5 py-px rounded-full border border-border bg-muted inline-flex items-center gap-0.5" title="Não aparece no link externo"><EyeOff className="w-2.5 h-2.5" /> interno</span>}
                      {pode && <button onClick={() => alternarInterno(it.a)} className="opacity-0 group-hover:opacity-100 hover:text-foreground" title={it.a.interno ? "Mostrar no link externo" : "Marcar como interno (some do link externo)"}><EyeOff className="w-3 h-3" /></button>}
                      {pode && <button onClick={() => removerAndamento(it.a)} className="opacity-0 group-hover:opacity-100 hover:text-danger" title="Remover"><Trash2 className="w-3 h-3" /></button>}</div>
                    {it.a.resumoIa ? <>
                      <div className="text-sm whitespace-pre-wrap">{it.a.resumoIa}</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{it.a.descricao}</div>
                    </> : <div className={cn("text-sm whitespace-pre-wrap", it.a.origem === "DATAJUD" && it.a.importancia === "ROTINA" && "text-muted-foreground")}>{it.a.descricao}</div>}
                    {it.a.documentoId && <Link href={`/documentos/${it.a.documentoId}`} className="text-xs text-info hover:underline inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {p.documentos.find((d) => d.id === it.a.documentoId)?.titulo ?? "Documento"}</Link>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {aba === "prazos" && (
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-semibold">Prazo</th><th className="text-left px-3 py-2 font-semibold">Vence</th><th className="text-left px-3 py-2 font-semibold">Situação</th><th /></tr></thead>
              <tbody>
                {p.prazos.map((pr) => (
                  <tr key={pr.id} className={cn("border-t border-border/60", pr.status !== "PENDENTE" && "opacity-60")}>
                    <td className="px-4 py-2">{pr.descricao}{pr.motivo && <div className="text-[11px] text-muted-foreground">{pr.motivo}</div>}
                      {pr.prazoDias != null && pr.inicioContagem && <div className="text-[11px] text-muted-foreground">{descreverContagem(pr.prazoDias, pr.diasUteis, pr.inicioContagem)}{pr.suspensaoForense && " · com recesso forense"}</div>}
                      {pr.fundamento && <div className="text-[11px] text-muted-foreground italic line-clamp-2" title={pr.fundamento}>“{pr.fundamento}”</div>}</td>
                    <td className="px-3 py-2"><PrazoChip vence={pr.vence} avisoDias={pr.avisoDias} status={pr.status} /><div className="text-[11px] text-muted-foreground">avisa {pr.avisoDias} dia(s) antes</div></td>
                    <td className="px-3 py-2 text-xs">{pr.status === "PENDENTE" ? "Pendente" : pr.status === "CUMPRIDO" ? `Cumprido ${fmtData(pr.cumpridoEm)}` : `Dispensado ${fmtData(pr.cumpridoEm)}`}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-xs">{pode && (pr.status === "PENDENTE" ? <>
                      <button onClick={() => acaoPrazo(pr, "cumprir")} className="text-success hover:underline inline-flex items-center gap-1"><Check className="w-3 h-3" /> cumprido</button>
                      <button onClick={() => acaoPrazo(pr, "dispensar")} className="ml-3 text-muted-foreground hover:underline">dispensar</button>
                    </> : <button onClick={() => acaoPrazo(pr, "reabrir")} className="text-muted-foreground hover:underline inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> reabrir</button>)}
                      {pode && <button onClick={() => removerPrazo(pr)} className="ml-3 text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5 inline" /></button>}</td>
                  </tr>
                ))}
                {p.prazos.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum prazo. Prazos avisam o responsável no sino e no Telegram.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {aba === "documentos" && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {pode && <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setNovoDoc(true)}><Plus className="w-3.5 h-3.5" /> Enviar documento</Button>
              <div className="w-96"><ComboboxWithCreate value={ligar} onChange={(v) => { setLigar(v); ligarDocumento(v); }} allowNone={false} options={docsLivres} placeholder="Ligar documento que já está no GED…" menuMinWidth={460} /></div>
            </div>}
            {p.documentos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum documento ligado.</p> : (
              <ul className="divide-y divide-border/60">
                {p.documentos.map((d) => (
                  <li key={d.id} className="py-2 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Link href={`/documentos/${d.id}`} className="text-sm hover:underline">{d.titulo}</Link>
                      <div className="text-[11px] text-muted-foreground">{d.categoria.nome}{d.numero && ` · nº ${d.numero}`}{d.emissao && ` · ${fmtData(d.emissao)}`}{d.versaoVigente && ` · ${(d.versaoVigente.tamanho / 1024 / 1024).toFixed(1)} MB`}{d.confidencial && " · confidencial"}</div>
                    </div>
                    {pode && <button onClick={() => desligarDocumento(d)} className="text-muted-foreground hover:text-danger" title="Desligar do processo"><X className="w-4 h-4" /></button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aba === "partes" && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {pode && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setParte({ papel: "ORGAO", nome: "", documento: "", contato: "" })}><Plus className="w-3.5 h-3.5" /> Parte</Button>}
            {p.partes.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhuma parte cadastrada (órgão, advogado, técnico responsável…).</p> : (
              <table className="w-full text-sm"><tbody>{p.partes.map((x) => (
                <tr key={x.id} className="border-t border-border/60 first:border-t-0">
                  <td className="py-2 text-xs text-muted-foreground w-32">{PAPEIS_PARTE[x.papel] ?? x.papel}</td><td className="py-2">{x.nome}{x.documento && <span className="text-xs text-muted-foreground"> · {x.documento}</span>}</td>
                  <td className="py-2 text-xs text-muted-foreground">{x.contato}</td>
                  <td className="py-2 text-right">{pode && <button onClick={() => removerParte(x)} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                </tr>
              ))}</tbody></table>
            )}
            <div className="pt-3 border-t border-border"><BensProcesso processoId={p.id} bens={p.bens} pode={pode} onMudou={load} /></div>
          </div>
        )}

        {aba === "acesso" && <AbaAcesso processoId={p.id} />}
        {aba === "financeiro" && <AbaFinanceiro processo={{ id: p.id, codigo: p.codigo }} />}
        {aba === "externo" && <AbaExterno processo={{ id: p.id, codigo: p.codigo, titulo: p.titulo }} documentos={p.documentos.map((d) => ({ id: d.id, titulo: d.titulo }))} pode={pode} onMudou={load} />}

        {aba === "dados" && (
          <div className="bg-card border border-border rounded-xl p-4">
            {pode ? <ProcessoForm inicial={inicialForm} processoId={p.id} onSalvo={load} /> : (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Esfera</dt><dd>{p.esfera ? ESFERAS[p.esfera] : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Imóvel / bem</dt><dd>{p.imovel ?? "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Observações</dt><dd className="whitespace-pre-wrap">{p.observacoes ?? "—"}</dd></div>
              </dl>
            )}
            {pode && <div className="mt-6 pt-4 border-t border-border flex justify-end"><Button variant="outline" className="text-danger gap-1.5" onClick={() => setDel(true)}><Trash2 className="w-4 h-4" /> Excluir processo</Button></div>}
          </div>
        )}
      </div>

      {/* Lançar andamento */}
      <Dialog open={!!and} onOpenChange={(v) => !v && setAnd(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Lançar andamento</DialogTitle></DialogHeader>
          {and && <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Data</Label><DatePicker value={and.data} onChange={(v) => setAnd({ ...and, data: v ?? "" })} /></div>
              <div className="sm:col-span-2"><Label>Tipo</Label><SelectMenu value={and.tipo} onChange={(v) => setAnd({ ...and, tipo: v })} options={Object.entries(TIPOS_ANDAMENTO).map(([value, label]) => ({ value, label }))} /></div>
            </div>
            <div><Label>O que aconteceu</Label><Textarea rows={3} autoFocus value={and.descricao} onChange={(e) => setAnd({ ...and, descricao: e.target.value })} /></div>
            <div><Label>Documento (opcional)</Label><ComboboxWithCreate value={and.documentoId} onChange={(v) => setAnd({ ...and, documentoId: v })} allowNone options={[...p.documentos.map((d) => ({ value: d.id, label: d.titulo, code: "deste processo" })), ...docsLivres]} placeholder="Escolha um documento do GED" menuMinWidth={460} /></div>
            <div><Label>Situação depois deste andamento</Label><SelectMenu value={and.situacao} onChange={(v) => setAnd({ ...and, situacao: v })} options={[{ value: "__auto", label: "Automática pelo tipo (exigência → aguardando a empresa; protocolo/resposta → aguardando o órgão)" }, ...Object.entries(SITUACOES).map(([value, s]) => ({ value, label: s.label }))]} /></div>
            {pendentes.length > 0 && <div><Label>Este andamento cumpre o prazo…</Label><SelectMenu value={and.cumpre} onChange={(v) => setAnd({ ...and, cumpre: v })} options={[{ value: "", label: "—" }, ...pendentes.map((x) => ({ value: x.id, label: `${x.descricao} (${fmtData(x.vence)})` }))]} /></div>}
            <div className={cn("rounded-lg border p-3 space-y-2", and.tipo === "EXIGENCIA" || and.tipo === "DECISAO" ? "border-warning/40 bg-warning/5" : "border-border")}>
              <div className="text-xs font-medium">Abrir prazo {and.tipo === "EXIGENCIA" ? "para atender a exigência" : "(opcional)"}</div>
              <Input value={and.prazoDesc} onChange={(e) => setAnd({ ...and, prazoDesc: e.target.value })} placeholder="Ex.: apresentar certidão de inteiro teor" />
              <div className="grid grid-cols-2 gap-2">
                <DatePicker value={and.prazoVence} onChange={(v) => setAnd({ ...and, prazoVence: v ?? "" })} />
                <Input inputMode="numeric" value={and.prazoAviso} onChange={(e) => setAnd({ ...and, prazoAviso: e.target.value })} placeholder="avisar N dias antes" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="rounded" checked={and.interno} onChange={(e) => setAnd({ ...and, interno: e.target.checked })} /> Interno — não aparece para advogado/despachante no link externo</label>
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setAnd(null)}>Cancelar</Button><Button onClick={salvarAndamento} disabled={salvando || !and?.descricao.trim()}>{salvando ? "Salvando…" : "Lançar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo prazo */}
      <Dialog open={!!prazo} onOpenChange={(v) => !v && setPrazo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo prazo</DialogTitle></DialogHeader>
          {prazo && <div className="space-y-3">
            <div><Label>Prazo</Label><Input autoFocus value={prazo.descricao} onChange={(e) => setPrazo({ ...prazo, descricao: e.target.value })} placeholder="Ex.: pagar taxa de vistoria" /></div>
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              {(["data", "contagem"] as const).map((m) => <button key={m} type="button" onClick={() => setPrazo({ ...prazo, modo: m })} className={cn("px-2.5 py-1 rounded-md", prazo.modo === m ? "bg-muted text-foreground font-medium" : "text-muted-foreground")}>{m === "data" ? "Data de vencimento" : "Contar em dias"}</button>)}
            </div>
            {prazo.modo === "data" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Vence em</Label><DatePicker value={prazo.vence} onChange={(v) => setPrazo({ ...prazo, vence: v ?? "" })} /></div>
                <div><Label>Avisar (dias antes)</Label><Input inputMode="numeric" value={prazo.avisoDias} onChange={(e) => setPrazo({ ...prazo, avisoDias: e.target.value })} /></div>
              </div>
            ) : (<>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Ciência / intimação</Label><DatePicker value={prazo.inicio} onChange={(v) => setPrazo({ ...prazo, inicio: v ?? "" })} /></div>
                <div><Label>Dias</Label><Input inputMode="numeric" value={prazo.dias} onChange={(e) => setPrazo({ ...prazo, dias: e.target.value.replace(/\D/g, "") })} /></div>
                <div><Label>Contagem</Label><SelectMenu value={prazo.uteis ? "U" : "C"} onChange={(v) => setPrazo({ ...prazo, uteis: v === "U" })} options={[{ value: "U", label: "Dias úteis" }, { value: "C", label: "Dias corridos" }]} /></div>
              </div>
              {p.tipo === "JUDICIAL" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="rounded" checked={prazo.suspensao} onChange={(e) => setPrazo({ ...prazo, suspensao: e.target.checked })} /> Suspender de 20/12 a 20/01 (recesso forense, CPC art. 220)</label>}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div><Label>Avisar (dias antes)</Label><Input inputMode="numeric" value={prazo.avisoDias} onChange={(e) => setPrazo({ ...prazo, avisoDias: e.target.value })} /></div>
                <div className="text-sm pb-2">{vencePrazo ? <>Vence em <b>{fmtData(vencePrazo)}</b></> : <span className="text-muted-foreground">—</span>}</div>
              </div>
              <p className="text-[11px] text-muted-foreground">Exclui o dia da ciência e inclui o do vencimento; sábados, domingos e feriados (nacionais, Amapá e Macapá) não contam em dias úteis; vencimento em dia não útil passa para o próximo útil.</p>
            </>)}
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPrazo(null)}>Cancelar</Button><Button onClick={salvarPrazo} disabled={salvando || !prazo?.descricao.trim() || !vencePrazo}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parte */}
      <Dialog open={!!parte} onOpenChange={(v) => !v && setParte(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova parte</DialogTitle></DialogHeader>
          {parte && <div className="space-y-3">
            <div><Label>Papel</Label><SelectMenu value={parte.papel} onChange={(v) => setParte({ ...parte, papel: v })} options={Object.entries(PAPEIS_PARTE).map(([value, label]) => ({ value, label }))} /></div>
            <div><Label>Nome</Label><Input value={parte.nome} onChange={(e) => setParte({ ...parte, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF/CNPJ/OAB</Label><Input value={parte.documento} onChange={(e) => setParte({ ...parte, documento: e.target.value })} /></div>
              <div><Label>Contato</Label><Input value={parte.contato} onChange={(e) => setParte({ ...parte, contato: e.target.value })} placeholder="e-mail / telefone" /></div>
            </div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setParte(null)}>Cancelar</Button><Button onClick={salvarParte} disabled={!parte?.nome.trim()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {docLanc && <DocumentoProcessoDialog processo={{ id: p.id, codigo: p.codigo, tipo: p.tipo }} onFechar={() => setDocLanc(false)} onConcluido={(_id, aviso) => { setDocLanc(false); if (aviso) setMsg(aviso); load(); }} />}
      {novoDoc && <DocumentoCreateDrawer vinculo={{ tipo: "processo", id: p.id }} onFechar={() => setNovoDoc(false)} onCriado={() => { setNovoDoc(false); load(); }} />}
      <ConfirmDialog open={del} onOpenChange={setDel} title="Excluir processo?" description={`${p.codigo} — ${p.titulo}. Vai para a lixeira; os documentos continuam no GED sem vínculo.`} onConfirm={excluir} loading={excluindo} confirmLabel="Excluir" />
    </div>
  );
}
