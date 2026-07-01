"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import DatePicker from "@/components/shared/DatePicker";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

type Titulo = {
  id: string;
  numero: string;
  descricao: string;
  valorOriginal: string | number;
  valorPago: string | number;
  dataVencimento: string;
  status: string;
  cliente?: { razaoSocial: string } | null;
  fornecedor?: { razaoSocial: string } | null;
};
type Conta = { id: string; nome: string };

const ABERTOS = ["ABERTA", "PARCIAL", "VENCIDA"];

export default function AgendaFinanceiraPage() {
  const [tipo, setTipo] = useState<"RECEBER" | "PAGAR">("PAGAR");
  const [cr, setCr] = useState<Titulo[]>([]);
  const [cp, setCp] = useState<Titulo[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [baixando, setBaixando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, p, c] = await Promise.all([
      fetch("/api/contas-receber").then((x) => x.json()),
      fetch("/api/contas-pagar").then((x) => x.json()),
      fetch("/api/financeiro/contas").then((x) => x.json()),
    ]);
    setCr((r.data ?? []).filter((t: Titulo) => ABERTOS.includes(t.status)));
    setCp((p.data ?? []).filter((t: Titulo) => ABERTOS.includes(t.status)));
    setContas((c.data ?? []).map((x: any) => ({ id: x.id, nome: x.nome })));
    setSel(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const titulos = tipo === "RECEBER" ? cr : cp;

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel((prev) => prev.size === titulos.length ? new Set() : new Set(titulos.map((t) => t.id)));
  }

  // Limpa seleção ao trocar de aba.
  useEffect(() => { setSel(new Set()); }, [tipo]);

  const totalSel = useMemo(
    () => titulos.filter((t) => sel.has(t.id)).reduce((s, t) => s + (Number(t.valorOriginal) - Number(t.valorPago)), 0),
    [titulos, sel],
  );

  async function baixarLote() {
    if (sel.size === 0 || !contaBancariaId) return;
    setBaixando(true);
    const res = await fetch("/api/financeiro/baixar-lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, ids: Array.from(sel), contaBancariaId, dataPagamento }),
    });
    setBaixando(false);
    if (res.ok) load();
    else { const j = await res.json().catch(() => ({})); alert(j.error || "Erro ao baixar"); }
  }

  return (
    <div>
      <PageHeader
        title="Agenda Financeira"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Agenda Financeira" }]}
      />
      <div className="px-8 pb-8 space-y-4">
        {/* Abas */}
        <div className="flex border-b border-border gap-1">
          {([
            { key: "PAGAR", label: "A Pagar", count: cp.length },
            { key: "RECEBER", label: "A Receber", count: cr.length },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipo(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tipo === t.key ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-semibold", tipo === t.key ? "bg-info/15 text-info" : "bg-muted text-muted-foreground")}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
          ) : titulos.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Nenhum título em aberto.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={sel.size === titulos.length && titulos.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium text-right">Em aberto</th>
                </tr>
              </thead>
              <tbody>
                {titulos.map((t) => {
                  const aberto = Number(t.valorOriginal) - Number(t.valorPago);
                  const vencido = new Date(t.dataVencimento) < new Date(new Date().toDateString());
                  return (
                    <tr key={t.id} className={cn("border-b border-gray-50 hover:bg-muted", sel.has(t.id) && "bg-info/10")}>
                      <td className="px-4 py-3"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.numero}</td>
                      <td className="px-4 py-3">
                        <span className="text-foreground">{t.descricao}</span>
                        <span className="block text-xs text-muted-foreground">{t.cliente?.razaoSocial || t.fornecedor?.razaoSocial || ""}</span>
                      </td>
                      <td className={cn("px-4 py-3", vencido ? "text-danger font-medium" : "text-muted-foreground")}>{formatDate(t.dataVencimento)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatBRL(aberto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Barra de baixa em lote */}
        {sel.size > 0 && (
          <div className="sticky bottom-4 rounded-xl border border-border bg-card shadow-lg p-4 flex flex-wrap items-end gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Selecionados:</span>{" "}
              <span className="font-semibold">{sel.size}</span>{" "}
              <span className="text-muted-foreground">·</span>{" "}
              <span className="font-semibold">{formatBRL(totalSel)}</span>
            </div>
            <div className="flex-1" />
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Conta</label>
              <div className="min-w-[180px]">
                <ComboboxWithCreate value={contaBancariaId} onChange={setContaBancariaId} placeholder="Selecione a conta..." noneLabel="Selecione" triggerClassName="h-9 rounded-lg"
                  options={contas.map((c) => ({ value: c.id, label: c.nome }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Data</label>
              <DatePicker value={dataPagamento} onChange={(v) => setDataPagamento(v)} className="w-40" />
            </div>
            <Button onClick={baixarLote} disabled={baixando || !contaBancariaId}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {baixando ? "Baixando..." : `Baixar ${tipo === "RECEBER" ? "recebimentos" : "pagamentos"}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
