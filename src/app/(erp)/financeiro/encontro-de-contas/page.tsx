"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeftRight, Loader2, Scale, Check, Trash2, Undo2, RefreshCw } from "lucide-react";
import { formatBRL, cn } from "@/lib/utils";

type Elegivel = {
  cpfCnpj: string; nome: string; clienteId: string; fornecedorId: string;
  totalReceber: number; totalPagar: number; minCompensavel: number;
};
type Compensacao = {
  id: string; numero: string; parceiro: string; data: string;
  valorCompensado: number; modoResiduo: string; status: string; qtdItens: number;
};
type TituloAberto = { id: string; numero: string; descricao: string; dataVencimento: string | null; saldo: number };

const STATUS_BADGE: Record<string, string> = {
  RASCUNHO: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CONFIRMADA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ESTORNADA: "bg-muted text-muted-foreground",
};

export default function EncontroDeContasPage() {
  const [elegiveis, setElegiveis] = useState<Elegivel[]>([]);
  const [compensacoes, setCompensacoes] = useState<Compensacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selParceiro, setSelParceiro] = useState<Elegivel | null>(null);
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
    <div className="space-y-6">
      <PageHeader
        title="Encontro de Contas"
        subtitle="Compense o que um parceiro deve (a receber) contra o que devemos a ele (a pagar), sem caixa."
        action={<Button variant="outline" onClick={carregar}><RefreshCw className="h-4 w-4 mr-2" />Atualizar</Button>}
      />

      {/* Parceiros elegíveis */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Parceiros elegíveis</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : elegiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum parceiro com títulos a receber e a pagar em aberto ao mesmo tempo.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {elegiveis.map((p) => (
              <div key={p.cpfCnpj} className="rounded-lg border border-border bg-card p-4 space-y-3">
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
                  <Button size="sm" onClick={() => setSelParceiro(p)}><Scale className="h-4 w-4 mr-1.5" />Compensar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compensações */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Compensações</h2>
        {compensacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma compensação registrada.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Número</th>
                  <th className="text-left font-medium px-3 py-2">Parceiro</th>
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
                    <td className="px-3 py-2 text-right">{formatBRL(c.valorCompensado)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.modoResiduo === "NOVA_PARCELA" ? "Nova parcela" : "Parcial"}</td>
                    <td className="px-3 py-2"><Badge className={cn("font-normal", STATUS_BADGE[c.status])}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selParceiro && (
        <SelecaoDialog parceiro={selParceiro} onClose={() => setSelParceiro(null)} onCriado={() => { setSelParceiro(null); carregar(); }} />
      )}
      {detalheId && (
        <DetalheDialog id={detalheId} onClose={() => setDetalheId(null)} onMudou={carregar} />
      )}
    </div>
  );
}

// ── Diálogo de seleção de títulos ────────────────────────────────────────────
function SelecaoDialog({ parceiro, onClose, onCriado }: { parceiro: Elegivel; onClose: () => void; onCriado: () => void }) {
  const [titulos, setTitulos] = useState<{ receber: TituloAberto[]; pagar: TituloAberto[] }>({ receber: [], pagar: [] });
  const [selR, setSelR] = useState<Set<string>>(new Set());
  const [selP, setSelP] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"PARCIAL" | "NOVA_PARCELA">("PARCIAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/financeiro/compensacoes/elegiveis/${parceiro.cpfCnpj}`)
      .then((r) => r.json())
      .then((d) => {
        setTitulos(d.data ?? { receber: [], pagar: [] });
        setSelR(new Set((d.data?.receber ?? []).map((t: TituloAberto) => t.id)));
        setSelP(new Set((d.data?.pagar ?? []).map((t: TituloAberto) => t.id)));
      })
      .finally(() => setLoading(false));
  }, [parceiro.cpfCnpj]);

  const somaR = useMemo(() => titulos.receber.filter((t) => selR.has(t.id)).reduce((s, t) => s + t.saldo, 0), [titulos, selR]);
  const somaP = useMemo(() => titulos.pagar.filter((t) => selP.has(t.id)).reduce((s, t) => s + t.saldo, 0), [titulos, selP]);
  const min = Math.min(somaR, somaP);
  const residual = Math.abs(somaR - somaP);

  const criar = async () => {
    setError(null);
    if (min <= 0) { setError("Selecione títulos dos dois lados."); return; }
    setSaving(true);
    const res = await fetch("/api/financeiro/compensacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cpfCnpj: parceiro.cpfCnpj, clienteId: parceiro.clienteId, fornecedorId: parceiro.fornecedorId,
        receberIds: Array.from(selR), pagarIds: Array.from(selP), modoResiduo: modo,
      }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao criar."); setSaving(false); return; }
    onCriado();
  };

  const Coluna = ({ titulo, lista, sel, setSel, cor }: { titulo: string; lista: TituloAberto[]; sel: Set<string>; setSel: (s: Set<string>) => void; cor: string }) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhum título.</p>}
        {lista.map((t) => (
          <label key={t.id} className={cn("flex items-center gap-2 rounded-md border border-border px-2.5 py-2 cursor-pointer", sel.has(t.id) && "bg-muted/60")}>
            <input
              type="checkbox"
              checked={sel.has(t.id)}
              onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(t.id); else n.delete(t.id); setSel(n); }}
              className="h-4 w-4 accent-current"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{t.numero} · {t.descricao || "—"}</p>
              {t.dataVencimento && <p className="text-[11px] text-muted-foreground">vence {new Date(t.dataVencimento).toLocaleDateString("pt-BR")}</p>}
            </div>
            <span className={cn("text-sm font-medium tabular-nums", cor)}>{formatBRL(t.saldo)}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compensar — {parceiro.nome}</DialogTitle>
          <DialogDescription>Selecione os títulos a receber e a pagar. Compensa o menor lado; o resíduo pode ficar aberto ou virar uma nova parcela.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Carregando títulos…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-6">
              <Coluna titulo="A receber" lista={titulos.receber} sel={selR} setSel={setSelR} cor="text-emerald-600 dark:text-emerald-400" />
              <Coluna titulo="A pagar" lista={titulos.pagar} sel={selP} setSel={setSelP} cor="text-rose-600 dark:text-rose-400" />
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Σ Receber</p><p className="font-medium">{formatBRL(somaR)}</p></div>
              <div><p className="text-xs text-muted-foreground">Σ Pagar</p><p className="font-medium">{formatBRL(somaP)}</p></div>
              <div><p className="text-xs text-muted-foreground">Compensa</p><p className="font-semibold text-foreground">{formatBRL(min)}</p></div>
            </div>

            {residual > 0.005 && (
              <div className="space-y-2">
                <p className="text-sm">Resíduo de <span className="font-medium">{formatBRL(residual)}</span> no lado {somaR > somaP ? "a receber" : "a pagar"}:</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setModo("PARCIAL")} className={cn("flex-1 rounded-md border px-3 py-2 text-sm text-left", modo === "PARCIAL" ? "border-primary bg-primary/5" : "border-border")}>
                    <span className="font-medium">Baixa parcial</span><br /><span className="text-xs text-muted-foreground">Resíduo fica aberto nos títulos originais.</span>
                  </button>
                  <button type="button" onClick={() => setModo("NOVA_PARCELA")} className={cn("flex-1 rounded-md border px-3 py-2 text-sm text-left", modo === "NOVA_PARCELA" ? "border-primary bg-primary/5" : "border-border")}>
                    <span className="font-medium">Nova parcela</span><br /><span className="text-xs text-muted-foreground">Quita 100% e cria um título novo com a diferença.</span>
                  </button>
                </div>
              </div>
            )}

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
  valorCompensado: number; observacoes: string | null; criadoPor: string | null;
  itens: { id: string; tipo: string; numero: string; descricao: string; valorAplicado: number }[];
  residuos: { tipo: string; numero: string; valor: number; status: string }[];
};

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
                {receber.map((i) => <div key={i.id} className="flex justify-between gap-2"><span className="truncate text-xs">{i.numero}</span><span className="tabular-nums">{formatBRL(i.valorAplicado)}</span></div>)}
              </div>
              <div className="space-y-1">
                <p className="font-medium text-rose-600 dark:text-rose-400">A pagar</p>
                {pagar.map((i) => <div key={i.id} className="flex justify-between gap-2"><span className="truncate text-xs">{i.numero}</span><span className="tabular-nums">{formatBRL(i.valorAplicado)}</span></div>)}
              </div>
            </div>

            {d.residuos.length > 0 && (
              <div className="text-sm space-y-1">
                <p className="font-medium">Título-resíduo</p>
                {d.residuos.map((r) => <div key={r.numero} className="flex justify-between gap-2"><span className="text-xs">{r.numero} · {r.tipo === "RECEBER" ? "a receber" : "a pagar"} · {r.status}</span><span className="tabular-nums">{formatBRL(r.valor)}</span></div>)}
              </div>
            )}

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
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
