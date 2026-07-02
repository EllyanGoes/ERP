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
import { Loader2, BookText, Plus, Trash2, HelpCircle, X, ShieldCheck, PenLine } from "lucide-react";
import ModalPortal from "@/components/shared/ModalPortal";
import BackfillConsistencia from "@/components/contabilidade/BackfillConsistencia";

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
  const [infoAberto, setInfoAberto] = useState(false);
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

  return (
    <div>
      <PageHeader
        title="Diário Contábil"
        breadcrumbs={[{ label: "Contabilidade" }, { label: "Diário" }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInfoAberto(true)}
              title="Para que serve cada botão"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-info hover:border-info/30 hover:bg-info/10 transition-colors"
            >
              <HelpCircle className="w-4.5 h-4.5" />
            </button>
            <NovoLancamentoDialog onDone={load} />
          </div>
        }
      />

      {infoAberto && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={() => setInfoAberto(false)}>
            <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-border">
                <div>
                  <h3 className="font-bold text-foreground">Para que serve cada botão</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Os lançamentos do diário nascem sozinhos a partir dos fatos do ERP (vendas, compras, baixas…). Os botões abaixo são ferramentas de correção e de exceção.</p>
                </div>
                <button onClick={() => setInfoAberto(false)} className="ml-4 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="rounded-xl border border-info/30 bg-info/10 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-5 h-5 text-info" />
                    <span className="font-semibold text-foreground">Backfill de consistência</span>
                  </div>
                  <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                    <li>Revisão geral de saúde do razão: <span className="font-medium text-foreground">re-sincroniza títulos e pedidos</span> com as regras atuais (juros/multa em conta de resultado, arredondamento por partida), aplica <span className="font-medium text-foreground">frete/desconto nas entradas de compra</span> (crédito do fornecedor pelo líquido) e ajusta os contas a pagar em aberto correspondentes, contabiliza devoluções antigas e recomputa os status dos pedidos.</li>
                    <li><span className="font-medium text-foreground">É idempotente</span>: o que já está certo não muda; re-rodar não duplica nada. Se der timeout no meio, clique de novo — continua de onde parou.</li>
                    <li>Também faz a <span className="font-medium text-foreground">faxina do razão</span>: remove partidas sem lançamento, lançamentos cujo documento de origem foi apagado e pernas de venda duplicadas de modelos antigos (substituiu o botão &quot;Gerar retroativos&quot;, que ficava nesta e nas telas de relatório).</li>
                    <li>Quando usar: após atualizações do sistema que mudam regras contábeis, ou quando algum razonete parecer defasado. Só administradores. Pendências que exigem revisão manual (ex.: título já baixado) aparecem no aviso e no console do navegador.</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-success/30 bg-success/10 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <PenLine className="w-5 h-5 text-success" />
                    <span className="font-semibold text-foreground">Novo lançamento</span>
                  </div>
                  <ul className="text-[13px] text-muted-foreground space-y-1 list-disc pl-5">
                    <li>Lançamento <span className="font-medium text-foreground">manual</span> de partidas dobradas (débito = crédito), para fatos que não passam pelos fluxos do ERP — ex.: ajustes, provisões avulsas, reclassificações pontuais.</li>
                    <li>Use com moderação: tudo que tem documento de origem (venda, compra, baixa, estoque) deve ser lançado pelo próprio fluxo, nunca manualmente — senão o reprocesso não enxerga.</li>
                  </ul>
                </div>

                <p className="text-xs text-muted-foreground">
                  Lançamentos automáticos não devem ser editados aqui — corrija o documento de origem (pedido, título, conferência) que o razão re-sincroniza sozinho. Reconstruções totais (migração de modelo contábil) são feitas por script, não por botão.
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <div className="px-8 pb-8 space-y-4">
        <BackfillConsistencia onDone={load} />

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
            <p className="text-xs mt-1">Use “Backfill de consistência” para gerar os lançamentos a partir dos documentos existentes.</p>
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
