"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Pencil, Check, ToggleLeft, ToggleRight, Loader2, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Condicao {
  id: string;
  nome: string;
  descricao: string | null;
  numeroParcelas: number;
  prazoInicial: number;
  intervaloParcelas: number;
  diasParcelas: string | null;
  percentuaisParcelas: string | null;
  semVencimento: boolean;
  pagamentoAntecipado: boolean;
  ativo: boolean;
}

type FormState = {
  nome: string;
  descricao: string;
  numeroParcelas: string;
  prazoInicial: string;
  intervaloParcelas: string;
  diasParcelas: string;
  percentuaisParcelas: string;
  semVencimento: boolean;
  pagamentoAntecipado: boolean;
};

const empty = (): FormState => ({
  nome: "",
  descricao: "",
  numeroParcelas: "1",
  prazoInicial: "0",
  intervaloParcelas: "30",
  diasParcelas: "",
  percentuaisParcelas: "",
  semVencimento: false,
  pagamentoAntecipado: false,
});

function numsList(s?: string | null): number[] {
  if (!s) return [];
  return s.split(/[,;/\s]+/).map((x) => parseFloat(x.trim().replace(",", "."))).filter((n) => Number.isFinite(n) && n >= 0);
}

function resumoCondicao(c: Condicao): string {
  if (c.semVencimento) return "Sem vencimento previsto";
  const dias = numsList(c.diasParcelas).map((d) => Math.round(d));
  const pcts = numsList(c.percentuaisParcelas);
  if (pcts.length > 0) return `${pcts.length}x · ${pcts.join("/")}%${dias.length ? ` em ${dias.join("/")}d` : ""}`;
  if (dias.length > 0) return dias.length > 1 ? `${dias.length}x · vence em ${dias.join("/")} dias` : `A prazo · ${dias[0]} dias`;
  const n = c.numeroParcelas ?? 1;
  const prazo = c.prazoInicial ?? 0;
  if (n > 1) return `${n}x · 1ª em ${prazo}d, a cada ${c.intervaloParcelas ?? 30}d`;
  return prazo === 0 ? "À vista" : `A prazo · ${prazo} dias`;
}

export default function CondicoesPagamentoPage() {
  const [rows, setRows] = useState<Condicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suprimentos/condicoes-pagamento");
    setRows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => { setForm(empty()); setEditingId("new"); setError(null); };
  const startEdit = (r: Condicao) => {
    setForm({
      nome: r.nome, descricao: r.descricao ?? "",
      numeroParcelas: String(r.numeroParcelas ?? 1),
      prazoInicial: String(r.prazoInicial ?? 0),
      intervaloParcelas: String(r.intervaloParcelas ?? 30),
      diasParcelas: r.diasParcelas ?? "",
      percentuaisParcelas: r.percentuaisParcelas ?? "",
      semVencimento: r.semVencimento ?? false,
      pagamentoAntecipado: r.pagamentoAntecipado ?? false,
    });
    setEditingId(r.id); setError(null);
  };
  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const url = editingId === "new"
      ? "/api/suprimentos/condicoes-pagamento"
      : `/api/suprimentos/condicoes-pagamento/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    setEditingId(null); await load(); setSaving(false);
  };

  const toggleAtivo = async (r: Condicao) => {
    await fetch(`/api/suprimentos/condicoes-pagamento/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Condições de Pagamento"
        breadcrumbs={[{ label: "Suprimentos" }, { label: "Cadastros" }, { label: "Condições de Pagamento" }]}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            A condição de pagamento define a forma de pagamento acordada em uma negociação comercial.
          </p>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{rows.length} condição(ões) cadastrada(s)</p>
          <Button size="sm" onClick={startNew} disabled={editingId !== null}>
            <Plus className="w-4 h-4 mr-1" /> Nova Condição
          </Button>
        </div>

        {/* Inline form — new */}
        {editingId === "new" && (
          <CondicaoForm
            form={form} setForm={setForm} saving={saving} error={error}
            onSave={save} onCancel={cancel} isNew
          />
        )}

        {/* List */}
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-center px-4 py-3 w-20">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground/60" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground text-xs">Nenhuma condição cadastrada</td></tr>
              ) : rows.map((r) => (
                <>
                  <tr key={r.id} className={cn("border-b border-border last:border-0", !r.ativo && "opacity-50", editingId === r.id ? "bg-info/10" : "hover:bg-muted")}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {r.nome}
                        {r.pagamentoAntecipado && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400" title="Gera pagamento antecipado — o título nasce no pedido">PA</span>
                        )}
                      </span>
                      <span className="block text-[11px] font-normal text-muted-foreground">{resumoCondicao(r)}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[260px] truncate">{r.descricao || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(r)}>
                        {r.ativo
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground/60" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {editingId === r.id ? null : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(r)} disabled={editingId !== null}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr key={`${r.id}-edit`} className="bg-info/10 border-b">
                      <td colSpan={4} className="px-4 py-4">
                        <CondicaoForm
                          form={form} setForm={setForm} saving={saving} error={error}
                          onSave={save} onCancel={cancel}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CondicaoForm({ form, setForm, saving, error, onSave, onCancel, isNew }: {
  form: ReturnType<typeof empty>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof empty>>>;
  saving: boolean; error: string | null;
  onSave: () => void; onCancel: () => void;
  isNew?: boolean;
}) {
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className={cn("rounded-xl border border-info/30 bg-card p-5 space-y-4", isNew && "mb-2")}>
      <p className="text-sm font-semibold text-foreground">{isNew ? "Nova condição de pagamento" : "Editar condição"}</p>

      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
          <Input value={form.nome} onChange={set("nome")} placeholder="Ex: A Vista, 30/60 DDL, Faturado..." autoFocus={isNew}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
          <Input value={form.descricao ?? ""} onChange={set("descricao")} placeholder="Observação opcional"
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
        </div>

        {/* Sem vencimento previsto (ex.: Faturado / a combinar) */}
        <label className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 cursor-pointer">
          <input type="checkbox" checked={form.semVencimento}
            onChange={(e) => setForm((f) => ({ ...f, semVencimento: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-border" />
          <span className="text-sm">
            <span className="font-medium text-foreground">Sem data de vencimento prevista</span>
            <span className="block text-xs text-muted-foreground">Ex.: &quot;Faturado&quot; — o título a receber nasce em aberto, sem vencimento (a combinar com o cliente).</span>
          </span>
        </label>

        {/* Gera pagamento antecipado (PA) — o título nasce já no pedido */}
        <label className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-500/5 p-3 cursor-pointer">
          <input type="checkbox" checked={form.pagamentoAntecipado}
            onChange={(e) => setForm((f) => ({ ...f, pagamentoAntecipado: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-border" />
          <span className="text-sm">
            <span className="font-medium text-foreground">Gera pagamento antecipado (PA)</span>
            <span className="block text-xs text-muted-foreground">O título a pagar nasce já no <b>pedido</b> (adiantamento a fornecedor), antes do documento de entrada. Sem essa marcação, o título é gerado só após a entrada.</span>
          </span>
        </label>

        {/* Parcelamento / prazo — só faz sentido quando há vencimento */}
        {!form.semVencimento && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Dias das parcelas</label>
              <Input value={form.diasParcelas} onChange={set("diasParcelas")} placeholder="Ex.: 15/30/45 ou 30,60,90 (pode ser irregular: 30/45/90)"
                onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Dias de vencimento de cada parcela a partir da emissão. Quando preenchido, define o nº e os prazos das parcelas (sobrepõe os campos abaixo).
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Percentuais das parcelas (%)</label>
              <Input value={form.percentuaisParcelas} onChange={set("percentuaisParcelas")} placeholder="Ex.: 50/50 (entrada + saldo) ou 50/30/20"
                onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
              <p className="text-[11px] text-muted-foreground mt-1">
                % de cada parcela sobre o total (ex.: &quot;50% na entrada&quot; → dias <b>0/30</b> e percentuais <b>50/50</b>). Vazio = parcelas iguais.
              </p>
            </div>
            {numsList(form.diasParcelas).length === 0 && numsList(form.percentuaisParcelas).length === 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nº de parcelas</label>
                  <Input type="number" min="1" value={form.numeroParcelas} onChange={set("numeroParcelas")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Prazo 1ª (dias)</label>
                  <Input type="number" min="0" value={form.prazoInicial} onChange={set("prazoInicial")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Intervalo (dias)</label>
                  <Input type="number" min="0" value={form.intervaloParcelas} onChange={set("intervaloParcelas")} />
                </div>
                <p className="col-span-3 text-[11px] text-muted-foreground">
                  À vista: 1 parcela, prazo 0. A prazo: prazo da 1ª em dias. Parcelado uniforme: nº de parcelas e intervalo.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
