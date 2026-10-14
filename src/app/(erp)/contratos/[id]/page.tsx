"use client";

// Página do contrato: cabeçalho com status/semáforo/ações e abas Resumo,
// Documentos, Aditivos e Histórico. Termos vigentes vêm do motor.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import DocumentosDaEntidade from "@/components/documentos/DocumentosDaEntidade";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown, Paperclip, FileText, Trash2, Pencil, Play, Pause, RotateCcw, XCircle, CheckCircle2, PenLine, MessageSquare } from "lucide-react";
import ContratoForm, { valoresDeContrato } from "@/components/contratos/ContratoForm";
import { StatusBadge, Semaforo, SeveridadeBadge, TIPO_CONTRATO, TIPO_EVENTO, TIPO_ADITIVO, LADO, RENOVACAO, MODALIDADE, PERIODICIDADE, REAJUSTE, INDICE, MESES, fmtBRL, fmtData, hojeISO, nomeParte, type Pendencia } from "@/components/contratos/comum";

type Aditivo = { id: string; numero: number; tipo: string; efeitoEm: string; descricao: string; novoFim: string | null; novoValor: string | null; novaPeriodicidade: string | null; novoReajusteTipo: string | null; novoReajusteIndice: string | null; novoReajustePercentual: string | null; documentoId: string | null; assinadoEm: string | null };
type Contrato = {
  id: string; numero: string; titulo: string; tipo: string; lado: string; status: string; objeto: string | null; inicio: string; fim: string | null; fimVigente: string | null;
  renovacao: string; renovacaoMeses: number | null; avisoPrevioDias: number | null; modalidade: string; valor: string | null; valorTotalEstimado: string | null; periodicidade: string | null; diaVencimento: number | null; primeiroVencimento: string | null;
  reajusteTipo: string; reajusteIndice: string | null; reajustePercentual: string | null; reajusteMesBase: number | null; reajusteProximo: string | null;
  multaRescisoria: string | null; garantia: string | null; documentoId: string | null; assinadoEm: string | null; observacoes: string | null; tags: string[]; encerradoEm: string | null; motivoEncerramento: string | null;
  fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null; cliente: { id: string; razaoSocial: string; nomeFantasia: string | null } | null; responsavel: { id: string; nome: string };
  centroCusto: { codigo: string; nome: string } | null; naturezaFinanceira: { codigo: string | null; nome: string } | null;
  termos: { valor: number | null; periodicidade: string | null; fim: string | null; reajusteTipo: string; reajusteIndice: string | null; reajustePercentual: number | null; aditivosAplicados: number[] };
  valorMensal: number; eventosProjetados: { tipo: string; data: string; descricao: string }[];
  eventos: { id: string; tipo: string; data: string; descricao: string; projetado: boolean }[];
  documentos: { id: string; titulo: string; validade: string | null; status: string; createdAt: string; categoria: { nome: string; slug: string }; versaoVigente: { nome: string } | null }[];
  aditivos: Aditivo[]; pendencias: Pendencia[]; semaforo: "OK" | "ATENCAO" | "CRITICO";
  fornecedorId: string | null; clienteId: string | null; responsavelId: string; centroCustoId: string | null; naturezaFinanceiraId: string | null;
};
type Aba = "resumo" | "documentos" | "aditivos" | "historico";

export default function ContratoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Contrato | null>(null); const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("resumo");
  useTabTitle(c ? `${c.numero} · ${c.titulo}` : "Contrato");
  const load = useCallback(async () => { const j = await fetch(`/api/contratos/${id}`).then((r) => r.json()).catch(() => null); setC(j?.data ?? null); setLoading(false); }, [id]);
  useEffect(() => { load(); }, [load]);

  // ações
  const [acao, setAcao] = useState<null | "RENOVAR" | "RESCINDIR" | "ENCERRAR" | "SUSPENDER" | "ASSINAR" | "OBSERVACAO">(null);
  const [aData, setAData] = useState(hojeISO()); const [aMotivo, setAMotivo] = useState(""); const [aNovoFim, setANovoFim] = useState(""); const [aNovoValor, setANovoValor] = useState("");
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  async function executar(a: string, body: Record<string, unknown> = {}) {
    setSaving(true); setErro("");
    const res = await fetch(`/api/contratos/${id}/acoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: a, ...body }) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return false; }
    setAcao(null); load(); return true;
  }
  const [editar, setEditar] = useState(false);
  const [del, setDel] = useState(false);
  async function excluir() { setSaving(true); const res = await fetch(`/api/contratos/${id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) { alert(j.error || "Erro"); setDel(false); return; } router.push("/contratos/lista"); }

  // aditivo
  const [dlgAd, setDlgAd] = useState(false);
  const [ad, setAd] = useState({ tipo: "PRAZO", efeitoEm: hojeISO(), descricao: "", novoFim: "", novoValor: "", novaPeriodicidade: "", novoReajusteTipo: "", novoReajusteIndice: "", novoReajustePercentual: "", assinadoEm: "" });
  async function salvarAditivo() {
    setSaving(true); setErro("");
    const res = await fetch(`/api/contratos/${id}/aditivos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ad) });
    const j = await res.json().catch(() => ({})); setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setDlgAd(false); setAd({ tipo: "PRAZO", efeitoEm: hojeISO(), descricao: "", novoFim: "", novoValor: "", novaPeriodicidade: "", novoReajusteTipo: "", novoReajusteIndice: "", novoReajustePercentual: "", assinadoEm: "" }); load();
  }
  const [delAd, setDelAd] = useState<Aditivo | null>(null);
  async function excluirAditivo() { if (!delAd) return; setSaving(true); const res = await fetch(`/api/contratos/${id}/aditivos?id=${delAd.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) alert(j.error || "Erro"); setDelAd(null); load(); }

  // upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [upTipo, setUpTipo] = useState<"contrato" | "aditivo" | "garantia" | "outro">("contrato");
  const [upAditivoId, setUpAditivoId] = useState<string | null>(null);
  const [upAssinadoEm, setUpAssinadoEm] = useState("");
  const [enviando, setEnviando] = useState(false);
  function pedirArquivo(tipo: typeof upTipo, aditivoId: string | null = null) { setUpTipo(tipo); setUpAditivoId(aditivoId); fileRef.current?.click(); }
  async function enviar(file: File) {
    setEnviando(true); setErro("");
    const fd = new FormData(); fd.append("file", file); fd.append("tipo", upTipo);
    if (upAditivoId) fd.append("aditivoId", upAditivoId);
    if (upAssinadoEm) fd.append("assinadoEm", upAssinadoEm);
    const res = await fetch(`/api/contratos/${id}/documentos`, { method: "POST", body: fd }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setEnviando(false);
    if (!res?.ok) { setErro(j?.error || "Falha no upload"); return; }
    load();
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!c) return <p className="px-8 py-8 text-sm text-danger">Contrato não encontrado.</p>;
  const ativo = ["VIGENTE", "EM_RENOVACAO"].includes(c.status);
  const encerrado = ["ENCERRADO", "RESCINDIDO"].includes(c.status);
  const contraparte = c.fornecedor ?? c.cliente;
  const ordem = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];
  const Linha = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex gap-3 py-1.5 text-sm border-b border-border/40 last:border-0"><span className="w-44 shrink-0 text-muted-foreground">{k}</span><span className="text-foreground">{v}</span></div>;

  return (
    <div>
      <PageHeader title={`${c.numero} · ${c.titulo}`}
        subtitle={[TIPO_CONTRATO[c.tipo], `${LADO[c.lado]?.label} · ${nomeParte(contraparte)}`, `responsável ${c.responsavel.nome}`].join(" — ")}
        breadcrumbs={[{ label: "Contratos", href: "/contratos" }, { label: "Lista", href: "/contratos/lista" }, { label: c.numero }]}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge s={c.status} /><Semaforo s={c.semaforo} />
            {c.status === "MINUTA" && <Button size="sm" variant="outline" onClick={() => setEditar(true)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" /> Editar</Button>}
            {c.status === "MINUTA" && <Button size="sm" onClick={() => executar("ATIVAR")} disabled={saving} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Play className="w-3.5 h-3.5" /> Ativar</Button>}
            {!encerrado && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>Ações <ChevronDown className="w-3.5 h-3.5 ml-1" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {!c.status.startsWith("MINUTA") && <DropdownMenuItem onClick={() => setEditar(true)}><Pencil className="w-4 h-4 mr-2" /> Editar dados administrativos</DropdownMenuItem>}
                  {!c.assinadoEm && <DropdownMenuItem onClick={() => { setAData(hojeISO()); setAcao("ASSINAR"); }}><PenLine className="w-4 h-4 mr-2" /> Registrar assinatura</DropdownMenuItem>}
                  {ativo && <DropdownMenuItem onClick={() => { setANovoFim(""); setANovoValor(""); setAMotivo(""); setAcao("RENOVAR"); }}><RotateCcw className="w-4 h-4 mr-2" /> Renovar (aditivo de prazo)</DropdownMenuItem>}
                  {ativo && <DropdownMenuItem onClick={() => { setAd((x) => ({ ...x, efeitoEm: hojeISO() })); setDlgAd(true); }}><FileText className="w-4 h-4 mr-2" /> Novo aditivo</DropdownMenuItem>}
                  {ativo && <DropdownMenuItem onClick={() => { setAMotivo(""); setAcao("SUSPENDER"); }}><Pause className="w-4 h-4 mr-2" /> Suspender</DropdownMenuItem>}
                  {c.status === "SUSPENSO" && <DropdownMenuItem onClick={() => executar("REATIVAR")}><Play className="w-4 h-4 mr-2" /> Reativar</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => { setAMotivo(""); setAcao("OBSERVACAO"); }}><MessageSquare className="w-4 h-4 mr-2" /> Anotar no histórico</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {(ativo || c.status === "SUSPENSO") && <DropdownMenuItem onClick={() => { setAData(hojeISO()); setAMotivo(""); setAcao("ENCERRAR"); }}><CheckCircle2 className="w-4 h-4 mr-2" /> Encerrar (fim da vigência)</DropdownMenuItem>}
                  {(ativo || c.status === "SUSPENSO") && <DropdownMenuItem variant="destructive" onClick={() => { setAData(hojeISO()); setAMotivo(""); setAcao("RESCINDIR"); }}><XCircle className="w-4 h-4 mr-2" /> Rescindir</DropdownMenuItem>}
                  {c.status === "MINUTA" && <DropdownMenuItem variant="destructive" onClick={() => setDel(true)}><Trash2 className="w-4 h-4 mr-2" /> Excluir minuta</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {encerrado && <Button size="sm" variant="outline" onClick={() => setDel(true)} className="gap-1.5 text-danger"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>}
          </div>
        } />

      <div className="px-8 pb-8 space-y-4">
        {erro && <p className="text-sm text-danger">{erro}</p>}
        {c.pendencias.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-2 flex flex-wrap gap-2">
            {[...c.pendencias].sort((a, b) => ordem.indexOf(a.severidade) - ordem.indexOf(b.severidade)).map((p, i) => <span key={i} className="inline-flex items-center gap-2 text-sm"><SeveridadeBadge s={p.severidade} /><span className="text-foreground">{p.titulo}</span>{p.detalhe && <span className="text-xs text-muted-foreground">— {p.detalhe}</span>}</span>)}
          </div>
        )}
        <div className="flex items-center gap-1 border-b border-border">
          {([["resumo", "Resumo"], ["documentos", `Documentos (${c.documentos.length})`], ["aditivos", `Aditivos (${c.aditivos.length})`], ["historico", "Histórico"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} className={cn("px-3 py-2 text-sm -mb-px border-b-2", aba === k ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>

        {aba === "resumo" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Termos vigentes{c.termos.aditivosAplicados.length > 0 && <span className="text-xs text-muted-foreground font-normal"> · com aditivo(s) {c.termos.aditivosAplicados.join(", ")}</span>}</h2></div>
                <div className="px-4 py-2">
                  <Linha k="Contraparte" v={contraparte ? <Link href={c.fornecedor ? `/suprimentos/fornecedores/${c.fornecedor.id}` : `/clientes/${c.cliente!.id}`} className="text-info hover:underline">{nomeParte(contraparte)}</Link> : "—"} />
                  <Linha k="Objeto" v={c.objeto || <span className="text-muted-foreground">—</span>} />
                  <Linha k="Vigência" v={<>{fmtData(c.inicio)} → {c.fimVigente ? fmtData(c.fimVigente) : "indeterminado"}{c.fimVigente && c.fim !== c.fimVigente && <span className="text-xs text-muted-foreground"> (original {fmtData(c.fim)})</span>}</>} />
                  <Linha k="Renovação" v={<>{RENOVACAO[c.renovacao]}{c.renovacao === "AUTOMATICA" && <span className="text-xs text-muted-foreground"> · {c.renovacaoMeses} meses · aviso prévio {c.avisoPrevioDias} dias</span>}</>} />
                  <Linha k="Valor" v={<>{c.termos.valor != null ? fmtBRL(c.termos.valor) : "—"} <span className="text-xs text-muted-foreground">{MODALIDADE[c.modalidade]}{c.termos.periodicidade ? ` · ${PERIODICIDADE[c.termos.periodicidade]}` : ""}{c.valorMensal ? ` · ${fmtBRL(c.valorMensal)}/mês` : ""}{c.valorTotalEstimado ? ` · teto ${fmtBRL(c.valorTotalEstimado)}` : ""}{c.diaVencimento ? ` · vence dia ${c.diaVencimento}` : ""}</span></>} />
                  <Linha k="Reajuste" v={<>{REAJUSTE[c.termos.reajusteTipo]}{c.termos.reajusteTipo === "INDICE" && ` · ${INDICE[c.termos.reajusteIndice ?? "OUTRO"]}`}{c.termos.reajusteTipo === "PERCENTUAL" && ` · ${c.termos.reajustePercentual}% a.a.`}{c.reajusteMesBase ? ` · aniversário em ${MESES[c.reajusteMesBase - 1]}` : ""}</>} />
                  <Linha k="Classificação" v={<>{c.centroCusto ? `${c.centroCusto.codigo} ${c.centroCusto.nome}` : "sem centro"} · {c.naturezaFinanceira ? c.naturezaFinanceira.nome : "sem natureza"}</>} />
                  {(c.multaRescisoria || c.garantia) && <Linha k="Multa / garantia" v={[c.multaRescisoria, c.garantia].filter(Boolean).join(" · ")} />}
                  <Linha k="Assinatura" v={c.assinadoEm ? <span className="text-success">assinado em {fmtData(c.assinadoEm)}</span> : <span className="text-warning">sem data de assinatura</span>} />
                  {c.encerradoEm && <Linha k={c.status === "RESCINDIDO" ? "Rescisão" : "Encerramento"} v={`${fmtData(c.encerradoEm)} — ${c.motivoEncerramento ?? ""}`} />}
                  {c.observacoes && <Linha k="Observações" v={<span className="whitespace-pre-wrap">{c.observacoes}</span>} />}
                </div>
              </section>
              <section className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between"><h2 className="font-semibold text-sm text-foreground">Documento do contrato</h2>
                  <div className="flex items-center gap-2">
                    {!c.documentoId && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">assinado em <DatePicker value={upAssinadoEm} onChange={setUpAssinadoEm} /></span>}
                    <Button size="sm" variant="outline" disabled={enviando} onClick={() => pedirArquivo("contrato")} className="gap-1.5">{enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} {c.documentoId ? "Substituir" : "Anexar contrato assinado"}</Button>
                  </div></div>
                <div className="px-4 py-3 text-sm">{c.documentoId ? <Link href={`/documentos/${c.documentoId}`} className="inline-flex items-center gap-1.5 text-info hover:underline"><FileText className="w-4 h-4" /> Abrir no GED</Link> : <p className="text-muted-foreground italic">Nenhum contrato anexado — o PDF assinado é a evidência que a auditoria pede.</p>}</div>
              </section>
            </div>
            <aside className="space-y-6">
              <section className="bg-card rounded-xl border border-border">
                <div className="px-4 py-3 border-b border-border bg-muted"><h2 className="font-semibold text-sm text-foreground">Próximos eventos</h2></div>
                {c.eventosProjetados.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground italic">{ativo ? "Nada previsto." : "Contrato não vigente."}</p> : (
                  <ul className="divide-y divide-border/60">
                    {c.eventosProjetados.map((e, i) => { const d = Math.ceil((new Date(e.data).getTime() - Date.now()) / 86_400_000); return (
                      <li key={i} className="px-4 py-2 text-sm"><div className="flex items-center justify-between"><span className="font-medium text-foreground">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span><span className={cn("text-xs tabular-nums", d < 0 ? "text-danger" : d <= 30 ? "text-warning" : "text-muted-foreground")}>{fmtData(e.data)} · {d < 0 ? `há ${-d} d` : `em ${d} d`}</span></div><p className="text-xs text-muted-foreground">{e.descricao}</p></li>
                    ); })}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )}

        {aba === "documentos" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => pedirArquivo("garantia")} className="gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Garantia / apólice</Button><Button size="sm" variant="outline" onClick={() => pedirArquivo("outro")} className="gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Outro anexo</Button></div>
            <DocumentosDaEntidade tipo="contrato" id={c.id} />
          </div>
        )}

        {aba === "aditivos" && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between"><h2 className="font-semibold text-sm text-foreground">Aditivos</h2>{ativo && <Button size="sm" onClick={() => setDlgAd(true)} className="bg-blue-600 hover:bg-blue-700">Novo aditivo</Button>}</div>
            {c.aditivos.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhum aditivo. Renovações, reajustes e mudanças de valor/prazo entram aqui.</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-1.5 font-semibold">Nº</th><th className="text-left px-3 py-1.5 font-semibold">Tipo</th><th className="text-left px-3 py-1.5 font-semibold">Efeito em</th><th className="text-left px-3 py-1.5 font-semibold">Descrição</th><th className="text-left px-3 py-1.5 font-semibold">Mudanças</th><th className="text-left px-3 py-1.5 font-semibold">Documento</th><th className="px-3 py-1.5"></th></tr></thead>
                <tbody>
                  {c.aditivos.map((a) => (
                    <tr key={a.id} className="border-t border-border/60">
                      <td className="px-4 py-2 tabular-nums">{a.numero}º</td><td className="px-3 py-2">{TIPO_ADITIVO[a.tipo] ?? a.tipo}</td><td className="px-3 py-2 text-muted-foreground">{fmtData(a.efeitoEm)}</td>
                      <td className="px-3 py-2 text-foreground">{a.descricao}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{[a.novoFim && `fim → ${fmtData(a.novoFim)}`, a.novoValor != null && `valor → ${fmtBRL(a.novoValor)}`, a.novaPeriodicidade && `periodicidade → ${PERIODICIDADE[a.novaPeriodicidade]}`, a.novoReajusteTipo && `reajuste → ${REAJUSTE[a.novoReajusteTipo]}`, a.novoReajustePercentual && `${a.novoReajustePercentual}%`].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-2 text-xs">{a.documentoId ? <Link href={`/documentos/${a.documentoId}`} className="text-info hover:underline inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {a.assinadoEm ? `assinado ${fmtData(a.assinadoEm)}` : "anexado"}</Link> : <button onClick={() => pedirArquivo("aditivo", a.id)} className="text-info hover:underline inline-flex items-center gap-1"><Paperclip className="w-3 h-3" /> anexar</button>}</td>
                      <td className="px-3 py-2 text-right">{a.numero === Math.max(...c.aditivos.map((x) => x.numero)) && !encerrado && <button onClick={() => setDelAd(a)} className="text-muted-foreground hover:text-danger" title="Remover último aditivo"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {aba === "historico" && (
          <div className="bg-card rounded-xl border border-border">
            <ul className="divide-y divide-border/60">
              {c.eventos.filter((e) => !e.projetado).map((e) => (
                <li key={e.id} className="px-4 py-2 flex items-start gap-3 text-sm"><span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{new Date(e.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span><span className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground whitespace-nowrap">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span><span className="text-foreground">{e.descricao}</span></li>
              ))}
              {c.eventos.filter((e) => !e.projetado).length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground italic">Sem histórico.</li>}
            </ul>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />

      {/* Editar */}
      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{c.status === "MINUTA" ? "Editar minuta" : "Editar dados administrativos"}</DialogTitle></DialogHeader>
          {c.status !== "MINUTA" && <p className="text-xs text-muted-foreground -mt-2">Contrato vigente: prazo, valor e reajuste mudam só por aditivo. Aqui você altera responsável, centro, natureza, objeto, garantias e observações.</p>}
          <ContratoForm contratoId={c.id} inicial={valoresDeContrato(c as unknown as Record<string, unknown>)} somenteAdministrativo={c.status !== "MINUTA"} onSalvo={() => { setEditar(false); load(); }} />
        </DialogContent>
      </Dialog>

      {/* Ações com formulário */}
      <Dialog open={!!acao} onOpenChange={(o) => !o && setAcao(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{{ RENOVAR: "Renovar contrato", RESCINDIR: "Rescindir contrato", ENCERRAR: "Encerrar contrato", SUSPENDER: "Suspender contrato", ASSINAR: "Registrar assinatura", OBSERVACAO: "Anotar no histórico" }[acao ?? "OBSERVACAO"]}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {acao === "RENOVAR" && <>
              <p className="text-sm text-muted-foreground">Gera um aditivo de prazo. Sem nova data, renova por {c.renovacaoMeses ?? 12} meses a partir de {c.fimVigente ? fmtData(c.fimVigente) : "hoje"}.</p>
              <div className="grid grid-cols-2 gap-3"><div><Label>Novo fim</Label><DatePicker value={aNovoFim} onChange={setANovoFim} /></div><div><Label>Novo valor (opcional)</Label><Input type="number" step="0.01" value={aNovoValor} onChange={(e) => setANovoValor(e.target.value)} /></div></div>
              <div><Label>Descrição</Label><Input value={aMotivo} onChange={(e) => setAMotivo(e.target.value)} placeholder="Ex.: renovação negociada com reajuste de 5%" /></div>
            </>}
            {(acao === "RESCINDIR" || acao === "ENCERRAR" || acao === "ASSINAR") && <div><Label>Data</Label><DatePicker value={aData} onChange={setAData} /></div>}
            {acao === "RESCINDIR" && c.multaRescisoria && <p className="text-xs text-warning">Multa prevista no contrato: {c.multaRescisoria}</p>}
            {(acao === "RESCINDIR" || acao === "ENCERRAR" || acao === "SUSPENDER" || acao === "OBSERVACAO") && <div><Label>{acao === "OBSERVACAO" ? "Texto" : "Motivo"}</Label><Textarea rows={3} value={aMotivo} onChange={(e) => setAMotivo(e.target.value)} /></div>}
            {acao === "RESCINDIR" && <p className="text-xs text-muted-foreground">Os eventos projetados são cancelados; anexe o distrato na aba Documentos.</p>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAcao(null)}>Cancelar</Button>
            <Button disabled={saving} className={acao === "RESCINDIR" ? "bg-danger hover:bg-danger/90" : ""} onClick={() => executar(acao!, acao === "RENOVAR" ? { novoFim: aNovoFim || null, novoValor: aNovoValor || null, descricao: aMotivo } : acao === "OBSERVACAO" ? { texto: aMotivo } : { data: aData, motivo: aMotivo })}>{saving ? "Salvando…" : "Confirmar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aditivo */}
      <Dialog open={dlgAd} onOpenChange={setDlgAd}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Novo aditivo ({c.aditivos.length + 1}º)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><SelectMenu value={ad.tipo} onChange={(v) => setAd({ ...ad, tipo: v })} options={Object.entries(TIPO_ADITIVO).map(([value, label]) => ({ value, label }))} /></div>
              <div><Label>Efeito a partir de</Label><DatePicker value={ad.efeitoEm} onChange={(v) => setAd({ ...ad, efeitoEm: v })} /></div>
              <div><Label>Assinado em</Label><DatePicker value={ad.assinadoEm} onChange={(v) => setAd({ ...ad, assinadoEm: v })} /></div>
            </div>
            <div><Label>Descrição</Label><Input value={ad.descricao} onChange={(e) => setAd({ ...ad, descricao: e.target.value })} placeholder="O que muda e por quê" /></div>
            <div className="grid grid-cols-3 gap-3">
              {(ad.tipo === "PRAZO" || ad.tipo === "OUTRO") && <div><Label>Novo fim</Label><DatePicker value={ad.novoFim} onChange={(v) => setAd({ ...ad, novoFim: v })} /></div>}
              {(ad.tipo === "VALOR" || ad.tipo === "REAJUSTE" || ad.tipo === "OUTRO") && <div><Label>Novo valor</Label><Input type="number" step="0.01" value={ad.novoValor} onChange={(e) => setAd({ ...ad, novoValor: e.target.value })} placeholder={c.termos.valor != null ? String(c.termos.valor) : ""} /></div>}
              {ad.tipo === "VALOR" && <div><Label>Nova periodicidade</Label><SelectMenu value={ad.novaPeriodicidade} onChange={(v) => setAd({ ...ad, novaPeriodicidade: v })} options={[{ value: "", label: "— mantém —" }, ...Object.entries(PERIODICIDADE).map(([value, label]) => ({ value, label }))]} /></div>}
              {ad.tipo === "REAJUSTE" && <div><Label>% aplicado</Label><Input type="number" step="0.01" value={ad.novoReajustePercentual} onChange={(e) => setAd({ ...ad, novoReajustePercentual: e.target.value })} /></div>}
            </div>
            {ad.tipo === "REAJUSTE" && <p className="text-xs text-muted-foreground">Informe o novo valor já reajustado; o próximo reajuste fica projetado para 12 meses após a data de efeito.</p>}
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlgAd(false)}>Cancelar</Button><Button onClick={salvarAditivo} disabled={saving}>{saving ? "Salvando…" : "Registrar aditivo"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={del} onOpenChange={setDel} title="Excluir contrato?" description={`${c.numero} — ${c.titulo}. Vai para a lixeira; os documentos ficam no GED sem vínculo.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
      <ConfirmDialog open={!!delAd} onOpenChange={(o) => !o && setDelAd(null)} title="Remover aditivo?" description={delAd ? `${delAd.numero}º aditivo — ${delAd.descricao}. O fim/valor voltam ao termo anterior.` : ""} onConfirm={excluirAditivo} loading={saving} confirmLabel="Remover" />
    </div>
  );
}
