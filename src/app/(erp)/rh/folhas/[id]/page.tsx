"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, Sparkles, Lock, FileText, AlertCircle } from "lucide-react";

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

  async function salvar() {
    if (!folha) return;
    setSalvando(true); setErro("");
    try {
      await fetch(`/api/rh/folhas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: folha.itens.map((i) => ({ id: i.id, colaboradorId: i.colaboradorId, classificacao: i.classificacao })) }),
      });
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
            {folha.arquivoUrl && <a href={folha.arquivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-info hover:underline"><FileText className="w-4 h-4" /> PDF</a>}
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

        {/* Totais */}
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
                  <th className="text-right px-3 py-3 font-semibold">Bruto</th>
                  <th className="text-right px-3 py-3 font-semibold">Líquido</th>
                  <th className="text-right px-3 py-3 font-semibold">INSS</th>
                  <th className="text-right px-3 py-3 font-semibold">IRRF</th>
                  <th className="text-right px-3 py-3 font-semibold">FGTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {folha.itens.map((it) => (
                  <tr key={it.id} className={cn("hover:bg-muted", !it.colaboradorId && "bg-warning/5")}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{it.nome}</div>
                      <div className="text-xs text-muted-foreground">{[it.matricula, it.cargo].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={it.colaboradorId ?? ""}
                        disabled={!editavel}
                        onChange={(e) => {
                          const cid = e.target.value || null;
                          const c = colabs.find((x) => x.id === cid);
                          setItem(it.id, { colaboradorId: cid, ...(c?.classificacaoCusto ? { classificacao: c.classificacaoCusto } : {}) });
                        }}
                        className="w-full h-8 rounded-md border border-border bg-card text-sm px-2 disabled:opacity-60"
                      >
                        <option value="">— selecionar —</option>
                        {colabs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
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
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(N(it.bruto))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(N(it.liquido))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatBRL(N(it.inssRetido))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatBRL(N(it.irrf))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatBRL(N(it.fgts))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editavel && folha.itens.length > 0 && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Salvar revisão
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
