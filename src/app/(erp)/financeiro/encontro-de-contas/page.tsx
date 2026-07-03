"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeftRight, Loader2, Scale, Check, Trash2, Undo2, RefreshCw, Plus, Search, Filter } from "lucide-react";
import { formatBRL, cn } from "@/lib/utils";
import { Autoria } from "@/components/shared/Autoria";

type Elegivel = {
  cpfCnpj: string; nome: string; clienteId: string; fornecedorId: string;
  totalReceber: number; totalPagar: number; minCompensavel: number;
};
type Compensacao = {
  id: string; numero: string; parceiro: string; data: string;
  valorCompensado: number; modoResiduo: string; status: string; nReceber: number; nPagar: number;
};
type TituloAberto = { id: string; numero: string; descricao: string; parceiro: string; dataVencimento: string | null; saldo: number };

const STATUS_BADGE: Record<string, string> = {
  RASCUNHO: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CONFIRMADA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ESTORNADA: "bg-muted text-muted-foreground",
};

export default function EncontroDeContasPage() {
  useTabTitle("Compensação Pagar/Receber");
  const [elegiveis, setElegiveis] = useState<Elegivel[]>([]);
  const [compensacoes, setCompensacoes] = useState<Compensacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [criar, setCriar] = useState<{ pre?: string } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [e, c] = await Promise.all([
      fetch("/api/financeiro/compensacoes/elegiveis").then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/financeiro/compensacoes").then((r) => r.json()).catch(() => ({ data: [] })),
    ]);
    setElegiveis(e.data ?? []);
    setCompensacoes(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Compensação Pagar/Receber"
        subtitle="Compense títulos a receber contra títulos a pagar, sem caixa. Podem ser de parceiros diferentes."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={carregar}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>
            <Button onClick={() => setCriar({})}><Plus className="h-4 w-4 mr-2" />Nova compensação</Button>
          </div>
        }
      />

      {/* Sugestões: parceiros com CR e CP em aberto (mesmo CNPJ) */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Sugestões</h2>
          <span className="text-xs text-muted-foreground">parceiros que são cliente e fornecedor ao mesmo tempo</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : elegiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão automática. Use <span className="font-medium text-foreground">Nova compensação</span> para selecionar títulos livremente.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {elegiveis.map((p) => (
              <div key={p.cpfCnpj} className="rounded-lg border border-border bg-background p-4 space-y-3">
                <div>
                  <p className="font-medium text-foreground truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{p.cpfCnpj}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">A receber</p><p className="text-emerald-600 dark:text-emerald-400 font-medium">{formatBRL(p.totalReceber)}</p></div>
                  <div><p className="text-xs text-muted-foreground">A pagar</p><p className="text-rose-600 dark:text-rose-400 font-medium">{formatBRL(p.totalPagar)}</p></div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <div><p className="text-xs text-muted-foreground">Compensável</p><p className="font-semibold">{formatBRL(p.minCompensavel)}</p></div>
                  <Button size="sm" onClick={() => setCriar({ pre: p.nome })}><Scale className="h-4 w-4 mr-1.5" />Compensar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compensações */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Compensações</h2>
        {compensacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma compensação registrada.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Número</th>
                  <th className="text-left font-medium px-3 py-2">Partes</th>
                  <th className="text-center font-medium px-3 py-2">Títulos</th>
                  <th className="text-right font-medium px-3 py-2">Valor</th>
                  <th className="text-left font-medium px-3 py-2">Resíduo</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {compensacoes.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => setDetalheId(c.id)}>
                    <td className="px-3 py-2 font-medium">{c.numero}</td>
                    <td className="px-3 py-2 truncate max-w-[240px]">{c.parceiro}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{c.nReceber}↓ · {c.nPagar}↑</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(c.valorCompensado)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.modoResiduo === "NOVA_PARCELA" ? "Nova parcela" : "Parcial"}</td>
                    <td className="px-3 py-2"><Badge className={cn("font-normal", STATUS_BADGE[c.status])}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {criar && (
        <SelecaoDialog preParceiro={criar.pre} onClose={() => setCriar(null)} onCriado={() => { setCriar(null); carregar(); }} />
      )}
      {detalheId && (
        <DetalheDialog id={detalheId} onClose={() => setDetalheId(null)} onMudou={carregar} />
      )}
    </div>
  );
}

// ── Diálogo de seleção — grid único (padrão TOTVS "Compensação Entre Carteiras") ─
type Ajuste = { juros?: string; multa?: string; desconto?: string; acrescimo?: string };
type LinhaGrid = TituloAberto & { carteira: "R" | "P" };
const numBR = (s?: string) => { const n = parseFloat((s ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };

function SelecaoDialog({ preParceiro, onClose, onCriado }: { preParceiro?: string; onClose: () => void; onCriado: () => void }) {
  const [titulos, setTitulos] = useState<{ receber: TituloAberto[]; pagar: TituloAberto[] }>({ receber: [], pagar: [] });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [busca, setBusca] = useState("");
  // Filtros por coluna (estilo grid TOTVS): combinam entre si e com a busca.
  const [showFiltros, setShowFiltros] = useState(false);
  const [colFiltros, setColFiltros] = useState({ carteira: "", numero: "", parceiro: "", vencimento: "" });
  const filtrosAtivos = Object.values(colFiltros).filter((v) => v.trim() !== "").length;
  const setCol = (k: keyof typeof colFiltros, v: string) => setColFiltros((p) => ({ ...p, [k]: v }));
  const limparFiltros = () => setColFiltros({ carteira: "", numero: "", parceiro: "", vencimento: "" });
  const [modo, setModo] = useState<"PARCIAL" | "NOVA_PARCELA">("PARCIAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/financeiro/compensacoes/titulos-abertos")
      .then((r) => r.json())
      .then((d) => {
        const data = d.data ?? { receber: [], pagar: [] };
        setTitulos(data);
        if (preParceiro) {
          const ids = [...(data.receber as TituloAberto[]), ...(data.pagar as TituloAberto[])].filter((t) => t.parceiro === preParceiro).map((t) => t.id);
          setSel(new Set(ids));
        }
      })
      .finally(() => setLoading(false));
  }, [preParceiro]);

  const linhas: LinhaGrid[] = useMemo(() => [
    ...titulos.receber.map((t) => ({ ...t, carteira: "R" as const })),
    ...titulos.pagar.map((t) => ({ ...t, carteira: "P" as const })),
  ], [titulos]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const fNum = colFiltros.numero.trim().toLowerCase();
    const fPar = colFiltros.parceiro.trim().toLowerCase();
    const fVen = colFiltros.vencimento.trim().toLowerCase();
    const arr = linhas.filter((l) => {
      if (q && !`${l.numero} ${l.parceiro} ${l.descricao}`.toLowerCase().includes(q)) return false;
      if (colFiltros.carteira && l.carteira !== colFiltros.carteira) return false;
      if (fNum && !String(l.numero).toLowerCase().includes(fNum)) return false;
      if (fPar && !l.parceiro.toLowerCase().includes(fPar)) return false;
      if (fVen) {
        const v = l.dataVencimento ? new Date(l.dataVencimento).toLocaleDateString("pt-BR") : "";
        if (!v.includes(fVen)) return false;
      }
      return true;
    });
    // Selecionados primeiro; depois por parceiro.
    return [...arr].sort((a, b) => (sel.has(b.id) ? 1 : 0) - (sel.has(a.id) ? 1 : 0) || a.parceiro.localeCompare(b.parceiro, "pt-BR"));
  }, [linhas, busca, sel, colFiltros]);

  // Valor efetivo de uma linha selecionada (saldo ± ajustes).
  const efetivo = (l: LinhaGrid) => { const a = ajustes[l.id] ?? {}; return l.saldo + numBR(a.juros) + numBR(a.multa) + numBR(a.acrescimo) - numBR(a.desconto); };

  const exibidoR = useMemo(() => titulos.receber.reduce((s, t) => s + t.saldo, 0), [titulos]);
  const exibidoP = useMemo(() => titulos.pagar.reduce((s, t) => s + t.saldo, 0), [titulos]);
  const selR = useMemo(() => linhas.filter((l) => l.carteira === "R" && sel.has(l.id)).reduce((s, l) => s + efetivo(l), 0), [linhas, sel, ajustes]);
  const selP = useMemo(() => linhas.filter((l) => l.carteira === "P" && sel.has(l.id)).reduce((s, l) => s + efetivo(l), 0), [linhas, sel, ajustes]);
  const min = Math.min(selR, selP);
  const residual = Math.abs(selR - selP);
  const houveAjuste = Object.values(ajustes).some((a) => numBR(a.juros) + numBR(a.multa) + numBR(a.desconto) + numBR(a.acrescimo) > 0.005);

  const setAj = (id: string, campo: keyof Ajuste, v: string) => setAjustes((p) => ({ ...p, [id]: { ...p[id], [campo]: v } }));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const criar = async () => {
    setError(null);
    if (min <= 0) { setError("Selecione títulos das duas carteiras (a pagar e a receber)."); return; }
    setSaving(true);
    const corpo = (l: LinhaGrid) => { const a = ajustes[l.id] ?? {}; return { id: l.id, juros: numBR(a.juros), multa: numBR(a.multa), desconto: numBR(a.desconto), acrescimo: numBR(a.acrescimo) }; };
    const res = await fetch("/api/financeiro/compensacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receber: linhas.filter((l) => l.carteira === "R" && sel.has(l.id)).map(corpo),
        pagar: linhas.filter((l) => l.carteira === "P" && sel.has(l.id)).map(corpo),
        modoResiduo: houveAjuste ? "PARCIAL" : modo,
      }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao criar."); setSaving(false); return; }
    onCriado();
  };

  const AjInput = ({ id, campo }: { id: string; campo: keyof Ajuste }) => (
    <input
      type="number" step="0.01" min="0"
      value={(ajustes[id]?.[campo]) ?? ""}
      disabled={!sel.has(id)}
      onChange={(e) => setAj(id, campo, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="w-16 h-7 rounded border border-border bg-background px-1.5 text-right text-xs tabular-nums disabled:opacity-40 disabled:bg-muted/50"
      placeholder="0,00"
    />
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[97vw] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Compensação entre carteiras</DialogTitle>
          <DialogDescription>Selecione títulos a pagar (P) e a receber (R) — de qualquer parceiro. Ajuste juros/multa/desconto para igualar os lados; o menor lado é compensado.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Carregando títulos…</div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar parceiro, número…" className="h-8 pl-8 text-sm" />
              </div>
              <button
                type="button"
                onClick={() => setShowFiltros((v) => !v)}
                title="Filtros por coluna"
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-sm transition-colors",
                  showFiltros || filtrosAtivos > 0 ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Filter className="h-3.5 w-3.5" /> Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ""}
              </button>
              {filtrosAtivos > 0 && (
                <button type="button" onClick={limparFiltros} className="text-xs text-muted-foreground hover:text-foreground">Limpar</button>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-auto max-h-[46vh]">
              <table className="w-full text-sm border-collapse">
                <thead className="text-muted-foreground sticky top-0 z-10">
                  <tr className="[&>th]:bg-muted [&>th]:px-2 [&>th]:py-2 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
                    <th className="w-8"></th>
                    <th>Cart.</th>
                    <th>Número</th>
                    <th>Parceiro</th>
                    <th>Vencimento</th>
                    <th className="text-right">A Receber</th>
                    <th className="text-right">A Pagar</th>
                    <th className="text-right">Juros</th>
                    <th className="text-right">Multa</th>
                    <th className="text-right">Desconto</th>
                    <th className="text-right">Acrésc.</th>
                    <th className="text-right">Efetivo</th>
                  </tr>
                  {showFiltros && (
                    <tr className="[&>th]:bg-muted [&>th]:px-2 [&>th]:pb-2 [&>th]:align-top [&>th]:font-normal">
                      <th></th>
                      <th>
                        <select
                          value={colFiltros.carteira}
                          onChange={(e) => setCol("carteira", e.target.value)}
                          className="w-full h-6 rounded border border-border bg-background px-1 text-xs"
                        >
                          <option value="">Todas</option>
                          <option value="R">R</option>
                          <option value="P">P</option>
                        </select>
                      </th>
                      <th><input value={colFiltros.numero} onChange={(e) => setCol("numero", e.target.value)} placeholder="Filtrar…" className="w-full h-6 rounded border border-border bg-background px-1.5 text-xs" /></th>
                      <th><input value={colFiltros.parceiro} onChange={(e) => setCol("parceiro", e.target.value)} placeholder="Filtrar…" className="w-full h-6 rounded border border-border bg-background px-1.5 text-xs" /></th>
                      <th><input value={colFiltros.vencimento} onChange={(e) => setCol("vencimento", e.target.value)} placeholder="dd/mm/aaaa" className="w-full h-6 rounded border border-border bg-background px-1.5 text-xs" /></th>
                      <th></th><th></th><th></th><th></th><th></th><th></th><th></th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filtradas.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Nenhum título em aberto.</td></tr>}
                  {filtradas.map((l) => {
                    const on = sel.has(l.id);
                    return (
                      <tr key={l.id} onClick={() => toggle(l.id)} className={cn("border-t border-border cursor-pointer [&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap", on ? "bg-primary/5" : "hover:bg-muted/40")}>
                        <td><input type="checkbox" checked={on} onChange={() => toggle(l.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4" /></td>
                        <td><Badge className={cn("font-normal", l.carteira === "R" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300")}>{l.carteira}</Badge></td>
                        <td className="font-mono text-xs">{l.numero}</td>
                        <td className="max-w-[220px] truncate">{l.parceiro}</td>
                        <td className="text-xs text-muted-foreground">{l.dataVencimento ? new Date(l.dataVencimento).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{l.carteira === "R" ? formatBRL(l.saldo) : ""}</td>
                        <td className="text-right tabular-nums text-rose-600 dark:text-rose-400">{l.carteira === "P" ? formatBRL(l.saldo) : ""}</td>
                        <td className="text-right"><AjInput id={l.id} campo="juros" /></td>
                        <td className="text-right"><AjInput id={l.id} campo="multa" /></td>
                        <td className="text-right"><AjInput id={l.id} campo="desconto" /></td>
                        <td className="text-right"><AjInput id={l.id} campo="acrescimo" /></td>
                        <td className="text-right tabular-nums font-medium">{on ? formatBRL(efetivo(l)) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Barra de totais (padrão TOTVS) */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Total Exibido</p><p className="tabular-nums">Pagar {formatBRL(exibidoP)}</p><p className="tabular-nums">Receber {formatBRL(exibidoR)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Selecionado</p><p className="tabular-nums text-rose-600 dark:text-rose-400">Pagar {formatBRL(selP)}</p><p className="tabular-nums text-emerald-600 dark:text-emerald-400">Receber {formatBRL(selR)}</p></div>
              <div><p className="text-xs text-muted-foreground">Compensa</p><p className="font-semibold text-lg tabular-nums">{formatBRL(min)}</p></div>
              <div><p className="text-xs text-muted-foreground">Resíduo</p><p className={cn("font-medium tabular-nums", residual > 0.005 ? "text-amber-600 dark:text-amber-400" : "")}>{formatBRL(residual)}</p>{residual > 0.005 && <p className="text-[11px] text-muted-foreground">no lado {selR > selP ? "a receber" : "a pagar"}</p>}</div>
            </div>

            {residual > 0.005 && !houveAjuste && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo("PARCIAL")} className={cn("flex-1 rounded-md border px-3 py-2 text-sm text-left", modo === "PARCIAL" ? "border-primary bg-primary/5" : "border-border")}>
                  <span className="font-medium">Baixa parcial</span><br /><span className="text-xs text-muted-foreground">Resíduo fica aberto nos títulos originais.</span>
                </button>
                <button type="button" onClick={() => setModo("NOVA_PARCELA")} className={cn("flex-1 rounded-md border px-3 py-2 text-sm text-left", modo === "NOVA_PARCELA" ? "border-primary bg-primary/5" : "border-border")}>
                  <span className="font-medium">Nova parcela</span><br /><span className="text-xs text-muted-foreground">Quita 100% e cria um título novo por parte.</span>
                </button>
              </div>
            )}
            {residual > 0.005 && houveAjuste && <p className="text-xs text-muted-foreground">Com ajustes, o resíduo fica em aberto nos títulos originais.</p>}
            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={criar} disabled={saving || loading || min <= 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowLeftRight className="h-4 w-4 mr-2" />}
            Criar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo de detalhe / confirmação / estorno ───────────────────────────────
type Detalhe = {
  id: string; numero: string; parceiro: string; status: string; modoResiduo: string;
  valorCompensado: number; observacoes: string | null; criadoPor: string | null; atualizadoPor?: string | null;
  itens: { id: string; tipo: string; numero: string; descricao: string; parte: string; valorAplicado: number; juros: number; multa: number; desconto: number; acrescimo: number }[];
  residuos: { tipo: string; numero: string; valor: number; status: string }[];
};

// Resumo dos ajustes de um item (para o detalhe).
function resumoAjuste(i: { juros: number; multa: number; desconto: number; acrescimo: number }): string {
  const p: string[] = [];
  if (i.juros > 0.005) p.push(`+ juros ${formatBRL(i.juros)}`);
  if (i.multa > 0.005) p.push(`+ multa ${formatBRL(i.multa)}`);
  if (i.acrescimo > 0.005) p.push(`+ acrésc. ${formatBRL(i.acrescimo)}`);
  if (i.desconto > 0.005) p.push(`− desc. ${formatBRL(i.desconto)}`);
  return p.join(" ");
}

function DetalheDialog({ id, onClose, onMudou }: { id: string; onClose: () => void; onMudou: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch(`/api/financeiro/compensacoes/${id}`).then((r) => r.json()).then((j) => setD(j.data ?? null));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const acao = async (path: string, method = "POST") => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/financeiro/compensacoes/${id}${path}`, { method });
    if (!res.ok) { setError((await res.json()).error ?? "Erro."); setBusy(false); return; }
    setBusy(false);
    onMudou();
    if (path === "" && method === "DELETE") { onClose(); return; }
    carregar();
  };

  const receber = d?.itens.filter((i) => i.tipo === "RECEBER") ?? [];
  const pagar = d?.itens.filter((i) => i.tipo === "PAGAR") ?? [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{d?.numero ?? "Compensação"}
            {d && <Badge className={cn("font-normal", STATUS_BADGE[d.status])}>{d.status}</Badge>}
          </DialogTitle>
          <DialogDescription>{d?.parceiro}</DialogDescription>
        </DialogHeader>

        {!d ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Valor compensado</span>
              <span className="font-semibold">{formatBRL(d.valorCompensado)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">A receber</p>
                {receber.map((i) => <div key={i.id}><div className="flex justify-between gap-2"><span className="truncate text-xs">{i.numero} · {i.parte}</span><span className="tabular-nums">{formatBRL(i.valorAplicado)}</span></div>{resumoAjuste(i) && <p className="text-[11px] text-muted-foreground">{resumoAjuste(i)}</p>}</div>)}
              </div>
              <div className="space-y-1">
                <p className="font-medium text-rose-600 dark:text-rose-400">A pagar</p>
                {pagar.map((i) => <div key={i.id}><div className="flex justify-between gap-2"><span className="truncate text-xs">{i.numero} · {i.parte}</span><span className="tabular-nums">{formatBRL(i.valorAplicado)}</span></div>{resumoAjuste(i) && <p className="text-[11px] text-muted-foreground">{resumoAjuste(i)}</p>}</div>)}
              </div>
            </div>

            {d.residuos.length > 0 && (
              <div className="text-sm space-y-1">
                <p className="font-medium">Títulos-resíduo</p>
                {d.residuos.map((r) => <div key={r.numero} className="flex justify-between gap-2"><span className="text-xs">{r.numero} · {r.tipo === "RECEBER" ? "a receber" : "a pagar"} · {r.status}</span><span className="tabular-nums">{formatBRL(r.valor)}</span></div>)}
              </div>
            )}

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

            <Autoria criadoPor={d.criadoPor} atualizadoPor={d.atualizadoPor} />
          </div>
        )}

        <DialogFooter>
          {d?.status === "RASCUNHO" && (
            <>
              <Button variant="outline" onClick={() => acao("", "DELETE")} disabled={busy}><Trash2 className="h-4 w-4 mr-2" />Excluir</Button>
              <Button onClick={() => acao("/confirmar")} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Confirmar</Button>
            </>
          )}
          {d?.status === "CONFIRMADA" && (
            <Button variant="outline" onClick={() => acao("/estornar")} disabled={busy} className="text-rose-600 dark:text-rose-400"><Undo2 className="h-4 w-4 mr-2" />Estornar</Button>
          )}
          {d?.status === "ESTORNADA" && <Button variant="outline" onClick={onClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
