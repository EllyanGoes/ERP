"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { useTabTitle } from "@/lib/tabs-context";
import { useSession } from "@/lib/session-context";
import { usePersistedState } from "@/lib/use-persisted-state";
import PageHeader from "@/components/shared/PageHeader";
import CalendarioProducao from "@/components/pcp/CalendarioProducao";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, Factory, CheckCircle2, Workflow, Loader2, X, Boxes, PackageCheck, Printer, Pencil, CalendarDays, LayoutGrid, List, Trash2, Calculator, MapPin, Search } from "lucide-react";

type FluxoOpt = { id: string; nome: string; versaoAtivaId: string | null };
type Area = { nodeId: string; sequencia: number; nome: string; centroTrabalho: string | null; estadoSaida: string | null; fromEstado: string | null; isPrimeira: boolean; produtoSaidaId: string | null; produtos: Produto[] };
type Unidade = { id: string; sigla: string; isPrincipal?: boolean; fator?: number };
type Produto = { id: string; codigo: string; descricao: string; unidades: Unidade[] };
type LinhaOP = { itemId: string; quantidade: string; unidadeId: string };
type NovoOP = { linhas: LinhaOP[]; inicio: string; fim: string; responsavelId: string; observacao: string; planoTransporte?: CargaVagaoRow[] | null; editId?: string | null; editNumero?: string; editCriadoPor?: string | null; editResponsavelNome?: string | null; editConcluida?: boolean };
type ProdutoOP = { itemId: string; codigo: string; descricao: string; planejada: string | number; real: string | number | null; unidade: string | null; unidadeId: string | null; pecasPorUnidade?: number; pecasPorPalete?: number | null };
type BoardOP = { id: string; numero: string; status: string; dia?: string; areaNome?: string; quantidade: string | number; unidade: string | null; produto: string | null; produtoCodigo: string | null; etapaStatus: string; responsavel: string | null; responsavelColaboradorId: string | null; criadoPor: string | null; observacao: string | null; planoTransporte?: PlanoVagaoSalvo[] | null; inicioPrevisto: string | null; fimPrevisto: string | null; produtos: ProdutoOP[] };
// Plano de transporte como sai do banco (números) — vira CargaVagaoRow (strings) na edição.
type PlanoVagaoSalvo = { veiculo: "VAGAO" | "VAGONETA"; nVagoes: number; cargas: { itemId: string; pecas: number }[] };
type SaldoInicial = { estado: string; itemId: string; quantidade: string; unidadeId: string; data: string };
type EstoqueLinha = { itemId: string | null; descricao: string; unidade: string | null; saldoTotal: number; locais: { localNome: string; saldo: number }[] };
type ConsumoLinha = { itemId: string | null; descricao: string; unidade: string | null; consumo: number; gerenciavel: boolean; saldo: number | null; local?: string | null; suficiente: boolean };
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
// Quantidades digitadas são pt-BR: "." é MILHAR e "," é DECIMAL ("1.740" → 1740;
// "19,5" → 19.5). Number() cru lia "5.354" como 5,354 e rejeitava vírgula — foi o
// que gerou apontamentos milhares de vezes maiores no Embalar.
const numBR = (v: string | number | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || !String(v).trim()) return 0;
  const n = Number(String(v).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
// Número → string de input pt-BR (vírgula decimal, SEM ponto de milhar — inequívoco).
const fmtQtd = (v: string | number | null | undefined): string => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
};

export default function OrdensBoardPage() {
  useTabTitle("Fluxo de Produção");
  const router = useRouter();
  const { user } = useSession();

  const [fluxos, setFluxos] = useState<FluxoOpt[]>([]);
  // Filtros persistidos por usuário: sobrevivem à troca de aba do app (o
  // componente remonta) e à volta na sessão seguinte.
  const [fluxoId, setFluxoId] = usePersistedState("pcp-fluxo-id", "");
  const [areas, setAreas] = useState<Area[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [areaNodeId, setAreaNodeId] = usePersistedState("pcp-area-node", "");
  // Dia: abre em HOJE a cada sessão (pedido do Ellyan), mas sobrevive à remontagem
  // da tela dentro da mesma sessão (sessionStorage) — apontar uma OP / trocar de aba
  // não volta mais o filtro para hoje.
  const [data, setDataState] = useState(() => {
    if (typeof window !== "undefined") {
      try { const v = window.sessionStorage.getItem("pcp-dia"); if (v) return v; } catch { /* ignore */ }
    }
    return hoje();
  });
  const setData = useCallback((d: string) => {
    setDataState(d);
    try { window.sessionStorage.setItem("pcp-dia", d); } catch { /* ignore */ }
  }, []);
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
  const [vista, setVista] = usePersistedState<"board" | "lista">("pcp-vista", "board");
  // Busca de OPs (número, produto, responsável, observação) — filtra board e lista.
  const [busca, setBusca] = useState("");
  const filtrarOps = useCallback((list: BoardOP[]): BoardOP[] => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = norm(busca.trim());
    if (!q) return list;
    return list.filter((o) =>
      norm([o.numero, o.produto, o.produtoCodigo, o.responsavel, o.observacao, o.criadoPor,
        ...o.produtos.flatMap((p) => [p.codigo, p.descricao])].filter(Boolean).join(" ")).includes(q));
  }, [busca]);
  const [escopoLista, setEscopoLista] = usePersistedState<"area" | "todas">("pcp-escopo-lista", "area");
  const [soAbertas, setSoAbertas] = usePersistedState("pcp-so-abertas", false);
  // Lista: segundo agrupamento (dentro do dia) por área, na ordem do fluxo.
  const [agruparArea, setAgruparArea] = usePersistedState("pcp-lista-agrupar-area", false);
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
  const [apForm, setApForm] = useState<{ reais: Record<string, string>; perdas: Record<string, string>; paletes: Record<string, string>; pcPlt: Record<string, string>; perda: string; biomassa: string; vagoes: string; vagonetas: string }>({ reais: {}, perdas: {}, paletes: {}, pcPlt: {}, perda: "", biomassa: "", vagoes: "", vagonetas: "" });

  // Apontamento POR PALETE: nº de paletes × pç/palete → quantidade real na
  // unidade da linha (÷ pecasPorUnidade; linha em PLT vira nº de paletes puro).
  function aplicarPorPalete(pr: ProdutoOP, paletesStr: string, pcPltStr: string) {
    setApForm((f) => {
      const next = { ...f, paletes: { ...f.paletes, [pr.itemId]: paletesStr }, pcPlt: { ...f.pcPlt, [pr.itemId]: pcPltStr } };
      const paletes = numBR(paletesStr);
      const pcPlt = numBR(pcPltStr);
      if (paletes > 0 && pcPlt > 0) {
        const totalPecas = paletes * pcPlt;
        const real = Math.round((totalPecas / (pr.pecasPorUnidade && pr.pecasPorUnidade > 0 ? pr.pecasPorUnidade : 1)) * 1000) / 1000;
        next.reais = { ...f.reais, [pr.itemId]: fmtQtd(real) };
      }
      return next;
    });
  }
  // Calculadora de perda (Embalar): linhas de vagão descarregado → descarregado por produto.
  const [calcPerda, setCalcPerda] = useState<{ rows: CargaVagaoRow[] } | null>(null);
  // Planejamento por transporte (Nova OP): mesma calculadora de vagões, mas o total
  // por produto alimenta a quantidade planejada da OP (em vez da perda).
  const [calcPlan, setCalcPlan] = useState<{ rows: CargaVagaoRow[] } | null>(null);
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
      // Mantém o fluxo persistido se ainda existir; senão cai no primeiro.
      setFluxoId((prev) => (pub.some((f: FluxoOpt) => f.id === prev) ? prev : (pub[0]?.id ?? "")));
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
      .filter((l) => l.itemId && numBR(l.quantidade) > 0)
      .map((l) => ({ itemId: l.itemId, quantidade: numBR(l.quantidade), unidadeId: l.unidadeId || null }));
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
      .map((p) => ({ itemId: p.itemId, quantidade: numBR(apForm.reais[p.itemId] ?? p.planejada), unidadeId: p.unidadeId }))
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
    const linhas = novo.linhas.filter((l) => l.itemId && numBR(l.quantidade) > 0);
    if (!linhas.length) { setErro("Adicione ao menos um produto com quantidade > 0"); return; }
    // OP já apontada: salvar estorna o apontamento em cascata (estoque, custos,
    // contábil) e a OP volta a pendente — o operador reaponta com os valores certos.
    if (novo.editId && novo.editConcluida) {
      if (!confirm(`A ${novo.editNumero ?? "OP"} já foi APONTADA.\n\nSalvar a correção vai ESTORNAR o apontamento (movimentos de estoque, custos e lançamentos contábeis revertidos em cascata) e a OP volta a pendente para reapontar.\n\nContinuar?`)) return;
    }
    setCriando(true); setErro(null);
    const produtos = linhas.map((l) => ({ itemId: l.itemId, quantidade: numBR(l.quantidade), unidadeId: l.unidadeId || null }));
    try {
      const salvar = (permitirSaldoNegativo: boolean) =>
        novo.editId
          ? fetch(`/api/pcp/ordens/${novo.editId}`, {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                produtos,
                dataPrevistaInicio: localInputToIso(novo.inicio), dataPrevistaFim: localInputToIso(novo.fim),
                responsavelColaboradorId: novo.responsavelId || null, observacao: novo.observacao || null,
                planoTransporte: novo.planoTransporte ?? null,
                permitirSaldoNegativo,
              }),
            })
          : fetch("/api/pcp/ordens/area", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fluxoId, areaNodeId, data, produtos,
                dataPrevistaInicio: localInputToIso(novo.inicio) ?? undefined, dataPrevistaFim: localInputToIso(novo.fim) ?? undefined,
                responsavelColaboradorId: novo.responsavelId || undefined, observacao: novo.observacao || undefined,
                planoTransporte: novo.planoTransporte ?? undefined,
              }),
            });
      let r = await salvar(false);
      let j = await r.json();
      // Estorno da edição deixaria saldo negativo (ex.: WIP já consumido adiante):
      // mostra os itens e deixa salvar mesmo assim — mesmo fluxo do apontamento.
      if (r.status === 422 && j?.codigo === "SALDO_NEGATIVO") {
        const linhasNeg = (j.negativos ?? []).map((ng: { descricao?: string | null; itemId: string; saldoAtual: number; saldoDepois: number }) =>
          `• ${ng.descricao ?? ng.itemId}: ${Number(ng.saldoAtual).toLocaleString("pt-BR")} → ${Number(ng.saldoDepois).toLocaleString("pt-BR")}`).join("\n");
        if (!confirm(`O estorno deixa estoque NEGATIVO:\n\n${linhasNeg}\n\nSalvar mesmo assim? (o saldo se ajusta por inventário depois)`)) { setCriando(false); return; }
        r = await salvar(true);
        j = await r.json();
      }
      if (!r.ok) throw new Error(j?.error ?? (novo.editId ? "Erro ao salvar OP" : "Erro ao criar OP"));
      setNovo(null);
      await loadOps();
      if (novo.editConcluida) loadEstoque(); // estorno mexe nos saldos dos cards
      if (vista === "lista") await loadLista();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setCriando(false); }
  }

  // Abre o modal em modo edição, pré-preenchido com a OP do board.
  function abrirEdicao(o: BoardOP) {
    setNovo({
      editId: o.id, editNumero: o.numero,
      linhas: o.produtos.length
        ? o.produtos.map((p) => ({ itemId: p.itemId, quantidade: Number(p.planejada) ? fmtQtd(p.planejada) : "", unidadeId: p.unidadeId ?? "" }))
        : [{ itemId: area?.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area?.produtos[0]) }],
      inicio: toLocalInput(o.inicioPrevisto), fim: toLocalInput(o.fimPrevisto),
      responsavelId: o.responsavelColaboradorId ?? "", observacao: o.observacao ?? "",
      // Plano de transporte salvo (números do banco) → linhas do dialog (strings).
      planoTransporte: o.planoTransporte?.length
        ? o.planoTransporte.map((r) => ({ veiculo: r.veiculo, nVagoes: String(r.nVagoes), cargas: r.cargas.map((c) => ({ itemId: c.itemId, pecas: String(c.pecas) })) }))
        : null,
      editCriadoPor: o.criadoPor, editResponsavelNome: o.responsavel,
      editConcluida: o.etapaStatus === "CONCLUIDA",
    });
    setErro(null);
  }

  async function salvarSaldoInicial() {
    if (!saldoIni) return;
    if (!saldoIni.itemId || numBR(saldoIni.quantidade) <= 0) { setErro("Informe produto e quantidade > 0"); return; }
    // Converte para a unidade-base (peças) pelo fator da unidade escolhida.
    const us = produtos.find((p) => p.id === saldoIni.itemId)?.unidades ?? [];
    const un = us.find((u) => u.id === saldoIni.unidadeId);
    const fator = un?.fator ?? 1;
    const quantidadeBase = numBR(saldoIni.quantidade) * fator;
    // Unidade ≠ peças com valor alto: confirma mostrando a conversão — "32.000" em
    // milheiro é 32.000.000 pç (foi assim que nasceu um saldo inicial de 32 milhões).
    if (fator > 1 && quantidadeBase >= 100000) {
      if (!confirm(`Confira a UNIDADE: ${numBR(saldoIni.quantidade).toLocaleString("pt-BR")} ${un?.sigla ?? ""} = ${quantidadeBase.toLocaleString("pt-BR")} peças.\n\nLançar mesmo assim?`)) return;
    }
    setSalvandoSaldo(true); setErro(null);
    try {
      const r = await fetch("/api/pcp/ordens/area/saldo-inicial-wip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: saldoIni.itemId, estado: saldoIni.estado, quantidade: quantidadeBase, data: saldoIni.data || null }),
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
    // Quantidades parseadas em pt-BR (numBR) e enviadas como NÚMERO — o servidor
    // não pode receber "5,354"/"5.354" ambíguo.
    const itens = apontar.produtos.map((p) => {
      const perdaStr = String(apForm.perdas[p.itemId] ?? "").trim();
      return {
        itemId: p.itemId,
        quantidadeReal: numBR(apForm.reais[p.itemId] ?? p.planejada),
        qtdPerda: perdaStr ? numBR(perdaStr) : undefined, // perda por produto (peças)
      };
    });
    if (!itens.some((i) => i.quantidadeReal > 0)) { setErro("Informe a quantidade produzida"); return; }
    // Perda é obrigatória: cada produto precisa ter a perda informada (0 é válido; vazio não).
    if (apontar.produtos.some((p) => !String(apForm.perdas[p.itemId] ?? "").trim())) {
      setErro('Calcular a perda é obrigatório — informe a perda de cada produto (use "Calcular perda" ou digite 0).');
      return;
    }
    // Linha em unidade alternativa (PLT no Embalar): peças digitadas no campo de
    // paletes multiplicam pelo fator (325 pç/palete → milhões no estoque). Real muito
    // acima do planejado exige confirmação com a conversão à vista.
    const suspeitos = apontar.produtos.filter((p) => {
      if ((p.pecasPorUnidade ?? 1) <= 1) return false;
      const real = numBR(apForm.reais[p.itemId] ?? p.planejada);
      const plan = Number(p.planejada) || 0;
      return plan > 0 ? real > plan * 3 : real > 1000;
    });
    if (suspeitos.length) {
      const linhas = suspeitos.map((p) => {
        const real = numBR(apForm.reais[p.itemId] ?? p.planejada);
        const ppu = p.pecasPorUnidade ?? 1;
        return `• ${p.descricao}: ${real.toLocaleString("pt-BR")} ${p.unidade ?? ""} = ${(real * ppu).toLocaleString("pt-BR")} peças (planejado ${Number(p.planejada).toLocaleString("pt-BR")} ${p.unidade ?? ""})`;
      }).join("\n");
      if (!confirm(`Confira a UNIDADE — o real está muito acima do planejado:\n\n${linhas}\n\nSe você contou PEÇAS, use a linha "ou por palete" (nº × pç/palete). Apontar mesmo assim?`)) return;
    }
    setApBusy(true); setErro(null);
    try {
      const enviar = (permitirSaldoNegativo: boolean) =>
        fetch(`/api/pcp/ordens/${apontar.id}/concluir-area`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          // qtdPerda (etapa) fica a cargo do servidor (soma das perdas por produto); mantém
          // apForm.perda como fallback p/ etapas sem calculadora (1 produto).
          body: JSON.stringify({ itens, qtdPerda: apForm.perda.trim() ? numBR(apForm.perda) : undefined, biomassaKg: apForm.biomassa.trim() ? numBR(apForm.biomassa) : undefined, vagoes: apForm.vagoes || undefined, vagonetas: apForm.vagonetas || undefined, permitirSaldoNegativo }),
        });
      let r = await enviar(false);
      let j = await r.json();
      // Estoque insuficiente: mostra o que ficaria negativo e deixa apontar mesmo
      // assim (consumo real aconteceu; o saldo se ajusta por inventário depois).
      if (r.status === 422 && j?.codigo === "SALDO_NEGATIVO") {
        const linhas = (j.negativos ?? []).map((ng: { descricao?: string | null; itemId: string; saldoAtual: number; saldoDepois: number }) =>
          `• ${ng.descricao ?? ng.itemId}: ${Number(ng.saldoAtual).toLocaleString("pt-BR")} → ${Number(ng.saldoDepois).toLocaleString("pt-BR")}`).join("\n");
        if (!confirm(`O apontamento deixa estoque NEGATIVO:\n\n${linhas}\n\nApontar mesmo assim?`)) { setApBusy(false); return; }
        r = await enviar(true);
        j = await r.json();
      }
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
    return numBR(apForm.reais[p.itemId] ?? p.planejada) * (p.pecasPorUnidade ?? 1);
  }
  // Descarregado (peças) por produto, somando as linhas de vagão (nº × peças/vagão).
  function descarregadoPorProduto(rows: CargaVagaoRow[]): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const row of rows) {
      const n = numBR(row.nVagoes);
      for (const c of row.cargas) {
        const pc = numBR(c.pecas);
        if (c.itemId && n > 0 && pc > 0) acc[c.itemId] = (acc[c.itemId] ?? 0) + n * pc;
      }
    }
    return acc;
  }
  // Abre a calculadora: parte do plano de transporte salvo na OP (o operador só
  // ajusta o nº de vagões descarregados); sem plano, 1 linha "cheia" por produto
  // com a capacidade do cadastro.
  function abrirCalcPerda() {
    if (!apontar) return;
    if (apontar.planoTransporte?.length) {
      setCalcPerda({
        rows: apontar.planoTransporte.map((r) => ({
          veiculo: r.veiculo, nVagoes: String(r.nVagoes),
          cargas: r.cargas.map((c) => ({ itemId: c.itemId, pecas: String(c.pecas) })),
        })),
      });
      return;
    }
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
      perdas[p.itemId] = fmtQtd(perda);
    }
    // Total de vagões/vagonetas descarregados (soma o nº de cada linha por tipo).
    const somaVeic = (v: CargaVagaoRow["veiculo"]) =>
      calcPerda.rows.filter((r) => r.veiculo === v).reduce((s, r) => s + numBR(r.nVagoes), 0);
    const vagoes = somaVeic("VAGAO");
    const vagonetas = somaVeic("VAGONETA");
    setApForm((f) => ({ ...f, perdas, vagoes: vagoes ? String(vagoes) : "", vagonetas: vagonetas ? String(vagonetas) : "" }));
    setCalcPerda(null);
  }

  // ── Planejamento por transporte (Nova OP) ────────────────────────────────────
  // Abre a calculadora de vagões: 1 linha "cheia" por produto já na OP (ou pelo 1º
  // produto da área), com a capacidade cadastrada como peças/vagão.
  function abrirCalcPlan() {
    if (!novo || !area) return;
    // Plano já salvo na OP (ou aplicado nesta edição): reabre com a configuração.
    if (novo.planoTransporte?.length) {
      setCalcPlan({ rows: novo.planoTransporte.map((r) => ({ ...r, cargas: r.cargas.map((c) => ({ ...c })) })) });
      return;
    }
    const itemIds = Array.from(new Set(novo.linhas.map((l) => l.itemId).filter(Boolean)));
    const base = itemIds.length ? itemIds : (area.produtos[0] ? [area.produtos[0].id] : []);
    const rows: CargaVagaoRow[] = base.map((id) => ({
      veiculo: "VAGAO", nVagoes: "",
      cargas: [{ itemId: id, pecas: String(capacidades[id]?.VAGAO ?? "") }],
    }));
    setCalcPlan({ rows: rows.length ? rows : [{ veiculo: "VAGAO", nVagoes: "", cargas: [{ itemId: "", pecas: "" }] }] });
  }
  // Aplica o total de peças por produto como quantidade planejada da OP, convertendo
  // peças → unidade da linha (÷ fator: PLT→peças/palete; principal = 1). Atualiza a
  // linha existente do produto ou cria uma nova.
  function aplicarCalcPlan() {
    if (!calcPlan || !novo || !area) return;
    const total = descarregadoPorProduto(calcPlan.rows); // peças por produto
    const linhas = [...novo.linhas];
    for (const [itemId, pecas] of Object.entries(total)) {
      const prod = area.produtos.find((p) => p.id === itemId);
      if (!prod) continue;
      const idx = linhas.findIndex((l) => l.itemId === itemId);
      const unidadeId = idx >= 0 ? linhas[idx].unidadeId : unidadePadrao(area, prod);
      const fator = prod.unidades.find((u) => u.id === unidadeId)?.fator;
      const qtd = Math.round((pecas / (fator && fator > 0 ? fator : 1)) * 1000) / 1000;
      // fmtQtd: o campo de quantidade é pt-BR — "5,354" (paletes), nunca "5.354",
      // que o operador lia como cinco mil (era a fonte dos apontamentos gigantes).
      if (idx >= 0) linhas[idx] = { ...linhas[idx], quantidade: fmtQtd(qtd) };
      else linhas.push({ itemId, quantidade: fmtQtd(qtd), unidadeId });
    }
    // Guarda a configuração na OP (persistida no salvar) — só linhas completas.
    const plano = calcPlan.rows.filter((r) => numBR(r.nVagoes) > 0 && r.cargas.some((c) => c.itemId && numBR(c.pecas) > 0));
    setNovo({ ...novo, linhas, planoTransporte: plano.length ? plano : null });
    setCalcPlan(null);
  }

  async function excluirOP(o: BoardOP) {
    const msg = o.etapaStatus === "CONCLUIDA"
      ? `Excluir a OP ${o.numero}?\n\nEla já foi APONTADA: o apontamento será ESTORNADO em cascata (movimentos de estoque, custos e lançamentos contábeis revertidos) antes de excluir. Esta ação é permanente.`
      : `Excluir a OP ${o.numero}? Esta ação é permanente.`;
    if (!confirm(msg)) return;
    setErro(null);
    try {
      let r = await fetch(`/api/pcp/ordens/${o.id}`, { method: "DELETE" });
      let j = await r.json().catch(() => ({}));
      // Estorno da exclusão deixaria saldo negativo (ex.: WIP já consumido adiante):
      // mostra os itens e deixa excluir mesmo assim — mesmo fluxo do apontamento.
      if (r.status === 422 && j?.codigo === "SALDO_NEGATIVO") {
        const linhas = (j.negativos ?? []).map((ng: { descricao?: string | null; itemId: string; saldoAtual: number; saldoDepois: number }) =>
          `• ${ng.descricao ?? ng.itemId}: ${Number(ng.saldoAtual).toLocaleString("pt-BR")} → ${Number(ng.saldoDepois).toLocaleString("pt-BR")}`).join("\n");
        if (!confirm(`O estorno da ${o.numero} deixa estoque NEGATIVO:\n\n${linhas}\n\nExcluir mesmo assim? (o saldo se ajusta por inventário depois)`)) return;
        r = await fetch(`/api/pcp/ordens/${o.id}?permitirSaldoNegativo=1`, { method: "DELETE" });
        j = await r.json().catch(() => ({}));
      }
      if (!r.ok) throw new Error(j?.error ?? "Não foi possível excluir");
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
          {/* Busca de OPs: filtra os cards do board e a lista (número/produto/responsável) */}
          <div className="ml-auto relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OP, produto…"
              className="h-9 w-52 rounded-lg border border-border bg-card pl-8 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500" />
            {busca && (
              <button type="button" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground" title="Limpar busca">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* Toggle de visão: board (kanban) × lista (por dia) */}
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
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
                ops={filtrarOps(opsLista)}
                carregando={carregandoLista}
                mes={data}
                escopo={escopoLista} onEscopo={setEscopoLista}
                soAbertas={soAbertas} onSoAbertas={setSoAbertas}
                agruparArea={agruparArea} onAgruparArea={setAgruparArea}
                ordemAreas={areas.map((a) => a.centroTrabalho ?? a.nome)}
                onNova={escopoLista === "area" ? () => { setNovo({ linhas: [{ itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area.produtos[0]) }], inicio: `${data}T07:00`, fim: `${data}T19:00`, responsavelId: "", observacao: "" }); setErro(null); } : null}
                onAbrir={(id) => router.push(`/pcp/ordens/${id}`)}
                onEditar={(o) => abrirEdicao(o)}
                onExcluir={(o) => excluirOP(o)}
                onApontar={(o) => { setApontar(o); setApForm({ reais: Object.fromEntries(o.produtos.map((p) => [p.itemId, Number(p.planejada) ? fmtQtd(p.planejada) : ""])), perdas: {}, paletes: {}, pcPlt: Object.fromEntries(o.produtos.map((p) => [p.itemId, p.pecasPorPalete ? String(p.pecasPorPalete) : ""])), perda: "", biomassa: "", vagoes: "", vagonetas: "" }); setErro(null); }}
              />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              {/* Coluna 1 — ENTRADA (matéria-prima ou PEP da etapa anterior) */}
              <ColBoard cor="amber" titulo={area.sequencia === minSeq ? "Matéria-prima" : "PEP de entrada"} icon={<Boxes className="w-3.5 h-3.5" />}
                acao={!area.isPrimeira && area.fromEstado && area.fromEstado !== "ACABADO" ? (
                  <button onClick={() => { setSaldoIni({ estado: area.fromEstado!, itemId: produtos[0]?.id ?? "", quantidade: "", unidadeId: (produtos[0]?.unidades.find((u) => u.isPrincipal) ?? produtos[0]?.unidades[0])?.id ?? "", data: hoje() }); setErro(null); }}
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
                ) : filtrarOps(ops).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma OP encontrada para &quot;{busca}&quot;.</p>
                ) : (
                  filtrarOps(ops).map((o) => {
                    const concl = o.etapaStatus === "CONCLUIDA";
                    return (
                      <div key={o.id} className={cn("rounded-lg border bg-card p-2.5", concl ? "border-success/30" : "border-border")}>
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => router.push(`/pcp/ordens/${o.id}`)} className="font-mono text-[11px] text-muted-foreground hover:text-cyan-600">{o.numero}</button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); abrirEdicao(o); }} className="text-muted-foreground hover:text-cyan-600" title={concl ? "Corrigir OP (estorna o apontamento)" : "Editar OP"}><Pencil className="w-3.5 h-3.5" /></button>
                            <Link href={`/pcp/ordens/${o.id}/imprimir`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-cyan-600" title="Imprimir OP"><Printer className="w-3.5 h-3.5" /></Link>
                            {(!concl || user?.perfil === "ADMIN") && <button onClick={(e) => { e.stopPropagation(); excluirOP(o); }} className="text-muted-foreground hover:text-danger" title={concl ? "Excluir OP (admin — estorna o apontamento)" : "Excluir OP"}><Trash2 className="w-3.5 h-3.5" /></button>}
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
                            ? o.produtos.map((p) => `${fmtQtd(p.planejada)}${p.unidade ? ` ${p.unidade}` : ""}`).join(" · ")
                            : `${fmtQtd(Number(o.produtos[0]?.planejada ?? o.quantidade))} ${o.produtos[0]?.unidade ?? o.unidade ?? ""}`}
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
                          <button onClick={() => { setApontar(o); setApForm({ reais: Object.fromEntries(o.produtos.map((p) => [p.itemId, Number(p.planejada) ? fmtQtd(p.planejada) : ""])), perdas: {}, paletes: {}, pcPlt: Object.fromEntries(o.produtos.map((p) => [p.itemId, p.pecasPorPalete ? String(p.pecasPorPalete) : ""])), perda: "", biomassa: "", vagoes: "", vagonetas: "" }); setErro(null); }}
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
                  <button onClick={() => { setSaldoIni({ estado: area.estadoSaida!, itemId: produtos[0]?.id ?? "", quantidade: "", unidadeId: (produtos[0]?.unidades.find((u) => u.isPrincipal) ?? produtos[0]?.unidades[0])?.id ?? "", data: hoje() }); setErro(null); }}
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
            {novo.editConcluida && (
              <p className="mt-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Esta OP já foi <b>apontada</b>. Ao salvar, o apontamento é <b>estornado em cascata</b> (movimentos de estoque, custos e lançamentos contábeis revertidos) e a OP volta a pendente para reapontar com os valores corrigidos.
              </p>
            )}
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
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={abrirCalcPlan}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"><Calculator className="w-3.5 h-3.5" /> Por transporte</button>
                      <button onClick={() => setNovo({ ...novo, linhas: [...novo.linhas, { itemId: area.produtos[0]?.id ?? "", quantidade: "", unidadeId: unidadePadrao(area, area.produtos[0]) }] })}
                        className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="w-3.5 h-3.5" /> Adicionar produto</button>
                    </div>
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
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Apontar {apontar.numero}</h2>
            <p className="text-xs text-muted-foreground mt-1">Área {area?.centroTrabalho ?? area?.nome}. Informe a quantidade <b>real</b> produzida por produto (padrão = planejado).</p>
            <div className="mt-4 flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_3.5rem_4rem_4.75rem] gap-2 px-3 py-1.5 bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>Produto</span><span className="text-right">Plan.</span><span className="text-right">Real</span><span className="text-right">Perda *</span>
                </div>
                {apontar.produtos.map((pr) => {
                  const perdaPc = numBR(apForm.perdas[pr.itemId]);
                  const desc = apontadoPecas(pr) + perdaPc; // descarregado = apontado + perda
                  const pct = desc > 0 && perdaPc > 0 ? `${(perdaPc / desc * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : null;
                  const paletesStr = apForm.paletes[pr.itemId] ?? "";
                  const pcPltStr = apForm.pcPlt[pr.itemId] ?? "";
                  const totPecas = numBR(paletesStr) * numBR(pcPltStr);
                  return (
                    <div key={pr.itemId} className="border-t border-border/60">
                    <div className="grid grid-cols-[1fr_3.5rem_4rem_4.75rem] gap-2 px-3 py-1.5 items-center">
                      <span className="text-xs text-foreground truncate">{pr.descricao}{pr.unidade ? <span className="text-muted-foreground"> ({pr.unidade})</span> : null}</span>
                      <span className="text-xs text-muted-foreground text-right tabular-nums">{fmtQtd(pr.planejada)}</span>
                      <div className="flex flex-col items-end">
                        <input inputMode="decimal" value={apForm.reais[pr.itemId] ?? ""} onChange={(e) => setApForm((p) => ({ ...p, reais: { ...p.reais, [pr.itemId]: e.target.value } }))} className="h-8 w-full rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                        {/* Linha em PLT/alternativa: mostra o equivalente em peças p/ o operador
                            perceber quando digitou peças num campo de paletes. */}
                        {(pr.pecasPorUnidade ?? 1) > 1 && numBR(apForm.reais[pr.itemId]) > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">= {(numBR(apForm.reais[pr.itemId]) * (pr.pecasPorUnidade ?? 1)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pç</span>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <input inputMode="decimal" title="Perda em peças" value={apForm.perdas[pr.itemId] ?? ""} onChange={(e) => setApForm((p) => ({ ...p, perdas: { ...p.perdas, [pr.itemId]: e.target.value } }))} className="h-8 w-full rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-amber-500" />
                        {pct && <span className="text-[10px] text-amber-600 tabular-nums leading-tight">{pct}</span>}
                      </div>
                    </div>
                    {/* Apontar POR PALETE: nº × pç/palete calcula o Real automaticamente. */}
                    <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] text-muted-foreground">
                      <span>ou por palete:</span>
                      <input inputMode="numeric" placeholder="nº" value={paletesStr} onChange={(e) => aplicarPorPalete(pr, e.target.value, pcPltStr)} className="h-6 w-14 rounded border border-border px-1.5 text-[11px] text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <span>×</span>
                      <input inputMode="numeric" placeholder="pç/plt" title="Peças por palete (do cadastro; editável)" value={pcPltStr} onChange={(e) => aplicarPorPalete(pr, paletesStr, e.target.value)} className="h-6 w-16 rounded border border-border px-1.5 text-[11px] text-right tabular-nums bg-card focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <span>pç/palete</span>
                      {totPecas > 0 && <span className="text-emerald-600 font-medium tabular-nums">= {totPecas.toLocaleString("pt-BR")} pç</span>}
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
            <div className="mt-5 flex items-center justify-between gap-2">
              {apontar.produtos.some((p) => !String(apForm.perdas[p.itemId] ?? "").trim())
                ? <span className="text-xs text-amber-600 dark:text-amber-400">Calcular a perda é obrigatório (use &quot;Calcular perda&quot; ou digite 0).</span>
                : <span />}
              <div className="flex items-center gap-2">
              <button onClick={() => setApontar(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={concluir} disabled={apBusy || apontar.produtos.some((p) => !String(apForm.perdas[p.itemId] ?? "").trim())}
                title={apontar.produtos.some((p) => !String(apForm.perdas[p.itemId] ?? "").trim()) ? "Calcular a perda é obrigatório (use \"Calcular perda\" ou digite 0)" : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {apBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Apontar
              </button>
              </div>
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

      {/* Planejamento por transporte — vagões carregados → quantidade planejada da OP */}
      {calcPlan && novo && area && (() => {
        const total = descarregadoPorProduto(calcPlan.rows);
        const setRows = (rows: CargaVagaoRow[]) => setCalcPlan({ rows });
        const upRow = (i: number, patch: Partial<CargaVagaoRow>) => setRows(calcPlan.rows.map((r, j) => j === i ? { ...r, ...patch } : r));
        const upCarga = (i: number, k: number, patch: Partial<{ itemId: string; pecas: string }>) =>
          upRow(i, { cargas: calcPlan.rows[i].cargas.map((c, m) => m === k ? { ...c, ...patch } : c) });
        // Produtos que apareceram na calculadora (preserva ordem de inserção).
        const itensPreview = Array.from(new Set(calcPlan.rows.flatMap((r) => r.cargas.map((c) => c.itemId)).filter(Boolean)));
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setCalcPlan(null)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Calculator className="w-5 h-5 text-amber-600" /> Planejar por transporte</h2>
            <p className="text-xs text-muted-foreground mt-1">Defina a carga dos vagões/vagonetas. <b>Cheio</b> = 1 produto; <b>meiado</b> = adicione mais de um produto. O total (nº × peças/vagão) vira a quantidade planejada da OP.</p>
            <div className="mt-4 space-y-2">
              {calcPlan.rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={row.veiculo} onChange={(e) => upRow(i, { veiculo: e.target.value as "VAGAO" | "VAGONETA" })} className="h-8 rounded-md border border-border px-1.5 text-xs bg-card">
                      <option value="VAGAO">Vagão</option><option value="VAGONETA">Vagoneta</option>
                    </select>
                    <input inputMode="numeric" placeholder="nº" value={row.nVagoes} onChange={(e) => upRow(i, { nVagoes: e.target.value })} className="h-8 w-20 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card" />
                    <span className="text-xs text-muted-foreground">vagões, cada um com:</span>
                    <div className="flex-1" />
                    {calcPlan.rows.length > 1 && <button type="button" onClick={() => setRows(calcPlan.rows.filter((_, j) => j !== i))} className="text-muted-foreground/60 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  {row.cargas.map((c, k) => (
                    <div key={k} className="flex items-center gap-2 pl-1">
                      <select value={c.itemId} onChange={(e) => { const id = e.target.value; const cap = capacidades[id]?.[row.veiculo]; upCarga(i, k, { itemId: id, ...(!c.pecas && cap != null ? { pecas: String(cap) } : {}) }); }} className="h-8 flex-1 min-w-0 rounded-md border border-border px-1.5 text-xs bg-card">
                        <option value="">Produto…</option>
                        {area.produtos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}
                      </select>
                      <input inputMode="numeric" placeholder="peças/vagão" value={c.pecas} onChange={(e) => upCarga(i, k, { pecas: e.target.value })} className="h-8 w-28 rounded-md border border-border px-2 text-xs text-right tabular-nums bg-card" />
                      {row.cargas.length > 1 && <button type="button" onClick={() => upRow(i, { cargas: row.cargas.filter((_, m) => m !== k) })} className="text-muted-foreground/60 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => upRow(i, { cargas: [...row.cargas, { itemId: "", pecas: "" }] })} className="text-[11px] text-amber-600 hover:underline pl-1">+ produto (meiado)</button>
                </div>
              ))}
              <button type="button" onClick={() => setRows([...calcPlan.rows, { veiculo: "VAGAO", nVagoes: "", cargas: [{ itemId: "", pecas: "" }] }])} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline"><Plus className="w-3.5 h-3.5" /> Adicionar vagão</button>
            </div>
            {itensPreview.length > 0 && (
              <div className="mt-4 rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_6rem_8rem] gap-2 px-3 py-1.5 bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>Produto</span><span className="text-right">Peças</span><span className="text-right">Planejado</span>
                </div>
                {itensPreview.map((itemId) => {
                  const prod = area.produtos.find((p) => p.id === itemId);
                  if (!prod) return null;
                  const pecas = total[itemId] ?? 0;
                  const linha = novo.linhas.find((l) => l.itemId === itemId);
                  const unidadeId = linha?.unidadeId ?? unidadePadrao(area, prod);
                  const un = prod.unidades.find((u) => u.id === unidadeId);
                  const fator = un?.fator && un.fator > 0 ? un.fator : 1;
                  const qtd = Math.round((pecas / fator) * 1000) / 1000;
                  return (
                    <div key={itemId} className="grid grid-cols-[1fr_6rem_8rem] gap-2 px-3 py-1.5 items-center border-t border-border/60 text-xs tabular-nums">
                      <span className="text-foreground truncate">{prod.descricao}</span>
                      <span className="text-right text-muted-foreground">{pecas.toLocaleString("pt-BR")}</span>
                      <span className="text-right font-medium text-cyan-600">{qtd.toLocaleString("pt-BR")} {un?.sigla ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setCalcPlan(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={aplicarCalcPlan} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-700">
                <CheckCircle2 className="w-4 h-4" /> Aplicar planejamento
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
                <ComboboxWithCreate value={saldoIni.itemId}
                  onChange={(v) => { const us = produtos.find((p) => p.id === v)?.unidades ?? []; const principal = us.find((u) => u.isPrincipal) ?? us[0]; setSaldoIni({ ...saldoIni, itemId: v, unidadeId: principal?.id ?? "" }); }}
                  allowNone={false} triggerClassName="h-9 rounded-lg"
                  options={produtos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }))} />
              </div>
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Quantidade *</label>
                  <input inputMode="decimal" value={saldoIni.quantidade} onChange={(e) => setSaldoIni({ ...saldoIni, quantidade: e.target.value })} className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-card text-right tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Unidade</label>
                  {(() => {
                    const us = produtos.find((p) => p.id === saldoIni.itemId)?.unidades ?? [];
                    return (
                      <select value={saldoIni.unidadeId} onChange={(e) => setSaldoIni({ ...saldoIni, unidadeId: e.target.value })}
                        className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-card">
                        {us.length === 0 && <option value="">—</option>}
                        {us.map((u) => <option key={u.id} value={u.id}>{u.sigla}{u.isPrincipal ? "" : ` (×${u.fator})`}</option>)}
                      </select>
                    );
                  })()}
                </div>
              </div>
              {(() => {
                const us = produtos.find((p) => p.id === saldoIni.itemId)?.unidades ?? [];
                const sel = us.find((u) => u.id === saldoIni.unidadeId);
                const base = us.find((u) => u.isPrincipal);
                if (!sel || sel.isPrincipal || !saldoIni.quantidade) return null;
                const q = numBR(saldoIni.quantidade);
                if (!q) return null;
                return <p className="-mt-1 text-[11px] text-muted-foreground">= {(q * (sel.fator ?? 1)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {base?.sigla}</p>;
              })()}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Data do saldo</label>
                <DatePicker value={saldoIni.data} onChange={(v) => setSaldoIni({ ...saldoIni, data: v })} className="w-full" />
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

// Visão em LISTA: OPs agrupadas por dia (cabeçalho de data + linhas); com
// "Agrupar por área" ligado, empilha um 2º agrupamento por área dentro do dia.
function ListaPorDia({ ops, carregando, mes, escopo, onEscopo, soAbertas, onSoAbertas, agruparArea, onAgruparArea, ordemAreas, onNova, onAbrir, onEditar, onExcluir, onApontar }: {
  ops: BoardOP[]; carregando: boolean; mes: string;
  escopo: "area" | "todas"; onEscopo: (e: "area" | "todas") => void;
  soAbertas: boolean; onSoAbertas: (v: boolean) => void;
  agruparArea: boolean; onAgruparArea: (v: boolean) => void; ordemAreas: string[];
  onNova: (() => void) | null; onAbrir: (id: string) => void; onEditar: (o: BoardOP) => void; onExcluir: (o: BoardOP) => void; onApontar: (o: BoardOP) => void;
}) {
  // Excluir OP concluída é só para ADMIN (o servidor estorna o apontamento em cascata).
  const { user } = useSession();
  const perfilAdmin = user?.perfil === "ADMIN";
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
          {escopo === "todas" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={agruparArea} onChange={(e) => onAgruparArea(e.target.checked)} className="accent-cyan-600" />
              Agrupar por área
            </label>
          )}
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
      ) : grupos.map(([dia, lista]) => {
        // 2º agrupamento (opcional): por área dentro do dia, na ordem do fluxo.
        const subgrupos: [string | null, BoardOP[]][] = agruparArea && escopo === "todas"
          ? (() => {
              const m = new Map<string, BoardOP[]>();
              for (const o of lista) { const k = o.areaNome ?? "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(o); }
              const pos = (nome: string) => { const i = ordemAreas.indexOf(nome); return i === -1 ? 999 : i; };
              return Array.from(m.entries()).sort((a, b) => pos(a[0]) - pos(b[0])).map(([k, v]) => [k, v] as [string, BoardOP[]]);
            })()
          : [[null, lista]];
        return (
        <div key={dia}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-muted/70 border-b border-border text-xs font-semibold text-muted-foreground capitalize">
            <span>{dia === "—" ? "Sem data" : fmtDiaTitulo(dia)}</span>
            <span className="text-[10px] font-medium text-muted-foreground/70">{lista.length} OP{lista.length === 1 ? "" : "s"}</span>
          </div>
          {subgrupos.map(([areaNome, opsArea]) => (
          <div key={areaNome ?? "_"}>
          {areaNome !== null && (
            <div className="flex items-center justify-between px-4 py-1 bg-cyan-500/5 border-b border-border/60 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
              <span className="inline-flex items-center gap-1.5"><Factory className="w-3 h-3" /> {areaNome === "—" ? "Sem área" : areaNome}</span>
              <span className="text-[10px] font-medium text-muted-foreground/70">{opsArea.length} OP{opsArea.length === 1 ? "" : "s"}</span>
            </div>
          )}
          {opsArea.map((o) => {
            const concl = o.etapaStatus === "CONCLUIDA";
            const qtdTxt = o.produtos.length > 1
              ? `${o.produtos.length} produtos`
              : `${fmtQtd(Number(o.produtos[0]?.planejada ?? o.quantidade))} ${o.produtos[0]?.unidade ?? o.unidade ?? ""}`.trim();
            return (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-muted/40 text-sm">
                <button onClick={() => onAbrir(o.id)} className="font-mono text-[11px] text-muted-foreground hover:text-cyan-600 w-24 shrink-0 text-left">{o.numero}</button>
                {escopo === "todas" && o.areaNome && areaNome === null && (
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
                  <button onClick={() => onEditar(o)} className="text-muted-foreground hover:text-cyan-600" title={concl ? "Corrigir OP (estorna o apontamento)" : "Editar OP"}><Pencil className="w-3.5 h-3.5" /></button>
                  <Link href={`/pcp/ordens/${o.id}/imprimir`} className="text-muted-foreground hover:text-cyan-600" title="Imprimir OP"><Printer className="w-3.5 h-3.5" /></Link>
                  {(!concl || perfilAdmin) && <button onClick={() => onExcluir(o)} className="text-muted-foreground hover:text-danger" title={concl ? "Excluir OP (admin — estorna o apontamento)" : "Excluir OP"}><Trash2 className="w-3.5 h-3.5" /></button>}
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
      })}
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
                  <>
                    <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px]">
                      <span className={c.suficiente ? "text-success" : "text-warning"}>{c.suficiente ? "✓ suficiente" : "⚠ insuficiente"}</span>
                      <span className="text-muted-foreground tabular-nums">saldo {(c.saldo ?? 0).toLocaleString("pt-BR")}{c.unidade ? ` ${c.unidade}` : ""}</span>
                    </div>
                    {c.local && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1 truncate" title={`Consome do estoque: ${c.local}`}>
                        <MapPin className="w-3 h-3 shrink-0 text-cyan-600 dark:text-cyan-400" /> {c.local}
                      </p>
                    )}
                  </>
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
