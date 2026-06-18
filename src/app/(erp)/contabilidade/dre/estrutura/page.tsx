"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, GripVertical, ArrowLeft } from "lucide-react";

type Secao = { id: string; nome: string; operacao: "SOMA" | "SUBTRAI" | "SUBTOTAL"; ordem: number };
type Conta = { id: string; codigo: string; nome: string; dreSecaoId: string | null; ordemDre: number };

// O que está sendo arrastado: uma seção (reordena seções) ou uma conta (reordena
// dentro da seção / move entre seções).
type Drag = { kind: "secao" | "conta"; id: string } | null;

export default function DreEstruturaPage() {
  useTabTitle("Estrutura da DRE");
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [overSecao, setOverSecao] = useState<string | "—" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/dre/estrutura").then((r) => r.json());
    setSecoes((j.secoes ?? []).sort((a: Secao, b: Secao) => a.ordem - b.ordem));
    setContas(j.contas ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function addSecao() {
    setSecoes((prev) => [...prev, { id: `novo:${Date.now()}`, nome: "Nova seção", operacao: "SOMA", ordem: prev.length }]);
  }
  function delSecao(id: string) {
    setSecoes((prev) => prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, ordem: idx })));
    setContas((prev) => prev.map((c) => (c.dreSecaoId === id ? { ...c, dreSecaoId: null } : c)));
  }
  function patchSecao(id: string, patch: Partial<Secao>) {
    setSecoes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // Reordena seções: solta a seção arrastada antes da seção-alvo.
  function reordenarSecao(targetId: string) {
    if (!drag || drag.kind !== "secao" || drag.id === targetId) return;
    setSecoes((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((s) => s.id === drag.id);
      const to = arr.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr.map((s, idx) => ({ ...s, ordem: idx }));
    });
  }
  // Reordena conta: solta a conta arrastada antes da conta-alvo (adotando a seção da alvo).
  function reordenarConta(targetId: string) {
    if (!drag || drag.kind !== "conta" || drag.id === targetId) return;
    setContas((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((c) => c.id === drag.id);
      const alvo = arr.find((c) => c.id === targetId);
      if (from < 0 || !alvo) return prev;
      const [moved] = arr.splice(from, 1);
      moved.dreSecaoId = alvo.dreSecaoId;
      const to = arr.findIndex((c) => c.id === targetId);
      arr.splice(to, 0, moved);
      return arr;
    });
  }
  // Move conta para o fim de uma seção (drop na área/título da seção).
  function moverContaParaSecao(secaoId: string | null) {
    if (!drag || drag.kind !== "conta") return;
    setContas((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((c) => c.id === drag.id);
      if (from < 0) return prev;
      const [moved] = arr.splice(from, 1);
      moved.dreSecaoId = secaoId;
      // insere após a última conta da seção de destino (mantém agrupamento)
      let lastIdx = -1;
      arr.forEach((c, i) => { if (c.dreSecaoId === secaoId) lastIdx = i; });
      arr.splice(lastIdx + 1, 0, moved);
      return arr;
    });
  }
  function moverContaSecao(contaId: string, secaoId: string | null) {
    setContas((prev) => prev.map((c) => (c.id === contaId ? { ...c, dreSecaoId: secaoId } : c)));
  }
  function endDrag() { setDrag(null); setOverSecao(null); }

  async function salvar() {
    setSaving(true); setMsg(null);
    // ordemDre = posição dentro da seção (ordem do array global)
    const porSecaoCount = new Map<string, number>();
    const contasPayload = contas.map((c) => {
      const k = c.dreSecaoId ?? "—";
      const ord = porSecaoCount.get(k) ?? 0;
      porSecaoCount.set(k, ord + 1);
      return { id: c.id, dreSecaoId: c.dreSecaoId, ordemDre: ord };
    });
    const res = await fetch("/api/contabilidade/dre/estrutura", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secoes: secoes.map((s, i) => ({ id: s.id, nome: s.nome, operacao: s.operacao, ordem: i })), contas: contasPayload }),
    });
    setSaving(false);
    if (!res.ok) { setMsg("Erro ao salvar"); return; }
    setMsg("Estrutura salva."); load();
  }

  const semSecao = contas.filter((c) => !c.dreSecaoId);

  return (
    <div>
      <PageHeader title="Estrutura da DRE" breadcrumbs={[{ label: "Contabilidade" }, { label: "DRE" }, { label: "Estrutura" }]}
        actions={<div className="flex items-center gap-2">
          <Link href="/contabilidade/dre" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar à DRE</Link>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>} />
      <div className="px-8 pb-8 space-y-4">
        {msg && <p className="text-sm text-success">{msg}</p>}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Arraste pelo <GripVertical className="inline w-3.5 h-3.5 align-text-bottom" /> para reordenar seções e contas — solte uma conta sobre outra seção para movê-la. Cada seção soma ou subtrai no resultado.</p>
            {secoes.map((s) => (
              <div
                key={s.id}
                className={cn("rounded-xl border bg-card transition-colors", overSecao === s.id ? "border-info ring-1 ring-info/40" : "border-border")}
                onDragOver={(e) => { if (drag?.kind === "conta") { e.preventDefault(); setOverSecao(s.id); } }}
                onDragLeave={() => setOverSecao((v) => (v === s.id ? null : v))}
                onDrop={(e) => { if (drag?.kind === "conta") { e.preventDefault(); moverContaParaSecao(s.id); endDrag(); } }}
              >
                <div
                  className={cn("flex items-center gap-2 px-4 py-3 border-b border-border bg-muted rounded-t-xl select-none", drag?.kind === "secao" && drag.id === s.id && "opacity-40")}
                  onDragOver={(e) => { if (drag?.kind === "secao") { e.preventDefault(); } }}
                  onDrop={(e) => { if (drag?.kind === "secao") { e.preventDefault(); reordenarSecao(s.id); endDrag(); } }}
                >
                  <span
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "secao", id: s.id }); }}
                    onDragEnd={endDrag}
                    className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
                    title="Arraste para reordenar a seção"
                  ><GripVertical className="w-4 h-4" /></span>
                  <Input value={s.nome} onChange={(e) => patchSecao(s.id, { nome: e.target.value })} className="h-9 max-w-xs font-semibold" />
                  <select value={s.operacao} onChange={(e) => patchSecao(s.id, { operacao: e.target.value as Secao["operacao"] })} className="h-9 rounded-lg border border-border px-2 text-sm bg-card">
                    <option value="SOMA">Soma (+)</option>
                    <option value="SUBTRAI">Subtrai (−)</option>
                    <option value="SUBTOTAL">Resultado (=)</option>
                  </select>
                  <button type="button" onClick={() => delSecao(s.id)} className="ml-auto text-muted-foreground/60 hover:text-red-500" title="Excluir seção"><Trash2 className="w-4 h-4" /></button>
                </div>
                {s.operacao === "SUBTOTAL" ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground">Linha de resultado acumulado (=) — soma as seções acima até aqui; não recebe contas.</div>
                ) : (
                  <ContasDaSecao contas={contas.filter((c) => c.dreSecaoId === s.id)} secoes={secoes} drag={drag} setDrag={setDrag} onReorder={reordenarConta} onMoveSecao={moverContaSecao} onEndDrag={endDrag} />
                )}
              </div>
            ))}
            <button type="button" onClick={addSecao} className="inline-flex items-center gap-1.5 text-sm font-medium text-info hover:text-info"><Plus className="w-4 h-4" /> Adicionar seção</button>

            {semSecao.length > 0 && (
              <div
                className={cn("rounded-xl border border-dashed bg-warning/10 transition-colors", overSecao === "—" ? "border-info ring-1 ring-info/40" : "border-amber-300")}
                onDragOver={(e) => { if (drag?.kind === "conta") { e.preventDefault(); setOverSecao("—"); } }}
                onDragLeave={() => setOverSecao((v) => (v === "—" ? null : v))}
                onDrop={(e) => { if (drag?.kind === "conta") { e.preventDefault(); moverContaParaSecao(null); endDrag(); } }}
              >
                <div className="px-4 py-2 text-sm font-semibold text-warning">Sem seção ({semSecao.length}) — não aparecem na DRE</div>
                <ContasDaSecao contas={semSecao} secoes={secoes} drag={drag} setDrag={setDrag} onReorder={reordenarConta} onMoveSecao={moverContaSecao} onEndDrag={endDrag} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ContasDaSecao({ contas, secoes, drag, setDrag, onReorder, onMoveSecao, onEndDrag }: {
  contas: Conta[]; secoes: Secao[];
  drag: Drag; setDrag: (d: Drag) => void;
  onReorder: (targetId: string) => void;
  onMoveSecao: (id: string, secaoId: string | null) => void;
  onEndDrag: () => void;
}) {
  if (contas.length === 0) return <div className="px-4 py-3 text-xs text-muted-foreground">Nenhuma conta nesta seção. Arraste uma conta para cá.</div>;
  return (
    <ul className="divide-y divide-border/50">
      {contas.map((c) => (
        <li
          key={c.id}
          className={cn("flex items-center gap-2 px-4 py-1.5 text-sm select-none transition-colors", drag?.kind === "conta" && drag.id === c.id && "opacity-40")}
          onDragOver={(e) => { if (drag?.kind === "conta") { e.preventDefault(); } }}
          onDrop={(e) => { if (drag?.kind === "conta") { e.preventDefault(); e.stopPropagation(); onReorder(c.id); onEndDrag(); } }}
        >
          <span
            draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); setDrag({ kind: "conta", id: c.id }); }}
            onDragEnd={onEndDrag}
            className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
            title="Arraste para reordenar / mover de seção"
          ><GripVertical className="w-3.5 h-3.5" /></span>
          <span className="font-mono text-[11px] text-muted-foreground w-20">{c.codigo}</span>
          <span className="flex-1 truncate text-foreground">{c.nome}</span>
          <select value={c.dreSecaoId ?? ""} onChange={(e) => onMoveSecao(c.id, e.target.value || null)} className="h-8 rounded-lg border border-border px-2 text-xs bg-card max-w-[12rem]">
            <option value="">— sem seção —</option>
            {secoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </li>
      ))}
    </ul>
  );
}
