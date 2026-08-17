"use client";

// Carteira B3 — investimentos pessoais (módulo standalone; cada usuário só vê
// a própria carteira). Operações manuais ou importadas do extrato da Área do
// Investidor da B3; cotações via brapi.dev.
import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { cn, formatBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import EscClose from "@/components/shared/EscClose";
import {
  Loader2, RefreshCw, Upload, Plus, Trash2, X, LineChart, TrendingUp, TrendingDown, Inbox,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

type PosicaoDTO = {
  ativoId: string; ticker: string; nome: string | null; tipo: string;
  quantidade: number; precoMedio: number; custoTotal: number;
  precoAtual: number | null; precoAtualizadoEm: string | null;
  valorAtual: number | null; resultado: number | null; resultadoPct: number | null;
  realizadoRs: number; proventosRs: number;
};
type OperacaoDTO = { id: string; ticker: string; tipo: string; data: string; quantidade: number; preco: number; custos: number; importada: boolean };
type ProventoDTO = { id: string; ticker: string; tipo: string; data: string; valor: number; importada: boolean };
type CarteiraDTO = {
  posicoes: PosicaoDTO[];
  totais: { custo: number; valor: number; resultado: number; realizado: number; proventos: number };
  series: { mes: string; investido: number; proventos: number }[];
  operacoes: OperacaoDTO[];
  proventos: ProventoDTO[];
};

const TIPO_ATIVO_LABEL: Record<string, string> = { ACAO: "Ação", FII: "FII", ETF: "ETF", BDR: "BDR", OUTRO: "Outro" };
const TIPO_PROVENTO_LABEL: Record<string, string> = { DIVIDENDO: "Dividendo", JCP: "JCP", RENDIMENTO: "Rendimento", OUTRO: "Outro" };

const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (ym: string) => `${MESES_ABREV[parseInt(ym.slice(5)) - 1]}/${ym.slice(2, 4)}`;
// Padrão dos gráficos do ERP (ex.: RH/Relatórios)
const tickStyle = { fontSize: 11, fill: "#94a3b8" };
const moedaCompacta = (v: number) =>
  v >= 10000 ? v.toLocaleString("pt-BR", { notation: "compact" }) : v.toLocaleString("pt-BR");

export default function InvestimentosPage() {
  useTabTitle("Carteira B3");

  const [dados, setDados] = useState<CarteiraDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"posicoes" | "operacoes" | "proventos">("posicoes");
  const [msg, setMsg] = useState("");
  const [atualizandoCotacoes, setAtualizandoCotacoes] = useState(false);
  const [importando, setImportando] = useState(false);
  const [novaOperacao, setNovaOperacao] = useState(false);
  const [novoProvento, setNovoProvento] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/investimentos/carteira").catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok) setDados(json.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function atualizarCotacoes() {
    setAtualizandoCotacoes(true); setMsg("");
    const res = await fetch("/api/investimentos/cotacoes", { method: "POST" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setAtualizandoCotacoes(false);
    if (!res?.ok) { setMsg(json?.error || "Erro ao atualizar cotações."); return; }
    const d = json.data;
    setMsg(`Cotações: ${d.atualizados} atualizada(s)${d.falhas.length ? ` · falhou: ${d.falhas.join(", ")}${d.semToken ? " (defina BRAPI_TOKEN p/ elevar o limite)" : ""}` : ""}`);
    load();
  }

  async function importar(file: File) {
    setImportando(true); setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/investimentos/importar", { method: "POST", body: fd }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setImportando(false);
    if (!res?.ok) { setMsg(json?.error || "Erro ao importar."); return; }
    const d = json.data;
    setMsg(`Importado: ${d.operacoesNovas} operação(ões), ${d.proventosNovos} provento(s) · ${d.duplicadas} já existiam · ${d.ignoradas} linha(s) ignorada(s)`);
    load();
  }

  async function excluir(recurso: "operacoes" | "proventos", id: string) {
    if (confirmaExcluir !== id) { setConfirmaExcluir(id); return; }
    setConfirmaExcluir(null);
    await fetch(`/api/investimentos/${recurso}?id=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const t = dados?.totais;

  return (
    <div>
      <PageHeader title="Carteira B3" breadcrumbs={[{ label: "Investimentos" }, { label: "Carteira B3" }]} />
      <div className="px-8 pb-8 space-y-5 max-w-6xl">
        {/* ── Totais ─────────────────────────────────────────────────────── */}
        {t && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Valor da carteira", valor: formatBRL(t.valor), cls: "text-foreground" },
              { label: "Custo", valor: formatBRL(t.custo), cls: "text-foreground" },
              { label: "Resultado", valor: `${formatBRL(t.resultado)}${t.custo > 0 ? ` (${fmtPct((t.resultado / t.custo) * 100)})` : ""}`, cls: t.resultado >= 0 ? "text-success" : "text-danger" },
              { label: "Proventos", valor: formatBRL(t.proventos), cls: "text-success" },
              { label: "Realizado (vendas)", valor: formatBRL(t.realizado), cls: t.realizado >= 0 ? "text-success" : "text-danger" },
            ].map((c) => (
              <div key={c.label} className="bg-card border border-border rounded-xl px-4 py-3">
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
                <p className={cn("text-base font-semibold truncate", c.cls)}>{c.valor}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Evolução (patrimônio investido e proventos) ────────────────── */}
        {dados && dados.series.length >= 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-semibold text-foreground">Evolução do patrimônio</p>
              <p className="text-[11px] text-muted-foreground mb-2">
                Valor investido (custo) ao fim de cada mês · a mercado hoje: <b>{formatBRL(dados.totais.valor)}</b>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dados.series.map((s) => ({ ...s, label: mesLabel(s.mes) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradInvestido" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                  <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={tickStyle} tickFormatter={moedaCompacta} axisLine={false} tickLine={false} width={64} />
                  <Tooltip
                    cursor={{ stroke: "#94a3b8", strokeOpacity: 0.3 }}
                    formatter={(v) => [formatBRL(Number(v)), "Investido"]}
                  />
                  <Area type="monotone" dataKey="investido" stroke="#3b82f6" strokeWidth={2} fill="url(#gradInvestido)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-sm font-semibold text-foreground">Evolução dos proventos</p>
              <p className="text-[11px] text-muted-foreground mb-2">
                Recebidos por mês · acumulado: <b>{formatBRL(dados.totais.proventos)}</b>
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados.series.map((s) => ({ ...s, label: mesLabel(s.mes) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.18} />
                  <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={tickStyle} tickFormatter={moedaCompacta} axisLine={false} tickLine={false} width={64} />
                  <Tooltip
                    cursor={{ fill: "#94a3b8", fillOpacity: 0.08 }}
                    formatter={(v) => [formatBRL(Number(v)), "Proventos"]}
                  />
                  <Bar dataKey="proventos" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Ações ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={atualizarCotacoes} disabled={atualizandoCotacoes}>
            {atualizandoCotacoes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar cotações
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={importando}>
            {importando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Importar extrato B3
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setNovaOperacao(true)}>
              <Plus className="w-3.5 h-3.5" /> Operação
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNovoProvento(true)}>
              <Plus className="w-3.5 h-3.5" /> Provento
            </Button>
          </div>
        </div>
        {msg && <p className="text-xs text-muted-foreground -mt-2">{msg}</p>}
        <p className="text-xs text-muted-foreground -mt-2">
          Extratos: na Área do Investidor da B3, exporte <b>Negociação</b> (vira operações) e <b>Movimentação</b> (vira proventos) em Excel — reimportar não duplica.
        </p>

        {/* ── Abas ───────────────────────────────────────────────────────── */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm w-fit">
          {([["posicoes", "Posições"], ["operacoes", "Operações"], ["proventos", "Proventos"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)} className={cn("px-4 py-1.5 transition-colors", aba === k ? "bg-info/10 text-info font-medium" : "text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !dados || dados.operacoes.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <LineChart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma operação ainda — lance uma compra ou importe o extrato da B3.</p>
          </div>
        ) : aba === "posicoes" ? (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5">Ativo</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Preço médio</th>
                  <th className="px-3 py-2.5 text-right">Cotação</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-right">Resultado</th>
                  <th className="px-3 py-2.5 text-right">Proventos</th>
                  <th className="px-4 py-2.5 text-right">Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dados.posicoes.map((p) => (
                  <tr key={p.ativoId} className={cn(p.quantidade === 0 && "opacity-50")}>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-foreground">{p.ticker}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">{TIPO_ATIVO_LABEL[p.tipo] ?? p.tipo}</span>
                      {p.nome && <p className="text-[11px] text-muted-foreground truncate max-w-52">{p.nome}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtQtd(p.quantidade)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.quantidade > 0 ? formatBRL(p.precoMedio) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {p.precoAtual != null ? formatBRL(p.precoAtual) : "—"}
                      {p.precoAtualizadoEm && <p className="text-[10px] text-muted-foreground">{new Date(p.precoAtualizadoEm).toLocaleDateString("pt-BR")}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{p.valorAtual != null ? formatBRL(p.valorAtual) : formatBRL(p.custoTotal)}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", p.resultado == null ? "text-muted-foreground" : p.resultado >= 0 ? "text-success" : "text-danger")}>
                      {p.resultado != null ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          {p.resultado >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {formatBRL(p.resultado)}{p.resultadoPct != null && <span className="text-[11px]">({fmtPct(p.resultadoPct)})</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-success">{p.proventosRs > 0 ? formatBRL(p.proventosRs) : "—"}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", p.realizadoRs === 0 ? "text-muted-foreground" : p.realizadoRs > 0 ? "text-success" : "text-danger")}>
                      {p.realizadoRs !== 0 ? formatBRL(p.realizadoRs) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : aba === "operacoes" ? (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-3 py-2.5">Ativo</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-right">Preço</th>
                  <th className="px-3 py-2.5 text-right">Custos</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Origem</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dados.operacoes.map((o) => (
                  <tr key={o.id} className="group">
                    <td className="px-4 py-2 tabular-nums">{fmtData(o.data)}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">{o.ticker}</td>
                    <td className="px-3 py-2">
                      <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded", o.tipo === "COMPRA" ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                        {o.tipo === "COMPRA" ? "Compra" : "Venda"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(o.quantidade)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(o.preco)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.custos > 0 ? formatBRL(o.custos) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatBRL(o.quantidade * o.preco + o.custos)}</td>
                    <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{o.importada ? "Extrato B3" : "Manual"}</td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => excluir("operacoes", o.id)} className={cn("text-muted-foreground hover:text-danger", confirmaExcluir === o.id ? "text-danger text-[11px] font-semibold" : "opacity-0 group-hover:opacity-100")}>
                        {confirmaExcluir === o.id ? "Confirmar?" : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            {dados.proventos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12"><Inbox className="w-6 h-6 mx-auto mb-2 opacity-40" />Nenhum provento — importe o extrato de Movimentação ou lance manualmente.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-3 py-2.5">Ativo</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5 text-right">Valor</th>
                    <th className="px-4 py-2.5 text-right">Origem</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dados.proventos.map((p) => (
                    <tr key={p.id} className="group">
                      <td className="px-4 py-2 tabular-nums">{fmtData(p.data)}</td>
                      <td className="px-3 py-2 font-semibold text-foreground">{p.ticker}</td>
                      <td className="px-3 py-2 text-[12px]">{TIPO_PROVENTO_LABEL[p.tipo] ?? p.tipo}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success">{formatBRL(p.valor)}</td>
                      <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{p.importada ? "Extrato B3" : "Manual"}</td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => excluir("proventos", p.id)} className={cn("text-muted-foreground hover:text-danger", confirmaExcluir === p.id ? "text-danger text-[11px] font-semibold" : "opacity-0 group-hover:opacity-100")}>
                          {confirmaExcluir === p.id ? "Confirmar?" : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {novaOperacao && <OperacaoDialog onFechar={() => setNovaOperacao(false)} onSalvo={() => { setNovaOperacao(false); load(); }} />}
      {novoProvento && <ProventoDialog onFechar={() => setNovoProvento(false)} onSalvo={() => { setNovoProvento(false); load(); }} />}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

function DialogShell({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <EscClose onClose={onFechar} />
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{titulo}</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OperacaoDialog({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [ticker, setTicker] = useState("");
  const [tipo, setTipo] = useState("COMPRA");
  const [data, setData] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [custos, setCustos] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setSalvando(true); setErro("");
    const res = await fetch("/api/investimentos/operacoes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, tipo, data, quantidade: quantidade.replace(",", "."), preco: preco.replace(",", "."), custos: custos ? custos.replace(",", ".") : 0 }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSalvando(false);
    if (!res?.ok) { setErro(json?.error || "Erro ao salvar."); return; }
    onSalvo();
  }

  return (
    <DialogShell titulo="Nova operação" onFechar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-1">
          <Label className="text-xs">Ticker</Label>
          <Input autoFocus value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="PETR4" />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <SelectMenu value={tipo} onChange={setTipo} options={[{ value: "COMPRA", label: "Compra" }, { value: "VENDA", label: "Venda" }]} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Data</Label>
          <DatePicker value={data} onChange={setData} />
        </div>
        <div>
          <Label className="text-xs">Quantidade</Label>
          <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" placeholder="100" />
        </div>
        <div>
          <Label className="text-xs">Preço unitário</Label>
          <Input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="35,20" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Custos (corretagem/taxas)</Label>
          <Input value={custos} onChange={(e) => setCustos(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </div>
      </div>
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <Button onClick={salvar} disabled={salvando} className="w-full bg-blue-600 hover:bg-blue-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
      </Button>
    </DialogShell>
  );
}

function ProventoDialog({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [ticker, setTicker] = useState("");
  const [tipo, setTipo] = useState("DIVIDENDO");
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setSalvando(true); setErro("");
    const res = await fetch("/api/investimentos/proventos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, tipo, data, valor: valor.replace(",", ".") }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSalvando(false);
    if (!res?.ok) { setErro(json?.error || "Erro ao salvar."); return; }
    onSalvo();
  }

  return (
    <DialogShell titulo="Novo provento" onFechar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Ticker</Label>
          <Input autoFocus value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="HGLG11" />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <SelectMenu value={tipo} onChange={setTipo} options={[
            { value: "DIVIDENDO", label: "Dividendo" }, { value: "JCP", label: "JCP" },
            { value: "RENDIMENTO", label: "Rendimento" }, { value: "OUTRO", label: "Outro" },
          ]} />
        </div>
        <div>
          <Label className="text-xs">Data</Label>
          <DatePicker value={data} onChange={setData} />
        </div>
        <div>
          <Label className="text-xs">Valor recebido</Label>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="120,50" />
        </div>
      </div>
      {erro && <p className="text-xs text-danger">{erro}</p>}
      <Button onClick={salvar} disabled={salvando} className="w-full bg-blue-600 hover:bg-blue-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
      </Button>
    </DialogShell>
  );
}
