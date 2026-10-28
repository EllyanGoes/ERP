"use client";

// Página do processo externo: cabeçalho (situação, números, portal), abas Linha do
// tempo · Prazos · Documentos · Partes · Dados. "Lançar andamento" e "Novo prazo"
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
import { Check, Copy, ExternalLink, FileText, Loader2, Lock, Plus, RotateCcw, Trash2, X } from "lucide-react";
import ProcessoForm, { type ProcessoValores } from "@/components/processos/ProcessoForm";
import {
  ESFERAS, PAPEIS_PARTE, PrazoChip, RISCOS, SITUACOES, SituacaoBadge, TIPOS_ANDAMENTO, TIPOS_PROCESSO, api, diasDesde, fmtBRL, fmtData, useLookups, type Pendencia,
} from "@/components/processos/comum";

type Andamento = { id: string; data: string; tipo: string; descricao: string; documentoId: string | null; usuario: string | null };
type Prazo = { id: string; descricao: string; vence: string; avisoDias: number; status: string; cumpridoEm: string | null; motivo: string | null; andamentoId: string | null };
type Parte = { id: string; papel: string; nome: string; documento: string | null; contato: string | null };
type Doc = { id: string; titulo: string; numero: string | null; emissao: string | null; confidencial: boolean; createdAt: string; categoria: { nome: string }; versaoVigente: { nome: string; tamanho: number } | null };
type Processo = {
  id: string; codigo: string; titulo: string; tipo: string; orgao: string; esfera: string | null; numero: string | null; numerosExtras: { rotulo: string; valor: string }[] | null;
  portalUrl: string | null; polo: string | null; interessadoTipo: string; interessadoNome: string | null; assunto: string | null; situacao: string; fase: string | null;
  abertoEm: string | null; encerradoEm: string | null; responsavelId: string | null; responsavel: { id: string; nome: string } | null; advogado: string | null;
  valorCausa: string | null; riscoPerda: string | null; confidencial: boolean; imovel: string | null; tags: string[]; observacoes: string | null; diasSemAndamentoAlerta: number;
  andamentos: Andamento[]; prazos: Prazo[]; partes: Parte[]; documentos: Doc[]; pendencias: Pendencia[];
};
const ABAS = ["linha", "prazos", "documentos", "partes", "dados"] as const;
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
  const load = useCallback(async () => {
    const j = await fetch(`/api/processos/${id}`).then((r) => r.json()).catch(() => ({}));
    if (!j.data) { setErro(j.error || "Processo não encontrado."); return; }
    setP(j.data); setPode(!!j.podeEditar);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // ── andamento ───────────────────────────────────────────────────────────────
  const [and, setAnd] = useState<{ data: string; tipo: string; descricao: string; documentoId: string; situacao: string; prazoDesc: string; prazoVence: string; prazoAviso: string; cumpre: string } | null>(null);
  const [msg, setMsg] = useState(""); const [salvando, setSalvando] = useState(false);
  const novoAndamento = (tipo = "MOVIMENTACAO") => { setMsg(""); setAnd({ data: new Date().toISOString().slice(0, 10), tipo, descricao: "", documentoId: "", situacao: "__auto", prazoDesc: "", prazoVence: "", prazoAviso: "5", cumpre: "" }); };
  async function salvarAndamento() {
    if (!and) return;
    setSalvando(true); setMsg("");
    const r = await api(`/api/processos/${id}/andamentos`, "POST", {
      data: and.data, tipo: and.tipo, descricao: and.descricao, documentoId: and.documentoId || null,
      ...(and.situacao === "__auto" ? {} : { mudarSituacao: and.situacao || null }),
      ...(and.prazoDesc.trim() && and.prazoVence ? { prazo: { descricao: and.prazoDesc, vence: and.prazoVence, avisoDias: Number(and.prazoAviso) || 5 } } : {}),
      ...(and.cumpre ? { cumprePrazoId: and.cumpre } : {}),
    });
    setSalvando(false);
    if (!r.ok) { setMsg(r.error!); return; }
    setAnd(null); load();
  }
  async function removerAndamento(a: Andamento) { if (!confirm("Remover este andamento?")) return; await api(`/api/processos/${id}/andamentos?andamentoId=${a.id}`, "DELETE"); load(); }

  // ── prazos ──────────────────────────────────────────────────────────────────
  const [prazo, setPrazo] = useState<{ descricao: string; vence: string; avisoDias: string } | null>(null);
  async function salvarPrazo() {
    if (!prazo) return;
    setSalvando(true); setMsg("");
    const r = await api(`/api/processos/${id}/prazos`, "POST", { descricao: prazo.descricao, vence: prazo.vence, avisoDias: Number(prazo.avisoDias) || 5 });
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

  const linhaTempo = useMemo(() => {
    if (!p) return [];
    const itens: ({ k: "a"; d: string; a: Andamento } | { k: "p"; d: string; pr: Prazo })[] = [
      ...p.andamentos.map((a) => ({ k: "a" as const, d: a.data, a })),
      ...p.prazos.filter((x) => x.status === "PENDENTE").map((pr) => ({ k: "p" as const, d: pr.vence, pr })),
    ];
    return itens.sort((x, y) => +new Date(y.d) - +new Date(x.d));
  }, [p]);
  const docsLivres = useMemo(() => lk.documentos.map((d) => ({ value: d.id, label: d.titulo, code: d.categoria.nome })), [lk.documentos]);

  if (!p) return erro ? <div className="p-8 text-sm text-danger">{erro}</div> : <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  const pendentes = p.prazos.filter((x) => x.status === "PENDENTE");
  const ultimo = p.andamentos[0];
  const inicialForm: Partial<ProcessoValores> = {
    titulo: p.titulo, tipo: p.tipo, orgao: p.orgao, esfera: p.esfera ?? "", numero: p.numero ?? "", portalUrl: p.portalUrl ?? "", polo: p.polo ?? "",
    interessadoTipo: p.interessadoTipo, interessadoNome: p.interessadoNome ?? "", assunto: p.assunto ?? "", situacao: p.situacao, fase: p.fase ?? "", abertoEm: dia(p.abertoEm),
    responsavelId: p.responsavelId ?? "", advogado: p.advogado ?? "", valorCausa: p.valorCausa ?? "", riscoPerda: p.riscoPerda ?? "", confidencial: p.confidencial,
    imovel: p.imovel ?? "", tags: p.tags.join(", "), observacoes: p.observacoes ?? "", diasSemAndamentoAlerta: String(p.diasSemAndamentoAlerta), numerosExtras: p.numerosExtras ?? [],
  };
  const abas: { id: Aba; label: string; n?: number }[] = [
    { id: "linha", label: "Linha do tempo", n: p.andamentos.length }, { id: "prazos", label: "Prazos", n: pendentes.length },
    { id: "documentos", label: "Documentos", n: p.documentos.length }, { id: "partes", label: "Partes", n: p.partes.length }, { id: "dados", label: "Dados" },
  ];
  const copiar = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

  return (
    <div>
      <PageHeader title={p.titulo} subtitle={`${p.codigo} · ${TIPOS_PROCESSO[p.tipo] ?? p.tipo} · ${p.orgao}`} breadcrumbs={[{ label: "Processos", href: "/processos" }, { label: "Lista", href: "/processos/lista" }, { label: p.codigo }]}
        action={pode ? <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => { setMsg(""); setPrazo({ descricao: "", vence: "", avisoDias: "5" }); }}><Plus className="w-4 h-4" /> Prazo</Button>
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
            {p.assunto && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{p.assunto}</p>}
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
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-info" />
                    <div className="text-xs text-muted-foreground flex items-center gap-2"><b className="text-foreground">{TIPOS_ANDAMENTO[it.a.tipo] ?? it.a.tipo}</b> · {fmtData(it.a.data)}{it.a.usuario && ` · ${it.a.usuario}`}
                      {pode && <button onClick={() => removerAndamento(it.a)} className="opacity-0 group-hover:opacity-100 hover:text-danger" title="Remover"><Trash2 className="w-3 h-3" /></button>}</div>
                    <div className="text-sm whitespace-pre-wrap">{it.a.descricao}</div>
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
                    <td className="px-4 py-2">{pr.descricao}{pr.motivo && <div className="text-[11px] text-muted-foreground">{pr.motivo}</div>}</td>
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
          </div>
        )}

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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vence em</Label><DatePicker value={prazo.vence} onChange={(v) => setPrazo({ ...prazo, vence: v ?? "" })} /></div>
              <div><Label>Avisar (dias antes)</Label><Input inputMode="numeric" value={prazo.avisoDias} onChange={(e) => setPrazo({ ...prazo, avisoDias: e.target.value })} /></div>
            </div>
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPrazo(null)}>Cancelar</Button><Button onClick={salvarPrazo} disabled={salvando || !prazo?.descricao.trim() || !prazo?.vence}>Salvar</Button></DialogFooter>
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

      {novoDoc && <DocumentoCreateDrawer vinculo={{ tipo: "processo", id: p.id }} onFechar={() => setNovoDoc(false)} onCriado={() => { setNovoDoc(false); load(); }} />}
      <ConfirmDialog open={del} onOpenChange={setDel} title="Excluir processo?" description={`${p.codigo} — ${p.titulo}. Vai para a lixeira; os documentos continuam no GED sem vínculo.`} onConfirm={excluir} loading={excluindo} confirmLabel="Excluir" />
    </div>
  );
}
