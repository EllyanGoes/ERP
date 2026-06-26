"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { ArrowLeft, RefreshCw, Flame, Ban, AlertTriangle, ArrowLeftRight, Printer, Paperclip, Upload, Trash2, FileText } from "lucide-react";

interface Etapa {
  id: string; sequencia: number; nome: string; centroTrabalho: string | null; estadoSaida: string | null; status: string;
  qtdEntrada: string | number | null; qtdSaida: string | number | null; qtdPerda: string | number | null;
  vagoes: number | null; vagonetas: number | null; apontadoPor: string | null;
}
interface ProdutoItem { itemId: string; quantidadePlanejada: string | number; quantidadeReal: string | number | null; item: { codigo: string; descricao: string; unidade?: { sigla: string } | null }; unidade: { sigla: string } | null; }
interface Consumo { id: string; descricao: string | null; quantidadeKg: string | number; milheirosProduzidos: string | number | null; }
interface Movimento { id: string; tipo: string; quantidade: string | number; saldoDepois: string | number; item: { codigo: string; descricao: string } | null; }
interface Anexo { id: string; nome: string; url: string; tamanho: number; tipo: string; criadoPor: string | null; createdAt: string; }
interface Ordem {
  id: string; numero: string; status: string; estadoAtual: string;
  quantidadePlanejada: string | number; unidade: string | null;
  criadoPor: string | null; dataPrevistaInicio: string | null; dataPrevistaFim: string | null;
  responsavelColaborador: { nome: string } | null;
  item: { codigo: string; descricao: string } | null;
  fluxoVersao: { versao: number; fluxo: { nome: string } } | null;
  produtoItens: ProdutoItem[];
  etapas: Etapa[];
  consumos: Consumo[];
  movimentacoes: Movimento[];
}

const STATUS_OP: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
  LIBERADA: { label: "Liberada", cls: "bg-info/10 text-info" },
  EM_PRODUCAO: { label: "Em produção", cls: "bg-warning/10 text-warning" },
  CONCLUIDA: { label: "Concluída", cls: "bg-success/10 text-success" },
  CANCELADA: { label: "Cancelada", cls: "bg-danger/10 text-danger" },
};
const ETAPA_STATUS: Record<string, string> = { PENDENTE: "bg-muted text-muted-foreground", EM_EXECUCAO: "bg-warning/15 text-warning", CONCLUIDA: "bg-success/15 text-success" };
const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const num = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));

export default function OrdemDetalhePage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const router = useRouter();
  useTabTitle("Ordem de Produção");

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [subindo, setSubindo] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pcp/ordens/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao carregar");
      setOrdem(j.data);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar"); }
  }, [id]);

  const loadAnexos = useCallback(async () => {
    try { const j = await fetch(`/api/pcp/ordens/${id}/anexos`).then((r) => r.json()); setAnexos(j.data ?? []); } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { if (id) { load(); loadAnexos(); } }, [id, load, loadAnexos]);

  async function cancelar() {
    if (!confirm("Cancelar esta OP?")) return;
    setBusy(true); setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELADA" }) });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro"); }
      await load();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function enviarArquivo(file: File) {
    setSubindo(true); setErro(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`/api/pcp/ordens/${id}/anexos`, { method: "POST", body: fd });
      if (!r.ok) { const j = await r.json(); throw new Error(j?.error ?? "Erro ao enviar"); }
      await loadAnexos();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao enviar arquivo"); } finally { setSubindo(false); }
  }
  async function excluirAnexo(anexoId: string) {
    try { await fetch(`/api/pcp/ordens/${id}/anexos/${anexoId}`, { method: "DELETE" }); await loadAnexos(); } catch { /* ignore */ }
  }

  if (erro && !ordem) return <div className="flex flex-col items-center justify-center h-full gap-2"><AlertTriangle className="w-7 h-7 text-amber-400" /><p className="text-sm text-muted-foreground">{erro}</p></div>;
  if (!ordem) return <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;

  const st = STATUS_OP[ordem.status] ?? { label: ordem.status, cls: "bg-muted" };
  const finalizada = ordem.status === "CONCLUIDA" || ordem.status === "CANCELADA";
  const linhas = ordem.produtoItens.length ? ordem.produtoItens : (ordem.item ? [{ itemId: "x", quantidadePlanejada: ordem.quantidadePlanejada, quantidadeReal: null, item: { ...ordem.item, unidade: null }, unidade: ordem.unidade ? { sigla: ordem.unidade } : null }] : []);
  const etapa = ordem.etapas[0];

  const Campo = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p><p className="text-sm font-medium text-foreground">{valor}</p></div>
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={ordem.numero}
        subtitle={`${ordem.fluxoVersao?.fluxo.nome ?? ""} · ${etapa?.centroTrabalho ?? etapa?.nome ?? ""}`}
        breadcrumbs={[{ label: "PCP" }, { label: "Ordens", href: "/pcp/ordens" }, { label: ordem.numero }]}
        action={
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", st.cls)}>{st.label}</span>
            <a href={`/pcp/ordens/${id}/imprimir`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
              <Printer className="w-4 h-4" /> Imprimir
            </a>
            {!finalizada && (
              <button onClick={cancelar} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
                <Ban className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4 max-w-4xl">
        <button onClick={() => router.push("/pcp/ordens")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {/* Resumo */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Campo rotulo="Fluxo" valor={ordem.fluxoVersao?.fluxo.nome ?? "—"} />
            <Campo rotulo="Etapa / Área" valor={etapa?.centroTrabalho ?? etapa?.nome ?? "—"} />
            <Campo rotulo="Estado atual" valor={ESTADO_LABEL[ordem.estadoAtual] ?? ordem.estadoAtual ?? "—"} />
            <Campo rotulo="Programado por" valor={ordem.criadoPor ?? "—"} />
            <Campo rotulo="Início previsto" valor={dt(ordem.dataPrevistaInicio)} />
            <Campo rotulo="Fim previsto" valor={dt(ordem.dataPrevistaFim)} />
            <Campo rotulo="Responsável" valor={ordem.responsavelColaborador?.nome ?? "—"} />
          </div>
        </div>

        {/* Produtos */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 pt-3">Produtos</p>
          <table className="w-full text-sm mt-1">
            <thead className="text-[11px] text-muted-foreground uppercase">
              <tr><th className="text-left px-3 py-1.5">Código</th><th className="text-left px-3 py-1.5">Produto</th><th className="text-right px-3 py-1.5">Planejado</th><th className="text-right px-3 py-1.5">Real</th><th className="text-left px-3 py-1.5 w-16">Un.</th></tr>
            </thead>
            <tbody>
              {linhas.map((pi, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{pi.item.codigo}</td>
                  <td className="px-3 py-1.5">{pi.item.descricao}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(pi.quantidadePlanejada)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(pi.quantidadeReal)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{pi.unidade?.sigla ?? pi.item.unidade?.sigla ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Etapas (consulta) */}
        {ordem.etapas.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Etapas</p>
            {ordem.etapas.map((e) => {
              const teveApont = e.qtdEntrada != null || e.qtdSaida != null || e.qtdPerda != null;
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm border border-border/60 rounded-lg px-2.5 py-1.5">
                  <span className="flex w-6 h-6 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-semibold shrink-0">{e.sequencia}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{e.centroTrabalho ?? e.nome}{e.estadoSaida ? <span className="text-muted-foreground font-normal"> → {ESTADO_LABEL[e.estadoSaida] ?? e.estadoSaida}</span> : null}</p>
                    {teveApont && <p className="text-[11px] text-muted-foreground">entrada {num(e.qtdEntrada)} · saída {num(e.qtdSaida)}{e.qtdPerda ? ` · perda ${num(e.qtdPerda)}` : ""}{e.apontadoPor ? ` · ${e.apontadoPor}` : ""}</p>}
                  </div>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0", ETAPA_STATUS[e.status])}>
                    {e.status === "EM_EXECUCAO" ? "em execução" : e.status === "CONCLUIDA" ? "concluída" : "pendente"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Consumo de biomassa */}
        {ordem.consumos.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-amber-500" /> Consumo de biomassa</p>
            <div className="space-y-1">
              {ordem.consumos.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{c.descricao ?? "Biomassa"}</span>
                  <span className="tabular-nums">{Number(c.quantidadeKg)} kg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Movimentações de WIP */}
        {ordem.movimentacoes.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><ArrowLeftRight className="w-3.5 h-3.5 text-cyan-500" /> Movimentações de estoque (WIP)</p>
            <div className="space-y-1">
              {ordem.movimentacoes.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold", m.tipo === "ENTRADA" ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{m.tipo === "ENTRADA" ? "entra" : "sai"}</span>
                    <span className="text-muted-foreground truncate">{m.item?.descricao ?? "—"}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{Number(m.quantidade)} → saldo {Number(m.saldoDepois)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documentos / Anexos (comprovação — OP escaneada) */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Paperclip className="w-3.5 h-3.5 text-cyan-500" /> Documentos / Anexos</p>
            <label className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs cursor-pointer hover:bg-muted", subindo && "opacity-50 pointer-events-none")}>
              {subindo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Enviar arquivo
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ""; }} />
            </label>
          </div>
          {anexos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum documento. Envie a OP escaneada/assinada como comprovação.</p>
          ) : (
            <div className="space-y-1">
              {anexos.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded-lg px-2.5 py-1.5">
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 text-foreground hover:text-cyan-600">
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.nome}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{(a.tamanho / 1024 / 1024).toFixed(2)} MB</span>
                  </a>
                  <button onClick={() => excluirAnexo(a.id)} className="text-muted-foreground hover:text-danger shrink-0" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
