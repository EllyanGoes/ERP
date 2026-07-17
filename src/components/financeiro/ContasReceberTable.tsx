"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import { usePersistedState } from "@/lib/use-persisted-state";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { formatBRL, formatDate, decimalToNumber, isVencida, cn } from "@/lib/utils";
import { CalendarClock, Building2, Wallet, RotateCcw, ExternalLink, Pencil, MoreVertical, Search, X, Layers } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import FilterSelect from "@/components/shared/FilterSelect";
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
  dataVencimento: Date | string; dataPagamento: Date | string | null;
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

type StatusFiltro = "TODOS" | "ABERTA" | "PARCIAL" | "VENCIDA" | "PAGA";

// Casa a conta com o filtro de status. "VENCIDA" é derivado (em aberto/parcial
// com vencimento passado), não um status do banco.
function casaStatus(c: ContaRow, f: StatusFiltro): boolean {
  switch (f) {
    case "ABERTA":  return c.status === "ABERTA";
    case "PARCIAL": return c.status === "PARCIAL";
    case "VENCIDA": return (c.status === "ABERTA" || c.status === "PARCIAL") && isVencida(c.dataVencimento, c.dataPagamento);
    case "PAGA":    return c.status === "PAGA";
    default:        return true;
  }
}

const FILTROS_RECEBER: { key: StatusFiltro; label: string }[] = [
  { key: "TODOS", label: "Todas" },
  { key: "ABERTA", label: "Em aberto" },
  { key: "PARCIAL", label: "Parciais" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "PAGA", label: "Recebidas" },
];

type Resumo = { emAberto: number; vencido: number; recebidoMes: number };

export default function ContasReceberTable({ contas, resumo }: { contas: ContaRow[]; resumo?: Resumo }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [editar, setEditar] = useState<ContaRow | null>(null);
  // Filtros persistidos por usuário (padrão do sistema — sobrevivem a trocar de aba).
  const [statusFiltro, setStatusFiltro] = usePersistedState<StatusFiltro>("financeiro:contas-receber:status", "ABERTA");
  const [contaFiltro, setContaFiltro] = usePersistedState<string>("financeiro:contas-receber:conta", "");
  // Busca na barra de filtros (vale para a tabela E para a visão agrupada).
  const [busca, setBusca] = useState("");
  // Contas de contrapartida distintas presentes na lista (para o filtro).
  const contasDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) for (const cc of c.contasContrapartida ?? []) m.set(cc.id, cc.nome);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  const contasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) => {
      if (statusFiltro !== "TODOS" && !casaStatus(c, statusFiltro)) return false;
      if (contaFiltro !== "" && !(c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)) return false;
      if (!q) return true;
      const o = origemReceber(c);
      return [c.numero, c.cliente?.razaoSocial, c.descricao, o.ref, o.label]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [contas, statusFiltro, contaFiltro, busca]);
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
  const grupos = useMemo(() => {
    if (agrupamento === "none") return [];
    const m = new Map<string, { chave: string; label: string; ordem: number | string; itens: ContaRow[] }>();
    for (const c of contasFiltradas) {
      if (agrupamento === "vencimento") {
        const d = c.dataVencimento ? new Date(c.dataVencimento) : null;
        const chave = d && !isNaN(d.getTime()) ? formatDate(c.dataVencimento) : "Sem vencimento";
        const ordem = d && !isNaN(d.getTime()) ? d.getTime() : Number.MAX_SAFE_INTEGER;
        const g = m.get(chave) ?? { chave, label: chave, ordem, itens: [] };
        g.itens.push(c);
        m.set(chave, g);
      } else {
        const nome = c.cliente?.razaoSocial ?? "Sem cliente";
        const g = m.get(nome) ?? { chave: nome, label: nome, ordem: nome.toLowerCase(), itens: [] };
        g.itens.push(c);
        m.set(nome, g);
      }
    }
    return Array.from(m.values()).sort((a, b) =>
      typeof a.ordem === "number" && typeof b.ordem === "number"
        ? a.ordem - b.ordem
        : String(a.ordem).localeCompare(String(b.ordem), "pt-BR"),
    );
  }, [agrupamento, contasFiltradas]);

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

  // Nome do cliente clicável → conta razão dele (analítica 1.1.2.x). Reusado na
  // tabela, na visão agrupada e no detalhe.
  function renderCliente(c: ContaRow, className?: string) {
    if (!c.cliente) return <span className={className}>—</span>;
    if (!c.clienteContaId) return <span className={className}>{c.cliente.razaoSocial}</span>;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); router.push(`/contabilidade/razao/${c.clienteContaId}`); }}
        className={cn("text-left hover:text-info hover:underline", className)}
        title="Abrir a conta razão do cliente"
      >
        {c.cliente.razaoSocial}
      </button>
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
      <div className="max-w-[13rem] truncate" title={row.original.cliente?.razaoSocial ?? undefined}>{renderCliente(row.original, "block truncate")}</div>
    ) },
    { accessorKey: "descricao", header: "Descrição", cell: ({ row }) => (
      <div className="max-w-[22rem] truncate text-sm" title={row.original.descricao}>{row.original.descricao}</div>
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
      accessorKey: "dataVencimento",
      header: "Vencimento",
      cell: ({ row }) => {
        const vencida = isVencida(row.original.dataVencimento, row.original.dataPagamento);
        return <span className={vencida ? "text-danger font-medium" : "text-muted-foreground"}>{formatDate(row.original.dataVencimento)}</span>;
      },
    },
    { accessorKey: "valorOriginal", header: "Valor", cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.valorOriginal))}</span> },
    { accessorKey: "valorPago", header: "Pago", cell: ({ row }) => <span className="text-success">{formatBRL(decimalToNumber(row.original.valorPago))}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
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
      cell: ({ row }) => <div className="w-10">{renderAcoes(row.original)}</div>,
    },
  ], [contasBanco, isAdmin]);

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
        {/* Status: dropdown único no estilo das listagens. */}
        <FilterSelect
          value={statusFiltro}
          onChange={(v) => setStatusFiltro(v as StatusFiltro)}
          active={statusFiltro !== "ABERTA"}
          options={FILTROS_RECEBER.map((f) => ({
            value: f.key,
            label: f.label,
            hint: String(f.key === "TODOS" ? contas.length : contas.filter((c) => casaStatus(c, f.key)).length),
          }))}
        />
        {/* Contagem de títulos filtrados. */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {contasFiltradas.length} título{contasFiltradas.length !== 1 ? "s" : ""}
        </span>
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
      {/* Linha 2: totais. */}
      {resumo && (
        <div className="flex flex-wrap items-center gap-4 text-sm whitespace-nowrap">
          <span className="text-muted-foreground">Em aberto <span className="font-semibold text-info">{formatBRL(resumo.emAberto)}</span></span>
          <span className="text-muted-foreground">Vencido <span className="font-semibold text-danger">{formatBRL(resumo.vencido)}</span></span>
          <span className="text-muted-foreground">Recebido no mês <span className="font-semibold text-success">{formatBRL(resumo.recebidoMes)}</span></span>
        </div>
      )}
      </div>
      {agrupamento !== "none" ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-md">
          {grupos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma conta.</div>
          ) : grupos.map((g) => {
            const soma = g.itens.reduce((s, c) => s + decimalToNumber(c.valorOriginal), 0);
            const vencido = g.itens.some((c) => isVencida(c.dataVencimento, c.dataPagamento));
            return (
              <div key={g.chave}>
                <div className={cn("flex items-center gap-2 px-5 py-2 bg-muted border-y border-border text-sm font-semibold", vencido && agrupamento === "vencimento" ? "text-danger" : "text-foreground")}>
                  {agrupamento === "cliente" ? <Building2 className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />} {g.label}
                  <span className="text-xs font-normal text-muted-foreground">· {g.itens.length} título{g.itens.length !== 1 ? "s" : ""}</span>
                  <span className="ml-auto tabular-nums">{formatBRL(soma)}</span>
                </div>
                <div className="divide-y divide-border">
                  {g.itens.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setDetalhe(c)}
                      className={cn(
                        "grid gap-3 items-center px-5 py-2.5 hover:bg-muted/40 cursor-pointer text-sm",
                        // Agrupado por cliente: a coluna de cliente some (já é o
                        // cabeçalho do grupo). Por vencimento, mostra o cliente.
                        agrupamento === "cliente"
                          ? "grid-cols-[7rem_1.4fr_8rem_6.5rem_5rem_auto]"
                          : "grid-cols-[7rem_1.2fr_1.4fr_8rem_6.5rem_5rem_auto]",
                      )}
                    >
                      <span className="font-mono text-xs font-semibold text-info">{c.numero}</span>
                      {agrupamento !== "cliente" && renderCliente(c, "truncate")}
                      <span className="truncate text-muted-foreground">{c.descricao}</span>
                      {(() => { const o = origemReceber(c); return (
                        <span className="truncate text-xs text-muted-foreground font-mono" title={o.ref ? `${o.label} · ${o.ref}` : o.label}>{o.ref || o.label}</span>
                      ); })()}
                      <span className="font-medium tabular-nums text-right">{formatBRL(decimalToNumber(c.valorOriginal))}</span>
                      <StatusBadge status={c.status} />
                      {renderAcoes(c)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DataTable
          data={contasFiltradas}
          columns={columns}
          hideSearch
          containerClassName="shadow-md rounded-xl"
          headerClassName="bg-muted"
          focusId={focusId}
          getRowId={(c) => c.id}
          onRowClick={(row) => setDetalhe(row)}
        />
      )}
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
