"use client";
import { useEffect, useState } from "react";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBRL, cn } from "@/lib/utils";
import { Plus, Trash2, Loader2, TrendingUp, TrendingDown, Minus, Truck, Store, X } from "lucide-react";

export type PrecoConcorrente = {
  id: string;
  itemId: string | null;
  produtoNome: string;
  preco: number | string;
  unidade: string | null;
  condicaoPagamento: string | null;
  modalidade: string | null;
  dataColeta: string;
  observacao: string | null;
  item: { id: string; codigo: string; descricao: string; precoVenda: number | string } | null;
};

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function ModalidadeBadge({ m }: { m: string | null }) {
  if (m === "ENTREGA") return <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400"><Truck className="h-3 w-3" /> Entrega</span>;
  if (m === "RETIRADA") return <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"><Store className="h-3 w-3" /> Retirada</span>;
  return <span className="text-muted-foreground/60">—</span>;
}

export default function ConcorrentePrecos({
  concorrenteId,
  precosIniciais,
}: {
  concorrenteId: string;
  precosIniciais: PrecoConcorrente[];
}) {
  const [precos, setPrecos] = useState<PrecoConcorrente[]>(precosIniciais);
  const [itens, setItens] = useState<ComboboxOption[]>([]);
  const [precoMap, setPrecoMap] = useState<Record<string, number>>({});

  // Novo registro (em popup)
  const [aberto, setAberto] = useState(false);
  const [unidadesItem, setUnidadesItem] = useState<string[]>([]); // siglas das unidades do produto selecionado (base + alternativas, ex.: UN, MI)
  const [itemId, setItemId] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [preco, setPreco] = useState("");
  const [unidade, setUnidade] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Só produtos acabados e mercadorias para revenda, agrupados no combobox.
    fetch("/api/itens?limit=500&categoria=PRODUTO_ACABADO,MERCADORIA")
      .then((r) => r.json())
      .then((j) => {
        const lista: any[] = j.data ?? j ?? [];
        setItens(
          lista.map((it) => ({
            value: it.id,
            label: it.descricao,
            code: it.codigo,
            group: it.categoriaEstoque === "MERCADORIA" ? "Mercadorias para Revenda" : "Produtos Acabados",
          })),
        );
        const m: Record<string, number> = {};
        for (const it of lista) {
          const pv = toNum(it.precoVenda);
          if (pv != null) m[it.id] = pv;
        }
        setPrecoMap(m);
      })
      .catch(() => {});
  }, []);

  // Unidades do produto do catálogo selecionado (base + alternativas, ex.: UN, MI).
  // Permite escolher a unidade do preço; default = principal.
  useEffect(() => {
    if (!itemId) { setUnidadesItem([]); return; }
    let cancel = false;
    fetch(`/api/suprimentos/produtos/${itemId}/unidades`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { unidade?: { sigla?: string } }[]) => {
        if (cancel) return;
        const siglas = (Array.isArray(rows) ? rows : []).map((r) => r.unidade?.sigla).filter((s): s is string => !!s);
        setUnidadesItem(siglas);
        setUnidade(siglas[0] ?? ""); // principal vem primeiro (endpoint ordena isPrincipal desc)
      })
      .catch(() => { if (!cancel) setUnidadesItem([]); });
    return () => { cancel = true; };
  }, [itemId]);

  const nossoPrecoNovo = itemId ? precoMap[itemId] ?? null : null;

  async function adicionar() {
    setErro(null);
    const precoNum = parseFloat(preco.replace(",", "."));
    const nome = itemId ? itens.find((i) => i.value === itemId)?.label ?? produtoNome : produtoNome;
    if (!nome.trim()) { setErro("Informe o produto (selecione do catálogo ou digite o nome)."); return; }
    if (Number.isNaN(precoNum) || precoNum < 0) { setErro("Preço inválido."); return; }
    setSalvando(true);
    try {
      const res = await fetch(`/api/marketing/concorrentes/${concorrenteId}/precos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: itemId || null,
          produtoNome: nome,
          preco: precoNum,
          unidade: unidade || null,
          condicaoPagamento: condicaoPagamento || null,
          modalidade: modalidade || null,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setPrecos((p) => [...p, json.data]);
        setItemId(""); setProdutoNome(""); setPreco(""); setUnidade(""); setCondicaoPagamento(""); setModalidade(""); setUnidadesItem([]);
        setAberto(false);
      } else {
        const j = await res.json().catch(() => ({}));
        setErro(j.error ?? "Erro ao adicionar preço.");
      }
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    const res = await fetch(`/api/marketing/concorrentes/${concorrenteId}/precos/${id}`, { method: "DELETE" });
    if (res.ok) setPrecos((p) => p.filter((x) => x.id !== id));
  }

  const selectCls = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground";

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Preços mapeados</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compare com o nosso preço de venda. O mesmo produto pode ter mais de um preço conforme a condição de pagamento e entrega/retirada.
          </p>
        </div>
        <Button type="button" onClick={() => { setErro(null); setAberto(true); }} className="h-9 gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Adicionar preço
        </Button>
      </div>

      {/* Tabela */}
      {precos.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum preço mapeado ainda.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="px-5 py-2 font-semibold">Produto</th>
              <th className="px-3 py-2 font-semibold">Cond. pagamento</th>
              <th className="px-3 py-2 font-semibold">Entrega/Retirada</th>
              <th className="px-3 py-2 font-semibold text-right">Preço competidor</th>
              <th className="px-3 py-2 font-semibold text-right">Nosso preço</th>
              <th className="px-3 py-2 font-semibold text-right">Diferença</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {precos.map((p) => {
              const precoConc = toNum(p.preco)!;
              const nosso = toNum(p.item?.precoVenda);
              const diff = nosso != null ? precoConc - nosso : null;
              const diffPct = nosso != null && nosso !== 0 ? (diff! / nosso) * 100 : null;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-2.5">
                    <span className="text-foreground">{p.produtoNome}</span>
                    {p.item && <span className="ml-2 text-[11px] text-muted-foreground">{p.item.codigo}</span>}
                    {!p.item && <span className="ml-2 text-[10px] uppercase font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">avulso</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.condicaoPagamento || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="px-3 py-2.5"><ModalidadeBadge m={p.modalidade} /></td>
                  <td className="px-3 py-2.5 text-right font-medium text-foreground">{formatBRL(precoConc)}{p.unidade ? `/${p.unidade}` : ""}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{nosso != null ? formatBRL(nosso) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {diff == null ? <span className="text-muted-foreground">—</span> : (
                      <span className={cn("inline-flex items-center gap-1 font-medium", diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                        {diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : diff < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                        {diff > 0 ? "+" : ""}{formatBRL(diff)}{diffPct != null ? ` (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(0)}%)` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => remover(p.id)} className="text-muted-foreground hover:text-danger transition-colors" title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border">
        Diferença positiva (verde) = competidor mais caro que nós. Negativa (vermelho) = competidor mais barato.
      </div>

      {/* Popup — novo preço de competidor */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Plus className="h-5 w-5 text-blue-600" /> Novo preço de competidor</h3>
              <button onClick={() => setAberto(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-7">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Produto (catálogo)</label>
                  <ComboboxWithCreate
                    options={itens}
                    value={itemId}
                    onChange={(v) => { setItemId(v); const lbl = itens.find((i) => i.value === v)?.label; if (lbl) setProdutoNome(lbl); }}
                    placeholder="Vincular ao nosso catálogo..."
                    noneLabel="Produto avulso (texto livre)"
                  />
                </div>
                <div className="col-span-5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Ou nome avulso</label>
                  <Input value={produtoNome} disabled={!!itemId} onChange={(e) => setProdutoNome(e.target.value)} placeholder="Nome do produto" className="h-10 border-border" />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-3">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Preço comp.</label>
                  <Input value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" inputMode="decimal" className="h-10 border-border" />
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Unidade</label>
                  {itemId && unidadesItem.length > 0 ? (
                    <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={selectCls}>
                      {unidadesItem.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="UN" className="h-10 border-border" />
                  )}
                </div>
                <div className="col-span-6">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Entrega / Retirada</label>
                  <select value={modalidade} onChange={(e) => setModalidade(e.target.value)} className={selectCls}>
                    <option value="">Indiferente</option>
                    <option value="ENTREGA">Entrega</option>
                    <option value="RETIRADA">Retirada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Condição de pagamento</label>
                <Input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="Ex.: À vista, 30 dias, 30/60/90" className="h-10 border-border" />
              </div>

              {nossoPrecoNovo != null && (
                <p className="text-[11px] text-muted-foreground">Nosso preço deste item: <strong>{formatBRL(nossoPrecoNovo)}</strong></p>
              )}
              {erro && <p className="text-xs text-danger">{erro}</p>}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setAberto(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <Button type="button" onClick={adicionar} disabled={salvando} className="h-10 gap-1.5">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
