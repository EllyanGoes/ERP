"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, Factory, CheckCircle2, List, Loader2, X, Boxes, PackageCheck, Printer } from "lucide-react";

type FluxoOpt = { id: string; nome: string; versaoAtivaId: string | null };
type Area = { nodeId: string; sequencia: number; nome: string; centroTrabalho: string | null; estadoSaida: string | null; fromEstado: string | null; isPrimeira: boolean; produtoSaidaId: string | null; produtos: Produto[] };
type Unidade = { id: string; sigla: string };
type Produto = { id: string; codigo: string; descricao: string; unidades: Unidade[] };
type LinhaOP = { itemId: string; quantidade: string; unidadeId: string };
type NovoOP = { linhas: LinhaOP[]; inicio: string; fim: string; responsavelId: string; observacao: string };
type ProdutoOP = { itemId: string; codigo: string; descricao: string; planejada: string | number; real: string | number | null; unidade: string | null };
type BoardOP = { id: string; numero: string; status: string; quantidade: string | number; unidade: string | null; produto: string | null; produtoCodigo: string | null; etapaStatus: string; responsavel: string | null; inicioPrevisto: string | null; fimPrevisto: string | null; produtos: ProdutoOP[] };
type Disp = { tipo: "MP" | "WIP"; rendimentoMilheiros?: number | null; saldoWipAnterior?: number; insumos?: { descricao: string; consumoPorMilheiro: number; disponivel: number }[]; aviso?: string };
type EstoqueLinha = { itemId: string | null; descricao: string; unidade: string | null; saldoTotal: number; locais: { localNome: string; saldo: number }[] };

const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };
const ETAPA_STATUS: Record<string, string> = { PENDENTE: "bg-muted text-muted-foreground", EM_EXECUCAO: "bg-warning/15 text-warning", CONCLUIDA: "bg-success/15 text-success" };
const hoje = () => new Date().toISOString().slice(0, 10);

export default function OrdensBoardPage() {
  useTabTitle("Fluxo de Produção");
  const router = useRouter();

  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [areaNodeId, setAreaNodeId] = useState("");
  const [data, setData] = useState(hoje());
  const [ops, setOps] = useState<BoardOP[]>([]);
  const [materiais, setMateriais] = useState<EstoqueLinha[] | null>(null);
  const [entradaWip, setEntradaWip] = useState<EstoqueLinha[] | null>(null);
  const [saidaEstoque, setSaidaEstoque] = useState<EstoqueLinha[] | null>(null);
  const [contagem, setContagem] = useState<Record<string, { abertas: number; concluidas: number }>>({});
  const [loading, setLoading] = useState(true);
  const [carregandoOps, setCarregandoOps] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Nova OP
  const [novo, setNovo] = useState<NovoOP | null>(null);
  const [criando, setCriando] = useState(false);
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string }[]>([]);

  // Apontar
  const [apontar, setApontar] = useState<BoardOP | null>(null);
  const [apForm, setApForm] = useState<{ reais: Record<string, string>; perda: string; biomassa: string }>({ reais: {}, perda: "", biomassa: "" });
  const [apBusy, setApBusy] = useState(false);

  const area = areas.find((a) => a.nodeId === areaNodeId) ?? null;
  const minSeq = areas.length ? Math.min(...areas.map((a) => a.sequencia)) : 0;

  // 1. Fluxos publicados
  useEffect(() => {
    fetch("/api/pcp/fluxos").then((r) => r.json()).then((j) => {
      const pub = (j.data ?? []).filter((f: FluxoOpt) => f.versaoAtivaId);
      setFluxos(pub);
      if (pub[0]) setFluxoId(pub[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // 2. Abas (áreas) + produtos do fluxo
  useEffect(() => {
    if (!fluxoId) { setAreas([]); setProdutos([]); return; }
    fetch(`/api/pcp/ordens/area/abas?fluxoId=${fluxoId}`).then((r) => r.json()).then((j) => {
      setAreas(j.areas ?? []);
      setProdutos(j.produtos ?? []);
      setAreaNodeId((prev) => (j.areas ?? []).some((a: Area) => a.nodeId === prev) ? prev : (j.areas?.[0]?.nodeId ?? ""));
    }).catch(() => { setAreas([]); setProdutos([]); });
  }, [fluxoId]);

  // 3. OPs da área no dia
  const loadOps = useCallback(async () => {
    if (!fluxoId || !areaNodeId) { setOps([]); return; }
    setCarregandoOps(true);
    try {
      const r = await fetch(`/api/pcp/ordens/area/board?fluxoId=${fluxoId}&areaNodeId=${areaNodeId}&data=${data}`);
      const j = await r.json();
      setOps(j.data ?? []);
    } finally { setCarregandoOps(false); }
  }, [fluxoId, areaNodeId, data]);
  useEffect(() => { loadOps(); }, [loadOps]);

  // Contagem de OPs por área (abertas/concluídas) no dia — exibida nas abas.
  useEffect(() => {
    if (!fluxoId) { setContagem({}); return; }
    fetch(`/api/pcp/ordens/area/contagem?fluxoId=${fluxoId}&data=${data}`)
      .then((r) => r.json()).then((j) => setContagem(j.data ?? {})).catch(() => setContagem({}));
  }, [fluxoId, data, ops]);

  // Saldo dos materiais necessários na área (insumos da operação no fluxo)
  useEffect(() => {
    if (!fluxoId || !areaNodeId) { setMateriais(null); return; }
    setMateriais(null);
    fetch(`/api/pcp/ordens/area/materiais?fluxoId=${fluxoId}&areaNodeId=${areaNodeId}`)
      .then((r) => r.json()).then((j) => setMateriais(j.data ?? [])).catch(() => setMateriais([]));
  }, [fluxoId, areaNodeId]);

  // Entrada (PEP da área anterior) e Saída (PEP/PA que esta área produz)
  useEffect(() => {
    const a = areas.find((x) => x.nodeId === areaNodeId) ?? null;
    if (!a) { setEntradaWip(null); setSaidaEstoque(null); return; }
    if (a.isPrimeira || !a.fromEstado) setEntradaWip([]);
    else {
      setEntradaWip(null);
      fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.fromEstado}`)
        .then((r) => r.json()).then((j) => setEntradaWip(j.data ?? [])).catch(() => setEntradaWip([]));
    }
    if (!a.estadoSaida) setSaidaEstoque([]);
    else {
      setSaidaEstoque(null);
      fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.estadoSaida}`)
        .then((r) => r.json()).then((j) => setSaidaEstoque(j.data ?? [])).catch(() => setSaidaEstoque([]));
    }
  }, [fluxoId, areaNodeId, areas]);

  // Colaboradores (responsável pela OP)
  useEffect(() => {
    fetch("/api/empresa/colaboradores?daEmpresaAtiva=1&ativo=true")
      .then((r) => r.json())
      .then((j) => setColaboradores(Array.isArray(j) ? j.map((c: { id: string; nome: string }) => ({ id: c.id, nome: c.nome })) : []))
      .catch(() => setColaboradores([]));
  }, []);

  async function criarOp() {
    if (!novo) return;
    const linhas = novo.linhas.filter((l) => l.itemId && Number(l.quantidade) > 0);
    if (!linhas.length) { setErro("Adicione ao menos um produto com quantidade > 0"); return; }
    setCriando(true); setErro(null);
    try {
      const r = await fetch("/api/pcp/ordens/area", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fluxoId, areaNodeId, data,
          produtos: linhas.map((l) => ({ itemId: l.itemId, quantidade: l.quantidade, unidadeId: l.unidadeId || undefined })),
          dataPrevistaInicio: novo.inicio || undefined,
          dataPrevistaFim: novo.fim || undefined,
          responsavelColaboradorId: novo.responsavelId || undefined,
          observacao: novo.observacao || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar OP");
      setNovo(null);
      await loadOps();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setCriando(false); }
  }

  async function concluir() {
    if (!apontar) return;
    const itens = apontar.produtos.map((p) => ({ itemId: p.itemId, quantidadeReal: apForm.reais[p.itemId] ?? String(p.planejada) }));
    if (!itens.some((i) => Number(i.quantidadeReal) > 0)) { setErro("Informe a quantidade produzida"); return; }
    setApBusy(true); setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${apontar.id}/concluir-area`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens, qtdPerda: apForm.perda || undefined, biomassaKg: apForm.biomassa || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao apontar");
      setApontar(null);
      await loadOps();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setApBusy(false); }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Fluxo de Produção"
        subtitle="Chão de fábrica por área: escolha o fluxo, abra a aba da área e crie/aponte as OPs do dia."
        breadcrumbs={[{ label: "PCP" }, { label: "Fluxo de Produção" }]}
        action={
          <div className="flex items-center gap-2">
            <Link href="/pcp/chao" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <Factory className="w-4 h-4" /> Chão de Fábrica
            </Link>
            <Link href="/pcp/ordens/lista" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <List className="w-4 h-4" /> Lista
            </Link>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 space-y-4">
        {erro && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</div>}

        {/* Fluxo + dia */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Fluxo de produção</label>
            {loading ? (
              <div className="h-9 flex items-center text-sm text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : fluxos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum fluxo publicado. Publique em <strong>Fluxos de Produção</strong>.</p>
            ) : (
              <ComboboxWithCreate value={fluxoId} onChange={setFluxoId} allowNone={false} triggerClassName="h-9 rounded-lg"
                options={fluxos.map((f) => ({ value: f.id, label: f.nome }))} />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Dia</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9 rounded-lg border border-border px-3 text-sm bg-card" />
          </div>
          <button onClick={loadOps} className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted">
            <RefreshCw className={cn("w-4 h-4", carregandoOps && "animate-spin")} /> Atualizar
          </button>
        </div>

        {/* Abas por área */}
        {areas.length > 0 && (
          <div className="flex gap-0 border-b border-border overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
            {areas.map((a) => (
              <button key={a.nodeId} type="button" onClick={() => { setAreaNodeId(a.nodeId); setNovo(null); }}
                className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  a.nodeId === areaNodeId ? "border-cyan-600 text-cyan-700 dark:text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className="text-[10px] text-muted-foreground mr-1.5">{a.sequencia}</span>{a.centroTrabalho ?? a.nome}
                {(() => {
                  const c = contagem[a.nodeId];
                  if (!c || c.abertas + c.concluidas === 0) return null;
                  return (
                    <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium align-middle" title="OPs abertas · concluídas no dia">
                      <span className="text-cyan-600 dark:text-cyan-400">{c.abertas}</span>
                      <span className="text-muted-foreground/60">/</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{c.concluidas}</span>
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>
        )}

        {area && (
          <>
            <p className="text-xs text-muted-foreground">
              {area.isPrimeira
                ? "Consome matéria-prima e gera o PEP da etapa."
                : area.estadoSaida === "ACABADO"
                  ? `Consome o PEP ${ESTADO_LABEL[area.fromEstado ?? ""] ?? area.fromEstado} e gera o produto acabado.`
                  : area.estadoSaida
                    ? `Consome o PEP ${ESTADO_LABEL[area.fromEstado ?? ""] ?? area.fromEstado ?? "—"} e gera o PEP ${ESTADO_LABEL[area.estadoSaida] ?? area.estadoSaida}.`
                    : "Etapa de preparo (sem movimentação de WIP)."}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              {/* Coluna 1 — ENTRADA (matéria-prima ou PEP da etapa anterior) */}
              <ColBoard cor="amber" titulo={area.sequencia === minSeq ? "Matéria-prima" : "PEP de entrada"} icon={<Boxes className="w-3.5 h-3.5" />}>
                {area.isPrimeira ? (
                  <EstoqueLista linhas={materiais} vazio="Sem materiais na engenharia desta fase." />
                ) : (
                  <>
                    <EstoqueLista linhas={entradaWip} estado={area.fromEstado} vazio="Sem PEP de entrada em estoque." />
                    <EstoqueLista linhas={materiais} vazio="" />
                  </>
                )}
              </ColBoard>

              {/* Coluna 2 — ORDENS DE PRODUÇÃO */}
              <ColBoard cor="cyan" titulo="Ordens de Produção" icon={<Factory className="w-3.5 h-3.5" />}
                acao={
                  <button onClick={() => { setNovo({ linhas: [{ itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: area.produtos[0]?.unidades[0]?.id ?? "" }], inicio: "", fim: "", responsavelId: "", observacao: "" }); setErro(null); }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-700">
                    <Plus className="w-3.5 h-3.5" /> Nova OP
                  </button>
                }>
                {carregandoOps ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 p-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
                ) : ops.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Factory className="w-6 h-6 text-cyan-400 mb-1.5" />
                    <p className="text-xs text-muted-foreground">Nenhuma OP hoje. Crie em &quot;Nova OP&quot;.</p>
                  </div>
                ) : (
                  ops.map((o) => {
                    const concl = o.etapaStatus === "CONCLUIDA";
                    return (
                      <div key={o.id} className={cn("rounded-lg border bg-card p-2.5", concl ? "border-success/30" : "border-border")}>
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => router.push(`/pcp/ordens/${o.id}`)} className="font-mono text-[11px] text-muted-foreground hover:text-cyan-600">{o.numero}</button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a href={`/pcp/ordens/${o.id}/imprimir`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-cyan-600" title="Imprimir OP"><Printer className="w-3.5 h-3.5" /></a>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", ETAPA_STATUS[o.etapaStatus] ?? "bg-muted")}>
                              {o.etapaStatus === "CONCLUIDA" ? "concluída" : o.etapaStatus === "EM_EXECUCAO" ? "em execução" : "pendente"}
                            </span>
                          </div>
                        </div>
                        {o.produtos.length > 1 ? (
                          <p className="text-sm font-medium text-foreground mt-1 truncate">{o.produtos.length} produtos</p>
                        ) : (
                          <p className="text-sm font-medium text-foreground mt-1 truncate">{o.produto ?? "—"}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {o.produtos.length > 1
                            ? o.produtos.map((p) => `${Number(p.planejada)}${p.unidade ? ` ${p.unidade}` : ""}`).join(" · ")
                            : `${Number(o.produtos[0]?.planejada ?? o.quantidade)} ${o.produtos[0]?.unidade ?? o.unidade ?? ""}`}
                        </p>
                        {(o.responsavel || o.fimPrevisto) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {o.responsavel && <span>👤 {o.responsavel}</span>}
                            {o.responsavel && o.fimPrevisto && " · "}
                            {o.fimPrevisto && <span>até {new Date(o.fimPrevisto).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                          </p>
                        )}
                        {!concl && (
                          <button onClick={() => { setApontar(o); setApForm({ reais: Object.fromEntries(o.produtos.map((p) => [p.itemId, String(Number(p.planejada) || "")])), perda: "", biomassa: "" }); setErro(null); }}
                            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Apontar / Concluir
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </ColBoard>

              {/* Coluna 3 — SAÍDA (PEP que a etapa gera, ou o produto produzido) */}
              <ColBoard cor="emerald" titulo={area.estadoSaida === "ACABADO" ? "Produto acabado" : area.estadoSaida ? "PEP de saída" : "Saída"} icon={<PackageCheck className="w-3.5 h-3.5" />}>
                {area.estadoSaida ? (
                  <EstoqueLista linhas={saidaEstoque} estado={area.estadoSaida} vazio="Sem produção ainda." />
                ) : (() => {
                  // Área sem estado de WIP: a saída é o(s) produto(s) produzido(s) — vem das OPs do dia.
                  const prods = Array.from(new Map(ops.map((o) => [o.produtoCodigo ?? o.produto ?? o.id, o])).values());
                  if (prods.length === 0) return <p className="text-xs text-muted-foreground p-1">A saída aparece ao criar uma OP nesta etapa.</p>;
                  return prods.map((o) => (
                    <div key={o.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                      <p className="text-foreground font-medium truncate">{o.produto ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{o.produtoCodigo ? `${o.produtoCodigo} · ` : ""}Produto</p>
                    </div>
                  ));
                })()}
              </ColBoard>
            </div>
          </>
        )}
      </div>

      {/* Modal Nova OP — multi-produto, prazos, responsável */}
      {novo && area && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNovo(null)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Plus className="w-5 h-5 text-cyan-600" /> Nova OP — {area.centroTrabalho ?? area.nome}</h2>
            {area.produtos.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-3">Esta etapa não tem produto configurado. Defina o produto de saída da operação no editor do fluxo.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Número</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground">automático</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Emissão</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/40 text-sm tabular-nums">{new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Responsável</label>
                    <ComboboxWithCreate value={novo.responsavelId} onChange={(v) => setNovo({ ...novo, responsavelId: v })} allowNone triggerClassName="h-9 rounded-lg" placeholder="—"
                      options={colaboradores.map((c) => ({ value: c.id, label: c.nome }))} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Início previsto</label>
                    <input type="datetime-local" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Fim previsto</label>
                    <input type="datetime-local" value={novo.fim} onChange={(e) => setNovo({ ...novo, fim: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card" />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Produtos *</label>
                    <button onClick={() => setNovo({ ...novo, linhas: [...novo.linhas, { itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: area.produtos[0]?.unidades[0]?.id ?? "" }] })}
                      className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="w-3.5 h-3.5" /> Adicionar produto</button>
                  </div>
                  <div className="space-y-2">
                    {novo.linhas.map((l, i) => {
                      const prod = area.produtos.find((p) => p.id === l.itemId);
                      return (
                        <div key={i} className="grid grid-cols-[1fr_5rem_4.5rem_1.75rem] gap-2 items-center">
                          <ComboboxWithCreate value={l.itemId} onChange={(v) => { const un = area.produtos.find((p) => p.id === v)?.unidades[0]?.id ?? ""; setNovo({ ...novo, linhas: novo.linhas.map((x, j) => j === i ? { ...x, itemId: v, unidadeId: un } : x) }); }} allowNone={false} triggerClassName="h-9 rounded-lg"
                            options={area.produtos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }))} />
                          <input inputMode="decimal" value={l.quantidade} onChange={(e) => setNovo({ ...novo, linhas: novo.linhas.map((x, j) => j === i ? { ...x, quantidade: e.target.value } : x) })} placeholder="qtd" className="h-9 rounded-lg border border-border px-2 text-sm text-right tabular-nums bg-card" />
                          <select value={l.unidadeId} onChange={(e) => setNovo({ ...novo, linhas: novo.linhas.map((x, j) => j === i ? { ...x, unidadeId: e.target.value } : x) })} className="h-9 rounded-lg border border-border px-1.5 text-sm bg-card">
                            {(prod?.unidades ?? []).map((u) => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                          </select>
                          <button onClick={() => novo.linhas.length > 1 && setNovo({ ...novo, linhas: novo.linhas.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-danger flex justify-center" title="Remover"><X className="w-4 h-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Observação</label>
                  <input value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card" placeholder="opcional" />
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={() => setNovo(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                  <button onClick={criarOp} disabled={criando} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                    {criando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar OP
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal apontar */}
      {apontar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setApontar(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Apontar {apontar.numero}</h2>
            <p className="text-xs text-muted-foreground mt-1">Área {area?.centroTrabalho ?? area?.nome}. Informe a quantidade <b>real</b> produzida por produto (padrão = planejado).</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-3 py-1.5 bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>Produto</span><span className="text-right">Planejado</span><span className="text-right">Real</span>
                </div>
                {apontar.produtos.map((pr) => (
                  <div key={pr.itemId} className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-3 py-1.5 items-center border-t border-border/60">
                    <span className="text-xs text-foreground truncate">{pr.descricao}{pr.unidade ? <span className="text-muted-foreground"> ({pr.unidade})</span> : null}</span>
                    <span className="text-xs text-muted-foreground text-right tabular-nums">{Number(pr.planejada)}</span>
                    <input inputMode="decimal" value={apForm.reais[pr.itemId] ?? ""} onChange={(e) => setApForm((p) => ({ ...p, reais: { ...p.reais, [pr.itemId]: e.target.value } }))} className="h-8 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Perda (opcional)</label>
                  <input inputMode="decimal" value={apForm.perda} onChange={(e) => setApForm((p) => ({ ...p, perda: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                {area?.estadoSaida === "QUEIMADO" && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Biomassa (kg)</label>
                    <input inputMode="decimal" value={apForm.biomassa} onChange={(e) => setApForm((p) => ({ ...p, biomassa: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setApontar(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={concluir} disabled={apBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {apBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Apontar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Coluna do board (Entrada / OPs / Saída), cada uma com a sua cor.
const COR_BOARD: Record<string, { topo: string; titulo: string; head: string }> = {
  amber:   { topo: "border-t-amber-400",   titulo: "text-amber-700 dark:text-amber-400",     head: "bg-amber-50/50 dark:bg-amber-950/20" },
  cyan:    { topo: "border-t-cyan-500",    titulo: "text-cyan-700 dark:text-cyan-400",       head: "bg-cyan-50/50 dark:bg-cyan-950/20" },
  emerald: { topo: "border-t-emerald-500", titulo: "text-emerald-700 dark:text-emerald-400", head: "bg-emerald-50/50 dark:bg-emerald-950/20" },
};
function ColBoard({ titulo, icon, acao, cor = "cyan", children }: { titulo: string; icon?: React.ReactNode; acao?: React.ReactNode; cor?: "amber" | "cyan" | "emerald"; children: React.ReactNode }) {
  const c = COR_BOARD[cor] ?? COR_BOARD.cyan;
  return (
    <div className={cn("rounded-xl border border-border border-t-2 bg-muted/20 flex flex-col min-h-[10rem]", c.topo)}>
      <div className={cn("flex items-center justify-between gap-2 px-3 py-2 border-b border-border rounded-t-[10px]", c.head)}>
        <p className={cn("text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 min-w-0", c.titulo)}>
          {icon}<span className="truncate">{titulo}</span>
        </p>
        {acao}
      </div>
      <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-22rem)]">{children}</div>
    </div>
  );
}

// Lista de saldos de estoque (matéria-prima / PEP / PA), aberta por local.
// `estado` (opcional) adiciona uma tag de estado WIP no produto (só PEP têm estado).
function EstoqueLista({ linhas, vazio, estado }: { linhas: EstoqueLinha[] | null; vazio: string; estado?: string | null }) {
  if (linhas === null) return <p className="text-xs text-muted-foreground flex items-center gap-1.5 p-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>;
  if (linhas.length === 0) return vazio ? <p className="text-xs text-muted-foreground p-1">{vazio}</p> : null;
  return (
    <>
      {linhas.map((m) => (
        <div key={m.itemId ?? m.descricao} className={cn("rounded-lg border px-3 py-2 text-xs bg-card", m.saldoTotal > 0 ? "border-border" : "border-warning/40 bg-warning/10")}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-foreground font-medium truncate">{m.descricao}</span>
              {estado && <span className="shrink-0 inline-flex items-center rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 text-[9px] font-semibold uppercase tracking-wide">{ESTADO_LABEL[estado] ?? estado}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              <b className={m.saldoTotal > 0 ? "text-foreground" : "text-warning"}>{m.saldoTotal.toLocaleString("pt-BR")}</b>
              {m.unidade && <span className="text-muted-foreground ml-1">{m.unidade}</span>}
            </span>
          </div>
          {m.locais.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {m.locais.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{l.localNome}</span>
                  <span className="tabular-nums shrink-0">{l.saldo.toLocaleString("pt-BR")}{m.unidade ? ` ${m.unidade}` : ""}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-warning">Sem saldo</p>
          )}
        </div>
      ))}
    </>
  );
}
