"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { Loader2, RefreshCw, BookText, Plus, Trash2 } from "lucide-react";

type Partida = { id: string; tipo: "DEBITO" | "CREDITO"; valor: unknown; conta: { codigo: string; nome: string } };
type Lancamento = {
  id: string; numero: string | null; data: string; historico: string; origemTipo: string; origemId: string | null; criadoPor: string | null; estornoDeId: string | null;
  partidas: Partida[];
};

const ORIGEM_LABEL: Record<string, string> = {
  VENDA: "Venda", RECEBIMENTO: "Recebimento", COMPRA: "Compra", PAGAMENTO: "Pagamento", MANUAL: "Manual", ESTORNO: "Estorno",
  RECEITA_ENTREGA: "Receita na entrega", ESTOQUE_ENTRADA: "Entrada de estoque", ESTOQUE_SAIDA: "CMV / saída",
  ESTOQUE_PRODUCAO: "Produção", ESTOQUE_CONSUMO: "Consumo", ESTOQUE_AJUSTE: "Ajuste de estoque",
  ESTOQUE_TRANSFERENCIA: "Transferência", DEPRECIACAO: "Depreciação", ENCERRAMENTO: "Encerramento",
};
const ORIGEM_COR: Record<string, string> = {
  VENDA: "bg-success/15 text-success", RECEBIMENTO: "bg-info/15 text-info",
  COMPRA: "bg-warning/15 text-warning", PAGAMENTO: "bg-danger/15 text-danger",
  MANUAL: "bg-muted text-muted-foreground", ESTORNO: "bg-muted text-muted-foreground",
};

export default function LancamentosContabeisPage() {
  useTabTitle("Diário Contábil");
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ pct: number; fase: string } | null>(null);
  const [aviso, setAviso] = useState("");
  // Reprocesso em andamento em QUALQUER sessão. Como o % é persistido (Configuracao),
  // ao trocar de aba e voltar a barra reaparece com o progresso real.
  const [reprocessoAtivo, setReprocessoAtivo] = useState(false);
  const [progressoRemoto, setProgressoRemoto] = useState<{ pct: number; fase: string } | null>(null);
  // Última vez que o retroativo rodou (persistido) — exibido no topo da tela.
  const [ultimaExecucao, setUltimaExecucao] = useState<{ at: string; processados?: number; total?: number; erros?: number; ok?: boolean; error?: string } | null>(null);
  // Filtros: classe (manual/auto), origem (tipo) e busca (histórico/código).
  const [classe, setClasse] = useState<"TODOS" | "AUTO" | "MANUAL">("TODOS");
  const [origemFiltro, setOrigemFiltro] = useState("TODOS");
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/lancamentos").then((r) => r.json());
    setLancs(j.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Acompanha um reprocesso em andamento (qualquer sessão): busca status + % real.
  const checarReprocesso = useCallback(async (): Promise<boolean> => {
    try {
      const j = await fetch("/api/contabilidade/backfill").then((r) => r.json());
      setProgressoRemoto(j.progresso ?? null);
      setUltimaExecucao(j.ultima ?? null);
      return !!j.running;
    } catch { return false; }
  }, []);

  // Ao abrir/voltar à tela: se já houver reprocesso rodando, reconstrói a barra.
  useEffect(() => { checarReprocesso().then(setReprocessoAtivo); }, [checarReprocesso]);

  // Seguindo um reprocesso (não iniciado por este cliente): polla até terminar
  // e então recarrega os lançamentos.
  useEffect(() => {
    if (!reprocessoAtivo || gerando) return;
    let parar = false;
    const timer = setInterval(async () => {
      const rodando = await checarReprocesso();
      if (parar) return;
      if (!rodando) {
        setReprocessoAtivo(false); setProgressoRemoto(null);
        setAviso("Reprocesso concluído."); await load();
      }
    }, 2000);
    return () => { parar = true; clearInterval(timer); };
  }, [reprocessoAtivo, gerando, checarReprocesso, load]);

  // Origens presentes (para o seletor de filtro por tipo).
  const origensPresentes = Array.from(new Set(lancs.map((l) => l.origemTipo))).sort();
  const q = busca.trim().toLowerCase();
  const lancsFiltrados = lancs.filter((l) => {
    if (classe === "MANUAL" && l.origemTipo !== "MANUAL") return false;
    if (classe === "AUTO" && l.origemTipo === "MANUAL") return false;
    if (origemFiltro !== "TODOS" && l.origemTipo !== origemFiltro) return false;
    if (q && !(l.historico.toLowerCase().includes(q) || (l.numero ?? "").toLowerCase().includes(q))) return false;
    return true;
  });

  // Destaque do lançamento ao vir do Razão (?focus=<lancamentoId>).
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    setFocusId(new URLSearchParams(window.location.search).get("focus"));
  }, []);
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`lanc-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading, lancs]);

  async function gerarRetroativos() {
    setGerando(true); setAviso(""); setProgresso({ pct: 0, fase: "Iniciando" });
    try {
      const res = await fetch("/api/contabilidade/backfill?reset=vendas", { method: "POST" });
      // 409 (já em execução) ou erro sem stream → corpo JSON.
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        // 409: já há um reprocesso rodando — segue o job (barra com % persistido)
        // em vez de só avisar.
        if (res.status === 409) { setReprocessoAtivo(true); checarReprocesso(); }
        else setAviso(j.error || "Erro ao gerar lançamentos");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: { processados?: number; erros?: string[]; error?: string } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop() ?? "";
        for (const parte of partes) {
          const linha = parte.replace(/^data:\s*/, "").trim();
          if (!linha) continue;
          try {
            const obj = JSON.parse(linha);
            if (obj.done) final = obj;
            else if (typeof obj.pct === "number") setProgresso({ pct: obj.pct, fase: obj.fase ?? "" });
          } catch { /* linha parcial */ }
        }
      }
      if (final?.error) {
        setAviso(final.error);
      } else if (final) {
        setProgresso({ pct: 100, fase: "Concluído" });
        setAviso(`${final.processados} título(s) processado(s).${final.erros?.length ? ` ${final.erros.length} com erro.` : ""}`);
        await load();
      }
    } catch {
      setAviso("Erro de conexão durante o reprocesso.");
    } finally {
      setGerando(false);
      setProgresso(null);
      checarReprocesso(); // atualiza "última execução" / status
    }
  }

  return (
    <div>
      <PageHeader
        title="Diário Contábil"
        breadcrumbs={[{ label: "Contabilidade" }, { label: "Diário" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={gerarRetroativos} disabled={gerando || reprocessoAtivo}>
              {gerando || reprocessoAtivo ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
              {gerando ? `Gerando… ${progresso?.pct ?? 0}%`
                : reprocessoAtivo ? `Reprocessando… ${progressoRemoto?.pct ?? 0}%`
                : "Gerar retroativos"}
            </Button>
            <NovoLancamentoDialog onDone={load} />
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-4">
        {ultimaExecucao?.at && (
          <p className="text-xs text-muted-foreground">
            Último retroativo gerado em <span className="font-medium text-foreground">{new Date(ultimaExecucao.at).toLocaleString("pt-BR")}</span>
            {ultimaExecucao.ok === false
              ? <span className="text-danger"> · falhou</span>
              : <>{typeof ultimaExecucao.processados === "number" ? ` · ${ultimaExecucao.processados} lançamento(s) processado(s)` : ""}{ultimaExecucao.erros ? ` · ${ultimaExecucao.erros} com erro` : ""}</>}
          </p>
        )}
        {gerando && progresso && (
          <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info space-y-1.5">
            <div className="flex items-center justify-between">
              <span>Gerando lançamentos retroativos{progresso.fase ? ` — ${progresso.fase}` : ""}…</span>
              <span className="font-semibold tabular-nums">{progresso.pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-info/20 overflow-hidden">
              <div className="h-full rounded-full bg-info transition-all duration-300" style={{ width: `${progresso.pct}%` }} />
            </div>
          </div>
        )}
        {/* Reprocesso em andamento iniciado em outra aba/sessão (ou retomado ao
            voltar à tela): barra com o % real persistido. */}
        {!gerando && reprocessoAtivo && (
          <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm text-info space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Reprocesso em andamento{progressoRemoto?.fase ? ` — ${progressoRemoto.fase}` : ""}… a página atualiza ao terminar.
              </span>
              <span className="font-semibold tabular-nums">{progressoRemoto?.pct ?? 0}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-info/20 overflow-hidden">
              <div className="h-full rounded-full bg-info transition-all duration-300" style={{ width: `${progressoRemoto?.pct ?? 0}%` }} />
            </div>
          </div>
        )}
        {aviso && <div className="rounded-lg border border-info/30 bg-info/10 px-4 py-2.5 text-sm text-info">{aviso}</div>}

        {/* Filtros */}
        {!loading && lancs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {([["TODOS", "Todos"], ["AUTO", "Automáticos"], ["MANUAL", "Manuais"]] as [typeof classe, string][]).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setClasse(v)}
                  className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors", classe === v ? "border-info bg-info/10 text-info font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                  {label}
                </button>
              ))}
            </div>
            <select value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value)} className="h-8 rounded-lg border border-border px-2 text-xs bg-card">
              <option value="TODOS">Todas as origens</option>
              {origensPresentes.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o] ?? o}</option>)}
            </select>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por histórico ou código..." className="h-8 max-w-xs" />
            <span className="text-xs text-muted-foreground ml-auto">{lancsFiltrados.length} de {lancs.length}</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
        ) : lancs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <BookText className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="font-medium">Nenhum lançamento contábil</p>
            <p className="text-xs mt-1">Use “Gerar retroativos” para lançar a partir dos títulos existentes.</p>
          </div>
        ) : lancsFiltrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nenhum lançamento para o filtro.</p>
        ) : (
          <div className="space-y-3">
            {lancsFiltrados.map((l) => {
              const totalD = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + decimalToNumber(p.valor), 0);
              return (
                <div key={l.id} id={`lanc-${l.id}`} className={cn("rounded-xl border bg-card overflow-hidden transition-colors", focusId === l.id ? "border-info ring-2 ring-info/50" : "border-border")}>
                  <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-muted">
                    {l.numero && <span className="font-mono text-xs text-muted-foreground shrink-0">{l.numero}</span>}
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{formatDate(l.data)}</span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0", ORIGEM_COR[l.origemTipo] ?? "bg-muted text-muted-foreground")}>
                      {ORIGEM_LABEL[l.origemTipo] ?? l.origemTipo}
                    </span>
                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0", l.origemTipo === "MANUAL" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground")}
                      title={l.origemTipo === "MANUAL" ? "Lançamento manual" : "Lançamento automático (gerado pelo sistema)"}>
                      {l.origemTipo === "MANUAL" ? "manual" : "auto"}
                    </span>
                    <span className="text-sm text-foreground truncate flex-1">
                      {l.historico}
                      {l.origemTipo === "MANUAL" && l.criadoPor && <span className="ml-2 text-[10px] text-muted-foreground">por {l.criadoPor}</span>}
                    </span>
                    <span className="text-sm font-semibold text-foreground shrink-0 tabular-nums">{formatBRL(totalD)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {l.partidas.map((p) => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-5 py-1.5 w-10 text-center">
                            <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold",
                              p.tipo === "DEBITO" ? "bg-info/15 text-info" : "bg-warning/15 text-warning")}>
                              {p.tipo === "DEBITO" ? "D" : "C"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground w-24">{p.conta.codigo}</td>
                          <td className="px-2 py-1.5 text-foreground">{p.conta.nome}</td>
                          <td className={cn("px-5 py-1.5 text-right tabular-nums w-32", p.tipo === "DEBITO" ? "text-info" : "text-warning")}>
                            {formatBRL(decimalToNumber(p.valor))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type LinhaManual = { contaId: string; tipo: "DEBITO" | "CREDITO"; valor: string };
type ContaOpt = { id: string; codigo: string; nome: string; aceitaLancamento: boolean };

function NovoLancamentoDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [contas, setContas] = useState<ContaOpt[]>([]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [historico, setHistorico] = useState("");
  const [linhas, setLinhas] = useState<LinhaManual[]>([
    { contaId: "", tipo: "DEBITO", valor: "" },
    { contaId: "", tipo: "CREDITO", valor: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || contas.length) return;
    fetch("/api/contabilidade/plano-contas").then((r) => r.json()).then((j) => setContas((j.flat ?? []).filter((c: ContaOpt) => c.aceitaLancamento)));
  }, [open, contas.length]);

  const num = (s: string) => { const n = parseFloat(s.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const totalD = linhas.filter((l) => l.tipo === "DEBITO").reduce((s, l) => s + num(l.valor), 0);
  const totalC = linhas.filter((l) => l.tipo === "CREDITO").reduce((s, l) => s + num(l.valor), 0);
  const balanceado = Math.abs(totalD - totalC) < 0.005 && totalD > 0;
  const completo = linhas.every((l) => l.contaId && num(l.valor) > 0);

  function setLinha(i: number, patch: Partial<LinhaManual>) { setLinhas((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); }
  function addLinha() { setLinhas((p) => [...p, { contaId: "", tipo: "CREDITO", valor: "" }]); }
  function delLinha(i: number) { setLinhas((p) => p.length > 2 ? p.filter((_, idx) => idx !== i) : p); }

  async function salvar() {
    setSaving(true); setErro(null);
    const res = await fetch("/api/contabilidade/lancamentos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, historico, partidas: linhas.map((l) => ({ contaId: l.contaId, tipo: l.tipo, valor: num(l.valor) })) }),
    });
    setSaving(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Erro ao salvar"); return; }
    setOpen(false); setHistorico(""); setLinhas([{ contaId: "", tipo: "DEBITO", valor: "" }, { contaId: "", tipo: "CREDITO", valor: "" }]);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="w-4 h-4 mr-1.5" /> Lançamento manual
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Novo lançamento manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Data</Label><DatePicker value={data} onChange={(v) => setData(v)} className="w-full" /></div>
            <div className="col-span-2"><Label>Descrição</Label><Input value={historico} onChange={(e) => setHistorico(e.target.value)} placeholder="Descrição do lançamento" /></div>
          </div>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={l.tipo} onChange={(e) => setLinha(i, { tipo: e.target.value as "DEBITO" | "CREDITO" })} className="h-9 rounded-lg border border-border px-2 text-sm bg-card w-24">
                  <option value="DEBITO">Débito</option>
                  <option value="CREDITO">Crédito</option>
                </select>
                <div className="flex-1">
                  <ComboboxWithCreate value={l.contaId} onChange={(v) => setLinha(i, { contaId: v })} placeholder="Conta..." triggerClassName="h-9 rounded-lg"
                    options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))} />
                </div>
                <Input value={l.valor} onChange={(e) => setLinha(i, { valor: e.target.value })} placeholder="0,00" className="w-32 text-right" inputMode="decimal" />
                <button type="button" onClick={() => delLinha(i)} className="text-muted-foreground/60 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addLinha} className="inline-flex items-center gap-1.5 text-sm text-info hover:text-info"><Plus className="w-4 h-4" /> Adicionar linha</button>
          </div>
          <div className={cn("flex items-center justify-between text-sm rounded-lg px-3 py-2", balanceado ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
            <span>Débitos: <b className="tabular-nums">{formatBRL(totalD)}</b> · Créditos: <b className="tabular-nums">{formatBRL(totalC)}</b></span>
            <span>{balanceado ? "Balanceado" : "Débito ≠ Crédito"}</span>
          </div>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={saving || !balanceado || !completo || !historico.trim()}>{saving ? "Salvando..." : "Lançar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
