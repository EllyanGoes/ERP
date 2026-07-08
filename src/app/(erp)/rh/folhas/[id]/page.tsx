"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBRL, cn } from "@/lib/utils";
import { Loader2, Sparkles, Lock, FileText, AlertCircle, Trash2, Plus, CopyCheck, Calculator, UserPlus, ChevronRight, ChevronDown } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import InssConfigDialog, { calcularInssProgressivo, type FaixaInss } from "@/components/rh/InssConfigDialog";
import { Autoria } from "@/components/shared/Autoria";
import { useTabTitle } from "@/lib/tabs-context";

type Classif = "MOD" | "MOI" | "ADMIN";
// Detalhamento importado do PDF (bases + rubricas) — o INSS incide na BASE DO
// INSS, não no total de proventos (faltas/ajustes alteram a base).
type Rubrica = { codigo?: string; descricao: string; referencia?: string; tipo: "P" | "D"; valor: number };
type Detalhe = {
  baseInss?: number | null; baseFgts?: number | null; baseIrrf?: number | null;
  totalProventos?: number | null; totalDescontos?: number | null;
  itens?: Rubrica[];
} | null;
type Item = {
  id: string; nome: string; cargo: string | null; matricula: string | null;
  colaboradorId: string | null; classificacao: Classif;
  bruto: string; liquido: string; inssRetido: string; inssPatronal: string; irrf: string; fgts: string;
  rubricas?: Detalhe;
};
type Folha = {
  id: string; empresaId: string; competencia: string; status: "EM_REVISAO" | "FECHADA" | "CANCELADA";
  arquivoUrl: string | null; arquivoNome: string | null; dataPagamento: string | null;
  totalBruto: string; totalLiquido: string; totalInssRetido: string; totalInssPatronal: string; totalIrrf: string; totalFgts: string;
  criadoPor?: string | null; atualizadoPor?: string | null;
  createdAt?: string; updatedAt?: string;
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
  const [aplicando, setAplicando] = useState(false);
  const [inssOpen, setInssOpen] = useState(false);
  // Linhas expandidas (detalhamento do cálculo) e tabela do INSS p/ conferência.
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [faixasInss, setFaixasInss] = useState<FaixaInss[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
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
    load().then(async (f) => {
      if (search.get("extrair") === "1" && f && f.itens.length === 0 && f.status === "EM_REVISAO") extrair();
      // Retorno do cadastro de colaborador (botão da linha): vincula o item e
      // limpa a URL. O cadastro redireciona p/ cá com vincularItem+colaboradorId.
      const itemId = search.get("vincularItem");
      const colabId = search.get("colaboradorId");
      if (itemId && colabId && f?.itens.some((i) => i.id === itemId)) {
        await fetch(`/api/rh/folhas/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: [{ id: itemId, colaboradorId: colabId }] }),
        });
        router.replace(`/rh/folhas/${id}`);
        await load();
        setAviso("Colaborador cadastrado e vinculado ao item da folha.");
      }
    });
    // Tabela do INSS p/ conferir o retido de cada item contra a base.
    fetch("/api/rh/inss-config")
      .then((r) => r.json())
      .then((j) => setFaixasInss(Array.isArray(j.data?.faixas) ? j.data.faixas : []))
      .catch(() => setFaixasInss([]));
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

  // Usa esta folha como parâmetro: grava matrícula + classificação no cadastro
  // e propaga vínculo/classificação para as demais folhas em revisão.
  async function aplicarVinculos() {
    if (!folha) return;
    if (!confirm("Usar esta folha como parâmetro? A matrícula e a classificação (MOD/MOI/Admin) dos colaboradores vinculados serão gravadas no cadastro e aplicadas às demais folhas em revisão.")) return;
    setAplicando(true); setErro(""); setAviso("");
    try {
      if (editavel) await salvar();
      const r = await fetch(`/api/rh/folhas/${id}/aplicar-vinculos`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Falha ao aplicar os vínculos"); return; }
      const d = j.data;
      const partes = [
        `${d.colaboradoresAtualizados} colaborador(es) atualizados no cadastro`,
        `${d.vinculados} item(ns) vinculados`,
        `${d.reclassificados} reclassificados`,
        `${d.jaCorretos} já estavam corretos`,
      ];
      const faltam = (d.semCorrespondencia ?? []) as string[];
      setAviso(
        `Parâmetro aplicado em ${d.folhas} outra(s) folha(s): ${partes.join(", ")}.` +
        (faltam.length ? ` Sem correspondência nesta folha (vincule manualmente ou cadastre o colaborador): ${faltam.join(", ")}.` : ""),
      );
    } finally { setAplicando(false); }
  }

  // Abre o cadastro de Colaborador pré-preenchido com os dados do item da folha;
  // ao salvar lá, volta para esta tela e o item é vinculado (efeito no load).
  async function criarCadastro(it: Item) {
    await salvar(); // não perder edições da revisão ao navegar
    const params = new URLSearchParams({
      nome: it.nome,
      classificacao: it.classificacao,
      retorno: `/rh/folhas/${id}?vincularItem=${it.id}`,
      ...(it.matricula ? { matricula: it.matricula } : {}),
      ...(it.cargo ? { cargo: it.cargo } : {}),
      ...(folha?.empresaId ? { empresaId: folha.empresaId } : {}),
    });
    router.push(`/empresa/colaboradores/novo?${params.toString()}`);
  }

  // Recalcula o INSS retido de todos os itens a partir do bruto, com a tabela
  // progressiva configurada no dialog. Só mexe no estado — o usuário revisa e salva.
  function calcularInssDaFolha(faixas: FaixaInss[]) {
    setFolha((prev) => prev ? {
      ...prev,
      // O INSS incide na BASE DO INSS do documento; sem base extraída, cai no bruto.
      itens: prev.itens.map((i) => ({
        ...i,
        inssRetido: calcularInssProgressivo(i.rubricas?.baseInss ?? N(i.bruto), faixas).toFixed(2),
      })),
    } : prev);
    setErro("");
    setAviso('INSS recalculado sobre a base do INSS de cada item (bruto quando não há base) — confira e clique em "Salvar revisão".');
  }

  function toggleExpandido(itemId: string) {
    setExpandidos((prev) => {
      const n = new Set(prev);
      n.has(itemId) ? n.delete(itemId) : n.add(itemId);
      return n;
    });
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
            {folha.itens.length > 0 && (
              <Button variant="outline" onClick={() => setInssOpen(true)} title="Configurar a tabela progressiva e recalcular o INSS dos itens">
                <Calculator className="w-4 h-4 mr-2" /> INSS
              </Button>
            )}
            {folha.itens.some((i) => i.colaboradorId) && (
              <Button variant="outline" onClick={aplicarVinculos} disabled={aplicando} title="Grava matrícula + classificação no cadastro e aplica às demais folhas em revisão">
                {aplicando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CopyCheck className="w-4 h-4 mr-2" />}
                Aplicar às outras folhas
              </Button>
            )}
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
        {aviso && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-success/10 border border-success/30 text-success text-sm"><CopyCheck className="w-4 h-4" /> {aviso}</div>}

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
                  <th className="w-8 px-2 py-3"></th>
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
                  <Fragment key={it.id}>
                  <tr className={cn("hover:bg-muted", !it.colaboradorId && "bg-warning/5")}>
                    <td className="px-2 py-2 text-center align-middle">
                      <button
                        onClick={() => toggleExpandido(it.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Detalhar cálculos (rubricas e bases do documento)"
                      >
                        {expandidos.has(it.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
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
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <ComboboxWithCreate
                            value={it.colaboradorId ?? ""}
                            onChange={(cid) => {
                              const c = colabs.find((x) => x.id === cid);
                              setItem(it.id, { colaboradorId: cid || null, ...(c?.classificacaoCusto ? { classificacao: c.classificacaoCusto } : {}) });
                            }}
                            placeholder="Buscar colaborador…"
                            noneLabel="— selecionar —"
                            menuMinWidth={340}
                            triggerClassName={cn("h-8 rounded-md", !it.colaboradorId && "border-warning/50")}
                            disabled={!editavel}
                            options={colabs.map((c) => ({ value: c.id, label: c.nome }))}
                          />
                        </div>
                        {editavel && !it.colaboradorId && !it.id.startsWith("new-") && (
                          <button
                            onClick={() => criarCadastro(it)}
                            disabled={salvando}
                            title="Cadastrar este funcionário em Colaboradores (volta para a folha ao salvar)"
                            className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-info hover:border-info/50 disabled:opacity-60"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
                  {expandidos.has(it.id) && (
                    <tr className="bg-muted/40">
                      <td colSpan={11} className="px-6 py-4">
                        {(() => {
                          const det = it.rubricas;
                          if (!det || (det.baseInss == null && !(det.itens?.length))) {
                            return (
                              <p className="text-sm text-muted-foreground">
                                Sem detalhamento importado para este item — clique em <span className="font-medium">Reextrair</span> para trazer as rubricas e bases do PDF.
                              </p>
                            );
                          }
                          const dif = (a: number, b: number) => Math.abs(a - b) > 0.05;
                          const inssEsperado = det.baseInss != null && faixasInss.length ? calcularInssProgressivo(det.baseInss, faixasInss) : null;
                          const fgtsEsperado = det.baseFgts != null ? Math.round(det.baseFgts * 8) / 100 : null;
                          const liquidoEsperado = det.totalProventos != null && det.totalDescontos != null
                            ? Math.round((det.totalProventos - det.totalDescontos) * 100) / 100 : null;
                          const chip = (label: string, valor: number | null | undefined) => (
                            <div className="px-3 py-1.5 rounded-lg bg-card border border-border">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                              <p className="text-sm font-semibold tabular-nums">{valor != null ? formatBRL(valor) : "—"}</p>
                            </div>
                          );
                          const confere = (label: string, esperado: number | null, extraido: number) =>
                            esperado == null ? null : (
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                dif(esperado, extraido) ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
                              )}>
                                {label}: {dif(esperado, extraido) ? `esperado ${formatBRL(esperado)} · documento ${formatBRL(extraido)}` : `${formatBRL(extraido)} ✓`}
                              </span>
                            );
                          return (
                            <div className="space-y-3">
                              {/* Bases e totais do documento */}
                              <div className="flex flex-wrap gap-2">
                                {chip("Total proventos", det.totalProventos)}
                                {chip("Total descontos", det.totalDescontos)}
                                {chip("Base INSS", det.baseInss)}
                                {chip("Base FGTS", det.baseFgts)}
                                {chip("Base IRRF", det.baseIrrf)}
                              </div>
                              {/* Conferência dos cálculos: INSS sobre a BASE (não sobre o bruto) */}
                              <div className="flex flex-wrap gap-2">
                                {confere("INSS (tabela × base)", inssEsperado, N(it.inssRetido))}
                                {confere("FGTS (8% × base)", fgtsEsperado, N(it.fgts))}
                                {confere("Líquido (prov. − desc.)", liquidoEsperado, N(it.liquido))}
                              </div>
                              {/* Rubricas do documento */}
                              {det.itens && det.itens.length > 0 && (
                                <table className="text-sm w-full max-w-2xl">
                                  <thead className="text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                                    <tr>
                                      <th className="text-left py-1.5 pr-3 font-semibold w-14">Cód.</th>
                                      <th className="text-left py-1.5 pr-3 font-semibold">Descrição</th>
                                      <th className="text-right py-1.5 pr-3 font-semibold w-20">Ref.</th>
                                      <th className="text-right py-1.5 pr-3 font-semibold w-28">Proventos</th>
                                      <th className="text-right py-1.5 font-semibold w-28">Descontos</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/60">
                                    {det.itens.map((r, ri) => (
                                      <tr key={ri}>
                                        <td className="py-1 pr-3 text-muted-foreground tabular-nums">{r.codigo ?? ""}</td>
                                        <td className="py-1 pr-3">{r.descricao}</td>
                                        <td className="py-1 pr-3 text-right text-muted-foreground tabular-nums">{r.referencia ?? ""}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{r.tipo === "P" ? formatBRL(r.valor) : ""}</td>
                                        <td className="py-1 text-right tabular-nums text-muted-foreground">{r.tipo === "D" ? formatBRL(r.valor) : ""}</td>
                                      </tr>
                                    ))}
                                    <tr className="font-semibold border-t border-border">
                                      <td colSpan={3} className="py-1.5 pr-3 text-right text-xs text-muted-foreground uppercase">Totais</td>
                                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatBRL(det.itens.filter((r) => r.tipo === "P").reduce((a, r) => a + r.valor, 0))}</td>
                                      <td className="py-1.5 text-right tabular-nums">{formatBRL(det.itens.filter((r) => r.tipo === "D").reduce((a, r) => a + r.valor, 0))}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                  </Fragment>
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

        <Autoria criadoPor={folha.criadoPor} criadoEm={folha.createdAt} atualizadoPor={folha.atualizadoPor} atualizadoEm={folha.updatedAt} />
      </div>

      <InssConfigDialog open={inssOpen} onOpenChange={setInssOpen} onCalcular={calcularInssDaFolha} podeCalcular={editavel} />
    </div>
  );
}
