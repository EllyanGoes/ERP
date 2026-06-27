"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import PageHeader from "@/components/shared/PageHeader";
import CalendarioProducao from "@/components/pcp/CalendarioProducao";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, Factory, CheckCircle2, Workflow, Loader2, X, Boxes, PackageCheck, Printer, Pencil, CalendarDays, LayoutGrid, List, Trash2, Calculator } from "lucide-react";

type FluxoOpt = { id: string; nome: string; versaoAtivaId: string | null };
type Area = { nodeId: string; sequencia: number; nome: string; centroTrabalho: string | null; estadoSaida: string | null; fromEstado: string | null; isPrimeira: boolean; produtoSaidaId: string | null; produtos: Produto[] };
type Unidade = { id: string; sigla: string };
type Produto = { id: string; codigo: string; descricao: string; unidades: Unidade[] };
type LinhaOP = { itemId: string; quantidade: string; unidadeId: string };
type NovoOP = { linhas: LinhaOP[]; inicio: string; fim: string; responsavelId: string; observacao: string; editId?: string | null; editNumero?: string; editCriadoPor?: string | null; editResponsavelNome?: string | null };
type ProdutoOP = { itemId: string; codigo: string; descricao: string; planejada: string | number; real: string | number | null; unidade: string | null; unidadeId: string | null; pecasPorUnidade?: number };
type BoardOP = { id: string; numero: string; status: string; dia?: string; areaNome?: string; quantidade: string | number; unidade: string | null; produto: string | null; produtoCodigo: string | null; etapaStatus: string; responsavel: string | null; responsavelColaboradorId: string | null; criadoPor: string | null; observacao: string | null; inicioPrevisto: string | null; fimPrevisto: string | null; produtos: ProdutoOP[] };
type SaldoInicial = { estado: string; itemId: string; quantidade: string; data: string };
type Disp = { tipo: "MP" | "WIP"; rendimentoMilheiros?: number | null; saldoWipAnterior?: number; insumos?: { descricao: string; consumoPorMilheiro: number; disponivel: number }[]; aviso?: string };
type EstoqueLinha = { itemId: string | null; descricao: string; unidade: string | null; saldoTotal: number; locais: { localNome: string; saldo: number }[] };
type ConsumoLinha = { itemId: string | null; descricao: string; unidade: string | null; consumo: number; gerenciavel: boolean; saldo: number | null; suficiente: boolean };
// Linha da calculadora de perda: nº de vagões/vagonetas e a carga (peças) por produto
// daquele tipo de vagão. Cheio = 1 produto; meiado = 2+ produtos.
type CargaVagaoRow = { veiculo: "VAGAO" | "VAGONETA"; nVagoes: string; cargas: { itemId: string; pecas: string }[] };

const ESTADO_LABEL: Record<string, string> = { UMIDO: "úmido", SECO: "seco", QUEIMADO: "queimado", ACABADO: "acabado" };
// Unidade padrão de um produto na OP: no Embalar (saída ACABADO) o padrão é o
// PALETE (PLT); nas demais etapas, a 1ª unidade (principal). Cai p/ a 1ª se não houver PLT.
function unidadePadrao(area: Area | null | undefined, prod: Produto | undefined): string {
  if (!prod) return "";
  if (area?.estadoSaida === "ACABADO") {
    const plt = prod.unidades.find((u) => u.sigla.toUpperCase() === "PLT");
    if (plt) return plt.id;
  }
  return prod.unidades[0]?.id ?? "";
}
const ETAPA_STATUS: Record<string, string> = { PENDENTE: "bg-muted text-muted-foreground", EM_EXECUCAO: "bg-warning/15 text-warning", CONCLUIDA: "bg-success/15 text-success" };
const hoje = () => new Date().toISOString().slice(0, 10);
// ISO → valor de <input type="datetime-local"> em hora local ("YYYY-MM-DDTHH:mm").
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
// <input datetime-local> ("YYYY-MM-DDTHH:mm", sem fuso) → ISO ABSOLUTO (com Z).
// new Date(local) interpreta na hora do NAVEGADOR (a do usuário); .toISOString()
// fixa o instante UTC correto — sem isso o servidor (UTC) parseava como UTC e a
// hora "andava" o offset ao reler.
const localInputToIso = (v: string): string | null => {
  if (!v?.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export default function OrdensBoardPage() {
  useTabTitle("Fluxo de Produção");
  const router = useRouter();
  const { user } = useSession();

  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  const [fluxoId, setFluxoId] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [areaNodeId, setAreaNodeId] = useState("");
  const [data, setData] = useState(hoje());
  // Popover do calendário de produção usado como filtro de dia.
  const [calAberto, setCalAberto] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!calAberto) return;
    const onDown = (e: MouseEvent) => { if (calRef.current && !calRef.current.contains(e.target as Node)) setCalAberto(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calAberto]);
  const [ops, setOps] = useState<BoardOP[]>([]);
  // Visão: board (kanban do dia) × lista (OPs da área agrupadas por dia, no mês).
  const [vista, setVista] = useState<"board" | "lista">("board");
  const [escopoLista, setEscopoLista] = useState<"area" | "todas">("area");
  const [soAbertas, setSoAbertas] = useState(false);
  const [opsLista, setOpsLista] = useState<BoardOP[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
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
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string; areasOperacao: string[] }[]>([]);
  const [consumo, setConsumo] = useState<ConsumoLinha[] | null>(null);
  const [carregandoConsumo, setCarregandoConsumo] = useState(false);
  // Saldo inicial de WIP
  const [saldoIni, setSaldoIni] = useState<SaldoInicial | null>(null);
  const [salvandoSaldo, setSalvandoSaldo] = useState(false);

  // Apontar
  const [apontar, setApontar] = useState<BoardOP | null>(null);
  const [apForm, setApForm] = useState<{ reais: Record<string, string>; perdas: Record<string, string>; perda: string; biomassa: string }>({ reais: {}, perdas: {}, perda: "", biomassa: "" });
  // Calculadora de perda (Embalar): linhas de vagão descarregado → descarregado por produto.
  const [calcPerda, setCalcPerda] = useState<{ rows: CargaVagaoRow[] } | null>(null);
  // Capacidades cadastradas (peças/veículo por produto), de cargas-movimentação.
  const [capacidades, setCapacidades] = useState<Record<string, { VAGONETA?: number; VAGAO?: number }>>({});
  const [apBusy, setApBusy] = useState(false);
  const [consumoAp, setConsumoAp] = useState<ConsumoLinha[] | null>(null);
  const [carregandoConsumoAp, setCarregandoConsumoAp] = useState(false);

  const area = areas.find((a) => a.nodeId === areaNodeId) ?? null;
  const minSeq = areas.length ? Math.min(...areas.map((a) => a.sequencia)) : 0;
  // Responsáveis elegíveis na área: SÓ quem tem esta etapa nas Áreas de operação.
  // Sem a área marcada, o colaborador não aparece como responsável aqui.
  const colaboradoresDaArea = colaboradores.filter((c) => area != null && c.areasOperacao.includes(area.nome));

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

  // 3b. Visão em LISTA: OPs no MÊS do dia selecionado, agrupadas por dia. Escopo
  // "area" = só a aba atual; "todas" = todas as áreas do fluxo (marca a área em cada OP).
  const loadLista = useCallback(async () => {
    if (!fluxoId) { setOpsLista([]); return; }
    const [y, m] = data.split("-").map(Number);
    const ult = new Date(y, m, 0).getDate();
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const to = `${y}-${String(m).padStart(2, "0")}-${String(ult).padStart(2, "0")}`;
    const busca = async (nodeId: string, nome?: string): Promise<BoardOP[]> => {
      const r = await fetch(`/api/pcp/ordens/area/board?fluxoId=${fluxoId}&areaNodeId=${nodeId}&from=${from}&to=${to}`);
      const j = await r.json();
      return (j.data ?? []).map((o: BoardOP) => ({ ...o, areaNome: nome }));
    };
    setCarregandoLista(true);
    try {
      if (escopoLista === "todas") {
        const partes = await Promise.all(areas.map((a) => busca(a.nodeId, a.centroTrabalho ?? a.nome)));
        setOpsLista(partes.flat());
      } else {
        if (!areaNodeId) { setOpsLista([]); return; }
        setOpsLista(await busca(areaNodeId));
      }
    } finally { setCarregandoLista(false); }
  }, [fluxoId, areaNodeId, data, escopoLista, areas]);
  useEffect(() => { if (vista === "lista") loadLista(); }, [vista, loadLista]);

  // Contagem de OPs por área (abertas/concluídas) no dia — exibida nas abas.
  useEffect(() => {
    if (!fluxoId) { setContagem({}); return; }
    fetch(`/api/pcp/ordens/area/contagem?fluxoId=${fluxoId}&data=${data}`)
      .then((r) => r.json()).then((j) => setContagem(j.data ?? {})).catch(() => setContagem({}));
  }, [fluxoId, data, ops]);

  // Estoque dos 3 cards (materiais de entrada · PEP de entrada · saída). Em callback
  // p/ recarregar em tempo real após apontar/excluir uma OP (o saldo muda na hora).
  const loadEstoque = useCallback(() => {
    if (!fluxoId || !areaNodeId) { setMateriais(null); setEntradaWip(null); setSaidaEstoque(null); return; }
    fetch(`/api/pcp/ordens/area/materiais?fluxoId=${fluxoId}&areaNodeId=${areaNodeId}`)
      .then((r) => r.json()).then((j) => setMateriais(j.data ?? [])).catch(() => setMateriais([]));
    const a = areas.find((x) => x.nodeId === areaNodeId) ?? null;
    if (!a) { setEntradaWip(null); setSaidaEstoque(null); return; }
    if (a.isPrimeira || !a.fromEstado) setEntradaWip([]);
    else {
      fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.fromEstado}`)
        .then((r) => r.json()).then((j) => setEntradaWip(j.data ?? [])).catch(() => setEntradaWip([]));
    }
    if (!a.estadoSaida) setSaidaEstoque([]);
    else {
      fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.estadoSaida}`)
        .then((r) => r.json()).then((j) => setSaidaEstoque(j.data ?? [])).catch(() => setSaidaEstoque([]));
    }
  }, [fluxoId, areaNodeId, areas]);
  useEffect(() => { setMateriais(null); setEntradaWip(null); setSaidaEstoque(null); loadEstoque(); }, [loadEstoque]);

  // Colaboradores (responsável pela OP)
  useEffect(() => {
    fetch("/api/empresa/colaboradores?daEmpresaAtiva=1&ativo=true")
      .then((r) => r.json())
      .then((j) => setColaboradores(Array.isArray(j) ? j.map((c: { id: string; nome: string; areasOperacao?: string[] }) => ({ id: c.id, nome: c.nome, areasOperacao: c.areasOperacao ?? [] })) : []))
      .catch(() => setColaboradores([]));
  }, []);

  // Consumo previsto do estoque conforme os produtos/quantidades/unidades da Nova OP (debounce).
  useEffect(() => {
    if (!novo || !fluxoId || !areaNodeId) { setConsumo(null); return; }
    const produtos = novo.linhas
      .filter((l) => l.itemId && Number(l.quantidade) > 0)
      .map((l) => ({ itemId: l.itemId, quantidade: Number(l.quantidade), unidadeId: l.unidadeId || null }));
    if (!produtos.length) { setConsumo(null); return; }
    setCarregandoConsumo(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/pcp/ordens/area/consumo-previsto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId, areaNodeId, produtos }), signal: ctrl.signal,
      }).then((r) => r.json()).then((j) => setConsumo(j.data ?? [])).catch(() => {}).finally(() => setCarregandoConsumo(false));
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [novo, fluxoId, areaNodeId]);

  // Consumo previsto ao APONTAR — usa a quantidade REAL informada por produto (padrão = planejado).
  useEffect(() => {
    if (!apontar || !fluxoId || !areaNodeId) { setConsumoAp(null); return; }
    const produtos = apontar.produtos
      .map((p) => ({ itemId: p.itemId, quantidade: Number(apForm.reais[p.itemId] ?? p.planejada), unidadeId: p.unidadeId }))
      .filter((p) => p.itemId && p.quantidade > 0);
    if (!produtos.length) { setConsumoAp(null); return; }
    setCarregandoConsumoAp(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/pcp/ordens/area/consumo-previsto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId, areaNodeId, produtos }), signal: ctrl.signal,
      }).then((r) => r.json()).then((j) => setConsumoAp(j.data ?? [])).catch(() => {}).finally(() => setCarregandoConsumoAp(false));
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [apontar, apForm.reais, fluxoId, areaNodeId]);

  // Capacidades cadastradas (peças/veículo por produto) p/ a calculadora de perda.
  useEffect(() => {
    fetch("/api/pcp/cargas-movimentacao").then((r) => r.json()).then((j) => {
      const map: Record<string, { VAGONETA?: number; VAGAO?: number }> = {};
      for (const p of (j?.produtos ?? []) as { itemId: string; capacidades?: { VAGONETA?: number; VAGAO?: number } }[]) {
        if (p.itemId) map[p.itemId] = p.capacidades ?? {};
      }
      setCapacidades(map);
    }).catch(() => {});
  }, []);

  async function criarOp() {
    if (!novo) return;
    const linhas = novo.linhas.filter((l) => l.itemId && Number(l.quantidade) > 0);
    if (!linhas.length) { setErro("Adicione ao menos um produto com quantidade > 0"); return; }
    setCriando(true); setErro(null);
    const produtos = linhas.map((l) => ({ itemId: l.itemId, quantidade: l.quantidade, unidadeId: l.unidadeId || null }));
    try {
      const r = novo.editId
        ? await fetch(`/api/pcp/ordens/${novo.editId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              produtos,
              dataPrevistaInicio: localInputToIso(novo.inicio), dataPrevistaFim: localInputToIso(novo.fim),
              responsavelColaboradorId: novo.responsavelId || null, observacao: novo.observacao || null,
            }),
          })
        : await fetch("/api/pcp/ordens/area", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fluxoId, areaNodeId, data, produtos,
              dataPrevistaInicio: localInputToIso(novo.inicio) ?? undefined, dataPrevistaFim: localInputToIso(novo.fim) ?? undefined,
              responsavelColaboradorId: novo.responsavelId || undefined, observacao: novo.observacao || undefined,
            }),
          });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? (novo.editId ? "Erro ao salvar OP" : "Erro ao criar OP"));
      setNovo(null);
      await loadOps();
      if (vista === "lista") await loadLista();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setCriando(false); }
  }

  // Abre o modal em modo edição, pré-preenchido com a OP do board.
  function abrirEdicao(o: BoardOP) {
    setNovo({
      editId: o.id, editNumero: o.numero,
      linhas: o.produtos.length
        ? o.produtos.map((p) => ({ itemId: p.itemId, quantidade: String(Number(p.planejada) || ""), unidadeId: p.unidadeId ?? "" }))
        : [{ itemId: area?.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area?.produtos[0]) }],
      inicio: toLocalInput(o.inicioPrevisto), fim: toLocalInput(o.fimPrevisto),
      responsavelId: o.responsavelColaboradorId ?? "", observacao: o.observacao ?? "",
      editCriadoPor: o.criadoPor, editResponsavelNome: o.responsavel,
    });
    setErro(null);
  }

  async function salvarSaldoInicial() {
    if (!saldoIni) return;
    if (!saldoIni.itemId || Number(saldoIni.quantidade) <= 0) { setErro("Informe produto e quantidade > 0"); return; }
    setSalvandoSaldo(true); setErro(null);
    try {
      const r = await fetch("/api/pcp/ordens/area/saldo-inicial-wip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: saldoIni.itemId, estado: saldoIni.estado, quantidade: saldoIni.quantidade, data: saldoIni.data || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao lançar saldo inicial");
      setSaldoIni(null);
      const a = areas.find((x) => x.nodeId === areaNodeId) ?? null;
      if (a?.fromEstado) fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.fromEstado}`).then((r) => r.json()).then((j) => setEntradaWip(j.data ?? []));
      if (a?.estadoSaida) fetch(`/api/pcp/ordens/area/estoque-estado?fluxoId=${fluxoId}&estado=${a.estadoSaida}`).then((r) => r.json()).then((j) => setSaidaEstoque(j.data ?? []));
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setSalvandoSaldo(false); }
  }

  async function concluir() {
    if (!apontar) return;
    const itens = apontar.produtos.map((p) => ({
      itemId: p.itemId,
      quantidadeReal: apForm.reais[p.itemId] ?? String(p.planejada),
      qtdPerda: apForm.perdas[p.itemId] || undefined, // perda por produto (peças)
    }));
    if (!itens.some((i) => Number(i.quantidadeReal) > 0)) { setErro("Informe a quantidade produzida"); return; }
    setApBusy(true); setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${apontar.id}/concluir-area`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // qtdPerda (etapa) fica a cargo do servidor (soma das perdas por produto); mantém
        // apForm.perda como fallback p/ etapas sem calculadora (1 produto).
        body: JSON.stringify({ itens, qtdPerda: apForm.perda || undefined, biomassaKg: apForm.biomassa || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Erro ao apontar");
      setApontar(null);
      await loadOps();
      loadEstoque(); // saldo dos cards (matéria-prima/PEP/saída) muda na hora
      if (vista === "lista") await loadLista();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setApBusy(false); }
  }

  // ── Calculadora de perda (Embalar) ───────────────────────────────────────────
  // Peças apontadas de um produto = real (na unidade) × peças por unidade (PLT→peças).
  function apontadoPecas(p: ProdutoOP): number {
    const real = Number(apForm.reais[p.itemId] ?? p.planejada) || 0;
    return real * (p.pecasPorUnidade ?? 1);
  }
  // Descarregado (peças) por produto, somando as linhas de vagão (nº × peças/vagão).
  function descarregadoPorProduto(rows: CargaVagaoRow[]): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const row of rows) {
      const n = Number(row.nVagoes) || 0;
      for (const c of row.cargas) {
        const pc = Number(c.pecas) || 0;
        if (c.itemId && n > 0 && pc > 0) acc[c.itemId] = (acc[c.itemId] ?? 0) + n * pc;
      }
    }
    return acc;
  }
  // Abre a calculadora: 1 linha "cheia" por produto da OP, capacidade do cadastro.
  function abrirCalcPerda() {
    if (!apontar) return;
    const rows: CargaVagaoRow[] = apontar.produtos.map((p) => ({
      veiculo: "VAGAO", nVagoes: "",
      cargas: [{ itemId: p.itemId, pecas: String(capacidades[p.itemId]?.VAGAO ?? "") }],
    }));
    setCalcPerda({ rows: rows.length ? rows : [{ veiculo: "VAGAO", nVagoes: "", cargas: [{ itemId: "", pecas: "" }] }] });
  }
  // Grava a perda por produto (descarregado − apontado, nunca < 0) e fecha.
  function aplicarCalcPerda() {
    if (!calcPerda || !apontar) return;
    const desc = descarregadoPorProduto(calcPerda.rows);
    const perdas: Record<string, string> = { ...apForm.perdas };
    for (const p of apontar.produtos) {
      const d = desc[p.itemId];
      if (d == null) continue;
      const perda = Math.max(0, Math.round((d - apontadoPecas(p)) * 1000) / 1000);
      perdas[p.itemId] = String(perda);
    }
    setApForm((f) => ({ ...f, perdas }));
    setCalcPerda(null);
  }

  async function excluirOP(o: BoardOP) {
    if (!confirm(`Excluir a OP ${o.numero}? Esta ação é permanente.`)) return;
    setErro(null);
    try {
      const r = await fetch(`/api/pcp/ordens/${o.id}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error ?? "Não foi possível excluir"); }
      await loadOps();
      loadEstoque();
      if (vista === "lista") await loadLista();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
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
              <Workflow className="w-4 h-4" /> Fluxo de Trabalho
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
          <div className="relative" ref={calRef}>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Dia</label>
            <button type="button" onClick={() => setCalAberto((o) => !o)}
              className="h-9 inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm bg-card hover:bg-muted">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              {data ? data.split("-").reverse().join("/") : "Selecionar dia"}
            </button>
            {calAberto && fluxoId && (
              <div className="absolute z-50 mt-1 left-0">
                <CalendarioProducao fluxoId={fluxoId} value={data} onSelect={(d) => { setData(d); setCalAberto(false); }} />
              </div>
            )}
          </div>
          <button onClick={() => { loadOps(); if (vista === "lista") loadLista(); }} className="h-9 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted">
            <RefreshCw className={cn("w-4 h-4", (carregandoOps || carregandoLista) && "animate-spin")} /> Atualizar
          </button>
          {/* Toggle de visão: board (kanban) × lista (por dia) */}
          <div className="ml-auto flex rounded-lg border border-border p-0.5 text-xs">
            <button type="button" onClick={() => setVista("board")}
              className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors", vista === "board" ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="w-3.5 h-3.5" /> Board
            </button>
            <button type="button" onClick={() => setVista("lista")}
              className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors", vista === "lista" ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
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

            {vista === "lista" ? (
              <ListaPorDia
                ops={opsLista}
                carregando={carregandoLista}
                mes={data}
                escopo={escopoLista} onEscopo={setEscopoLista}
                soAbertas={soAbertas} onSoAbertas={setSoAbertas}
                onNova={escopoLista === "area" ? () => { setNovo({ linhas: [{ itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area.produtos[0]) }], inicio: `${data}T07:00`, fim: `${data}T19:00`, responsavelId: "", observacao: "" }); setErro(null); } : null}
                onAbrir={(id) => router.push(`/pcp/ordens/${id}`)}
                onEditar={(o) => abrirEdicao(o)}
                onExcluir={(o) => excluirOP(o)}
                onApontar={(o) => { setApontar(o); setApForm({ reais: Object.fromEntries(o.produtos.map((p) => [p.itemId, String(Number(p.planejada) || "")])), perdas: {}, perda: "", biomassa: "" }); setErro(null); }}
              />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              {/* Coluna 1 — ENTRADA (matéria-prima ou PEP da etapa anterior) */}
              <ColBoard cor="amber" titulo={area.sequencia === minSeq ? "Matéria-prima" : "PEP de entrada"} icon={<Boxes className="w-3.5 h-3.5" />}
                acao={!area.isPrimeira && area.fromEstado && area.fromEstado !== "ACABADO" ? (
                  <button onClick={() => { setSaldoIni({ estado: area.fromEstado!, itemId: produtos[0]?.id ?? "", quantidade: "", data: hoje() }); setErro(null); }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30" title="Definir saldo inicial">
                    <Plus className="w-3 h-3" /> Saldo inicial
                  </button>
                ) : undefined}>
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
                  <button onClick={() => { setNovo({ linhas: [{ itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area.produtos[0]) }], inicio: `${data}T07:00`, fim: `${data}T19:00`, responsavelId: "", observacao: "" }); setErro(null); }}
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
                            {!concl && <button onClick={(e) => { e.stopPropagation(); abrirEdicao(o); }} className="text-muted-foreground hover:text-cyan-600" title="Editar OP"><Pencil className="w-3.5 h-3.5" /></button>}
                            <Link href={`/pcp/ordens/${o.id}/imprimir`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-cyan-600" title="Imprimir OP"><Printer className="w-3.5 h-3.5" /></Link>
                            {!concl && <button onClick={(e) => { e.stopPropagation(); excluirOP(o); }} className="text-muted-foreground hover:text-danger" title="Excluir OP"><Trash2 className="w-3.5 h-3.5" /></button>}
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
                        {o.criadoPor && <p className="text-[10px] text-muted-foreground/70 truncate">Programado: {o.criadoPor}</p>}
                        {!concl && (
                          <button onClick={() => { setApontar(o); setApForm({ reais: Object.fromEntries(o.produtos.map((p) => [p.itemId, String(Number(p.planejada) || "")])), perdas: {}, perda: "", biomassa: "" }); setErro(null); }}
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
              <ColBoard cor="emerald" titulo={area.estadoSaida === "ACABADO" ? "Produto acabado" : area.estadoSaida ? "PEP de saída" : "Saída"} icon={<PackageCheck className="w-3.5 h-3.5" />}
                acao={area.estadoSaida && area.estadoSaida !== "ACABADO" ? (
                  <button onClick={() => { setSaldoIni({ estado: area.estadoSaida!, itemId: produtos[0]?.id ?? "", quantidade: "", data: hoje() }); setErro(null); }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-300 dark:border-emerald-800 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" title="Definir saldo inicial">
                    <Plus className="w-3 h-3" /> Saldo inicial
                  </button>
                ) : undefined}>
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
            )}
          </>
        )}
      </div>

      {/* Modal Nova OP — multi-produto, prazos, responsável */}
      {novo && area && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNovo(null)}>
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">{novo.editId ? <Pencil className="w-5 h-5 text-cyan-600" /> : <Plus className="w-5 h-5 text-cyan-600" />} {novo.editId ? `Editar OP ${novo.editNumero ?? ""}` : `Nova OP — ${area.centroTrabalho ?? area.nome}`}</h2>
            {area.produtos.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-3">Esta etapa não tem produto configurado. Defina o produto de saída da operação no editor do fluxo.</p>
            ) : (
              <>
                <div className="mt-4 flex flex-col lg:flex-row gap-5">
                <div className="flex-1 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-start">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Número</label>
                      <div className="h-9 flex items-center px-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground">automático</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Emissão</label>
                      <div className="h-9 flex items-center px-3 rounded-lg border border-border bg-muted/40 text-sm tabular-nums">{new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")}</div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Responsável</label>
                    <ComboboxWithCreate value={novo.responsavelId} onChange={(v) => setNovo({ ...novo, responsavelId: v })} allowNone triggerClassName="h-9 rounded-lg" placeholder="—" menuMinWidth={340}
                      options={(() => {
                        // Inclui o responsável já salvo mesmo que ele não atue na etapa (senão o nome some ao editar).
                        const opts = colaboradoresDaArea.map((c) => ({ value: c.id, label: c.nome }));
                        if (novo.responsavelId && !opts.some((o) => o.value === novo.responsavelId)) {
                          const c = colaboradores.find((x) => x.id === novo.responsavelId);
                          opts.unshift({ value: novo.responsavelId, label: c?.nome ?? novo.editResponsavelNome ?? "Responsável atual" });
                        }
                        return opts;
                      })()} />
                    {area && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {colaboradoresDaArea.length === 0
                          ? <>Nenhum colaborador marcado para <b>{area.nome}</b>. Marque a etapa em Colaboradores → Áreas de operação.</>
                          : <>Mostrando só quem atua em <b>{area.nome}</b> (definido em Colaboradores → Áreas de operação).</>}
                      </p>
                    )}
                  </div>
                </div>

                {(() => {
                  // Edição: mostra quem programou (gravado); sem isso, cai no usuário logado.
                  const quem = (novo.editId ? novo.editCriadoPor : null) ?? user?.nome;
                  return quem ? <p className="mt-2 text-[11px] text-muted-foreground">Programado por: <b className="text-foreground">{quem}</b></p> : null;
                })()}

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
                    <button onClick={() => setNovo({ ...novo, linhas: [...novo.linhas, { itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area.produtos[0]) }] })}
                      className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="w-3.5 h-3.5" /> Adicionar produto</button>
                  </div>
                  <div className="space-y-2">
                    {novo.linhas.map((l, i) => {
                      const prod = area.produtos.find((p) => p.id === l.itemId);
                      return (
                        <div key={i} className="grid grid-cols-[1fr_5rem_4.5rem_1.75rem] gap-2 items-center">
                          <ComboboxWithCreate value={l.itemId} onChange={(v) => { const un = unidadePadrao(area, area.produtos.find((p) => p.id === v)); setNovo({ ...novo, linhas: novo.linhas.map((x, j) => j === i ? { ...x, itemId: v, unidadeId: un } : x) }); }} allowNone={false} triggerClassName="h-9 rounded-lg"
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
                </div>

                {/* Coluna direita — consumo previsto do estoque */}
                <div className="lg:w-80 shrink-0">
                  <ConsumoEstoque consumo={consumo} carregando={carregandoConsumo} />
                </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={() => setNovo(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                  <button onClick={criarOp} disabled={criando} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
                    {criando ? <RefreshCw className="w-4 h-4 animate-spin" /> : novo.editId ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {novo.editId ? "Salvar" : "Criar OP"}
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
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Apontar {apontar.numero}</h2>
            <p className="text-xs text-muted-foreground mt-1">Área {area?.centroTrabalho ?? area?.nome}. Informe a quantidade <b>real</b> produzida por produto (padrão = planejado).</p>
            <div className="mt-4 flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_3.5rem_4rem_4.75rem] gap-2 px-3 py-1.5 bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>Produto</span><span className="text-right">Plan.</span><span className="text-right">Real</span><span className="text-right">Perda</span>
                </div>
                {apontar.produtos.map((pr) => {
                  const perdaPc = Number(apForm.perdas[pr.itemId] || 0);
                  const desc = apontadoPecas(pr) + perdaPc; // descarregado = apontado + perda
                  const pct = desc > 0 && perdaPc > 0 ? `${(perdaPc / desc * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : null;
                  return (
                    <div key={pr.itemId} className="grid grid-cols-[1fr_3.5rem_4rem_4.75rem] gap-2 px-3 py-1.5 items-center border-t border-border/60">
                      <span className="text-xs text-foreground truncate">{pr.descricao}{pr.unidade ? <span className="text-muted-foreground"> ({pr.unidade})</span> : null}</span>
                      <span className="text-xs text-muted-foreground text-right tabular-nums">{Number(pr.planejada)}</span>
                      <input inputMode="decimal" value={apForm.reais[pr.itemId] ?? ""} onChange={(e) => setApForm((p) => ({ ...p, reais: { ...p.reais, [pr.itemId]: e.target.value } }))} className="h-8 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <div className="flex flex-col items-end">
                        <input inputMode="decimal" title="Perda em peças" value={apForm.perdas[pr.itemId] ?? ""} onChange={(e) => setApForm((p) => ({ ...p, perdas: { ...p.perdas, [pr.itemId]: e.target.value } }))} className="h-8 w-full rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-amber-500" />
                        {pct && <span className="text-[10px] text-amber-600 tabular-nums leading-tight">{pct}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-end gap-3">
                <button type="button" onClick={abrirCalcPerda} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20">
                  <Calculator className="w-3.5 h-3.5" /> Calcular perda
                </button>
                {area?.estadoSaida === "QUEIMADO" && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Biomassa (kg)</label>
                    <input inputMode="decimal" value={apForm.biomassa} onChange={(e) => setApForm((p) => ({ ...p, biomassa: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-card text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                )}
              </div>
            </div>
            <div className="lg:w-72 shrink-0">
              <ConsumoEstoque consumo={consumoAp} carregando={carregandoConsumoAp} />
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

      {/* Calculadora de perda — vagões descarregados (descarregado − apontado, por produto) */}
      {calcPerda && apontar && (() => {
        const desc = descarregadoPorProduto(calcPerda.rows);
        const setRows = (rows: CargaVagaoRow[]) => setCalcPerda({ rows });
        const upRow = (i: number, patch: Partial<CargaVagaoRow>) => setRows(calcPerda.rows.map((r, j) => j === i ? { ...r, ...patch } : r));
        const upCarga = (i: number, k: number, patch: Partial<{ itemId: string; pecas: string }>) =>
          upRow(i, { cargas: calcPerda.rows[i].cargas.map((c, m) => m === k ? { ...c, ...patch } : c) });
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setCalcPerda(null)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Calculator className="w-5 h-5 text-amber-600" /> Calcular perda — vagões descarregados</h2>
            <p className="text-xs text-muted-foreground mt-1">Defina a carga dos vagões descarregados. <b>Cheio</b> = 1 produto; <b>meiado</b> = adicione mais de um produto. Perda = descarregado − apontado, por produto.</p>
            <div className="mt-4 space-y-2">
              {calcPerda.rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={row.veiculo} onChange={(e) => upRow(i, { veiculo: e.target.value as "VAGAO" | "VAGONETA" })} className="h-8 rounded-md border border-border px-1.5 text-xs bg-card">
                      <option value="VAGAO">Vagão</option><option value="VAGONETA">Vagoneta</option>
                    </select>
                    <input inputMode="numeric" placeholder="nº" value={row.nVagoes} onChange={(e) => upRow(i, { nVagoes: e.target.value })} className="h-8 w-20 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card" />
                    <span className="text-xs text-muted-foreground">vagões, cada um com:</span>
                    <div className="flex-1" />
                    {calcPerda.rows.length > 1 && <button type="button" onClick={() => setRows(calcPerda.rows.filter((_, j) => j !== i))} className="text-muted-foreground/60 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  {row.cargas.map((c, k) => (
                    <div key={k} className="flex items-center gap-2 pl-1">
                      <select value={c.itemId} onChange={(e) => { const id = e.target.value; const cap = capacidades[id]?.[row.veiculo]; upCarga(i, k, { itemId: id, ...(!c.pecas && cap != null ? { pecas: String(cap) } : {}) }); }} className="h-8 flex-1 min-w-0 rounded-md border border-border px-1.5 text-xs bg-card">
                        <option value="">Produto…</option>
                        {apontar.produtos.map((p) => <option key={p.itemId} value={p.itemId}>{p.descricao}</option>)}
                      </select>
                      <input inputMode="numeric" placeholder="peças/vagão" value={c.pecas} onChange={(e) => upCarga(i, k, { pecas: e.target.value })} className="h-8 w-28 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card" />
                      {row.cargas.length > 1 && <button type="button" onClick={() => upRow(i, { cargas: row.cargas.filter((_, m) => m !== k) })} className="text-muted-foreground/60 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => upRow(i, { cargas: [...row.cargas, { itemId: "", pecas: "" }] })} className="text-[11px] text-amber-600 hover:underline pl-1">+ produto (meiado)</button>
                </div>
              ))}
              <button type="button" onClick={() => setRows([...calcPerda.rows, { veiculo: "VAGAO", nVagoes: "", cargas: [{ itemId: "", pecas: "" }] }])} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline"><Plus className="w-3.5 h-3.5" /> Adicionar vagão</button>
            </div>
            <div className="mt-4 rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_5rem_5rem_5rem_3.5rem] gap-2 px-3 py-1.5 bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                <span>Produto</span><span className="text-right">Descarreg.</span><span className="text-right">Apontado</span><span className="text-right">Perda</span><span className="text-right">%</span>
              </div>
              {apontar.produtos.map((p) => {
                const d = desc[p.itemId] ?? 0;
                const ap = apontadoPecas(p);
                const perda = Math.max(0, Math.round((d - ap) * 1000) / 1000);
                const pct = d > 0 ? `${(perda / d * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
                return (
                  <div key={p.itemId} className="grid grid-cols-[1fr_5rem_5rem_5rem_3.5rem] gap-2 px-3 py-1.5 items-center border-t border-border/60 text-xs tabular-nums">
                    <span className="text-foreground truncate">{p.descricao}</span>
                    <span className="text-right text-muted-foreground">{d.toLocaleString("pt-BR")}</span>
                    <span className="text-right text-muted-foreground">{ap.toLocaleString("pt-BR")}</span>
                    <span className="text-right font-medium text-amber-600">{perda.toLocaleString("pt-BR")}</span>
                    <span className="text-right text-amber-600">{pct}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setCalcPerda(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={aplicarCalcPerda} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
                <CheckCircle2 className="w-4 h-4" /> Aplicar perda
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal saldo inicial de WIP */}
      {saldoIni && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSaldoIni(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Boxes className="w-5 h-5 text-amber-600" /> Saldo inicial — PEP {ESTADO_LABEL[saldoIni.estado] ?? saldoIni.estado}</h2>
            <p className="text-xs text-muted-foreground mt-1">Saldo de abertura do produto neste estado de WIP (uma vez por produto/estado). Lança D Estoque WIP / C Saldos de Abertura.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Produto *</label>
                <ComboboxWithCreate value={saldoIni.itemId} onChange={(v) => setSaldoIni({ ...saldoIni, itemId: v })} allowNone={false} triggerClassName="h-9 rounded-lg"
                  options={produtos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Quantidade *</label>
                <input inputMode="decimal" value={saldoIni.quantidade} onChange={(e) => setSaldoIni({ ...saldoIni, quantidade: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card text-right tabular-nums" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Data do saldo</label>
                <input type="date" value={saldoIni.data} onChange={(e) => setSaldoIni({ ...saldoIni, data: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card" />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setSaldoIni(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={salvarSaldoInicial} disabled={salvandoSaldo} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {salvandoSaldo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Lançar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Visão em LISTA: OPs agrupadas por dia (cabeçalho de data + linhas).
function ListaPorDia({ ops, carregando, mes, escopo, onEscopo, soAbertas, onSoAbertas, onNova, onAbrir, onEditar, onExcluir, onApontar }: {
  ops: BoardOP[]; carregando: boolean; mes: string;
  escopo: "area" | "todas"; onEscopo: (e: "area" | "todas") => void;
  soAbertas: boolean; onSoAbertas: (v: boolean) => void;
  onNova: (() => void) | null; onAbrir: (id: string) => void; onEditar: (o: BoardOP) => void; onExcluir: (o: BoardOP) => void; onApontar: (o: BoardOP) => void;
}) {
  const fmtDiaTitulo = (dia: string) => {
    const d = new Date(`${dia}T12:00:00`);
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  };
  const visiveis = soAbertas ? ops.filter((o) => o.etapaStatus !== "CONCLUIDA") : ops;
  // Agrupa por dia e ordena (mais recente primeiro).
  const grupos = (() => {
    const m = new Map<string, BoardOP[]>();
    for (const o of visiveis) { const k = o.dia ?? "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(o); }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  })();
  const mesLabel = (() => { const [y, mm] = mes.split("-").map(Number); return new Date(y, (mm || 1) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); })();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/40 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm font-medium text-foreground capitalize">{mesLabel} · {visiveis.length} OP{visiveis.length === 1 ? "" : "s"}</p>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {([["area", "Esta área"], ["todas", "Todas as áreas"]] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => onEscopo(k)}
                className={cn("px-2.5 py-1 rounded-md transition-colors", escopo === k ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
                {lbl}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={soAbertas} onChange={(e) => onSoAbertas(e.target.checked)} className="accent-cyan-600" />
            Só abertas
          </label>
        </div>
        {onNova && (
          <button onClick={onNova} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-700">
            <Plus className="w-3.5 h-3.5" /> Nova OP
          </button>
        )}
      </div>
      {carregando ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 p-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Factory className="w-6 h-6 text-cyan-400 mb-1.5" />
          <p className="text-xs text-muted-foreground">{soAbertas ? "Nenhuma OP aberta neste mês." : "Nenhuma OP neste mês."}</p>
        </div>
      ) : grupos.map(([dia, lista]) => (
        <div key={dia}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-muted/70 border-b border-border text-xs font-semibold text-muted-foreground capitalize">
            <span>{dia === "—" ? "Sem data" : fmtDiaTitulo(dia)}</span>
            <span className="text-[10px] font-medium text-muted-foreground/70">{lista.length} OP{lista.length === 1 ? "" : "s"}</span>
          </div>
          {lista.map((o) => {
            const concl = o.etapaStatus === "CONCLUIDA";
            const qtdTxt = o.produtos.length > 1
              ? `${o.produtos.length} produtos`
              : `${Number(o.produtos[0]?.planejada ?? o.quantidade)} ${o.produtos[0]?.unidade ?? o.unidade ?? ""}`.trim();
            return (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-muted/40 text-sm">
                <button onClick={() => onAbrir(o.id)} className="font-mono text-[11px] text-muted-foreground hover:text-cyan-600 w-24 shrink-0 text-left">{o.numero}</button>
                {escopo === "todas" && o.areaNome && (
                  <span className="hidden sm:inline-flex items-center rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 px-2 py-0.5 text-[10px] font-medium shrink-0 w-32 justify-center truncate" title={o.areaNome}>{o.areaNome}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground font-medium truncate">{o.produtos.length > 1 ? `${o.produtos.length} produtos` : (o.produto ?? "—")}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {qtdTxt}
                    {o.responsavel && <> · 👤 {o.responsavel}</>}
                    {o.fimPrevisto && <> · até {new Date(o.fimPrevisto).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>}
                  </p>
                </div>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", ETAPA_STATUS[o.etapaStatus] ?? "bg-muted")}>
                  {concl ? "concluída" : o.etapaStatus === "EM_EXECUCAO" ? "em execução" : "pendente"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!concl && <button onClick={() => onEditar(o)} className="text-muted-foreground hover:text-cyan-600" title="Editar OP"><Pencil className="w-3.5 h-3.5" /></button>}
                  <Link href={`/pcp/ordens/${o.id}/imprimir`} className="text-muted-foreground hover:text-cyan-600" title="Imprimir OP"><Printer className="w-3.5 h-3.5" /></Link>
                  {!concl && <button onClick={() => onExcluir(o)} className="text-muted-foreground hover:text-danger" title="Excluir OP"><Trash2 className="w-3.5 h-3.5" /></button>}
                  {!concl && (
                    <button onClick={() => onApontar(o)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700">
                      <CheckCircle2 className="w-3 h-3" /> Apontar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
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

// Tabela de consumo previsto do estoque (reusada na criação e no apontamento da OP).
function ConsumoEstoque({ consumo, carregando }: { consumo: ConsumoLinha[] | null; carregando: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-cyan-50/50 dark:bg-cyan-950/20 flex items-center gap-1.5">
        <Boxes className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Consumo previsto do estoque</p>
      </div>
      <div className="p-2 max-h-[60vh] overflow-y-auto">
        {carregando && (!consumo || consumo.length === 0) ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 p-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando…</p>
        ) : !consumo || consumo.length === 0 ? (
          <p className="text-xs text-muted-foreground p-1">Escolha produto e quantidade para ver o consumo.</p>
        ) : (
          <div className="space-y-1.5">
            {consumo.map((c, i) => (
              <div key={c.itemId ?? i} className={cn("rounded-lg border px-2.5 py-1.5 text-xs bg-card", !c.gerenciavel ? "border-border/60 opacity-70" : c.suficiente ? "border-border" : "border-warning/50 bg-warning/10")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground font-medium truncate">{c.descricao}</span>
                  <span className="tabular-nums shrink-0 text-foreground">{c.consumo.toLocaleString("pt-BR")}{c.unidade ? <span className="text-muted-foreground ml-0.5">{c.unidade}</span> : null}</span>
                </div>
                {c.gerenciavel ? (
                  <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px]">
                    <span className={c.suficiente ? "text-success" : "text-warning"}>{c.suficiente ? "✓ suficiente" : "⚠ insuficiente"}</span>
                    <span className="text-muted-foreground tabular-nums">saldo {(c.saldo ?? 0).toLocaleString("pt-BR")}{c.unidade ? ` ${c.unidade}` : ""}</span>
                  </div>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">não controla estoque</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
