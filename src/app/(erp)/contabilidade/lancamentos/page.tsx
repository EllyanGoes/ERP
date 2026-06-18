"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { formatBRL, formatDate, decimalToNumber, cn } from "@/lib/utils";
import { Loader2, RefreshCw, BookText, Plus, Trash2 } from "lucide-react";

type Partida = { id: string; tipo: "DEBITO" | "CREDITO"; valor: unknown; conta: { codigo: string; nome: string } };
type Lancamento = {
  id: string; data: string; historico: string; origemTipo: string; origemId: string | null; criadoPor: string | null; estornoDeId: string | null;
  partidas: Partida[];
};

const ORIGEM_LABEL: Record<string, string> = {
  VENDA: "Venda", RECEBIMENTO: "Recebimento", COMPRA: "Compra", PAGAMENTO: "Pagamento", MANUAL: "Manual", ESTORNO: "Estorno",
};
const ORIGEM_COR: Record<string, string> = {
  VENDA: "bg-emerald-100 text-emerald-700", RECEBIMENTO: "bg-blue-100 text-blue-700",
  COMPRA: "bg-amber-100 text-amber-700", PAGAMENTO: "bg-rose-100 text-rose-700",
  MANUAL: "bg-gray-100 text-gray-600", ESTORNO: "bg-gray-200 text-gray-600",
};

export default function LancamentosContabeisPage() {
  useTabTitle("Diário Contábil");
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/lancamentos").then((r) => r.json());
    setLancs(j.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function gerarRetroativos() {
    setGerando(true); setAviso("");
    try {
      const res = await fetch("/api/contabilidade/backfill", { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        setAviso(`${j.processados} título(s) processado(s).${j.erros?.length ? ` ${j.erros.length} com erro.` : ""}`);
        await load();
      } else setAviso(j.error || "Erro ao gerar lançamentos");
    } finally { setGerando(false); }
  }

  return (
    <div>
      <PageHeader
        title="Diário Contábil"
        breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "Diário" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={gerarRetroativos} disabled={gerando}>
              {gerando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
              Gerar retroativos
            </Button>
            <NovoLancamentoDialog onDone={load} />
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-4">
        {aviso && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">{aviso}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>
        ) : lancs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-xl">
            <BookText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-medium">Nenhum lançamento contábil</p>
            <p className="text-xs mt-1">Use “Gerar retroativos” para lançar a partir dos títulos existentes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lancs.map((l) => {
              const totalD = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + decimalToNumber(p.valor), 0);
              return (
                <div key={l.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-500 w-20 shrink-0">{formatDate(l.data)}</span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0", ORIGEM_COR[l.origemTipo] ?? "bg-gray-100 text-gray-600")}>
                      {ORIGEM_LABEL[l.origemTipo] ?? l.origemTipo}
                    </span>
                    <span className="text-sm text-gray-700 truncate flex-1">
                      {l.historico}
                      {l.origemTipo === "MANUAL" && l.criadoPor && <span className="ml-2 text-[10px] text-gray-400">por {l.criadoPor}</span>}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">{formatBRL(totalD)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {l.partidas.map((p) => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-5 py-1.5 w-10 text-center">
                            <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold",
                              p.tipo === "DEBITO" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}>
                              {p.tipo === "DEBITO" ? "D" : "C"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-gray-500 w-24">{p.conta.codigo}</td>
                          <td className="px-2 py-1.5 text-gray-700">{p.conta.nome}</td>
                          <td className={cn("px-5 py-1.5 text-right tabular-nums w-32", p.tipo === "DEBITO" ? "text-blue-700" : "text-amber-700")}>
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
            <div><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="col-span-2"><Label>Histórico</Label><Input value={historico} onChange={(e) => setHistorico(e.target.value)} placeholder="Descrição do lançamento" /></div>
          </div>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={l.tipo} onChange={(e) => setLinha(i, { tipo: e.target.value as "DEBITO" | "CREDITO" })} className="h-9 rounded-lg border border-gray-300 px-2 text-sm bg-white w-24">
                  <option value="DEBITO">Débito</option>
                  <option value="CREDITO">Crédito</option>
                </select>
                <div className="flex-1">
                  <ComboboxWithCreate value={l.contaId} onChange={(v) => setLinha(i, { contaId: v })} placeholder="Conta..." triggerClassName="h-9 rounded-lg"
                    options={contas.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))} />
                </div>
                <Input value={l.valor} onChange={(e) => setLinha(i, { valor: e.target.value })} placeholder="0,00" className="w-32 text-right" inputMode="decimal" />
                <button type="button" onClick={() => delLinha(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addLinha} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"><Plus className="w-4 h-4" /> Adicionar linha</button>
          </div>
          <div className={cn("flex items-center justify-between text-sm rounded-lg px-3 py-2", balanceado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
            <span>Débitos: <b className="tabular-nums">{formatBRL(totalD)}</b> · Créditos: <b className="tabular-nums">{formatBRL(totalC)}</b></span>
            <span>{balanceado ? "Balanceado" : "Débito ≠ Crédito"}</span>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={saving || !balanceado || !completo || !historico.trim()}>{saving ? "Salvando..." : "Lançar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
