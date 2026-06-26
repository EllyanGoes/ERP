"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, Sparkles, Lock, FileText, AlertCircle, Trash2, Plus } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";

type Classif = "MOD" | "MOI" | "ADMIN";
type Item = {
  id: string; nome: string; cargo: string | null; matricula: string | null;
  colaboradorId: string | null; classificacao: Classif;
  bruto: string; liquido: string; inssRetido: string; inssPatronal: string; irrf: string; fgts: string;
};
type Folha = {
  id: string; competencia: string; status: "EM_REVISAO" | "FECHADA" | "CANCELADA";
  arquivoUrl: string | null; arquivoNome: string | null; dataPagamento: string | null;
  totalBruto: string; totalLiquido: string; totalInssRetido: string; totalInssPatronal: string; totalIrrf: string; totalFgts: string;
  itens: Item[];
};
type Colab = { id: string; nome: string; classificacaoCusto: Classif | null };

const N = (v: string) => parseFloat(v) || 0;
const compLabel = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };

export default function FolhaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [folha, setFolha] = useState<Folha | null>(null);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [erro, setErro] = useState("");
  const [removidos, setRemovidos] = useState<string[]>([]);
  const novoIdRef = useRef(0);

  // Título da aba = "Folha MM/AAAA" (em vez do id cru da rota).
  useTabTitle(folha ? `Folha ${compLabel(folha.competencia)}` : "Folha");

  const load = useCallback(async () => {
    const r = await fetch(`/api/rh/folhas/${id}`);
    const j = await r.json();
    setFolha(j.data); setColabs(j.colaboradores ?? []);
    setLoading(false);
    return j.data as Folha;
  }, [id]);

  const extrair = useCallback(async () => {
    setExtraindo(true); setErro("");
    try {
      const r = await fetch(`/api/rh/folhas/${id}/extrair`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Falha na extração"); return; }
      await load();
    } finally { setExtraindo(false); }
  }, [id, load]);

  useEffect(() => {
    load().then((f) => {
      if (search.get("extrair") === "1" && f && f.itens.length === 0 && f.status === "EM_REVISAO") extrair();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setItem(itemId: string, patch: Partial<Item>) {
    setFolha((prev) => prev ? { ...prev, itens: prev.itens.map((i) => i.id === itemId ? { ...i, ...patch } : i) } : prev);
  }

  function addItem() {
    const novo: Item = {
      id: `new-${novoIdRef.current++}`, nome: "", cargo: null, matricula: null,
      colaboradorId: null, classificacao: "ADMIN",
      bruto: "0", liquido: "0", inssRetido: "0", inssPatronal: "0", irrf: "0", fgts: "0",
    };
    setFolha((prev) => prev ? { ...prev, itens: [...prev.itens, novo] } : prev);
  }

  function removeItem(it: Item) {
    if (!it.id.startsWith("new-")) setRemovidos((r) => [...r, it.id]);
    setFolha((prev) => prev ? { ...prev, itens: prev.itens.filter((i) => i.id !== it.id) } : prev);
  }

  async function salvar() {
    if (!folha) return;
    setSalvando(true); setErro("");
    try {
      await fetch(`/api/rh/folhas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removidos,
          itens: folha.itens.map((i) => ({
            id: i.id.startsWith("new-") ? undefined : i.id,
            nome: i.nome, colaboradorId: i.colaboradorId, classificacao: i.classificacao,
            bruto: i.bruto, liquido: i.liquido, inssRetido: i.inssRetido,
            inssPatronal: i.inssPatronal, irrf: i.irrf, fgts: i.fgts,
          })),
        }),
      });
      setRemovidos([]);
      await load();
    } finally { setSalvando(false); }
  }

  async function fechar() {
    if (!folha) return;
    if (folha.itens.some((i) => !i.colaboradorId)) { setErro("Vincule todos os colaboradores antes de fechar."); return; }
    if (!confirm("Fechar a folha? Isso gera a apropriação contábil e as Contas a Pagar.")) return;
    setFechando(true); setErro("");
    try {
      await salvar();
      const r = await fetch(`/api/rh/folhas/${id}/fechar`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Falha ao fechar"); return; }
      await load();
    } finally { setFechando(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!folha) return <div className="p-8 text-muted-foreground">Folha não encontrada.</div>;

  const editavel = folha.status === "EM_REVISAO";
  const semVinculo = folha.itens.filter((i) => !i.colaboradorId).length;

  return (
    <div>
      <PageHeader
        title={`Folha ${compLabel(folha.competencia)}`}
        breadcrumbs={[{ label: "RH" }, { label: "Folhas", href: "/rh/folhas" }, { label: compLabel(folha.competencia) }]}
        action={
          <div className="flex items-center gap-2">
            {folha.arquivoUrl && <a href={`/api/rh/folhas/${id}/arquivo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-info hover:underline"><FileText className="w-4 h-4" /> PDF</a>}
            {editavel && (
              <Button variant="outline" onClick={extrair} disabled={extraindo}>
                {extraindo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {folha.itens.length ? "Reextrair" : "Extrair do PDF"}
              </Button>
            )}
            {editavel && folha.itens.length > 0 && (
              <Button onClick={fechar} disabled={fechando || semVinculo > 0}>
                {fechando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                Fechar folha
              </Button>
            )}
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-4">
        {erro && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"><AlertCircle className="w-4 h-4" /> {erro}</div>}

        {/* Totais da folha + custo por classificação (apropriação) */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="inline-flex flex-wrap items-stretch rounded-xl border border-border bg-card divide-x divide-border overflow-hidden">
            {[
              ["Bruto", folha.totalBruto], ["Líquido", folha.totalLiquido], ["INSS retido", folha.totalInssRetido],
              ["INSS patronal", folha.totalInssPatronal], ["IRRF", folha.totalIrrf], ["FGTS", folha.totalFgts],
            ].map(([k, v]) => (
              <div key={k} className="px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k}</p>
                <p className="text-sm font-bold tabular-nums">{formatBRL(N(v))}</p>
              </div>
            ))}
          </div>

          {/* Custo por classificação = bruto + INSS patronal + FGTS por grupo. */}
          <div className="inline-flex flex-wrap items-stretch rounded-xl border border-border bg-card divide-x divide-border overflow-hidden">
            {([["MOD", "MOD (PEP)"], ["MOI", "MOI (CIF)"], ["ADMIN", "Admin (despesa)"]] as const).map(([cl, label]) => {
              const total = folha.itens.filter((i) => i.classificacao === cl).reduce((a, i) => a + N(i.bruto) + N(i.inssPatronal) + N(i.fgts), 0);
              return (
                <div key={cl} className="px-4 py-2.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-bold tabular-nums">{formatBRL(total)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {extraindo && folha.itens.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Extraindo os dados do PDF com IA…</div>
        )}

        {semVinculo > 0 && editavel && folha.itens.length > 0 && (
          <div className="px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm">
            {semVinculo} colaborador(es) sem vínculo — selecione o cadastro para poder fechar.
          </div>
        )}

        {folha.itens.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-3 font-semibold">Funcionário (folha)</th>
                  <th className="text-left px-3 py-3 font-semibold w-56">Colaborador</th>
                  <th className="text-left px-3 py-3 font-semibold w-28">Classif.</th>
                  <th className="text-right px-3 py-3 font-semibold w-28">Bruto</th>
                  <th className="text-right px-3 py-3 font-semibold w-28">Líquido</th>
                  <th className="text-right px-3 py-3 font-semibold w-24">INSS</th>
                  <th className="text-right px-3 py-3 font-semibold w-24">INSS Pat.</th>
                  <th className="text-right px-3 py-3 font-semibold w-24">IRRF</th>
                  <th className="text-right px-3 py-3 font-semibold w-24">FGTS</th>
                  <th className="w-10 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {folha.itens.map((it) => (
                  <tr key={it.id} className={cn("hover:bg-muted", !it.colaboradorId && "bg-warning/5")}>
                    <td className="px-3 py-2">
                      {editavel ? (
                        <input
                          value={it.nome}
                          onChange={(e) => setItem(it.id, { nome: e.target.value })}
                          className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm font-medium"
                        />
                      ) : (
                        <div className="font-medium text-foreground">{it.nome}</div>
                      )}
                      <div className="text-xs text-muted-foreground">{[it.matricula, it.cargo].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <ComboboxWithCreate
                        value={it.colaboradorId ?? ""}
                        onChange={(cid) => {
                          const c = colabs.find((x) => x.id === cid);
                          setItem(it.id, { colaboradorId: cid || null, ...(c?.classificacaoCusto ? { classificacao: c.classificacaoCusto } : {}) });
                        }}
                        placeholder="Buscar colaborador…"
                        noneLabel="— selecionar —"
                        triggerClassName={cn("h-8 rounded-md", !it.colaboradorId && "border-warning/50")}
                        disabled={!editavel}
                        options={colabs.map((c) => ({ value: c.id, label: c.nome }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.classificacao}
                        disabled={!editavel}
                        onChange={(e) => setItem(it.id, { classificacao: e.target.value as Classif })}
                        className="w-full h-8 rounded-md border border-border bg-card text-sm px-2 disabled:opacity-60"
                      >
                        <option value="MOD">MOD</option>
                        <option value="MOI">MOI</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    {(["bruto", "liquido", "inssRetido", "inssPatronal", "irrf", "fgts"] as const).map((campo) => (
                      <td key={campo} className="px-2 py-1.5 text-right tabular-nums">
                        {editavel ? (
                          <input
                            inputMode="decimal"
                            value={it[campo]}
                            onChange={(e) => setItem(it.id, { [campo]: e.target.value } as Partial<Item>)}
                            className="w-full h-8 rounded-md border border-border bg-card px-2 text-right text-sm"
                          />
                        ) : (
                          <span className={campo === "bruto" || campo === "liquido" ? "" : "text-muted-foreground"}>{formatBRL(N(it[campo]))}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      {editavel && (
                        <button onClick={() => removeItem(it)} className="text-muted-foreground hover:text-danger" title="Remover">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editavel && folha.itens.length > 0 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1.5" /> Adicionar linha</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar revisão
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
