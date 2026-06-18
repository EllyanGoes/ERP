"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabTitle } from "@/lib/tabs-context";
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft } from "lucide-react";

type Secao = { id: string; nome: string; operacao: "SOMA" | "SUBTRAI"; ordem: number };
type Conta = { id: string; codigo: string; nome: string; dreSecaoId: string | null; ordemDre: number };

export default function DreEstruturaPage() {
  useTabTitle("Estrutura da DRE");
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/dre/estrutura").then((r) => r.json());
    setSecoes((j.secoes ?? []).sort((a: Secao, b: Secao) => a.ordem - b.ordem));
    setContas(j.contas ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function moverSecao(i: number, dir: -1 | 1) {
    setSecoes((prev) => {
      const arr = [...prev]; const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr.map((s, idx) => ({ ...s, ordem: idx }));
    });
  }
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
  function moverConta(contaId: string, dir: -1 | 1) {
    setContas((prev) => {
      const c = prev.find((x) => x.id === contaId); if (!c) return prev;
      const mesma = prev.filter((x) => x.dreSecaoId === c.dreSecaoId);
      const pos = mesma.findIndex((x) => x.id === contaId);
      const alvo = mesma[pos + dir]; if (!alvo) return prev;
      // troca a ordem relativa das duas na lista global
      const arr = [...prev];
      const ia = arr.findIndex((x) => x.id === c.id), ib = arr.findIndex((x) => x.id === alvo.id);
      [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
      return arr;
    });
  }
  function moverContaSecao(contaId: string, secaoId: string | null) {
    setContas((prev) => prev.map((c) => (c.id === contaId ? { ...c, dreSecaoId: secaoId } : c)));
  }

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
      <PageHeader title="Estrutura da DRE" breadcrumbs={[{ label: "Contabilidade Gerencial" }, { label: "DRE" }, { label: "Estrutura" }]}
        actions={<div className="flex items-center gap-2">
          <Link href="/contabilidade/dre" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft className="w-4 h-4" /> Voltar à DRE</Link>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>} />
      <div className="px-8 pb-8 space-y-4">
        {msg && <p className="text-sm text-emerald-600">{msg}</p>}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <p className="text-sm text-gray-500">Defina as seções (somam ou subtraem no resultado), sua ordem, e em qual seção cada conta de resultado aparece.</p>
            {secoes.map((s, i) => (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moverSecao(i, -1)} className="text-gray-400 hover:text-gray-700"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => moverSecao(i, 1)} className="text-gray-400 hover:text-gray-700"><ChevronDown className="w-4 h-4" /></button>
                  </div>
                  <Input value={s.nome} onChange={(e) => patchSecao(s.id, { nome: e.target.value })} className="h-9 max-w-xs font-semibold" />
                  <select value={s.operacao} onChange={(e) => patchSecao(s.id, { operacao: e.target.value as "SOMA" | "SUBTRAI" })} className="h-9 rounded-lg border border-gray-300 px-2 text-sm bg-white">
                    <option value="SOMA">Soma (+)</option>
                    <option value="SUBTRAI">Subtrai (−)</option>
                  </select>
                  <button type="button" onClick={() => delSecao(s.id)} className="ml-auto text-gray-300 hover:text-red-500" title="Excluir seção"><Trash2 className="w-4 h-4" /></button>
                </div>
                <ContasDaSecao contas={contas.filter((c) => c.dreSecaoId === s.id)} secoes={secoes} onMove={moverConta} onMoveSecao={moverContaSecao} />
              </div>
            ))}
            <button type="button" onClick={addSecao} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"><Plus className="w-4 h-4" /> Adicionar seção</button>

            {semSecao.length > 0 && (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40">
                <div className="px-4 py-2 text-sm font-semibold text-amber-700">Sem seção ({semSecao.length}) — não aparecem na DRE</div>
                <ContasDaSecao contas={semSecao} secoes={secoes} onMove={moverConta} onMoveSecao={moverContaSecao} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ContasDaSecao({ contas, secoes, onMove, onMoveSecao }: {
  contas: Conta[]; secoes: Secao[];
  onMove: (id: string, dir: -1 | 1) => void; onMoveSecao: (id: string, secaoId: string | null) => void;
}) {
  if (contas.length === 0) return <div className="px-4 py-3 text-xs text-gray-400">Nenhuma conta nesta seção.</div>;
  return (
    <ul className="divide-y divide-gray-50">
      {contas.map((c) => (
        <li key={c.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
          <div className="flex flex-col">
            <button type="button" onClick={() => onMove(c.id, -1)} className="text-gray-300 hover:text-gray-700"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onMove(c.id, 1)} className="text-gray-300 hover:text-gray-700"><ChevronDown className="w-3.5 h-3.5" /></button>
          </div>
          <span className="font-mono text-[11px] text-gray-400 w-20">{c.codigo}</span>
          <span className="flex-1 truncate text-gray-700">{c.nome}</span>
          <select value={c.dreSecaoId ?? ""} onChange={(e) => onMoveSecao(c.id, e.target.value || null)} className="h-8 rounded-lg border border-gray-300 px-2 text-xs bg-white max-w-[12rem]">
            <option value="">— sem seção —</option>
            {secoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </li>
      ))}
    </ul>
  );
}
