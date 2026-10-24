"use client";

// Sobressalentes do ativo: produtos do estoque do ERP usados no equipamento, com
// quantidade, estoque mínimo e o SALDO ATUAL (estoque próprio da empresa ativa).
// Saldo abaixo do mínimo fica destacado (e aparece no painel da Manutenção).
import { useCallback, useEffect, useState } from "react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import { api } from "./comum";

type Peca = {
  id: string;
  itemId: string;
  quantidade: number;
  estoqueMinimo: number | null;
  observacao: string | null;
  item: { id: string; codigo: string; descricao: string; unidade: string | null };
  saldo: number;
  abaixoMinimo: boolean;
};
type ItemOpt = { id: string; codigo: string; descricao: string };

const fmtQtd = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const paraCampo = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export default function AtivoPecas({ codApl }: { codApl: number }) {
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [itens, setItens] = useState<ItemOpt[] | null>(null);
  const [nova, setNova] = useState<{ itemId: string; quantidade: string; estoqueMinimo: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [remover, setRemover] = useState<Peca | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pcm/ativos/${codApl}/pecas`).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (res?.ok) setPecas(j.data ?? []);
    else setErro(j?.error || "Não foi possível carregar os sobressalentes.");
    setLoading(false);
  }, [codApl]);
  useEffect(() => { setLoading(true); setNova(null); load(); }, [load]);

  function abrirNova() {
    setErro("");
    setNova({ itemId: "", quantidade: "1", estoqueMinimo: "" });
    // catálogo de produtos só quando for adicionar (a lista é grande)
    if (!itens) fetch("/api/itens?limit=3000").then((r) => r.json()).then((j) => setItens(j.data ?? [])).catch(() => setItens([]));
  }

  async function adicionar() {
    if (!nova?.itemId) { setErro("Escolha o produto."); return; }
    setSaving(true); setErro("");
    const r = await api(`/api/pcm/ativos/${codApl}/pecas`, "POST", { itemId: nova.itemId, quantidade: nova.quantidade, estoqueMinimo: nova.estoqueMinimo || null });
    setSaving(false);
    if (!r.ok) { setErro(r.error || "Erro ao adicionar."); return; }
    setNova(null);
    load();
  }

  async function salvarCampo(p: Peca, campo: "quantidade" | "estoqueMinimo", valor: string) {
    const atual = campo === "quantidade" ? paraCampo(p.quantidade) : paraCampo(p.estoqueMinimo);
    if (valor.trim() === atual) return;
    setErro("");
    const r = await api(`/api/pcm/ativos/${codApl}/pecas`, "PATCH", { id: p.id, [campo]: valor.trim() || null });
    if (!r.ok) setErro(r.error || "Erro ao salvar.");
    load();
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setSaving(true);
    const r = await api(`/api/pcm/ativos/${codApl}/pecas?id=${remover.id}`, "DELETE");
    setSaving(false);
    setRemover(null);
    if (!r.ok) setErro(r.error || "Erro ao remover.");
    load();
  }

  const abaixo = pecas.filter((p) => p.abaixoMinimo).length;

  return (
    <section className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sobressalentes ({pecas.length})
          {abaixo > 0 && <span className="ml-1.5 normal-case tracking-normal font-medium text-danger">· {abaixo} abaixo do mínimo</span>}
        </h3>
        {!nova && <button onClick={abrirNova} className="text-xs text-info hover:underline inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> peça</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : pecas.length === 0 && !nova ? (
        <p className="text-xs text-muted-foreground italic">Nenhuma peça cadastrada para este ativo.</p>
      ) : pecas.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium pb-1">Produto</th>
              <th className="text-right font-medium pb-1 w-14" title="Quantidade usada no equipamento">Qtd</th>
              <th className="text-right font-medium pb-1 w-16" title="Estoque mínimo a manter para este ativo">Mín.</th>
              <th className="text-right font-medium pb-1 w-16" title="Saldo atual do estoque próprio (todos os locais)">Saldo</th>
              <th className="w-5" />
            </tr>
          </thead>
          <tbody>
            {pecas.map((p) => (
              <tr key={p.id} className={cn("border-t border-border/60", p.abaixoMinimo && "bg-danger/5")}>
                <td className="py-1 pr-1 min-w-0">
                  <div className="truncate text-foreground" title={`${p.item.codigo} — ${p.item.descricao}`}>{p.item.descricao}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{p.item.codigo}{p.item.unidade ? ` · ${p.item.unidade}` : ""}</div>
                </td>
                <td className="py-1 pl-1">
                  <Input key={`q${p.quantidade}`} defaultValue={paraCampo(p.quantidade)} inputMode="decimal" onBlur={(e) => salvarCampo(p, "quantidade", e.target.value)} className="h-7 px-1.5 text-right text-xs tabular-nums" />
                </td>
                <td className="py-1 pl-1">
                  <Input key={`m${p.estoqueMinimo}`} defaultValue={paraCampo(p.estoqueMinimo)} inputMode="decimal" placeholder="—" onBlur={(e) => salvarCampo(p, "estoqueMinimo", e.target.value)} className="h-7 px-1.5 text-right text-xs tabular-nums" />
                </td>
                <td className={cn("py-1 pl-1 text-right tabular-nums font-medium", p.abaixoMinimo ? "text-danger" : "text-foreground")}>
                  <span className="inline-flex items-center gap-0.5">{p.abaixoMinimo && <AlertTriangle className="w-3 h-3" />}{fmtQtd(p.saldo)}</span>
                </td>
                <td className="py-1 pl-1 text-right">
                  <button onClick={() => setRemover(p)} className="text-muted-foreground hover:text-danger" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nova && (
        <div className="mt-2 rounded-lg border border-border p-2 space-y-2">
          <ComboboxWithCreate
            value={nova.itemId}
            onChange={(v) => setNova({ ...nova, itemId: v })}
            options={(itens ?? []).filter((x) => !pecas.some((p) => p.itemId === x.id)).map((x) => ({ value: x.id, label: `${x.codigo} — ${x.descricao}` }))}
            placeholder={itens ? "Produto do estoque…" : "Carregando produtos…"}
            disabled={!itens}
            menuMinWidth={360}
          />
          <div className="flex items-end gap-2">
            <label className="flex-1 text-[11px] text-muted-foreground">Qtd no equipamento
              <Input value={nova.quantidade} inputMode="decimal" onChange={(e) => setNova({ ...nova, quantidade: e.target.value })} className="h-8 text-xs mt-0.5" />
            </label>
            <label className="flex-1 text-[11px] text-muted-foreground">Estoque mínimo
              <Input value={nova.estoqueMinimo} inputMode="decimal" placeholder="opcional" onChange={(e) => setNova({ ...nova, estoqueMinimo: e.target.value })} className="h-8 text-xs mt-0.5" />
            </label>
            <Button size="sm" className="h-8" disabled={saving || !nova.itemId} onClick={adicionar}>Adicionar</Button>
            <button onClick={() => { setNova(null); setErro(""); }} className="h-8 text-muted-foreground hover:text-foreground" title="Cancelar"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {erro && <p className="text-xs text-danger mt-1">{erro}</p>}

      <ConfirmDialog
        open={!!remover}
        onOpenChange={(o) => !o && setRemover(null)}
        title="Remover peça do ativo?"
        description={remover ? `${remover.item.codigo} — ${remover.item.descricao} sai da lista de sobressalentes deste ativo (o produto e o estoque não mudam).` : ""}
        onConfirm={confirmarRemocao}
        loading={saving}
        confirmLabel="Remover"
      />
    </section>
  );
}
