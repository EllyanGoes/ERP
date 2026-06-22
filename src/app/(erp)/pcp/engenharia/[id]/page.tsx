"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { ArrowLeft, RefreshCw, Save, Trash2, AlertTriangle, Check } from "lucide-react";

interface ItemLite { id: string; codigo: string; descricao: string; }

interface Linha {
  insumoItemId: string;
  codigo: string;
  descricao: string;
  quantidade: string;
  base: string;
  categoria: string;
}
interface Eng {
  id: string;
  item: { codigo: string; descricao: string } | null;
  fluxo: { id: string; nome: string } | null;
  ativo: boolean;
  insumos: { insumoItemId: string; quantidade: string | number; base: string; categoria: string; insumoItem: { codigo: string; descricao: string } }[];
}
interface FluxoOpt { id: string; nome: string; }

const BASES = [
  { v: "POR_MILHEIRO", l: "por milheiro" },
  { v: "POR_UNIDADE", l: "por unidade" },
  { v: "POR_CICLO", l: "por ciclo" },
  { v: "POR_VAGAO", l: "por vagão" },
];
const CATEGORIAS = [
  { v: "MATERIA_PRIMA", l: "Matéria-prima" },
  { v: "MISTURA", l: "Mistura" },
  { v: "EMBALAGEM", l: "Embalagem" },
  { v: "ENERGIA", l: "Energia" },
  { v: "OUTRO", l: "Outro" },
];
const selCls = "rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500";

export default function EngenhariaDetalhePage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";
  const router = useRouter();
  useTabTitle("Engenharia do Produto");

  const [eng, setEng] = useState<Eng | null>(null);
  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState(false);
  const [itens, setItens] = useState<ItemLite[]>([]);

  useEffect(() => {
    fetch("/api/itens?limit=1000")
      .then((r) => r.json())
      .then((j) => setItens((j.data ?? []).map((it: ItemLite) => ({ id: it.id, codigo: it.codigo, descricao: it.descricao }))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [re, rf] = await Promise.all([fetch(`/api/pcp/engenharia/${id}`), fetch("/api/pcp/fluxos")]);
      const [je, jf] = await Promise.all([re.json(), rf.json()]);
      if (!re.ok) throw new Error(je?.error ?? "Erro ao carregar");
      const e: Eng = je.data;
      setEng(e);
      setFluxoId(e.fluxo?.id ?? "");
      setFluxos(jf.data ?? []);
      setLinhas(
        e.insumos.map((i) => ({
          insumoItemId: i.insumoItemId,
          codigo: i.insumoItem.codigo,
          descricao: i.insumoItem.descricao,
          quantidade: String(i.quantidade),
          base: i.base,
          categoria: i.categoria,
        })),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  function addInsumo(it: ItemLite) {
    if (linhas.some((l) => l.insumoItemId === it.id)) return;
    setLinhas((prev) => [...prev, { insumoItemId: it.id, codigo: it.codigo, descricao: it.descricao, quantidade: "", base: "POR_MILHEIRO", categoria: "MATERIA_PRIMA" }]);
  }
  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function rmLinha(i: number) { setLinhas((prev) => prev.filter((_, idx) => idx !== i)); }

  async function salvar() {
    setSaving(true);
    setErro(null);
    setOkMsg(false);
    try {
      const insumos = linhas.map((l) => ({
        insumoItemId: l.insumoItemId,
        quantidade: l.quantidade === "" ? 0 : Number(l.quantidade),
        base: l.base,
        categoria: l.categoria,
      }));
      const r = await fetch(`/api/pcp/engenharia/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId, insumos }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao salvar");
      setOkMsg(true);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (erro && !eng) {
    return <div className="flex flex-col items-center justify-center h-full gap-2"><AlertTriangle className="w-7 h-7 text-amber-400" /><p className="text-sm text-muted-foreground">{erro}</p></div>;
  }
  if (!eng) {
    return <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando…</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={eng.item?.descricao ?? "Engenharia"}
        subtitle={`${eng.item?.codigo ?? ""} · estrutura (BOM) e fluxo de produção`}
        breadcrumbs={[{ label: "PCP" }, { label: "Engenharia", href: "/pcp/engenharia" }, { label: eng.item?.codigo ?? "" }]}
        action={
          <div className="flex items-center gap-2">
            {okMsg && <span className="text-xs text-success inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Salvo</span>}
            <button onClick={salvar} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        <button onClick={() => router.push("/pcp/engenharia")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-muted-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
        {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {/* Fluxo */}
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo de produção (compartilhado)</label>
          <ComboboxWithCreate
            value={fluxoId}
            onChange={(v) => setFluxoId(v)}
            noneLabel="—"
            triggerClassName="h-9 rounded-lg max-w-md"
            options={fluxos.map((f) => ({ value: f.id, label: f.nome }))}
          />
        </div>

        {/* BOM */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Insumos (estrutura do produto)</h3>
            <div className="w-72">
              <ComboboxWithCreate
                value=""
                onChange={(id) => { const it = itens.find((x) => x.id === id); if (it) addInsumo(it); }}
                allowNone={false}
                placeholder="Adicionar insumo…"
                triggerClassName="h-9 rounded-lg"
                options={itens
                  .filter((it) => !linhas.some((l) => l.insumoItemId === it.id))
                  .map((it) => ({ value: it.id, label: it.descricao, code: it.codigo }))}
              />
            </div>
          </div>

          {linhas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhum insumo. Use a busca acima para adicionar argila, água, caco, biomassa, pallet, fita, grampo…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium py-1.5">Insumo</th>
                  <th className="text-right font-medium py-1.5 w-28">Quantidade</th>
                  <th className="text-left font-medium py-1.5 w-32">Base</th>
                  <th className="text-left font-medium py-1.5 w-36">Categoria</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l, i) => (
                  <tr key={l.insumoItemId}>
                    <td className="py-1.5 text-foreground"><span className="font-mono text-muted-foreground text-xs mr-2">{l.codigo}</span>{l.descricao}</td>
                    <td className="py-1.5 text-right">
                      <input className={selCls + " w-24 text-right tabular-nums"} inputMode="decimal" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value })} />
                    </td>
                    <td className="py-1.5">
                      <select className={selCls} value={l.base} onChange={(e) => setLinha(i, { base: e.target.value })}>
                        {BASES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <select className={selCls} value={l.categoria} onChange={(e) => setLinha(i, { categoria: e.target.value })}>
                        {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => rmLinha(i)} className="p-1 text-muted-foreground/60 hover:text-red-500" title="Remover"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
