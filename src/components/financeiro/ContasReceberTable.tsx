"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable, { type GroupInfo } from "@/components/shared/DataTable";
import { usePersistedState } from "@/lib/use-persisted-state";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { formatBRL, formatDate, decimalToNumber, isVencida, cn } from "@/lib/utils";
import { CalendarClock, Building2, Wallet, RotateCcw, ExternalLink, Pencil, MoreVertical, Search, X, Layers, UserRound, BookOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import FilterSelect from "@/components/shared/FilterSelect";
import CheckboxFilter from "@/components/shared/CheckboxFilter";
import DateRangePicker, { type DateRange } from "@/components/shared/DateRangePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import TituloDetalhesDialog, { type TituloCampo, type TituloAcao } from "@/components/financeiro/TituloDetalhesDialog";
import EditarTituloDialog from "@/components/financeiro/EditarTituloDialog";
import { useSession } from "@/lib/session-context";
import DatePicker from "@/components/shared/DatePicker";
import PagamentosInput, {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma, pagamentoContaInvalida,
  contaEhCaixa, formaEhCartao, formaEhDinheiro, temContaBanco,
  pagamentoCartaoSemMaquineta, fetchMaquinetas,
} from "@/components/pedidos-venda/PagamentosInput";

type ContaRow = {
  id: string; numero: string; descricao: string; status: string;
  parcelaNumero?: number | null; parcelaTotal?: number | null;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  dataEmissao?: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  cliente: { id: string; razaoSocial: string };
  // Conta analítica de Clientes a Receber (1.1.2.x) — link p/ o razão do cliente.
  clienteContaId?: string | null;
  contasContrapartida?: { id: string; nome: string }[];
  pedidoVenda?: { id: string; numero: string } | null;
  centroCusto?: { codigo: string; nome: string } | null; centroCustoId?: string | null;
  recorrenciaId?: string | null; compensacaoOrigemId?: string | null; intragrupo?: boolean;
  naturezaFinanceiraId?: string | null; observacoes?: string | null; beneficiarioTipo?: string | null; beneficiarioId?: string | null;
  criadoPor?: string | null; atualizadoPor?: string | null;
};

// Documento de ORIGEM do título a receber: pedido de venda, encontro de contas,
// recorrência, intragrupo — ou avulso (manual).
function origemReceber(c: ContaRow): { label: string; ref: string | null; pedidoId?: string | null } {
  if (c.pedidoVenda) return { label: "Pedido de Venda", ref: c.pedidoVenda.numero, pedidoId: c.pedidoVenda.id };
  if (c.compensacaoOrigemId) return { label: "Encontro de Contas", ref: null };
  if (c.recorrenciaId) return { label: "Recorrência", ref: null };
  if (c.intragrupo) return { label: "Intragrupo", ref: null };
  return { label: "Manual", ref: null };
}

// Naturezas TRAVADAS do sistema elegíveis para a taxa/tarifa RETIDA na baixa
// (vêm do GET de naturezas com sistema=true). A ordem das chaves define o
// default do lado: no receber, taxa de cartão primeiro.
type TaxaNaturezaOpt = { id: string; nome: string; sistema?: boolean; sistemaChave?: string | null };
const CHAVES_TAXA_RECEBER = ["taxa-cartao", "tarifa-bancaria"] as const;
function filtrarTaxaNaturezas(arr: TaxaNaturezaOpt[]): TaxaNaturezaOpt[] {
  return CHAVES_TAXA_RECEBER
    .map((ch) => arr.find((n) => n.sistema === true && n.sistemaChave === ch))
    .filter((n): n is TaxaNaturezaOpt => !!n);
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
  const [contaFiltro, setContaFiltro] = usePersistedState<string>("financeiro:contas-receber:conta", "");
  // Busca na barra de filtros (vale para a tabela E para a visão agrupada).
  const [busca, setBusca] = useState("");
  // Período por data de vencimento (persistido por usuário — padrão do sistema).
  const [periodo, setPeriodo] = usePersistedState<DateRange>("financeiro:contas-receber:periodo", { from: "", to: "" });
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
  const contasBase = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) => {
      if (contaFiltro !== "" && !(c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)) return false;
      if (clienteFiltro !== "" && c.cliente?.id !== clienteFiltro) return false;
      if (!dentroDoPeriodo(c, periodo)) return false;
      if (!q) return true;
      const o = origemReceber(c);
      return [c.numero, c.cliente?.razaoSocial, c.descricao, o.ref, o.label]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [contas, contaFiltro, clienteFiltro, busca, periodo]);
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
    return { emAberto, vencido, aVencer, semVenc, recebidoMes };
  }, [contasBase]);
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [detalhe, setDetalhe] = useState<ContaRow | null>(null);
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contasBanco, setContasBanco] = useState<ContaOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Encargos da baixa: juros/multa ENTRAM no caixa além do título; a taxa/tarifa
  // é RETIDA (recebe MENOS) — o título é quitado por linhas + taxa e a taxa vira
  // despesa com natureza travada do sistema.
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [taxa, setTaxa] = useState("");
  const [taxaNaturezaId, setTaxaNaturezaId] = useState("");
  const [taxaNaturezas, setTaxaNaturezas] = useState<TaxaNaturezaOpt[]>([]);
  // Pagamentos registrados no pedido de origem do título selecionado (forma +
  // valor por linha) — pré-preenchem a baixa e alimentam o backstop do Caixa.
  const [pedidoPags, setPedidoPags] = useState<PedidoPag[]>([]);
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
    // Naturezas travadas do sistema para a taxa/tarifa retida (taxa de cartão,
    // tarifa bancária — ambas SAIDA).
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json()).then((j) => {
      const arr = Array.isArray(j) ? j : (j.data ?? []);
      setTaxaNaturezas(filtrarTaxaNaturezas(arr));
    }).catch(() => {});
  }, []);

  const saldo = selected ? decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago) : 0;

  function abrir(row: ContaRow) {
    setSelected(row);
    setErro(null);
    setDataPag(new Date().toISOString().split("T")[0]);
    const s = decimalToNumber(row.valorOriginal) - decimalToNumber(row.valorPago);
    setLinhas([novaLinhaPagamento("", contaPadraoParaForma("", formas, contasBanco), s > 0 ? s.toFixed(2).replace(".", ",") : "")]);
    // Encargos sempre zerados ao reabrir o modal.
    setJuros(""); setMulta(""); setTaxa(""); setTaxaNaturezaId("");
    // Título nascido de pedido: pré-preenche as linhas com os pagamentos
    // registrados nele (ex.: 44,00 dinheiro + 0,50 cartão vira duas linhas,
    // cada uma na sua conta) — sem isso a baixa abre numa linha única e o
    // valor eletrônico acaba caindo inteiro no Caixa.
    setPedidoPags([]);
    if (!row.pedidoVenda) return;
    const seq = ++abrirSeq.current;
    fetch(`/api/contas-receber/${row.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (seq !== abrirSeq.current) return; // modal já reaberto para outro título
        const pags: PedidoPag[] = j?.data?.pedidoVenda?.pagamentos ?? [];
        if (pags.length === 0) return;
        setPedidoPags(pags);
        // Só substitui as linhas quando o espelho é exato: título ainda sem
        // baixa e soma dos pagamentos igual ao saldo (parcial/encargo não tem
        // como ratear automaticamente).
        const soma = pags.reduce((t, p) => t + decimalToNumber(p.valor), 0);
        if (decimalToNumber(row.valorPago) > 0.005 || Math.abs(soma - s) > 0.005) return;
        setLinhas(pags.map((p) => novaLinhaPagamento(
          p.forma,
          p.contaBancariaId ?? contaPadraoParaForma(p.forma, formas, contasBanco),
          decimalToNumber(p.valor).toFixed(2).replace(".", ","),
        )));
        // Linha de cartão: sugere a maquineta quando a empresa só tem uma (com
        // 2+ o operador escolhe — o PagamentosInput destaca até escolher).
        if (pags.some((p) => formaEhCartao(p.forma, formas))) {
          fetchMaquinetas().then((ms) => {
            if (seq !== abrirSeq.current || ms.length !== 1) return;
            setLinhas((prev) => prev.map((l) =>
              formaEhCartao(l.forma, formas) && !l.maquinetaId ? { ...l, maquinetaId: ms[0].id, contaBancariaId: "" } : l,
            ));
          });
        }
      })
      .catch(() => {});
  }

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
              <DropdownMenuItem onClick={() => abrir(c)}>
                <Wallet className="w-4 h-4 text-emerald-600" /> Receber
              </DropdownMenuItem>
            )}
            {podeEstornar && (
              <DropdownMenuItem onClick={() => estornar(c)}>
                <RotateCcw className="w-4 h-4 text-amber-600" /> Estornar
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem onClick={() => setEditar(c)}>
                <Pencil className="w-4 h-4" /> Editar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.numero}</span> },
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
      return o.pedidoId ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/pedidos-venda/${o.pedidoId}`); }}
          className="font-mono text-xs text-info hover:underline"
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
      meta: { className: "whitespace-nowrap" },
      cell: ({ row }) => {
        const d = row.original.dataEmissao ?? null;
        return d ? <span className="text-muted-foreground">{formatDate(d)}</span> : <span className="text-muted-foreground/60">—</span>;
      },
    },
    {
      accessorKey: "dataVencimento",
      header: "Vencimento",
      meta: { className: "whitespace-nowrap" },
      cell: ({ row }) => {
        if (!row.original.dataVencimento) return <span className="text-muted-foreground italic">A combinar</span>;
        const vencida = isVencida(row.original.dataVencimento, row.original.dataPagamento);
        return <span className={vencida ? "text-danger font-medium" : "text-muted-foreground"}>{formatDate(row.original.dataVencimento)}</span>;
      },
    },
    { accessorKey: "valorOriginal", header: "Valor", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.valorOriginal))}</span> },
    { accessorKey: "valorPago", header: "Pago", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="text-success">{formatBRL(decimalToNumber(row.original.valorPago))}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => (
      <StatusBadge status={
        !row.original.dataVencimento && (row.original.status === "ABERTA" || row.original.status === "PARCIAL")
          ? "SEM_VENCIMENTO"
          : row.original.status
      } />
    ) },
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
  ], [contasBanco, isAdmin]);

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

  async function handlePagamento() {
    if (!selected) return;
    // Linha de cartão com maquineta: envia maquinetaId e NÃO envia conta — a
    // conta efetiva (administradora) e a taxa retida são derivadas no back.
    const pagamentos = linhas
      .filter((l) => parseValorBR(l.valor) > 0)
      .map((l) => {
        const comMaquineta = !!l.maquinetaId && formaEhCartao(l.forma, formas);
        return {
          forma: l.forma || null,
          contaBancariaId: comMaquineta ? null : (l.contaBancariaId || null),
          valor: parseValorBR(l.valor),
          ...(comMaquineta ? { maquinetaId: l.maquinetaId } : {}),
        };
      });
    if (pagamentos.length === 0) { setErro("Informe ao menos uma forma com valor."); return; }
    const cartaoSemMaq = pagamentoCartaoSemMaquineta(linhas, formas);
    if (cartaoSemMaq) {
      setErro(`Escolha a maquineta para "${cartaoSemMaq.forma}" — a conta e a taxa do cartão derivam dela.`);
      return;
    }
    const contaRuim = pagamentoContaInvalida(linhas, formas, contasBanco);
    if (contaRuim) {
      setErro(`Selecione a conta bancária de destino para "${contaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem cair no Caixa em Dinheiro.`);
      return;
    }
    // Encargos: juros/multa entram no caixa; taxa é retida (natureza travada).
    const vJuros = parseValorBR(juros);
    const vMulta = parseValorBR(multa);
    const vTaxa = parseValorBR(taxa);
    if (vJuros < 0 || vMulta < 0 || vTaxa < 0) { setErro("Juros, multa e taxa não podem ser negativos."); return; }
    // Backstop do pedido: a trava acima depende da FORMA da linha — uma linha
    // sem forma escapa dela. Se o pedido registrou parte eletrônica, o que for
    // roteado para o Caixa (conta tipo CAIXA ou linha sem conta, que o back
    // resolve para o caixa da empresa) não pode passar do dinheiro do pedido
    // mais os encargos desta baixa.
    if (temContaBanco(contasBanco) && pedidoPags.length > 0) {
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
      if (eletronicoPedido > 0.005 && paraCaixa > dinheiroPedido + vJuros + vMulta + 0.005) {
        setErro(`O pedido registrou ${formatBRL(eletronicoPedido)} em formas eletrônicas — esse valor não pode cair no Caixa em Dinheiro. Direcione-o para a conta do cartão/banco.`);
        return;
      }
    }
    setSaving(true); setErro(null);
    const res = await fetch(`/api/contas-receber/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagamentos, dataPagamento: dataPag, valorMulta: vMulta, valorJuros: vJuros,
        valorTaxa: vTaxa,
        taxaNaturezaId: vTaxa > 0 ? (taxaNaturezaId || taxaNaturezas[0]?.id || null) : null,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Erro ao receber."); return; }
    setSelected(null);
    router.refresh();
  }

  const totalInformado = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);

  return (
    <>
      <div className="space-y-2">
      {/* Linha 1: todos os filtros + botão de novo lançamento (canto sup. direito). */}
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
        {/* Status: múltipla escolha (checkboxes) no estilo das listagens. */}
        <CheckboxFilter
          values={statusSel}
          onChange={setStatusSel}
          noun="status"
          options={STATUS_RECEBER.map((f) => ({
            value: f.key,
            label: f.label,
            hint: String(contas.filter((c) => casaStatus(c, f.key)).length),
          }))}
        />
        {/* Agrupamento: um único dropdown (Não agrupar / Vencimento / Cliente). */}
        <FilterSelect
          value={agrupamento}
          onChange={(v) => setAgrupamento(v as "none" | "vencimento" | "cliente")}
          active={agrupamento !== "none"}
          icon={<Layers className="w-3.5 h-3.5" />}
          menuWidth="w-48"
          options={[
            { value: "none", label: "Não agrupar" },
            { value: "vencimento", label: "Por vencimento" },
            { value: "cliente", label: "Por cliente" },
          ]}
        />
        {/* Período por data de vencimento. */}
        <DateRangePicker value={periodo} onChange={setPeriodo} placeholder="Período (vencimento)" />
        {/* Cliente (da lista carregada). */}
        {clientesDisponiveis.length > 0 && (
          <div className="w-80">
            <ComboboxWithCreate
              value={clienteFiltro}
              onChange={setClienteFiltro}
              noneLabel="Todos os clientes"
              placeholder="Cliente"
              triggerClassName="h-9 rounded-lg"
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
          </div>
        )}
        {contasDisponiveis.length > 0 && (
          <div className="w-64">
            <ComboboxWithCreate
              value={contaFiltro}
              onChange={setContaFiltro}
              noneLabel="Todas as contas"
              triggerClassName="h-9 rounded-lg"
              menuMinWidth={340}
              options={contasDisponiveis.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
        )}
      </div>
        <NovaContaButton tipo="receber" />
      </div>
      {/* Linha 2: totais em blocos compactos coloridos — clicáveis, cada um
          aplica o preset de status (toggle: reclicar marca todos os status). */}
      {resumo && (() => {
        const toggle = (set: string[]) => setStatusSel((cur) => (mesmoSet(cur, set) ? STATUS_RECEBER_KEYS : set));
        return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => toggle(SET_ABERTO)} title="Filtrar por Em aberto"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-info/10 px-3 py-1.5 transition-shadow hover:bg-info/20 cursor-pointer", mesmoSet(statusSel, SET_ABERTO) && "ring-2 ring-info")}>
            <span className="text-xs font-medium text-info">Em aberto</span>
            <span className="text-sm font-bold text-info tabular-nums">{formatBRL(totais.emAberto)}</span>
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
      })()}
      </div>
      <DataTable
        data={contasFiltradas}
        columns={colsParaTabela}
        hideSearch
        columnConfig
        itemLabel="título"
        containerClassName="shadow-md rounded-xl"
        headerClassName="bg-muted"
        focusId={focusId}
        getRowId={(c) => c.id}
        onRowClick={(row) => setDetalhe(row)}
        groupBy={groupByFn}
        renderGroupHeader={renderGrupoHeader}
      />
      {detalhe && (() => {
        const podeReceber = detalhe.status !== "PAGA" && detalhe.status !== "CANCELADA";
        const podeEstornar = detalhe.status === "PAGA" || detalhe.status === "PARCIAL";
        const vo = decimalToNumber(detalhe.valorOriginal);
        const vp = decimalToNumber(detalhe.valorPago);
        const contas = detalhe.contasContrapartida ?? [];
        const org = origemReceber(detalhe);
        const campos: TituloCampo[] = [
          { label: "Cliente", valor: renderCliente(detalhe, "font-medium"), full: true },
          { label: "Origem", full: true, valor: org.label },
          // Pedido de venda clicável — abre o pedido de origem.
          ...(detalhe.pedidoVenda ? [{
            label: "Pedido de venda", full: true,
            valor: (
              <button type="button" onClick={() => router.push(`/pedidos-venda/${detalhe.pedidoVenda!.id}`)}
                className="inline-flex items-center gap-1 text-info hover:underline font-medium">
                <ExternalLink className="w-3.5 h-3.5" /> {detalhe.pedidoVenda.numero}
              </button>
            ),
          }] : []),
          { label: "Descrição", valor: detalhe.descricao || "—", full: true },
          // Centro de custo — SOMENTE LEITURA (definido no material/título, não aqui).
          { label: "Centro de custo", valor: <span className="text-muted-foreground">{detalhe.centroCusto ? `${detalhe.centroCusto.codigo} - ${detalhe.centroCusto.nome}` : "—"}</span> },
          { label: "Vencimento", valor: <span className={isVencida(detalhe.dataVencimento, detalhe.dataPagamento) ? "text-danger font-medium" : undefined}>{formatDate(detalhe.dataVencimento)}</span> },
          { label: "Valor", valor: formatBRL(vo) },
          { label: "Recebido", valor: formatBRL(vp) },
          { label: "Saldo", valor: <span className="font-medium">{formatBRL(vo - vp)}</span> },
          ...(detalhe.dataPagamento ? [{ label: "Recebimento", valor: formatDate(detalhe.dataPagamento) }] : []),
          ...(contas.length ? [{ label: "Conta", valor: contas.map((c) => c.nome).join(" + "), full: true }] : []),
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
            acoes={acoes}
            criadoPor={detalhe.criadoPor}
            atualizadoPor={detalhe.atualizadoPor}
          />
        );
      })()}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            {selected && <p className="text-sm text-muted-foreground">{selected.numero} — Saldo: {formatBRL(saldo)}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Data do Recebimento</Label>
              <DatePicker value={dataPag} onChange={(v) => setDataPag(v)} className="mt-1 w-full" />
            </div>
            <PagamentosInput
              linhas={linhas}
              setLinhas={setLinhas}
              formas={formas}
              contas={contasBanco}
              total={saldo}
              usarMaquinetas
            />
            {/* Encargos da baixa: juros/multa entram no caixa além do título; a
                taxa/tarifa é retida (recebe MENOS) — quitação = linhas + taxa. */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Encargos (opcional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Juros (R$)</Label>
                  <Input value={juros} onChange={(e) => setJuros(e.target.value)} placeholder="0,00" className="mt-1 h-9 text-right font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Multa (R$)</Label>
                  <Input value={multa} onChange={(e) => setMulta(e.target.value)} placeholder="0,00" className="mt-1 h-9 text-right font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <div>
                  <Label className="text-xs">Taxa/tarifa retida (R$)</Label>
                  <Input value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="0,00" className="mt-1 h-9 text-right font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Natureza da taxa</Label>
                  <select
                    value={taxaNaturezaId || taxaNaturezas[0]?.id || ""}
                    onChange={(e) => setTaxaNaturezaId(e.target.value)}
                    disabled={taxaNaturezas.length === 0}
                    className="mt-1 w-full h-9 rounded-lg border border-border px-2 text-sm bg-card disabled:opacity-50"
                  >
                    {taxaNaturezas.length === 0 && <option value="">—</option>}
                    {taxaNaturezas.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
                  </select>
                </div>
              </div>
              {(() => {
                const vJuros = parseValorBR(juros), vMulta = parseValorBR(multa), vTaxa = parseValorBR(taxa);
                if (vJuros < 0 || vMulta < 0 || vTaxa < 0) return <p className="text-[11px] text-danger">Juros, multa e taxa não podem ser negativos.</p>;
                if (vTaxa <= 0 && vJuros <= 0 && vMulta <= 0) return null;
                const caixa = totalInformado + vJuros + vMulta;
                return (
                  <p className="text-[11px] text-muted-foreground">
                    {vTaxa > 0
                      ? <>Caixa: <span className="font-medium text-foreground">{formatBRL(caixa)}</span> · Baixa do título: <span className="font-medium text-foreground">{formatBRL(totalInformado + vTaxa)}</span></>
                      : <>Caixa: <span className="font-medium text-foreground">{formatBRL(caixa)}</span> (título + juros/multa)</>}
                  </p>
                );
              })()}
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handlePagamento} disabled={saving || totalInformado <= 0}>
              {saving ? "Salvando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição do título em pop-up (mesma tela) */}
      <EditarTituloDialog
        tipo="receber"
        titulo={editar ? { ...editar, clienteId: editar.cliente?.id ?? null } : null}
        onOpenChange={(o) => !o && setEditar(null)}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
