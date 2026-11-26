"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable, { type GroupInfo } from "@/components/shared/DataTable";
import { usePersistedState, useSessionState } from "@/lib/use-persisted-state";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { formatBRL, formatDate, decimalToNumber, isVencida, cn } from "@/lib/utils";
import { CalendarClock, Building2, Wallet, RotateCcw, ExternalLink, Pencil, MoreVertical, Search, X, Layers, UserRound, BookOpen, CircleDot, ChevronLeft, ChevronRight, Table2, ChartNoAxesCombined, Kanban } from "lucide-react";
import TitulosGrafico from "@/components/financeiro/TitulosGrafico";
import TitulosKanban, { type TituloKanban } from "@/components/financeiro/TitulosKanban";
import PagamentoTituloForm, { type TaxaNaturezaOpt, filtrarTaxaNaturezas } from "@/components/financeiro/PagamentoTituloForm";
import PagamentoLoteDialog, { type TituloLote } from "@/components/financeiro/PagamentoLoteDialog";
import { useFilterBar, FilterBarToggle, FilterBarChips, CHIP_TRIGGER, type FiltroChip } from "@/components/shared/FilterBar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import EmpresaTag from "@/components/shared/EmpresaTag";
import FilterSelect from "@/components/shared/FilterSelect";
import CheckboxFilter from "@/components/shared/CheckboxFilter";
import DateRangePicker, { type DateRange } from "@/components/shared/DateRangePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import TituloDetalhesDialog, { type TituloCampo, type TituloAcao } from "@/components/financeiro/TituloDetalhesDialog";
import EditarTituloDialog from "@/components/financeiro/EditarTituloDialog";
import { useSession } from "@/lib/session-context";
import {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma,
  contaEhCaixa, formaEhCartao, formaEhDinheiro, temContaBanco, fetchMaquinetas,
} from "@/components/pedidos-venda/PagamentosInput";

type ContaRow = {
  id: string; numero: string; descricao: string; status: string;
  // Empresa dona do título (modo grupo lista todas — a tag identifica cada uma).
  empresaId?: string | null;
  parcelaNumero?: number | null; parcelaTotal?: number | null;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  dataEmissao?: Date | string | null;
  createdAt?: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  // Encargos ACUMULADOS nas baixas (juros/multa por fora, taxa retida).
  valorJuros?: unknown; valorMulta?: unknown; valorTaxa?: unknown;
  // Natureza da taxa retida (travada) — "descontos-concedidos" = desconto na baixa.
  taxaNaturezaId?: string | null;
  cliente: { id: string; razaoSocial: string };
  // Conta analítica de Clientes a Receber (1.1.2.x) — link p/ o razão do cliente.
  clienteContaId?: string | null;
  contasContrapartida?: { id: string; nome: string }[];
  // Rateio gerencial por natureza + natureza única (legado sem split) — detalhe.
  naturezas?: { naturezaFinanceiraId: string; detalhamento: string | null; valor: unknown; naturezaFinanceira?: { codigo: string | null; nome: string } | null }[];
  naturezaFinanceira?: { id: string; codigo: string | null; nome: string } | null;
  pedidoVenda?: { id: string; numero: string } | null;
  centroCusto?: { codigo: string; nome: string } | null; centroCustoId?: string | null;
  recorrenciaId?: string | null; compensacaoOrigemId?: string | null; intragrupo?: boolean;
  naturezaFinanceiraId?: string | null; observacoes?: string | null; beneficiarioTipo?: string | null; beneficiarioId?: string | null;
  criadoPor?: string | null; atualizadoPor?: string | null;
  // Processo externo ligado (restituição/indenização) — origem quando não há pedido.
  processoId?: string | null; processo?: { id: string; codigo: string } | null;
};

// Documento de ORIGEM do título a receber: pedido de venda (PV-xxxx — cobre
// balcão, entrega/minuta, venda à ordem e devolução, que nascem do pedido),
// encontro de contas, recorrência, intragrupo — ou avulso (manual). Com número,
// a tela mostra SÓ o número (o PV já diz que é venda), com link para o pedido.
function origemReceber(c: ContaRow): { label: string; ref: string | null; pedidoId?: string | null; href?: string | null } {
  if (c.pedidoVenda) return { label: "Pedido de Venda", ref: c.pedidoVenda.numero, pedidoId: c.pedidoVenda.id, href: `/pedidos-venda/${c.pedidoVenda.id}` };
  if (c.processo) return { label: "Processo", ref: c.processo.codigo, href: `/processos/${c.processo.id}` };
  if (c.compensacaoOrigemId) return { label: "Encontro de Contas", ref: null };
  if (c.recorrenciaId) return { label: "Recorrência", ref: null };
  if (c.intragrupo) return { label: "Intragrupo", ref: null };
  return { label: "Manual", ref: null };
}


type PedidoPag = { forma: string; valor: unknown; contaBancariaId: string | null };

// Data (Date|string) → "YYYY-MM-DD" para comparar com o range do filtro.
function isoDia(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
// Casa a data de vencimento do título com o período (limites inclusivos, cada
// ponta opcional). Sem período → passa tudo.
function dentroDoPeriodo(c: { dataVencimento: Date | string }, p: DateRange): boolean {
  if (!p.from && !p.to) return true;
  const iso = isoDia(c.dataVencimento);
  if (!iso) return false;
  if (p.from && iso < p.from) return false;
  if (p.to && iso > p.to) return false;
  return true;
}

// Badge redondo com a contagem por categoria (cores dos blocos) ao lado do
// cliente no filtro — número DENTRO, colorido; sem bolinha separada.
type ContagemCli = { vencido: number; aVencer: number; semVenc: number; paga: number };
function BadgeContagem({ bg, text, n, titulo }: { bg: string; text: string; n: number; titulo: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-full min-w-[1.4rem] h-5 px-1.5 text-[11px] font-semibold tabular-nums", bg, text)} title={`${n} ${titulo}`}>
      {n}
    </span>
  );
}
function bolinhasCliente(st?: ContagemCli) {
  if (!st) return null;
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {st.vencido > 0 && <BadgeContagem bg="bg-danger/15" text="text-danger" n={st.vencido} titulo="vencidos" />}
      {st.aVencer > 0 && <BadgeContagem bg="bg-sky-500/15" text="text-sky-700 dark:text-sky-300" n={st.aVencer} titulo="a vencer" />}
      {st.semVenc > 0 && <BadgeContagem bg="bg-violet-500/15" text="text-violet-700 dark:text-violet-300" n={st.semVenc} titulo="sem vencimento" />}
      {st.paga > 0 && <BadgeContagem bg="bg-muted" text="text-muted-foreground" n={st.paga} titulo="recebidas" />}
    </span>
  );
}

type StatusFiltro = "TODOS" | "ABERTA" | "PARCIAL" | "VENCIDA" | "A_VENCER" | "SEM_VENCIMENTO" | "PAGA";

// Casa a conta com o filtro de status. "VENCIDA", "A_VENCER" e "SEM_VENCIMENTO"
// são derivados (não são status do banco): vencida = em aberto/parcial com
// vencimento passado; a vencer = com data futura; sem vencimento = sem data.
function casaStatus(c: ContaRow, f: StatusFiltro): boolean {
  const emAberto = c.status === "ABERTA" || c.status === "PARCIAL";
  switch (f) {
    case "ABERTA":  return c.status === "ABERTA";
    case "PARCIAL": return c.status === "PARCIAL";
    case "VENCIDA": return emAberto && isVencida(c.dataVencimento, c.dataPagamento);
    case "A_VENCER": return emAberto && !!c.dataVencimento && !isVencida(c.dataVencimento, c.dataPagamento);
    case "SEM_VENCIMENTO": return emAberto && !c.dataVencimento;
    case "PAGA":    return c.status === "PAGA";
    default:        return true;
  }
}

// Status reais selecionáveis no filtro de múltipla escolha (sem "TODOS": todos
// marcados = todas). "VENCIDA", "A_VENCER" e "SEM_VENCIMENTO" são derivados e
// SOBREPÕEM ABERTA/PARCIAL.
const STATUS_RECEBER: { key: Exclude<StatusFiltro, "TODOS">; label: string }[] = [
  { key: "ABERTA", label: "Em aberto" },
  { key: "PARCIAL", label: "Parciais" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "A_VENCER", label: "A vencer" },
  { key: "SEM_VENCIMENTO", label: "Sem vencimento" },
  { key: "PAGA", label: "Recebidas" },
];
const STATUS_RECEBER_KEYS = STATUS_RECEBER.map((s) => s.key) as string[];

// Conjuntos de status por bloco de total (clique nos totais aplica um preset).
const SET_ABERTO = ["ABERTA", "PARCIAL"];
// "A Receber" = com vencimento (vencidas + a vencer); sem vencimento tem bloco próprio.
const SET_A_RECEBER = ["VENCIDA", "A_VENCER"];
const SET_VENCIDO = ["VENCIDA"];
const SET_A_VENCER = ["A_VENCER"];
const SET_SEM_VENC = ["SEM_VENCIMENTO"];
const SET_PAGO = ["PAGA"];
function mesmoSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

type Resumo = { emAberto: number; vencido: number; recebidoMes: number };

export default function ContasReceberTable({ contas, resumo }: { contas: ContaRow[]; resumo?: Resumo }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [editar, setEditar] = useState<ContaRow | null>(null);
  // Filtros persistidos por usuário (padrão do sistema — sobrevivem a trocar de aba).
  // Status é múltipla escolha (chave nova para não colidir com o valor antigo
  // de seleção única). Padrão: em aberto (ABERTA + PARCIAL).
  const [statusSel, setStatusSel] = usePersistedState<string[]>("financeiro:contas-receber:status-multi", SET_ABERTO);
  // Filtro por EMPRESA (modo grupo — multi-seleção). Vazio = sem recorte (todas
  // marcadas no chip, mesmo padrão do status: todos marcados = tudo).
  const empresasSessao = user?.empresas ?? [];
  const [empresasSel, setEmpresasSel] = usePersistedState<string[]>("financeiro:contas-receber:empresas", []);
  const [contaFiltro, setContaFiltro] = usePersistedState<string>("financeiro:contas-receber:conta", "");
  // Busca na barra de filtros — persiste na SESSÃO (troca de página mantém).
  const [busca, setBusca] = useSessionState("financeiro:contas-receber:busca", "");
  // Período por data de vencimento (persistido por usuário — padrão do sistema).
  const [periodo, setPeriodo] = usePersistedState<DateRange>("financeiro:contas-receber:periodo", { from: "", to: "" });
  // Barra de filtros padrão (funil + chips) — ver shared/FilterBar.
  const filterBar = useFilterBar("financeiro:contas-receber:filtros", ["status"]);
  // Vista: tabela (padrão), quadro (por situação) ou gráfico (barras por
  // vencimento) — como no CP.
  const [vista, setVista] = usePersistedState<"tabela" | "quadro" | "grafico">("financeiro:contas-receber:vista", "tabela");
  // Filtro por MÊS (padrão, ativo sem período custom): títulos do mês + carry-over
  // em aberto dos meses anteriores. Abre no mês corrente; "TODOS" desliga.
  const [mes, setMes] = useSessionState<string>("financeiro:contas-receber:mes", () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const mudarMes = (delta: number) => setMes((m) => {
    if (m === "TODOS") return m;
    const [a, mm] = m.split("-").map(Number);
    const d = new Date(a, mm - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const modoMes = !periodo.from && !periodo.to;
  // Contas de contrapartida distintas presentes na lista (para o filtro).
  const contasDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) for (const cc of c.contasContrapartida ?? []) m.set(cc.id, cc.nome);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  const [clienteFiltro, setClienteFiltro] = usePersistedState<string>("financeiro:contas-receber:cliente", "");
  // Clientes distintos presentes na lista (para o filtro).
  const clientesDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) if (c.cliente) m.set(c.cliente.id, c.cliente.razaoSocial);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  // Contagem de títulos por categoria por cliente — vira os badges no filtro.
  const clienteStats = useMemo(() => {
    const m = new Map<string, ContagemCli>();
    for (const c of contas) {
      const cid = c.cliente?.id;
      if (!cid) continue;
      const s = m.get(cid) ?? { vencido: 0, aVencer: 0, semVenc: 0, paga: 0 };
      if (c.status === "PAGA") s.paga++;
      else if (c.status === "ABERTA" || c.status === "PARCIAL") {
        if (!c.dataVencimento) s.semVenc++;
        else if (isVencida(c.dataVencimento, c.dataPagamento)) s.vencido++;
        else s.aVencer++;
      }
      m.set(cid, s);
    }
    return m;
  }, [contas]);
  // Base dos totais: todos os filtros MENOS o de status (cada bloco é uma
  // categoria de status) — assim os blocos refletem cliente/conta/período/busca.
  // Recorte de data: período custom quando definido; senão o MODO MÊS (padrão) —
  // títulos com vencimento no mês + carry-over EM ABERTO (vencidos de meses
  // anteriores e sem vencimento). Vale para a TABELA e para o GRÁFICO.
  const passaData = (c: ContaRow): boolean => {
    if (periodo.from || periodo.to) return dentroDoPeriodo(c, periodo);
    if (mes === "TODOS") return true;
    const iso = isoDia(c.dataVencimento);
    const ini = `${mes}-01`;
    if (iso && iso >= ini && iso <= `${mes}-31`) return true;
    const emAberto = c.status === "ABERTA" || c.status === "PARCIAL";
    return emAberto && (!iso || iso < ini);
  };
  const contasBase = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) => {
      // Recorte por empresa (modo grupo): seleção vazia = todas.
      if (empresasSel.length > 0 && c.empresaId && !empresasSel.includes(c.empresaId)) return false;
      if (contaFiltro !== "" && !(c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)) return false;
      if (clienteFiltro !== "" && c.cliente?.id !== clienteFiltro) return false;
      if (!passaData(c)) return false;
      if (!q) return true;
      const o = origemReceber(c);
      return [c.numero, c.cliente?.razaoSocial, c.descricao, o.ref, o.label]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [contas, empresasSel, contaFiltro, clienteFiltro, busca, periodo, mes]);
  const contasFiltradas = useMemo(
    () => contasBase.filter((c) => statusSel.some((s) => casaStatus(c, s as StatusFiltro))),
    [contasBase, statusSel],
  );
  // Totais dos blocos, recortando a base por categoria de status.
  const totais = useMemo(() => {
    const now = new Date();
    let emAberto = 0, vencido = 0, aVencer = 0, semVenc = 0, recebidoMes = 0;
    for (const c of contasBase) {
      if (c.status === "ABERTA" || c.status === "PARCIAL") {
        const saldo = decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago);
        emAberto += saldo;
        if (!c.dataVencimento) semVenc += saldo;
        else if (isVencida(c.dataVencimento, c.dataPagamento)) vencido += saldo;
        else aVencer += saldo;
      }
      if (c.dataPagamento) {
        const d = new Date(c.dataPagamento);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) recebidoMes += decimalToNumber(c.valorPago);
      }
    }
    // A Receber DESCONSIDERA os sem vencimento (eles têm o próprio bloco).
    return { aReceber: vencido + aVencer, vencido, aVencer, semVenc, recebidoMes };
  }, [contasBase]);
  // SALDO de todo o Contas a Receber (em aberto, inclusive sem vencimento) —
  // ignora mês/período e filtros; fica ao lado do navegador de mês.
  const saldoTotal = useMemo(
    () => contas.reduce((s, c) => (c.status === "ABERTA" || c.status === "PARCIAL")
      ? s + decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago)
      : s, 0),
    [contas],
  );
  // Gráfico (barras por vencimento): mesmos filtros da tabela, INCLUINDO o
  // recorte de mês/período. Valor = saldo em aberto; PAGA entra pelo original
  // (só aparece se o filtro de status incluir recebidas).
  const pontosGrafico = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas
      .filter((c) => {
        if (c.status === "CANCELADA") return false;
        if (empresasSel.length > 0 && c.empresaId && !empresasSel.includes(c.empresaId)) return false;
        if (!statusSel.some((s) => casaStatus(c, s as StatusFiltro))) return false;
        if (contaFiltro !== "" && !(c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)) return false;
        if (clienteFiltro !== "" && c.cliente?.id !== clienteFiltro) return false;
        if (!passaData(c)) return false;
        if (!q) return true;
        const o = origemReceber(c);
        return [c.numero, c.cliente?.razaoSocial, c.descricao, o.ref, o.label]
          .some((v) => v?.toLowerCase().includes(q));
      })
      .map((c) => ({
        venc: isoDia(c.dataVencimento) || null,
        valor: c.status === "PAGA"
          ? decimalToNumber(c.valorOriginal)
          : Math.max(0, decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago)),
        // Detalhe p/ o popup da barra (lista de títulos do período clicado).
        id: c.id,
        empresaId: c.empresaId ?? null,
        numero: c.numero,
        fornecedor: c.cliente?.razaoSocial ?? null,
        descricao: c.descricao ?? null,
        parcela: c.parcelaTotal ? `${c.parcelaNumero}/${c.parcelaTotal}` : "Única",
        status: c.status,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas, empresasSel, statusSel, contaFiltro, clienteFiltro, busca, periodo, mes]);
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [detalhe, setDetalhe] = useState<ContaRow | null>(null);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contasBanco, setContasBanco] = useState<ContaOpt[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Apoio do formulário de recebimento (PagamentoTituloForm tipo="receber"):
  // naturezas da taxa retida (grupo 6 / travadas; default taxa de cartão) e a
  // travada "descontos-concedidos" (desconto na baixa — recebeu menos e quitou).
  const [taxaNaturezas, setTaxaNaturezas] = useState<TaxaNaturezaOpt[]>([]);
  const [descontoNatureza, setDescontoNatureza] = useState<TaxaNaturezaOpt | null>(null);
  // Pagamentos registrados no pedido de origem do título selecionado (forma +
  // valor por linha) — pré-preenchem a baixa e alimentam o backstop do Caixa.
  const [pedidoPags, setPedidoPags] = useState<PedidoPag[]>([]);
  // Pré-preenchimento da baixa vindo do pedido (linhas exatas ou forma única).
  const [linhasIniciais, setLinhasIniciais] = useState<LinhaPagamento[] | undefined>(undefined);
  const [formaPrevista, setFormaPrevista] = useState<{ nome: string } | null>(null);
  // Aberto pelo arraste à coluna Parcial do quadro: valor vazio p/ informar a parcela.
  const [abrirParcial, setAbrirParcial] = useState(false);
  const abrirSeq = useRef(0);

  // Agrupamento (toggle): por data de VENCIMENTO ou por CLIENTE. Grupos com
  // contagem e soma dos valores.
  const [agrupamento, setAgrupamento] = usePersistedState<"none" | "vencimento" | "cliente">("financeiro:contas-receber:agrupamento", "none");
  // Agrupamento NATIVO do DataTable: função de grupo por linha + cabeçalho.
  const groupByFn = useMemo<((c: ContaRow) => GroupInfo | null) | undefined>(() => {
    if (agrupamento === "none") return undefined;
    if (agrupamento === "vencimento") return (c) => {
      const d = c.dataVencimento ? new Date(c.dataVencimento) : null;
      const ok = !!d && !isNaN(d.getTime());
      const label = ok ? formatDate(c.dataVencimento) : "Sem vencimento";
      return { key: label, label, ordem: ok ? d!.getTime() : Number.MAX_SAFE_INTEGER };
    };
    return (c) => {
      const nome = c.cliente?.razaoSocial ?? "Sem cliente";
      return { key: c.cliente?.id ?? "sem", label: nome, ordem: nome.toLowerCase() };
    };
  }, [agrupamento]);
  const renderGrupoHeader = (info: { key: string; label: string; rows: ContaRow[] }) => {
    const soma = info.rows.reduce((s, c) => s + decimalToNumber(c.valorOriginal), 0);
    const temVencido = agrupamento === "vencimento" && info.rows.some((c) => isVencida(c.dataVencimento, c.dataPagamento));
    return (
      <div className={cn("flex items-center gap-2 text-sm font-semibold", temVencido ? "text-danger" : "text-foreground")}>
        {agrupamento === "cliente" ? <Building2 className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
        <span>{info.label}</span>
        <span className="text-xs font-normal text-muted-foreground">· {info.rows.length} título{info.rows.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto tabular-nums">{formatBRL(soma)}</span>
      </div>
    );
  };

  // Rastreabilidade: ?focus=<id> destaca o título vindo do Razão/contabilidade.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f) setFocusId(f);
  }, []);

  // Dados de apoio (formas de pagamento e contas de destino).
  useEffect(() => {
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setContasBanco(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    // Naturezas SAIDA: taxa/tarifa retida (grupo 6 do plano; senão as travadas
    // taxa de cartão/tarifa bancária) e a travada do desconto concedido (fica
    // FORA da lista da taxa — desconto tem caminho próprio no formulário).
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json()).then((j) => {
      const arr: TaxaNaturezaOpt[] = Array.isArray(j) ? j : (j.data ?? []);
      setTaxaNaturezas(filtrarTaxaNaturezas(arr).filter((n) => n.sistemaChave !== "descontos-concedidos"));
      setDescontoNatureza(arr.find((n) => n.sistemaChave === "descontos-concedidos") ?? null);
    }).catch(() => {});
  }, []);

  // MODO GRUPO: título de OUTRA empresa aparece na lista (leitura em grupo do
  // seletor), mas as AÇÕES pedem a troca da empresa ativa — baixa/edição usam
  // contas bancárias e naturezas da empresa ativa, que não são os dele.
  const acaoCruzaEmpresa = (c: ContaRow): boolean =>
    !!c.empresaId && !!user?.activeEmpresaId && c.empresaId !== user.activeEmpresaId;
  const comGuardaEmpresa = (c: ContaRow, fn: () => void) => () => {
    if (!acaoCruzaEmpresa(c)) return fn();
    const nome = user?.empresas?.find((e) => e.id === c.empresaId)?.nome ?? "outra empresa";
    alert(`Este título é da ${nome}. Troque a empresa ativa no seletor (canto superior direito) para executar esta ação.`);
  };

  // Abre o "Registrar Recebimento" (PagamentoTituloForm tipo="receber").
  // Título nascido de pedido: busca os pagamentos registrados nele ANTES de
  // abrir — pré-preenchem a baixa (ex.: 44,00 dinheiro + 0,50 cartão vira duas
  // linhas, cada uma na sua conta; sem isso o valor eletrônico acabaria caindo
  // inteiro no Caixa) e alimentam o backstop do Caixa (validarBaixa).
  // `parcial`: aberto pelo arraste à coluna Parcial do quadro (valor vazio).
  async function abrir(row: ContaRow, parcial = false) {
    const seq = ++abrirSeq.current;
    let pags: PedidoPag[] = [];
    let iniciais: LinhaPagamento[] | undefined;
    let prevista: { nome: string } | null = null;
    if (row.pedidoVenda) {
      const j = await fetch(`/api/contas-receber/${row.id}`).then((r) => r.json()).catch(() => null);
      if (seq !== abrirSeq.current) return; // já reaberto para outro título
      pags = j?.data?.pedidoVenda?.pagamentos ?? [];
      // Só espelha quando é exato: título ainda sem baixa e soma dos pagamentos
      // igual ao saldo (parcial/encargo não tem como ratear automaticamente).
      const s = decimalToNumber(row.valorOriginal) - decimalToNumber(row.valorPago);
      const soma = pags.reduce((t, p) => t + decimalToNumber(p.valor), 0);
      const exato = pags.length > 0 && decimalToNumber(row.valorPago) <= 0.005 && Math.abs(soma - s) <= 0.005;
      if (exato && !parcial) {
        const temCartao = pags.some((p) => formaEhCartao(p.forma, formas));
        if (pags.length > 1 || temCartao || pags[0].contaBancariaId) {
          // Linhas exatas do pedido → o formulário abre no modo dividido.
          iniciais = pags.map((p) => novaLinhaPagamento(
            p.forma,
            p.contaBancariaId ?? contaPadraoParaForma(p.forma, formas, contasBanco),
            decimalToNumber(p.valor).toFixed(2).replace(".", ","),
          ));
          // Cartão: sugere a maquineta quando a empresa só tem uma (com 2+ o
          // operador escolhe — o PagamentosInput destaca até escolher).
          if (temCartao) {
            const ms = await fetchMaquinetas().catch(() => []);
            if (seq !== abrirSeq.current) return;
            if (ms.length === 1) {
              iniciais = iniciais.map((l) => (formaEhCartao(l.forma, formas) && !l.maquinetaId ? { ...l, maquinetaId: ms[0].id, contaBancariaId: "" } : l));
            }
          }
        } else {
          prevista = { nome: pags[0].forma };
        }
      }
    }
    setPedidoPags(pags);
    setLinhasIniciais(iniciais);
    setFormaPrevista(prevista);
    setAbrirParcial(parcial);
    setSelected(row);
  }

  // Backstop do pedido: a trava de roteamento depende da FORMA da linha — uma
  // linha sem forma escapa dela. Se o pedido registrou parte eletrônica, o que
  // for roteado para o Caixa (conta tipo CAIXA ou linha sem conta, que o back
  // resolve para o caixa da empresa) não pode passar do dinheiro do pedido mais
  // os encargos desta baixa.
  function validarBaixa(linhas: LinhaPagamento[], acrescimo: number): string | null {
    if (!temContaBanco(contasBanco) || pedidoPags.length === 0) return null;
    const totalPedido = pedidoPags.reduce((t, p) => t + decimalToNumber(p.valor), 0);
    const dinheiroPedido = pedidoPags
      .filter((p) => formaEhDinheiro(p.forma, formas))
      .reduce((t, p) => t + decimalToNumber(p.valor), 0);
    const eletronicoPedido = totalPedido - dinheiroPedido;
    const paraCaixa = linhas
      // Linha de cartão com maquineta não conta: a conta é derivada da
      // administradora no back, nunca o Caixa.
      .filter((l) => !(l.maquinetaId && formaEhCartao(l.forma, formas)))
      .filter((l) => !l.contaBancariaId || contaEhCaixa(l.contaBancariaId, contasBanco))
      .reduce((t, l) => t + parseValorBR(l.valor), 0);
    if (eletronicoPedido > 0.005 && paraCaixa > dinheiroPedido + acrescimo + 0.005) {
      return `O pedido registrou ${formatBRL(eletronicoPedido)} em formas eletrônicas — esse valor não pode cair no Caixa em Dinheiro. Direcione-o para a conta do cartão/banco.`;
    }
    return null;
  }

  // ── Seleção para recebimento EM LOTE ───────────────────────────────────────
  // Só títulos recebíveis (em aberto/parcial, com saldo) ganham checkbox. Os
  // que o lote vai pular (outra empresa, intragrupo) podem ser marcados — o
  // modal avisa o motivo antes de enviar (mesma regra do servidor).
  const saldoDe = (c: ContaRow) => Math.max(0, Math.round((decimalToNumber(c.valorOriginal) - decimalToNumber(c.valorPago)) * 100) / 100);
  const podeSelecionar = (c: ContaRow) => c.status !== "PAGA" && c.status !== "CANCELADA" && saldoDe(c) > 0.005;
  const motivoLote = (c: ContaRow): string | null =>
    acaoCruzaEmpresa(c) ? "Título de outra empresa — troque a empresa ativa"
    : c.intragrupo ? "Título intragrupo — receba individualmente"
    : null;
  const [selIds, setSelIds] = useState<string[]>([]);
  const [loteAberto, setLoteAberto] = useState(false);
  const toggleSel = (id: string) => setSelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  // Após refresh (recebidos saem do "em aberto"), a seleção perde o que não é mais recebível.
  useEffect(() => {
    setSelIds((prev) => {
      const novo = prev.filter((id) => { const c = contas.find((x) => x.id === id); return !!c && podeSelecionar(c); });
      return novo.length === prev.length ? prev : novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas]);
  const selecionadas = useMemo(
    () => selIds.map((id) => contas.find((c) => c.id === id)).filter((c): c is ContaRow => !!c),
    [selIds, contas],
  );
  const totalSelecionado = selecionadas.reduce((s, c) => s + saldoDe(c), 0);
  const titulosLote: TituloLote[] = selecionadas.map((c) => ({
    id: c.id, numero: c.numero, fornecedor: c.cliente?.razaoSocial ?? null, saldo: saldoDe(c), motivo: motivoLote(c),
  }));

  // Cliente: nome em texto simples + dois atalhos ao lado — cadastro do cliente
  // e conta razão dele (analítica 1.1.2.x). Reusado na tabela, na visão
  // agrupada e no detalhe.
  function renderCliente(c: ContaRow, className?: string) {
    const cli = c.cliente;
    if (!cli) return <span className={className}>—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <span className={cn("truncate", className)} title={cli.razaoSocial}>{cli.razaoSocial}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/clientes/${cli.id}`); }}
          className="shrink-0 text-muted-foreground hover:text-info transition-colors"
          title="Abrir o cadastro do cliente"
        >
          <UserRound className="h-3.5 w-3.5" />
        </button>
        {c.clienteContaId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push(`/contabilidade/razao/${c.clienteContaId}`); }}
            className="shrink-0 text-muted-foreground hover:text-info transition-colors"
            title="Abrir a conta razão do cliente"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  // Ações da linha num menu de 3 pontinhos ao fim da linha (Receber/Estornar/
  // Editar). Reusadas na tabela e na visão agrupada.
  function renderAcoes(c: ContaRow) {
    const s = c.status;
    const podeReceber = s !== "PAGA" && s !== "CANCELADA";
    const podeEstornar = s === "PAGA" || s === "PARCIAL";
    if (!podeReceber && !podeEstornar && !isAdmin) return null;
    return (
      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Ações" />}>
            <MoreVertical className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            {podeReceber && (
              <DropdownMenuItem onClick={comGuardaEmpresa(c, () => abrir(c))}>
                <Wallet className="w-4 h-4 text-emerald-600" /> Receber
              </DropdownMenuItem>
            )}
            {podeEstornar && (
              <DropdownMenuItem onClick={comGuardaEmpresa(c, () => estornar(c))}>
                <RotateCcw className="w-4 h-4 text-amber-600" /> Estornar
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem onClick={comGuardaEmpresa(c, () => setEditar(c))}>
                <Pencil className="w-4 h-4" /> Editar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        {/* Seleção p/ recebimento em lote (o DataTable ignora clique em input). */}
        {podeSelecionar(row.original) ? (
          <input
            type="checkbox"
            checked={selIds.includes(row.original.id)}
            onChange={() => toggleSel(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
            title="Selecionar para recebimento em lote"
          />
        ) : <span className="inline-block w-3.5" />}
        <EmpresaTag empresaId={row.original.empresaId} compact />
        <span className="font-mono text-xs font-semibold">{row.original.numero}</span>
      </span>
    ) },
    { id: "cliente", header: "Cliente", cell: ({ row }) => (
      <div className="max-w-[16rem]">{renderCliente(row.original)}</div>
    ) },
    // A coluna Descrição ABSORVE a folga de largura da tabela: w-full no TH
    // (puxa o espaço livre) e max-w-0 só no TD (o texto trunca no disponível).
    // max-w-0 no TH colapsaria a coluna inteira a zero.
    { accessorKey: "descricao", header: "Descrição", meta: { thClass: "w-full", tdClass: "max-w-0" }, cell: ({ row }) => (
      <div className="truncate text-sm" title={row.original.descricao}>{row.original.descricao}</div>
    ) },
    // Só o CÓDIGO do documento de origem (o nome do processo fica no tooltip);
    // sem código (manual, encontro, recorrência…), mostra o rótulo mesmo.
    { id: "origem", header: "Origem", cell: ({ row }) => {
      const o = origemReceber(row.original);
      if (!o.ref) return <span className="text-xs text-muted-foreground">{o.label}</span>;
      return o.href ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(o.href!); }}
          className="font-mono text-xs text-info hover:underline whitespace-nowrap"
          title={`${o.label} — abrir`}
        >
          {o.ref}
        </button>
      ) : (
        <span className="font-mono text-xs text-muted-foreground" title={o.label}>{o.ref}</span>
      );
    } },
    {
      id: "parcela",
      header: "Parcela",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.original.parcelaTotal && row.original.parcelaTotal > 1
            ? `${row.original.parcelaNumero ?? 1}/${row.original.parcelaTotal}`
            : "Única"}
        </span>
      ),
    },
    {
      id: "emissao",
      header: "Emissão",
      // accessorFn dá o VALOR à coluna (sem ele o tanstack não tem o que ordenar).
      accessorFn: (c) => c.dataEmissao ?? null,
      meta: { className: "whitespace-nowrap", sortTipo: "data" },
      cell: ({ row }) => {
        const d = row.original.dataEmissao ?? null;
        return d ? <span className="text-muted-foreground">{formatDate(d)}</span> : <span className="text-muted-foreground/60">—</span>;
      },
    },
    {
      accessorKey: "dataVencimento",
      header: "Vencimento",
      meta: { className: "whitespace-nowrap", sortTipo: "data" },
      cell: ({ row }) => {
        if (!row.original.dataVencimento) return <span className="text-muted-foreground italic">A combinar</span>;
        const vencida = isVencida(row.original.dataVencimento, row.original.dataPagamento);
        return <span className={vencida ? "text-danger font-medium" : "text-muted-foreground"}>{formatDate(row.original.dataVencimento)}</span>;
      },
    },
    { accessorKey: "valorOriginal", header: "Valor", meta: { className: "whitespace-nowrap", sortTipo: "numero" }, cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.valorOriginal))}</span> },
    { accessorKey: "valorPago", header: "Pago", meta: { className: "whitespace-nowrap", sortTipo: "numero" }, cell: ({ row }) => <span className="text-success">{formatBRL(decimalToNumber(row.original.valorPago))}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => {
      // Status colorido pela MESMA categoria dos blocos: ABERTO vira Sem
      // vencimento (violeta) / Vencida (vermelho) / A vencer (azul).
      const c = row.original;
      let s: string = c.status;
      if (c.status === "ABERTA") {
        s = !c.dataVencimento ? "SEM_VENCIMENTO" : isVencida(c.dataVencimento, c.dataPagamento) ? "VENCIDA" : "A_VENCER";
      }
      return <StatusBadge status={s} />;
    } },
    {
      id: "conta",
      header: "Conta",
      cell: ({ row }) => {
        const cs = row.original.contasContrapartida ?? [];
        const txt = cs.map((c) => c.nome).join(" + ");
        return cs.length ? <div className="max-w-[10rem] truncate text-xs text-muted-foreground" title={txt}>{txt}</div> : <span className="text-muted-foreground/60">—</span>;
      },
    },
    {
      id: "actions",
      header: "",
      // w-px encolhe a célula ao conteúdo — a folga da tabela fica na Descrição.
      meta: { className: "w-px whitespace-nowrap", stickyRight: true },
      cell: ({ row }) => <div className="w-10">{renderAcoes(row.original)}</div>,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [contasBanco, isAdmin, selIds, user?.activeEmpresaId]);

  // Ao agrupar, esconde a coluna que virou o cabeçalho do grupo (redundante).
  const colsParaTabela = useMemo(() => columns.filter((c) => {
    const id = (c as { id?: string; accessorKey?: string }).id ?? (c as { accessorKey?: string }).accessorKey;
    if (agrupamento === "cliente" && id === "cliente") return false;
    if (agrupamento === "vencimento" && id === "dataVencimento") return false;
    return true;
  }), [columns, agrupamento]);

  // Estorna o recebimento: o título volta para "em aberto" e o lançamento no
  // caixa/banco é removido.
  async function estornar(row: ContaRow) {
    if (!confirm(`Estornar o recebimento do título ${row.numero}? Ele volta para "em aberto" e o lançamento no caixa/banco é removido.`)) return;
    const res = await fetch(`/api/contas-receber/${row.id}/estorno`, { method: "POST" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Não foi possível estornar."); return; }
    router.refresh();
  }


  // Chips da barra de filtros padrão (shared/FilterBar): o funil da toolbar
  // mostra/esconde a linha; filtro ativo mantém o funil azul mesmo escondido.
  const chipsFiltro: FiltroChip[] = [
    {
      key: "status", label: "Status",
      icon: <CircleDot className="w-4 h-4 text-muted-foreground" />,
      ativo: !mesmoSet(statusSel, SET_ABERTO),
      limpar: () => setStatusSel(SET_ABERTO),
      render: () => (
        <CheckboxFilter
          values={statusSel}
          onChange={setStatusSel}
          noun="status"
          triggerClassName={CHIP_TRIGGER}
          options={STATUS_RECEBER.map((f) => ({
            value: f.key,
            label: f.label,
            hint: String(contas.filter((c) => casaStatus(c, f.key)).length),
          }))}
        />
      ),
    },
    {
      // Empresa (modo grupo): multi-seleção — vazio persiste como "todas".
      key: "empresa", label: "Empresa",
      icon: <Building2 className="w-4 h-4 text-muted-foreground" />,
      disponivel: empresasSessao.length > 1,
      ativo: empresasSel.length > 0 && empresasSel.length < empresasSessao.length,
      limpar: () => setEmpresasSel([]),
      render: () => (
        <CheckboxFilter
          values={empresasSel.length ? empresasSel : empresasSessao.map((e) => e.id)}
          onChange={(v) => setEmpresasSel(v.length >= empresasSessao.length ? [] : v)}
          noun="empresas"
          triggerClassName={CHIP_TRIGGER}
          options={empresasSessao.map((e) => ({
            value: e.id,
            label: e.nome,
            hint: String(contas.filter((c) => c.empresaId === e.id).length),
          }))}
        />
      ),
    },
    {
      key: "periodo", label: "Período",
      icon: <CalendarClock className="w-4 h-4 text-muted-foreground" />,
      ativo: Boolean(periodo.from || periodo.to),
      limpar: () => setPeriodo({ from: "", to: "" }),
      render: () => (
        <DateRangePicker value={periodo} onChange={setPeriodo} placeholder="Período" triggerClassName={CHIP_TRIGGER} />
      ),
    },
    {
      key: "cliente", label: "Cliente",
      icon: <UserRound className="w-4 h-4 text-muted-foreground" />,
      disponivel: clientesDisponiveis.length > 0,
      ativo: clienteFiltro !== "",
      limpar: () => setClienteFiltro(""),
      render: () => (
        <ComboboxWithCreate
          value={clienteFiltro}
          onChange={setClienteFiltro}
          noneLabel="Todos os clientes"
          placeholder="Cliente"
          triggerClassName={cn(CHIP_TRIGGER, "w-auto max-w-[16rem] border-border bg-card")}
          menuMinWidth={460}
          options={clientesDisponiveis.map((c) => ({
            value: c.id, label: c.nome,
            render: () => (
              <span className="inline-flex items-center gap-2 w-full min-w-0">
                <span className="flex-1 truncate">{c.nome}</span>
                {bolinhasCliente(clienteStats.get(c.id))}
              </span>
            ),
          }))}
        />
      ),
    },
    {
      key: "conta", label: "Conta",
      icon: <Wallet className="w-4 h-4 text-muted-foreground" />,
      disponivel: contasDisponiveis.length > 0,
      ativo: contaFiltro !== "",
      limpar: () => setContaFiltro(""),
      render: () => (
        <ComboboxWithCreate
          value={contaFiltro}
          onChange={setContaFiltro}
          noneLabel="Todas as contas"
          placeholder="Conta"
          triggerClassName={cn(CHIP_TRIGGER, "w-auto max-w-[16rem] border-border bg-card")}
          menuMinWidth={340}
          options={contasDisponiveis.map((c) => ({ value: c.id, label: c.nome }))}
        />
      ),
    },
  ];

  // Blocos de TOTAIS (clicáveis — presets de status): moram na barra do
  // DataTable (toolbarLeft) na vista tabela — aproveitando a faixa ao lado
  // do contador/por página — e acima do gráfico na vista gráfico.
  const blocosTotais = resumo ? (() => {
        const toggle = (set: string[]) => setStatusSel((cur) => (mesmoSet(cur, set) ? STATUS_RECEBER_KEYS : set));
        return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => toggle(SET_A_RECEBER)} title="Filtrar por Vencidas + A vencer (sem vencimento fica de fora)"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-1.5 transition-shadow hover:bg-warning/20 cursor-pointer", mesmoSet(statusSel, SET_A_RECEBER) && "ring-2 ring-warning")}>
            <span className="text-xs font-medium text-warning">A Receber</span>
            <span className="text-sm font-bold text-warning tabular-nums">{formatBRL(totais.aReceber)}</span>
          </button>
          <button type="button" onClick={() => toggle(SET_VENCIDO)} title="Filtrar por Vencidas"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-1.5 transition-shadow hover:bg-danger/20 cursor-pointer", mesmoSet(statusSel, SET_VENCIDO) && "ring-2 ring-danger")}>
            <span className="text-xs font-medium text-danger">Vencido</span>
            <span className="text-sm font-bold text-danger tabular-nums">{formatBRL(totais.vencido)}</span>
          </button>
          <button type="button" onClick={() => toggle(SET_A_VENCER)} title="Filtrar por A vencer"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-1.5 transition-shadow hover:bg-sky-500/20 cursor-pointer", mesmoSet(statusSel, SET_A_VENCER) && "ring-2 ring-sky-500")}>
            <span className="text-xs font-medium text-sky-700 dark:text-sky-300">A vencer</span>
            <span className="text-sm font-bold text-sky-700 dark:text-sky-300 tabular-nums">{formatBRL(totais.aVencer)}</span>
          </button>
          <button type="button" onClick={() => toggle(SET_SEM_VENC)} title="Filtrar por Sem vencimento"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-violet-500/10 px-3 py-1.5 transition-shadow hover:bg-violet-500/20 cursor-pointer", mesmoSet(statusSel, SET_SEM_VENC) && "ring-2 ring-violet-500")}>
            <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Sem vencimento</span>
            <span className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums">{formatBRL(totais.semVenc)}</span>
          </button>
          <button type="button" onClick={() => toggle(SET_PAGO)} title="Filtrar por Recebidas"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-1.5 transition-shadow hover:bg-success/20 cursor-pointer", mesmoSet(statusSel, SET_PAGO) && "ring-2 ring-success")}>
            <span className="text-xs font-medium text-success">Recebido no mês</span>
            <span className="text-sm font-bold text-success tabular-nums">{formatBRL(totais.recebidoMes)}</span>
          </button>
        </div>
        );
      })() : null;

  return (
    <>
      <div className="space-y-2">
      {/* Linha 1 (estilo Notion): busca à esquerda; ícones (filtros, agrupar) +
          novo lançamento à direita. Os FILTROS viram chips numa linha própria,
          revelada pelo funil ou por filtro ativo. */}
      <div className="flex items-start gap-2">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {/* Busca (mesmo padrão das listagens: à esquerda, com limpar). */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar número, cliente…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          {busca && (
            <button type="button" onClick={() => setBusca("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground" title="Limpar busca">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Recorte de data (padrão: MÊS) — igual ao Contas a Pagar. Clicar no
            rótulo alterna Todos ↔ mês atual; período custom (chip) desliga. */}
        {modoMes && (
          <div className="inline-flex items-center h-9 rounded-lg border border-border bg-card overflow-hidden">
            <button type="button" onClick={() => mudarMes(-1)} disabled={mes === "TODOS"}
              className="h-full px-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Mês anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button"
              onClick={() => setMes((m) => m === "TODOS"
                ? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
                : "TODOS")}
              title="Mês do vencimento — inclui o vencido em aberto dos meses anteriores. Clique para alternar Todos ↔ mês atual."
              className="h-full px-2 min-w-[6.5rem] text-xs font-medium text-foreground hover:bg-muted capitalize">
              {mes === "TODOS" ? "Todos os meses" : (() => {
                const [a, m] = mes.split("-").map(Number);
                return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              })()}
            </button>
            <button type="button" onClick={() => mudarMes(1)} disabled={mes === "TODOS"}
              className="h-full px-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="Próximo mês">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* SALDO de todo o CR (em aberto, inclusive sem vencimento) — não muda
            com o mês nem com os filtros. */}
        <div className="inline-flex items-center gap-2 h-9 rounded-lg bg-muted px-3"
          title="Saldo em aberto de todo o Contas a Receber (inclui sem vencimento; não muda com mês/filtros)">
          <span className="text-xs font-medium text-foreground">Saldo</span>
          <span className="text-sm font-bold text-foreground tabular-nums">{formatBRL(saldoTotal)}</span>
        </div>
      </div>
        {/* Funil: mostra/esconde a linha de chips (filtros seguem ativos). */}
        <FilterBarToggle bar={filterBar} chips={chipsFiltro} />
        {/* Agrupamento: só o ícone (o rótulo atual vira tooltip). */}
        <FilterSelect
          value={agrupamento}
          onChange={(v) => setAgrupamento(v as "none" | "vencimento" | "cliente")}
          active={agrupamento !== "none"}
          icon={<Layers className="w-4 h-4" />}
          iconOnly
          className="shrink-0"
          menuWidth="w-48"
          options={[
            { value: "none", label: "Não agrupar" },
            { value: "vencimento", label: "Por vencimento" },
            { value: "cliente", label: "Por cliente" },
          ]}
        />
        {/* Vista: tabela × quadro (por situação) × gráfico (barras por vencimento). */}
        <div className="inline-flex items-center h-9 rounded-lg border border-border overflow-hidden shrink-0">
          <button type="button" onClick={() => setVista("tabela")} title="Ver em tabela"
            className={cn("h-full px-2.5 inline-flex items-center transition-colors",
              vista === "tabela" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>
            <Table2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setVista("quadro")} title="Ver em quadro (por situação)"
            className={cn("h-full px-2.5 inline-flex items-center transition-colors",
              vista === "quadro" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>
            <Kanban className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setVista("grafico")} title="Ver as contas por vencimento em gráfico"
            className={cn("h-full px-2.5 inline-flex items-center transition-colors",
              vista === "grafico" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>
            <ChartNoAxesCombined className="w-4 h-4" />
          </button>
        </div>
        <NovaContaButton tipo="receber" />
      </div>
      {/* Linha de CHIPS de filtro (padrão do sistema — shared/FilterBar). */}
      <FilterBarChips bar={filterBar} chips={chipsFiltro} />

      </div>
      {vista === "grafico" ? (
        <div className="space-y-2">
        {blocosTotais}
        <TitulosGrafico
          pontos={pontosGrafico}
          titulo="Contas a receber por vencimento"
          subtitulo="Respeita os filtros da tela, inclusive o recorte de mês/período."
          parceiroHeader="Cliente"
          rotuloPago="Recebido"
          granKey="financeiro:contas-receber:grafico-gran"
          onAbrirTitulo={(tituloId) => {
            const c = contas.find((x) => x.id === tituloId);
            if (c) setDetalhe(c);
          }}
        />
        </div>
      ) : vista === "quadro" ? (
        <div>
          {/* Sem os blocos de totais: as colunas já trazem contagem e total. */}
          <TitulosKanban
            tipo="receber"
            itens={contasFiltradas.map((c): TituloKanban => {
              const valor = decimalToNumber(c.valorOriginal) + decimalToNumber(c.valorMulta ?? 0) + decimalToNumber(c.valorJuros ?? 0);
              return {
                id: c.id, numero: c.numero,
                fornecedor: c.cliente?.razaoSocial ?? null,
                descricao: c.descricao,
                valor, saldo: Math.max(0, valor - decimalToNumber(c.valorPago)),
                vencimento: c.dataVencimento ?? null,
                status: c.status,
                compra: origemReceber(c).ref,
                antecipado: false,
                selecionavel: podeSelecionar(c),
              };
            })}
            onAbrir={(id) => { const c = contas.find((x) => x.id === id); if (c) setDetalhe(c); }}
            selecionados={selIds}
            onToggleSelecao={toggleSel}
            onSoltarBaixa={(id, modo) => {
              const c = contas.find((x) => x.id === id);
              if (c) comGuardaEmpresa(c, () => { void abrir(c, modo === "parcial"); })();
            }}
          />
        </div>
      ) : (
      <DataTable
        data={contasFiltradas}
        columns={colsParaTabela}
        hideSearch
        columnConfig
        itemLabel="título"
        toolbarLeft={blocosTotais}
        containerClassName="shadow-md rounded-xl"
        headerClassName="bg-muted"
        focusId={focusId}
        getRowId={(c) => c.id}
        onRowClick={(row) => setDetalhe(row)}
        groupBy={groupByFn}
        renderGroupHeader={renderGrupoHeader}
        stickyFirstColumn
      />
      )}
      {/* Barra de seleção (recebimento em lote) — fixa no rodapé enquanto há seleção. */}
      {selecionadas.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
          <span className="text-sm">
            <b>{selecionadas.length}</b> selecionado{selecionadas.length !== 1 ? "s" : ""} · <span className="font-semibold tabular-nums">{formatBRL(totalSelecionado)}</span>
          </span>
          {(() => {
            const visiveis = contasFiltradas.filter(podeSelecionar).map((c) => c.id);
            const faltam = visiveis.filter((id) => !selIds.includes(id));
            return faltam.length > 0 ? (
              <button type="button" onClick={() => setSelIds((prev) => [...prev, ...faltam].slice(0, 200))} className="text-xs text-info hover:underline">
                Selecionar todos os visíveis ({visiveis.length})
              </button>
            ) : null;
          })()}
          <Button size="sm" onClick={() => setLoteAberto(true)}>
            <Wallet className="w-4 h-4" /> Receber selecionados
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelIds([])}>Limpar</Button>
        </div>
      )}
      {detalhe && (() => {
        const podeReceber = detalhe.status !== "PAGA" && detalhe.status !== "CANCELADA";
        const podeEstornar = detalhe.status === "PAGA" || detalhe.status === "PARCIAL";
        const vo = decimalToNumber(detalhe.valorOriginal);
        const vp = decimalToNumber(detalhe.valorPago);
        const contas = detalhe.contasContrapartida ?? [];
        const org = origemReceber(detalhe);
        // Empresa dona do título (modo grupo) — só faz sentido p/ quem vê 2+.
        const nomeEmpresa = empresasSessao.length > 1 && detalhe.empresaId
          ? empresasSessao.find((e) => e.id === detalhe.empresaId)?.nome ?? null
          : null;
        // Encargos ACUMULADOS nas baixas — só aparecem quando > 0.
        const vJuros = decimalToNumber(detalhe.valorJuros ?? 0);
        const vMulta = decimalToNumber(detalhe.valorMulta ?? 0);
        const vTaxa = decimalToNumber(detalhe.valorTaxa ?? 0);
        // Taxa retida com a travada "descontos-concedidos" = desconto na baixa.
        const taxaEhDesconto = !!descontoNatureza && detalhe.taxaNaturezaId === descontoNatureza.id;
        // Emissão do título; sem ela cai na data de criação.
        const emissao = detalhe.dataEmissao ?? detalhe.createdAt ?? null;
        // Naturezas: split com valores (uma linha por natureza); sem split, a
        // natureza única do título (legado).
        const natLinhas = (detalhe.naturezas ?? []).filter((l) => l.naturezaFinanceira);
        const rotuloNat = (n: { codigo?: string | null; nome: string }) => `${n.codigo ? `${n.codigo} ` : ""}${n.nome}`;
        // Ordem lógica: identificação → datas → valores → classificação → origem.
        const campos: TituloCampo[] = [
          // ── Identificação ────────────────────────────────────────────────
          ...(nomeEmpresa ? [{ label: "Empresa", valor: nomeEmpresa }] : []),
          { label: "Cliente", valor: renderCliente(detalhe, "font-medium") },
          { label: "Descrição", valor: detalhe.descricao || "—", full: true },
          { label: "Parcela", valor: detalhe.parcelaTotal && detalhe.parcelaTotal > 1 ? `${detalhe.parcelaNumero ?? 1}/${detalhe.parcelaTotal}` : "Única" },
          // ── Datas ────────────────────────────────────────────────────────
          ...(emissao ? [{ label: "Emissão", valor: formatDate(emissao) }] : []),
          { label: "Vencimento", valor: <span className={isVencida(detalhe.dataVencimento, detalhe.dataPagamento) ? "text-danger font-medium" : undefined}>{detalhe.dataVencimento ? formatDate(detalhe.dataVencimento) : "A combinar"}</span> },
          ...(detalhe.dataPagamento ? [{ label: "Recebimento", valor: formatDate(detalhe.dataPagamento) }] : []),
          // ── Valores ──────────────────────────────────────────────────────
          { label: "Valor original", valor: formatBRL(vo) },
          { label: "Recebido", valor: formatBRL(vp) },
          { label: "Saldo", valor: <span className="font-medium">{formatBRL(vo - vp)}</span> },
          ...(vJuros > 0 ? [{ label: "Juros", valor: formatBRL(vJuros) }] : []),
          ...(vMulta > 0 ? [{ label: "Multa", valor: formatBRL(vMulta) }] : []),
          ...(vTaxa > 0 ? [{ label: taxaEhDesconto ? "Desconto" : "Taxa retida", valor: formatBRL(vTaxa) }] : []),
          // ── Classificação ────────────────────────────────────────────────
          // Centro de custo — SOMENTE LEITURA (definido no material/título, não aqui).
          { label: "Centro de custo", valor: <span className="text-muted-foreground">{detalhe.centroCusto ? `${detalhe.centroCusto.codigo} - ${detalhe.centroCusto.nome}` : "—"}</span> },
          ...(natLinhas.length || detalhe.naturezaFinanceira ? [{
            label: natLinhas.length > 1 ? "Naturezas" : "Natureza", full: true,
            valor: natLinhas.length ? (
              <div className="space-y-0.5">
                {natLinhas.map((l, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {rotuloNat(l.naturezaFinanceira!)}
                      {l.detalhamento ? <span className="text-muted-foreground"> · {l.detalhamento}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatBRL(decimalToNumber(l.valor))}</span>
                  </div>
                ))}
              </div>
            ) : rotuloNat(detalhe.naturezaFinanceira!),
          }] : []),
          ...(contas.length ? [{ label: "Conta", valor: contas.map((c) => c.nome).join(" + ") }] : []),
          // ── Origem ───────────────────────────────────────────────────────
          // Origem: o número do documento (PV-xxxx) com link para o pedido; sem
          // número, o rótulo (Manual, Recorrência, Encontro de Contas…).
          { label: "Origem", valor: org.ref && org.href ? (
            <button type="button" onClick={() => router.push(org.href!)}
              className="inline-flex items-center gap-1 text-info hover:underline" title={`${org.label} — abrir`}>
              <ExternalLink className="w-3.5 h-3.5" /> <span className="font-mono">{org.ref}</span>
            </button>
          ) : org.ref ? <span className="font-mono">{org.ref}</span> : org.label },
          ...(detalhe.observacoes ? [{ label: "Observações", valor: detalhe.observacoes, full: true }] : []),
        ];
        const acoes: TituloAcao[] = [
          ...(podeReceber ? [{ label: "Receber", tone: "primary" as const, icon: <Wallet className="w-4 h-4" />, onClick: () => abrir(detalhe) }] : []),
          ...(isAdmin ? [{ label: "Editar", icon: <Pencil className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); setEditar(r); } }] : []),
          ...(podeEstornar ? [{ label: "Estornar", tone: "danger" as const, icon: <RotateCcw className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); estornar(r); } }] : []),
        ];
        return (
          <TituloDetalhesDialog
            open={!!detalhe}
            onOpenChange={(o) => !o && setDetalhe(null)}
            numero={detalhe.numero}
            status={detalhe.status}
            campos={campos}
            acoes={acoes.map((a) => ({ ...a, onClick: comGuardaEmpresa(detalhe, a.onClick) }))}
            anexosApiBase={`/api/contas-receber/${detalhe.id}/anexos`}
            criadoPor={detalhe.criadoPor}
            atualizadoPor={detalhe.atualizadoPor}
          />
        );
      })()}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            {selected && <p className="text-sm text-muted-foreground">{selected.numero}{selected.cliente ? ` · ${selected.cliente.razaoSocial}` : ""} — Saldo: {formatBRL(decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago))}</p>}
          </DialogHeader>
          {/* Origem e classificação (somente leitura) — o receber não reclassifica na baixa. */}
          {selected && (() => {
            const org = origemReceber(selected);
            const nat = selected.naturezaFinanceira;
            return (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Origem</span><span className="text-foreground font-mono">{org.ref ?? org.label}</span></div>
                <div className="min-w-0"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Natureza</span><span className="text-foreground block truncate">{nat ? `${nat.codigo ? `${nat.codigo} ` : ""}${nat.nome}` : "—"}</span></div>
                <div className="min-w-0"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Centro de custo</span><span className="text-foreground block truncate">{selected.centroCusto ? `${selected.centroCusto.codigo} ${selected.centroCusto.nome}` : "—"}</span></div>
              </div>
            );
          })()}
          {selected && (
            <PagamentoTituloForm
              key={selected.id}
              tipo="receber"
              titulo={{
                id: selected.id,
                numero: selected.numero,
                valorOriginal: decimalToNumber(selected.valorOriginal),
                valorPago: decimalToNumber(selected.valorPago),
                formaPagamentoPrevista: formaPrevista,
              }}
              formas={formas}
              contas={contasBanco}
              naturezas={[]}
              centros={[]}
              taxaNaturezas={taxaNaturezas}
              descontoNatureza={descontoNatureza}
              linhasIniciais={linhasIniciais}
              validarExtra={validarBaixa}
              valorVazio={abrirParcial}
              onPago={() => { setSelected(null); router.refresh(); }}
              onCancelar={() => setSelected(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Recebimento em lote dos títulos selecionados. */}
      {loteAberto && (
        <PagamentoLoteDialog
          tipo="receber"
          titulos={titulosLote}
          formas={formas}
          contas={contasBanco}
          onClose={() => setLoteAberto(false)}
          onConcluido={() => { setSelIds([]); router.refresh(); }}
        />
      )}

      {/* Edição do título em pop-up (mesma tela) */}
      <EditarTituloDialog
        tipo="receber"
        titulo={editar ? { ...editar, clienteId: editar.cliente?.id ?? null } : null}
        origemInfo={editar ? (() => {
          const org = origemReceber(editar);
          return {
            origem: `${org.label}${org.ref ? ` · ${org.ref}` : ""}`,
            tes: "—", // TES é do fluxo de compras — não se aplica ao receber
            centro: editar.centroCusto ? `${editar.centroCusto.codigo} ${editar.centroCusto.nome}` : "—",
          };
        })() : null}
        onOpenChange={(o) => !o && setEditar(null)}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
