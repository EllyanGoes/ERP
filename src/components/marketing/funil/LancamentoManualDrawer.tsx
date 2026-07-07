"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Trash2, Loader2, Plus, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import DatePicker from "@/components/shared/DatePicker";

type Lancamento = {
  id: string;
  noId: string;
  dataInicio: string;
  dataFim: string;
  visitantes: number | null;
  leads: number | null;
  conversoes: number | null;
  receita: number | null;
  observacao: string | null;
};

const inputCls = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500";
const labelCls = "block text-[11px] font-medium text-muted-foreground mb-1";

const fmtNum = new Intl.NumberFormat("pt-BR");
const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function isoDiasAtras(dias: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - dias);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${m}-${d}`;
}

interface Props {
  funilId: string;
  noId: string;
  noRotulo: string;
  onClose: () => void;
  /** Chamado após criar/excluir — o canvas usa p/ atualizar a análise. */
  onChanged: () => void;
}

// Painel de lançamentos manuais de um nó (períodos com visitantes/leads/
// conversões/receita digitados à mão — fonte "manual" das métricas).
export default function LancamentoManualDrawer({ funilId, noId, noRotulo, onClose, onChanged }: Props) {
  const [lista, setLista] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [dataInicio, setDataInicio] = useState(() => isoDiasAtras(30));
  const [dataFim, setDataFim] = useState(() => isoDiasAtras(0));
  const [visitantes, setVisitantes] = useState("");
  const [leads, setLeads] = useState("");
  const [conversoes, setConversoes] = useState("");
  const [receita, setReceita] = useState("");
  const [observacao, setObservacao] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/marketing/funis/${funilId}/lancamentos?noId=${encodeURIComponent(noId)}`);
      const j = await r.json();
      setLista(j.data ?? []);
    } catch {
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, [funilId, noId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function num(v: string): number | null {
    const t = v.replace(",", ".").trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function salvar() {
    setErro(null);
    const body = {
      noId,
      dataInicio,
      dataFim,
      visitantes: num(visitantes),
      leads: num(leads),
      conversoes: num(conversoes),
      receita: num(receita),
      observacao: observacao.trim() || null,
    };
    if (body.visitantes == null && body.leads == null && body.conversoes == null && body.receita == null) {
      setErro("Informe ao menos uma métrica.");
      return;
    }
    if (!dataInicio || !dataFim || dataFim < dataInicio) {
      setErro("Período inválido.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/marketing/funis/${funilId}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar lançamento");
      setVisitantes("");
      setLeads("");
      setConversoes("");
      setReceita("");
      setObservacao("");
      await carregar();
      onChanged();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar lançamento");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(lancamentoId: string) {
    try {
      const r = await fetch(`/api/marketing/funis/${funilId}/lancamentos/${lancamentoId}`, { method: "DELETE" });
      if (!r.ok) return;
      await carregar();
      onChanged();
    } catch {
      /* mantém a lista atual */
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-card border-l border-border shadow-xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex w-6 h-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300">
            <BarChart3 className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">Lançar métricas</p>
            <p className="text-[11px] text-muted-foreground truncate">{noRotulo}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:bg-muted" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Novo lançamento */}
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Novo lançamento</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Início</label>
              <DatePicker value={dataInicio} onChange={setDataInicio} allowClear={false} triggerClassName="h-8" />
            </div>
            <div>
              <label className={labelCls}>Fim</label>
              <DatePicker value={dataFim} onChange={setDataFim} allowClear={false} min={dataInicio || undefined} triggerClassName="h-8" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Visitantes</label>
              <input className={inputCls} inputMode="numeric" value={visitantes} onChange={(e) => setVisitantes(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Leads</label>
              <input className={inputCls} inputMode="numeric" value={leads} onChange={(e) => setLeads(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Conversões</label>
              <input className={inputCls} inputMode="numeric" value={conversoes} onChange={(e) => setConversoes(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Receita (R$)</label>
              <input className={inputCls} inputMode="decimal" value={receita} onChange={(e) => setReceita(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <input className={inputCls} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="opcional" />
          </div>
          {erro && <p className="text-xs text-danger">{erro}</p>}
          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </div>

        {/* Lançamentos existentes */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Lançamentos</p>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : lista.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum lançamento manual para este nó.</p>
          ) : (
            <div className="space-y-1.5">
              {lista.map((l) => (
                <div key={l.id} className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {fmtData(l.dataInicio)} – {fmtData(l.dataFim)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {[
                        l.visitantes != null ? `${fmtNum.format(l.visitantes)} visit.` : null,
                        l.leads != null ? `${fmtNum.format(l.leads)} leads` : null,
                        l.conversoes != null ? `${fmtNum.format(l.conversoes)} conv.` : null,
                        l.receita != null ? fmtMoeda.format(l.receita) : null,
                      ].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {l.observacao && <p className={cn("text-[11px] text-muted-foreground/80 truncate")}>{l.observacao}</p>}
                  </div>
                  <button onClick={() => excluir(l.id)} className="p-1 text-muted-foreground/60 hover:text-danger shrink-0" title="Excluir lançamento">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
