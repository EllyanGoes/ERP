"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, Factory, CheckCircle2, List, Loader2, X, Boxes } from "lucide-react";

type FluxoOpt = { id: string; nome: string; versaoAtivaId: string | null };
type Area = { nodeId: string; sequencia: number; nome: string; centroTrabalho: string | null; estadoSaida: string | null; fromEstado: string | null; isPrimeira: boolean };
type Produto = { id: string; codigo: string; descricao: string };
type BoardOP = { id: string; numero: string; status: string; quantidade: string | number; unidade: string | null; produto: string | null; produtoCodigo: string | null; etapaStatus: string };
type Disp = { tipo: "MP" | "WIP"; rendimentoMilheiros?: number | null; saldoWipAnterior?: number; insumos?: { descricao: string; consumoPorMilheiro: number; disponivel: number }[]; aviso?: string };

const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };
const ETAPA_STATUS: Record<string, string> = { PENDENTE: "bg-muted text-muted-foreground", EM_EXECUCAO: "bg-warning/15 text-warning", CONCLUIDA: "bg-success/15 text-success" };
const hoje = () => new Date().toISOString().slice(0, 10);

export default function OrdensBoardPage() {
  useTabTitle("Ordens de Produção");
  const router = useRouter();

  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [areaNodeId, setAreaNodeId] = useState("");
  const [data, setData] = useState(hoje());
  const [ops, setOps] = useState<BoardOP[]>([]);
  const [materiais, setMateriais] = useState<{ itemId: string; descricao: string; unidade: string | null; saldoTotal: number; locais: { localNome: string; saldo: number }[] }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [carregandoOps, setCarregandoOps] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Nova OP
  const [novo, setNovo] = useState<{ itemId: string; quantidade: string; dataPrevista: string } | null>(null);
  const [disp, setDisp] = useState<Disp | null>(null);
  const [criando, setCriando] = useState(false);

  // Apontar
  const [apontar, setApontar] = useState<BoardOP | null>(null);
  const [apForm, setApForm] = useState({ quantidade: "", perda: "", biomassa: "" });
  const [apBusy, setApBusy] = useState(false);

  const area = areas.find((a) => a.nodeId === areaNodeId) ?? null;

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

  // Saldo dos materiais necessários na área (insumos da operação no fluxo)
  useEffect(() => {
    if (!fluxoId || !areaNodeId) { setMateriais(null); return; }
    setMateriais(null);
    fetch(`/api/pcp/ordens/area/materiais?fluxoId=${fluxoId}&areaNodeId=${areaNodeId}`)
      .then((r) => r.json()).then((j) => setMateriais(j.data ?? [])).catch(() => setMateriais([]));
  }, [fluxoId, areaNodeId]);

  // Referência de disponibilidade ao escolher produto
  useEffect(() => {
    if (!novo?.itemId || !area) { setDisp(null); return; }
    setDisp(null);
    fetch(`/api/pcp/ordens/area/disponibilidade?fluxoId=${fluxoId}&areaNodeId=${areaNodeId}&itemId=${novo.itemId}`)
      .then((r) => r.json()).then((j) => setDisp(j)).catch(() => setDisp(null));
  }, [novo?.itemId, area, fluxoId, areaNodeId]);

  async function criarOp() {
    if (!novo?.itemId) { setErro("Escolha o produto"); return; }
    const q = Number(novo.quantidade);
    if (!Number.isFinite(q) || q <= 0) { setErro("Quantidade deve ser > 0"); return; }
    setCriando(true); setErro(null);
    try {
      const r = await fetch("/api/pcp/ordens/area", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId, areaNodeId, itemId: novo.itemId, quantidadePlanejada: q, data, dataPrevista: novo.dataPrevista || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao criar OP");
      setNovo(null); setDisp(null);
      await loadOps();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setCriando(false); }
  }

  async function concluir() {
    if (!apontar) return;
    const q = Number(apForm.quantidade);
    if (!Number.isFinite(q) || q <= 0) { setErro("Informe a quantidade produzida"); return; }
    setApBusy(true); setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${apontar.id}/concluir-area`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidadeProduzida: apForm.quantidade, qtdPerda: apForm.perda || undefined, biomassaKg: apForm.biomassa || undefined }),
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
        title="Ordens de Produção"
        subtitle="Chão de fábrica por área: escolha o fluxo, abra a aba da área e crie/aponte as OPs do dia."
        breadcrumbs={[{ label: "PCP" }, { label: "Ordens de Produção" }]}
        action={
          <Link href="/pcp/ordens/lista" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <List className="w-4 h-4" /> Lista
          </Link>
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
          <div className="flex gap-0 border-b border-border overflow-x-auto">
            {areas.map((a) => (
              <button key={a.nodeId} type="button" onClick={() => { setAreaNodeId(a.nodeId); setNovo(null); }}
                className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  a.nodeId === areaNodeId ? "border-cyan-600 text-cyan-700 dark:text-cyan-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <span className="text-[10px] text-muted-foreground mr-1.5">{a.sequencia}</span>{a.centroTrabalho ?? a.nome}
                {a.estadoSaida && <span className="text-[11px] text-muted-foreground"> · {ESTADO_LABEL[a.estadoSaida] ?? a.estadoSaida}</span>}
              </button>
            ))}
          </div>
        )}

        {area && (
          <div className="space-y-3">
            {/* Cabeçalho da área + nova OP */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {area.isPrimeira
                  ? "Consome matéria-prima e gera o WIP da etapa."
                  : `Consome o WIP ${ESTADO_LABEL[area.fromEstado ?? ""] ?? area.fromEstado} e gera ${ESTADO_LABEL[area.estadoSaida ?? ""] ?? "o próximo"}.`}
              </p>
              <button onClick={() => { setNovo({ itemId: produtos[0]?.id ?? "", quantidade: "", dataPrevista: "" }); setDisp(null); setErro(null); }}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700">
                <Plus className="w-4 h-4" /> Nova OP
              </button>
            </div>

            {/* Saldo dos materiais necessários nesta etapa */}
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5" /> Materiais da etapa — saldo em estoque</p>
              {materiais === null ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
              ) : materiais.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum material configurado nesta etapa — defina os insumos da operação no editor do fluxo.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {materiais.map((m) => (
                    <div key={m.itemId} className={cn("rounded-lg border px-3 py-2 text-xs", m.saldoTotal > 0 ? "border-border bg-card" : "border-warning/40 bg-warning/10")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground font-medium truncate">{m.descricao}</span>
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
                        <p className="mt-1 text-[11px] text-warning">Sem saldo em estoque</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OPs do dia na área */}
            {carregandoOps ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : ops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-cyan-50 dark:bg-cyan-500/15 flex items-center justify-center mb-2"><Factory className="w-6 h-6 text-cyan-400" /></div>
                <p className="text-sm font-medium text-foreground">Nenhuma OP nesta área hoje</p>
                <p className="text-xs text-muted-foreground mt-1">Crie uma OP com &quot;Nova OP&quot;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ops.map((o) => {
                  const concl = o.etapaStatus === "CONCLUIDA";
                  return (
                    <div key={o.id} className={cn("rounded-xl border bg-card p-3", concl ? "border-success/30" : "border-border")}>
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => router.push(`/pcp/ordens/${o.id}`)} className="font-mono text-xs text-muted-foreground hover:text-cyan-600">{o.numero}</button>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", ETAPA_STATUS[o.etapaStatus] ?? "bg-muted")}>
                          {o.etapaStatus === "CONCLUIDA" ? "concluída" : o.etapaStatus === "EM_EXECUCAO" ? "em execução" : "pendente"}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{o.produto ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{Number(o.quantidade)} {o.unidade}</p>
                      {!concl && (
                        <button onClick={() => { setApontar(o); setApForm({ quantidade: String(Number(o.quantidade) || ""), perda: "", biomassa: "" }); setErro(null); }}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Apontar / Concluir
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova OP */}
      {novo && area && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setNovo(null); setDisp(null); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Plus className="w-5 h-5 text-cyan-600" /> Nova OP — {area.centroTrabalho ?? area.nome}</h2>
            {produtos.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-3">Nenhum produto com engenharia neste fluxo. Cadastre a <strong>Engenharia do Produto</strong>.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Número da OP</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground">automático</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Data de emissão</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/40 text-sm text-foreground tabular-nums">{new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Produto acabado *</label>
                    <ComboboxWithCreate value={novo.itemId} onChange={(v) => setNovo({ ...novo, itemId: v })} allowNone={false} triggerClassName="h-9 rounded-lg"
                      options={produtos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Código do produto</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/40 text-sm text-foreground font-mono">{produtos.find((p) => p.id === novo.itemId)?.codigo ?? "—"}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Quantidade solicitada *</label>
                    <input autoFocus className="w-full h-9 rounded-lg border border-border px-3 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      inputMode="decimal" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} placeholder="ex.: 50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Data de entrega (prazo)</label>
                    <input type="date" value={novo.dataPrevista} onChange={(e) => setNovo({ ...novo, dataPrevista: e.target.value })} className="h-9 rounded-lg border border-border px-3 text-sm bg-card" />
                  </div>
                </div>
                {disp && (
                  <div className="text-xs text-muted-foreground mt-3 border-t border-border/60 pt-2">
                    {disp.tipo === "MP" ? (
                      disp.aviso ? <span className="text-warning">{disp.aviso}</span> : (
                        <span>Estoque de MP rende <b className="text-foreground">{disp.rendimentoMilheiros != null ? `~${disp.rendimentoMilheiros.toLocaleString("pt-BR")} milheiro` : "—"}</b>
                          {disp.insumos && disp.insumos.length > 0 && <> · {disp.insumos.map((i) => `${i.descricao}: ${i.disponivel.toLocaleString("pt-BR")}`).join(" · ")}</>}
                          {" "}(referência)</span>
                      )
                    ) : (
                      <span>Saldo de WIP {ESTADO_LABEL[area.fromEstado ?? ""] ?? area.fromEstado}: <b className="text-foreground">{(disp.saldoWipAnterior ?? 0).toLocaleString("pt-BR")}</b> (referência)</span>
                    )}
                  </div>
                )}
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={() => { setNovo(null); setDisp(null); }} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
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
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Apontar {apontar.numero}</h2>
            <p className="text-xs text-muted-foreground mt-1">{apontar.produto} · área {area?.centroTrabalho ?? area?.nome}. Consome o WIP/MP de entrada e gera a saída.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Quantidade produzida *</label>
                <input autoFocus inputMode="decimal" value={apForm.quantidade} onChange={(e) => setApForm((p) => ({ ...p, quantidade: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
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
