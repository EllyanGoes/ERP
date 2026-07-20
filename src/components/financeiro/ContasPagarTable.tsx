"use client";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable, { type GroupInfo } from "@/components/shared/DataTable";
import { usePersistedState } from "@/lib/use-persisted-state";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { formatBRL, formatDate, decimalToNumber, isVencida } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import PagamentosInput, {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma, pagamentoContaInvalida,
} from "@/components/pedidos-venda/PagamentosInput";
import NaturezaCombobox, { type NaturezaOpt } from "@/components/financeiro/NaturezaCombobox";
import EditarTituloDialog from "@/components/financeiro/EditarTituloDialog";
import TituloDetalhesDialog, { type TituloCampo, type TituloAcao } from "@/components/financeiro/TituloDetalhesDialog";
import { Plus, Trash2, Wallet, CalendarClock, Pencil, Building2, RotateCcw, ExternalLink, MoreVertical, Search, X, Layers, Link2, Loader2, BookOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import NovaContaButton from "@/components/financeiro/NovaContaButton";
import FilterSelect from "@/components/shared/FilterSelect";
import CheckboxFilter from "@/components/shared/CheckboxFilter";
import DateRangePicker, { type DateRange } from "@/components/shared/DateRangePicker";
import { cn } from "@/lib/utils";

// Linha do rateio gerencial por natureza no modal de baixa.
type RateioLinha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

type ContaRow = {
  id: string; numero: string; descricao: string; categoria: string | null; status: string; antecipado?: boolean;
  parcelaNumero?: number | null; parcelaTotal?: number | null;
  // Forma PREVISTA de quitação (herdada do DE; ex.: permuta) — distinta do
  // formaPagamento (resumo do que foi efetivamente baixado).
  formaPagamentoPrevista?: { id: string; nome: string; tipo?: string } | null;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  // Emissão do título (NF/lançamento manual). Fallback na tela: emissão do DE.
  dataEmissao?: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  fornecedor: { id: string; razaoSocial: string } | null;
  contasContrapartida?: { id: string; nome: string }[];
  naturezas?: { naturezaFinanceiraId: string; detalhamento: string | null; valor: unknown }[];
  pedidoCompra?: {
    id: string; numero: string; conferencia?: { id: string; numero: string; dtEmissao?: Date | string | null } | null;
    itens?: { tes?: { codigo: string; nome: string } | null; centroCusto?: { codigo: string; nome: string } | null }[];
  } | null;
  // Documento de Entrada de origem (pedido OU avulsa) — link clicável e fonte
  // preferida do TES/centro (normalizado no server: direto ?? DE do pedido).
  conferencia?: {
    id: string; numero: string; dtEmissao?: Date | string | null;
    itens?: { tes?: { codigo: string; nome: string } | null; centroCusto?: { codigo: string; nome: string } | null }[];
  } | null;
  // Conta analítica de passivo do fornecedor (2.1.1.x) — link p/ o razão dele.
  fornecedorContaId?: string | null;
  centroCusto?: { codigo: string; nome: string } | null; centroCustoId?: string | null;
  folhaId?: string | null; recorrenciaId?: string | null; compensacaoOrigemId?: string | null; intragrupo?: boolean;
  naturezaFinanceiraId?: string | null; observacoes?: string | null; beneficiarioTipo?: string | null; beneficiarioId?: string | null;
  criadoPor?: string | null; atualizadoPor?: string | null;
};

// TES e Centro de custo do documento de material que originou o título — SOMENTE
// LEITURA para o financeiro (a fonte é a linha do material; aqui só exibe). Junta
// os valores distintos dos itens; "Vários" quando a compra mistura.
function rotulosDistintos(vals: (string | null | undefined)[]): string {
  const set = Array.from(new Set(vals.filter((v): v is string => !!v)));
  if (set.length === 0) return "—";
  if (set.length === 1) return set[0];
  return `Vários (${set.length})`;
}
function tesEcentroDoTitulo(c: ContaRow): { tes: string; centro: string } {
  // Fonte preferida: itens do DOCUMENTO DE ENTRADA — é lá que TES/centro são
  // conferidos de fato (o pedido raramente os tem). Fallback: itens do pedido;
  // por último, o centro do próprio título (avulso/despesa, sem TES).
  const itensDe = c.conferencia?.itens ?? [];
  const itensPc = c.pedidoCompra?.itens ?? [];
  const tes = [itensDe, itensPc]
    .map((itens) => rotulosDistintos(itens.map((i) => i.tes ? `${i.tes.codigo} ${i.tes.nome}` : null)))
    .find((v) => v !== "—") ?? "—";
  const centro = [
    ...[itensDe, itensPc].map((itens) => rotulosDistintos(itens.map((i) => i.centroCusto ? `${i.centroCusto.codigo} - ${i.centroCusto.nome}` : null))),
    c.centroCusto ? `${c.centroCusto.codigo} - ${c.centroCusto.nome}` : "—",
  ].find((v) => v !== "—") ?? "—";
  return { tes, centro };
}

// Documento de ORIGEM do título a pagar: de onde ele veio (documento de entrada,
// pedido antecipado, folha, encontro de contas, recorrência, intragrupo) ou avulso.
function origemPagar(c: ContaRow): { label: string; ref: string | null; confId?: string | null } {
  if (c.pedidoCompra) {
    if (c.antecipado) return { label: "Pedido de Compra (PA)", ref: c.pedidoCompra.numero };
    const conf = c.conferencia ?? c.pedidoCompra.conferencia;
    return { label: "Documento de Entrada", ref: conf?.numero ?? c.pedidoCompra.numero, confId: conf?.id ?? null };
  }
  // Entrada AVULSA: sem pedido, mas com DE — mesma origem clicável.
  if (c.conferencia) return { label: "Documento de Entrada", ref: c.conferencia.numero, confId: c.conferencia.id };
  if (c.folhaId) return { label: "Folha de Pagamento", ref: null };
  if (c.compensacaoOrigemId) return { label: "Encontro de Contas", ref: null };
  if (c.recorrenciaId) return { label: "Recorrência", ref: null };
  if (c.intragrupo) return { label: "Intragrupo", ref: null };
  return { label: "Manual", ref: null };
}

// Naturezas TRAVADAS do sistema elegíveis para a taxa/tarifa RETIDA na baixa
// (vêm do GET de naturezas com sistema=true). A ordem das chaves define o
// default do lado: no pagar, tarifa bancária primeiro.
type TaxaNaturezaOpt = { id: string; nome: string; sistema?: boolean; sistemaChave?: string | null };
const CHAVES_TAXA_PAGAR = ["tarifa-bancaria", "taxa-cartao"] as const;
function filtrarTaxaNaturezas(arr: TaxaNaturezaOpt[]): TaxaNaturezaOpt[] {
  return CHAVES_TAXA_PAGAR
    .map((ch) => arr.find((n) => n.sistema === true && n.sistemaChave === ch))
    .filter((n): n is TaxaNaturezaOpt => !!n);
}

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

// Contagem por categoria (cores dos blocos de totais) usada nas bolinhas ao lado
// do nome do fornecedor no filtro.
type ContagemForn = { vencido: number; aVencer: number; semVenc: number; paga: number };
function BolinhaContagem({ cor, n, titulo }: { cor: string; n: number; titulo: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${n} ${titulo}`}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cor)} />
      <span className="text-[10px] tabular-nums text-muted-foreground">{n}</span>
    </span>
  );
}
function bolinhasForn(st?: ContagemForn) {
  if (!st) return null;
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {st.vencido > 0 && <BolinhaContagem cor="bg-danger" n={st.vencido} titulo="vencidos" />}
      {st.aVencer > 0 && <BolinhaContagem cor="bg-sky-500" n={st.aVencer} titulo="a vencer" />}
      {st.semVenc > 0 && <BolinhaContagem cor="bg-violet-500" n={st.semVenc} titulo="sem vencimento" />}
      {st.paga > 0 && <BolinhaContagem cor="bg-muted-foreground/70" n={st.paga} titulo="pagas" />}
    </span>
  );
}

type StatusFiltro = "TODOS" | "ABERTA" | "PARCIAL" | "VENCIDA" | "A_VENCER" | "SEM_VENCIMENTO" | "PAGA";

// Casa a conta com o filtro de status. "VENCIDA", "A_VENCER" e "SEM_VENCIMENTO"
// são derivados (não são status do banco): vencida = em aberto/parcial com
// vencimento passado; a vencer = em aberto/parcial com vencimento FUTURO; sem
// vencimento = em aberto/parcial sem data (permuta/faturado).
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
// SOBREPÕEM ABERTA/PARCIAL — são lentes extras (marcar só uma mostra o subconjunto).
const STATUS_PAGAR: { key: Exclude<StatusFiltro, "TODOS">; label: string }[] = [
  { key: "ABERTA", label: "Em aberto" },
  { key: "PARCIAL", label: "Parciais" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "A_VENCER", label: "A vencer" },
  { key: "SEM_VENCIMENTO", label: "Sem vencimento" },
  { key: "PAGA", label: "Pagas" },
];
const STATUS_PAGAR_KEYS = STATUS_PAGAR.map((s) => s.key) as string[];

// Conjuntos de status por bloco de total (clique nos totais aplica um preset).
const SET_ABERTO = ["ABERTA", "PARCIAL"];
const SET_VENCIDO = ["VENCIDA"];
const SET_A_VENCER = ["A_VENCER"];
const SET_SEM_VENC = ["SEM_VENCIMENTO"];
const SET_PAGO = ["PAGA"];
function mesmoSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

type Resumo = { emAberto: number; vencido: number; pagoMes: number };

export default function ContasPagarTable({ contas, resumo }: { contas: ContaRow[]; resumo?: Resumo }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  // Filtros persistidos por usuário (padrão do sistema — sobrevivem a trocar de aba).
  // Status é múltipla escolha (chave nova para não colidir com o valor antigo
  // de seleção única). Padrão: em aberto (ABERTA + PARCIAL).
  const [statusSel, setStatusSel] = usePersistedState<string[]>("financeiro:contas-pagar:status-multi", SET_ABERTO);
  const [contaFiltro, setContaFiltro] = usePersistedState<string>("financeiro:contas-pagar:conta", "");
  const [fornecedorFiltro, setFornecedorFiltro] = usePersistedState<string>("financeiro:contas-pagar:fornecedor", "");
  // Busca na barra de filtros (vale para a tabela E para a visão agrupada).
  const [busca, setBusca] = useState("");
  // Período por data de vencimento (persistido por usuário — padrão do sistema).
  const [periodo, setPeriodo] = usePersistedState<DateRange>("financeiro:contas-pagar:periodo", { from: "", to: "" });
  // Contas de contrapartida distintas presentes na lista (para o filtro).
  const contasDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) for (const cc of c.contasContrapartida ?? []) m.set(cc.id, cc.nome);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  // Fornecedores distintos presentes na lista (para o filtro).
  const fornecedoresDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) if (c.fornecedor) m.set(c.fornecedor.id, c.fornecedor.razaoSocial);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  // Contagem de títulos por categoria (vencido/a vencer/sem venc./paga) por
  // fornecedor — vira as bolinhas coloridas ao lado do nome no filtro.
  const fornecedorStats = useMemo(() => {
    const m = new Map<string, ContagemForn>();
    for (const c of contas) {
      const fid = c.fornecedor?.id;
      if (!fid) continue;
      const s = m.get(fid) ?? { vencido: 0, aVencer: 0, semVenc: 0, paga: 0 };
      if (c.status === "PAGA") s.paga++;
      else if (c.status === "ABERTA" || c.status === "PARCIAL") {
        if (!c.dataVencimento) s.semVenc++;
        else if (isVencida(c.dataVencimento, c.dataPagamento)) s.vencido++;
        else s.aVencer++;
      }
      m.set(fid, s);
    }
    return m;
  }, [contas]);
  // Base dos totais: aplica TODOS os filtros MENOS o de status (cada bloco de
  // total é uma categoria de status). Assim os blocos refletem fornecedor/conta/
  // período/busca selecionados.
  const contasBase = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contas.filter((c) => {
      if (contaFiltro !== "" && !(c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)) return false;
      if (fornecedorFiltro !== "" && c.fornecedor?.id !== fornecedorFiltro) return false;
      if (!dentroDoPeriodo(c, periodo)) return false;
      if (!q) return true;
      const o = origemPagar(c);
      return [c.numero, c.fornecedor?.razaoSocial, c.descricao, o.ref, o.label]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [contas, contaFiltro, fornecedorFiltro, busca, periodo]);
  // Tabela: base + o filtro de status (OR sobre os marcados).
  const contasFiltradas = useMemo(
    () => contasBase.filter((c) => statusSel.some((s) => casaStatus(c, s as StatusFiltro))),
    [contasBase, statusSel],
  );
  // Totais dos blocos, recortando a base por categoria de status.
  const totais = useMemo(() => {
    const now = new Date();
    let emAberto = 0, vencido = 0, aVencer = 0, semVenc = 0, pagoMes = 0;
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
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) pagoMes += decimalToNumber(c.valorPago);
      }
    }
    return { emAberto, vencido, aVencer, semVenc, pagoMes };
  }, [contasBase]);
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [detalhe, setDetalhe] = useState<ContaRow | null>(null);
  // Vínculo de título manual com Documento de Entrada (modal de candidatos).
  const [vincular, setVincular] = useState<ContaRow | null>(null);
  const [editar, setEditar] = useState<ContaRow | null>(null);

  // Abre o detalhe do título vindo por ?abrir=<id> (ex.: botão "Pagar" do pedido de
  // compra que leva para o financeiro). Roda uma vez, ao encontrar o título.
  const searchParams = useSearchParams();
  useEffect(() => {
    const alvo = searchParams.get("abrir");
    if (!alvo) return;
    const c = contas.find((x) => x.id === alvo);
    if (c) setDetalhe(c);
  }, [searchParams, contas]);
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contasBanco, setContasBanco] = useState<ContaOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Rateio gerencial por natureza (classificação do título na baixa).
  const [naturezasOpts, setNaturezasOpts] = useState<NaturezaOpt[]>([]);
  const [rateio, setRateio] = useState<RateioLinha[]>([]);
  // Encargos da baixa: juros/multa SAEM do caixa além do título; a taxa/tarifa
  // é RETIDA (paga MENOS) — o título é quitado por linhas + taxa e a taxa vira
  // despesa com natureza travada do sistema.
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [taxa, setTaxa] = useState("");
  const [taxaNaturezaId, setTaxaNaturezaId] = useState("");
  const [taxaNaturezas, setTaxaNaturezas] = useState<TaxaNaturezaOpt[]>([]);

  // Rastreabilidade: ?focus=<id> destaca o título vindo do Razão/contabilidade.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f) setFocusId(f);
  }, []);

  // Dados de apoio (formas de pagamento e contas de origem).
  useEffect(() => {
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setContasBanco(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json()).then((j) => {
      const arr = Array.isArray(j) ? j : (j.data ?? []);
      setNaturezasOpts(arr);
      // Travadas do sistema para a taxa/tarifa retida (tarifa bancária, taxa de cartão).
      setTaxaNaturezas(filtrarTaxaNaturezas(arr));
    }).catch(() => {});
  }, []);

  const saldo = selected ? decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago) : 0;

  function abrir(row: ContaRow) {
    setSelected(row);
    setErro(null);
    setDataPag(new Date().toISOString().split("T")[0]);
    const s = decimalToNumber(row.valorOriginal) - decimalToNumber(row.valorPago);
    // Forma prevista do título (herdada do DE) pré-preenche a 1ª linha — exceto
    // permuta, que não é forma de baixa (quita-se pelo Encontro de Contas).
    const prev = row.formaPagamentoPrevista;
    const formaPrev = prev && prev.tipo !== "PERMUTA" ? prev.nome : "";
    setLinhas([novaLinhaPagamento(formaPrev, contaPadraoParaForma(formaPrev, formas, contasBanco), s > 0 ? s.toFixed(2).replace(".", ",") : "")]);
    // Rateio por natureza: pré-carrega o existente ou 1 linha com o valor do título.
    const valOrig = decimalToNumber(row.valorOriginal);
    setRateio(
      row.naturezas && row.naturezas.length
        ? row.naturezas.map((n) => ({ key: crypto.randomUUID(), naturezaFinanceiraId: n.naturezaFinanceiraId, detalhamento: n.detalhamento ?? "", valor: decimalToNumber(n.valor).toFixed(2).replace(".", ",") }))
        : [{ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: valOrig > 0 ? valOrig.toFixed(2).replace(".", ",") : "" }],
    );
    // Encargos sempre zerados ao reabrir o modal.
    setJuros(""); setMulta(""); setTaxa(""); setTaxaNaturezaId("");
  }

  // Estorna o pagamento: o título volta para "em aberto" e o lançamento no
  // caixa/banco é removido.
  async function estornar(row: ContaRow) {
    if (!confirm(`Reabrir o título ${row.numero}? O pagamento é estornado, ele volta para "em aberto" e o lançamento no caixa/banco é removido.`)) return;
    const res = await fetch(`/api/contas-pagar/${row.id}/estorno`, { method: "POST" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Não foi possível estornar."); return; }
    router.refresh();
  }

  // Fornecedor: nome em texto simples + dois atalhos ao lado — cadastro do
  // fornecedor e conta razão dele (analítica 2.1.1.x). Reusado na tabela, na
  // visão agrupada e no detalhe.
  function renderFornecedor(c: ContaRow, className?: string) {
    const forn = c.fornecedor;
    if (!forn) return <span className={className}>—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 max-w-full min-w-0">
        <span className={cn("truncate", className)} title={forn.razaoSocial}>{forn.razaoSocial}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/suprimentos/fornecedores/${forn.id}`); }}
          className="shrink-0 text-muted-foreground hover:text-info transition-colors"
          title="Abrir o cadastro do fornecedor"
        >
          <Building2 className="h-3.5 w-3.5" />
        </button>
        {c.fornecedorContaId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push(`/contabilidade/razao/${c.fornecedorContaId}`); }}
            className="shrink-0 text-muted-foreground hover:text-info transition-colors"
            title="Abrir a conta razão do fornecedor"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  // Ações da linha num menu de 3 pontinhos ao fim da linha (Pagar/Editar).
  // Reusadas na tabela e na visão agrupada.
  // Título manual (sem pedido/folha/encontro) pode ganhar/perder vínculo com DE.
  const podeVincularDe = (c: ContaRow) =>
    c.status !== "CANCELADA" && !c.pedidoCompra && !c.folhaId && !c.compensacaoOrigemId;

  async function desvincularDe(c: ContaRow) {
    if (!confirm(`Desvincular ${c.numero} do Documento de Entrada ${c.conferencia?.numero}? O título volta a provisionar como lançamento manual.`)) return;
    const res = await fetch(`/api/contas-pagar/${c.id}/vincular-de`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conferenciaId: null }),
    });
    if (!res.ok) { alert((await res.json()).error ?? "Erro ao desvincular"); return; }
    router.refresh();
  }

  function renderAcoes(c: ContaRow) {
    const podePagar = c.status !== "PAGA" && c.status !== "CANCELADA";
    if (!podePagar && !isAdmin) return null;
    return (
      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Ações" />}>
            <MoreVertical className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            {podePagar && (
              <DropdownMenuItem onClick={() => abrir(c)}>
                <Wallet className="w-4 h-4 text-emerald-600" /> Pagar
              </DropdownMenuItem>
            )}
            {podeVincularDe(c) && !c.conferencia && (
              <DropdownMenuItem onClick={() => setVincular(c)}>
                <Link2 className="w-4 h-4 text-info" /> Vincular a Doc. de Entrada
              </DropdownMenuItem>
            )}
            {isAdmin && podeVincularDe(c) && c.conferencia && (
              <DropdownMenuItem onClick={() => desvincularDe(c)}>
                <Link2 className="w-4 h-4 text-danger" /> Desvincular do DE
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

  // Agrupamento (toggle): por data de VENCIMENTO (grupos por data, sem vencimento
  // por último) ou por FORNECEDOR (grupos por parceiro, em ordem alfabética). Cada
  // grupo tem contagem e soma dos valores.
  const [agrupamento, setAgrupamento] = usePersistedState<"none" | "vencimento" | "fornecedor">("financeiro:contas-pagar:agrupamento", "none");
  const agrupado = agrupamento !== "none";
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
      const nome = c.fornecedor?.razaoSocial ?? "Sem fornecedor";
      return { key: c.fornecedor?.id ?? "sem", label: nome, ordem: nome.toLowerCase() };
    };
  }, [agrupamento]);
  const renderGrupoHeader = (info: { key: string; label: string; rows: ContaRow[] }) => {
    const soma = info.rows.reduce((s, c) => s + decimalToNumber(c.valorOriginal), 0);
    const temVencido = agrupamento === "vencimento" && info.rows.some((c) => isVencida(c.dataVencimento, c.dataPagamento));
    return (
      <div className={cn("flex items-center gap-2 text-sm font-semibold", temVencido ? "text-danger" : "text-foreground")}>
        {agrupamento === "fornecedor" ? <Building2 className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
        <span>{info.label}</span>
        <span className="text-xs font-normal text-muted-foreground">· {info.rows.length} título{info.rows.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto tabular-nums">{formatBRL(soma)}</span>
      </div>
    );
  };

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold">{row.original.numero}</span>
        {row.original.antecipado && (
          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400" title="Pagamento antecipado — adiantamento a fornecedor gerado no pedido">PA</span>
        )}
      </span>
    ) },
    { id: "fornecedor", header: "Fornecedor", cell: ({ row }) => (
      <div className="max-w-[16rem]">{renderFornecedor(row.original)}</div>
    ) },
    // A coluna Descrição ABSORVE a folga de largura da tabela: w-full no TH
    // (puxa o espaço livre) e max-w-0 só no TD (o texto trunca no disponível).
    // max-w-0 no TH colapsaria a coluna inteira a zero.
    { accessorKey: "descricao", header: "Descrição", meta: { thClass: "w-full", tdClass: "max-w-0" }, cell: ({ row }) => (
      <div className="truncate text-muted-foreground" title={row.original.descricao}>{row.original.descricao}</div>
    ) },
    // Só o CÓDIGO do documento de origem (o nome do processo fica no tooltip);
    // sem código (manual, folha, recorrência…), mostra o rótulo mesmo.
    { id: "origem", header: "Origem", cell: ({ row }) => {
      const o = origemPagar(row.original);
      if (!o.ref) return <span className="text-xs text-muted-foreground">{o.label}</span>;
      return o.confId ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/suprimentos/conferencias/${o.confId}`); }}
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
      // Emissão do próprio título; sem ela (compra), cai na emissão do DE.
      cell: ({ row }) => {
        const d = row.original.dataEmissao ?? row.original.conferencia?.dtEmissao ?? null;
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
      // Coluna estreita e fixa à direita — o menu de 3 pontos nunca é empurrado
      // para fora da tela (w-px encolhe a célula ao conteúdo).
      meta: { className: "w-px whitespace-nowrap", stickyRight: true },
      cell: ({ row }) => <div className="w-10">{renderAcoes(row.original)}</div>,
    },
  ], [contasBanco, isAdmin]);

  // Ao agrupar, esconde a coluna que virou o cabeçalho do grupo (redundante).
  const colsParaTabela = useMemo(() => columns.filter((c) => {
    const id = (c as { id?: string; accessorKey?: string }).id ?? (c as { accessorKey?: string }).accessorKey;
    if (agrupamento === "fornecedor" && id === "fornecedor") return false;
    if (agrupamento === "vencimento" && id === "dataVencimento") return false;
    return true;
  }), [columns, agrupamento]);

  async function handlePagamento() {
    if (!selected) return;
    const pagamentos = linhas
      .filter((l) => parseValorBR(l.valor) > 0)
      .map((l) => ({ forma: l.forma || null, contaBancariaId: l.contaBancariaId || null, valor: parseValorBR(l.valor) }));
    if (pagamentos.length === 0) { setErro("Informe ao menos uma forma com valor."); return; }
    const contaRuim = pagamentoContaInvalida(linhas, formas, contasBanco);
    if (contaRuim) {
      setErro(`Selecione a conta bancária de origem para "${contaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem sair do Caixa em Dinheiro.`);
      return;
    }
    // Rateio gerencial por natureza (opcional): se preenchido, a soma deve bater
    // com o valor do título (classifica a obrigação inteira).
    const rateioValido = rateio.filter((l) => l.naturezaFinanceiraId && parseValorBR(l.valor) > 0);
    if (rateioValido.length > 0) {
      const soma = Math.round(rateioValido.reduce((s, l) => s + parseValorBR(l.valor), 0) * 100) / 100;
      const valOrig = decimalToNumber(selected.valorOriginal);
      if (Math.abs(soma - valOrig) > 0.05) {
        setErro(`A soma das naturezas (${formatBRL(soma)}) deve bater com o valor do título (${formatBRL(valOrig)}).`);
        return;
      }
    }
    // Encargos: juros/multa saem do caixa; taxa é retida (natureza travada).
    const vJuros = parseValorBR(juros);
    const vMulta = parseValorBR(multa);
    const vTaxa = parseValorBR(taxa);
    if (vJuros < 0 || vMulta < 0 || vTaxa < 0) { setErro("Juros, multa e taxa não podem ser negativos."); return; }
    setSaving(true); setErro(null);
    const res = await fetch(`/api/contas-pagar/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagamentos, dataPagamento: dataPag, valorMulta: vMulta, valorJuros: vJuros,
        valorTaxa: vTaxa,
        taxaNaturezaId: vTaxa > 0 ? (taxaNaturezaId || taxaNaturezas[0]?.id || null) : null,
        naturezas: rateioValido.length
          ? rateioValido.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId, detalhamento: l.detalhamento.trim() || null, valor: parseValorBR(l.valor) }))
          : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Erro ao pagar."); return; }
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
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar número, fornecedor…"
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
          options={STATUS_PAGAR.map((f) => ({
            value: f.key,
            label: f.label,
            hint: String(contas.filter((c) => casaStatus(c, f.key)).length),
          }))}
        />
        {/* Agrupamento: um único dropdown (Não agrupar / Vencimento / Fornecedor). */}
        <FilterSelect
          value={agrupamento}
          onChange={(v) => setAgrupamento(v as "none" | "vencimento" | "fornecedor")}
          active={agrupado}
          icon={<Layers className="w-3.5 h-3.5" />}
          menuWidth="w-48"
          options={[
            { value: "none", label: "Não agrupar" },
            { value: "vencimento", label: "Por vencimento" },
            { value: "fornecedor", label: "Por fornecedor" },
          ]}
        />
        {/* Período por data de vencimento. */}
        <DateRangePicker value={periodo} onChange={setPeriodo} placeholder="Período (vencimento)" />
        {/* Fornecedor (da lista carregada). */}
        {fornecedoresDisponiveis.length > 0 && (
          <div className="w-64">
            <ComboboxWithCreate
              value={fornecedorFiltro}
              onChange={setFornecedorFiltro}
              noneLabel="Todos os fornecedores"
              placeholder="Fornecedor"
              triggerClassName="h-9 rounded-lg"
              menuMinWidth={340}
              options={fornecedoresDisponiveis.map((f) => ({
                value: f.id, label: f.nome,
                render: () => (
                  <span className="inline-flex items-center gap-2 w-full min-w-0">
                    <span className="flex-1 truncate">{f.nome}</span>
                    {bolinhasForn(fornecedorStats.get(f.id))}
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
        <NovaContaButton tipo="pagar" />
      </div>
      {/* Linha 2: totais em blocos compactos coloridos — clicáveis, cada um
          aplica o preset de status (toggle: reclicar marca todos os status). */}
      {resumo && (() => {
        const toggle = (set: string[]) => setStatusSel((cur) => (mesmoSet(cur, set) ? STATUS_PAGAR_KEYS : set));
        return (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => toggle(SET_ABERTO)} title="Filtrar por Em aberto"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-1.5 transition-shadow hover:bg-warning/20 cursor-pointer", mesmoSet(statusSel, SET_ABERTO) && "ring-2 ring-warning")}>
            <span className="text-xs font-medium text-warning">A Pagar</span>
            <span className="text-sm font-bold text-warning tabular-nums">{formatBRL(totais.emAberto)}</span>
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
          <button type="button" onClick={() => toggle(SET_PAGO)} title="Filtrar por Pagas"
            className={cn("inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 transition-shadow hover:bg-muted/70 cursor-pointer", mesmoSet(statusSel, SET_PAGO) && "ring-2 ring-foreground/40")}>
            <span className="text-xs font-medium text-muted-foreground">Pago no mês</span>
            <span className="text-sm font-bold text-foreground tabular-nums">{formatBRL(totais.pagoMes)}</span>
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
        const podePagar = detalhe.status !== "PAGA" && detalhe.status !== "CANCELADA";
        const vo = decimalToNumber(detalhe.valorOriginal);
        const vp = decimalToNumber(detalhe.valorPago);
        const contas = detalhe.contasContrapartida ?? [];
        const org = origemPagar(detalhe);
        const conf = detalhe.conferencia ?? detalhe.pedidoCompra?.conferencia;
        const campos: TituloCampo[] = [
          { label: "Fornecedor", valor: renderFornecedor(detalhe, "font-medium"), full: true },
          { label: "Origem", full: true, valor: org.label },
          // Documento de entrada clicável (igual ao pedido) — abre a conferência.
          ...(conf ? [{
            label: "Documento de Entrada", full: true,
            valor: (
              <button type="button" onClick={() => router.push(`/suprimentos/conferencias/${conf.id}`)}
                className="inline-flex items-center gap-1 text-info hover:underline font-medium">
                <ExternalLink className="w-3.5 h-3.5" /> {conf.numero}
              </button>
            ),
          }] : []),
          ...(detalhe.pedidoCompra ? [{
            label: "Pedido de compra", full: true,
            valor: (
              <button
                type="button"
                onClick={() => router.push(`/suprimentos/pedidos-compra/${detalhe.pedidoCompra!.id}`)}
                className="inline-flex items-center gap-1 text-info hover:underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {detalhe.pedidoCompra.numero}
              </button>
            ),
          }] : []),
          { label: "Descrição", valor: detalhe.descricao || "—", full: true },
          // TES e Centro de custo — SOMENTE LEITURA (definidos no material, não aqui).
          { label: "TES (origem)", valor: <span className="text-muted-foreground">{tesEcentroDoTitulo(detalhe).tes}</span> },
          { label: "Centro de custo (origem)", valor: <span className="text-muted-foreground">{tesEcentroDoTitulo(detalhe).centro}</span> },
          { label: "Vencimento", valor: <span className={isVencida(detalhe.dataVencimento, detalhe.dataPagamento) ? "text-danger font-medium" : undefined}>{detalhe.dataVencimento ? formatDate(detalhe.dataVencimento) : "A combinar"}</span> },
          ...(detalhe.formaPagamentoPrevista ? [{ label: "Forma prevista", valor: detalhe.formaPagamentoPrevista.nome }] : []),
          { label: "Valor", valor: formatBRL(vo) },
          { label: "Pago", valor: formatBRL(vp) },
          { label: "Saldo", valor: <span className="font-medium">{formatBRL(vo - vp)}</span> },
          ...(detalhe.dataPagamento ? [{ label: "Pagamento", valor: formatDate(detalhe.dataPagamento) }] : []),
          ...(contas.length ? [{ label: "Conta", valor: contas.map((c) => c.nome).join(" + "), full: true }] : []),
        ];
        const podeEstornar = detalhe.status === "PAGA" || detalhe.status === "PARCIAL";
        const acoes: TituloAcao[] = [
          ...(podePagar ? [{ label: "Pagar", tone: "primary" as const, icon: <Wallet className="w-4 h-4" />, onClick: () => abrir(detalhe) }] : []),
          ...(podeEstornar ? [{ label: "Reabrir", tone: "danger" as const, icon: <RotateCcw className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); estornar(r); } }] : []),
          ...(podeVincularDe(detalhe) && !detalhe.conferencia
            ? [{ label: "Vincular a DE", icon: <Link2 className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); setVincular(r); } }]
            : []),
          ...(isAdmin ? [{ label: "Editar", icon: <Pencil className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); setEditar(r); } }] : []),
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            {selected && <p className="text-sm text-muted-foreground">{selected.numero} — Saldo: {formatBRL(saldo)}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Classificação de origem (somente leitura) — o financeiro vê, não edita. */}
            {selected && (() => { const o = tesEcentroDoTitulo(selected); const org = origemPagar(selected); return (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Origem</span><span className="text-foreground">{org.label}{org.ref ? ` · ${org.ref}` : ""}</span></div>
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">TES</span><span className="text-foreground">{o.tes}</span></div>
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">Centro de custo</span><span className="text-foreground">{o.centro}</span></div>
              </div>
            ); })()}
            <div>
              <Label>Data do Pagamento</Label>
              <DatePicker value={dataPag} onChange={(v) => setDataPag(v)} className="mt-1 w-full" />
            </div>
            {selected?.formaPagamentoPrevista?.tipo === "PERMUTA" && (
              <div className="rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-300/50 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                Título previsto como <b>permuta</b> — quite pelo <b>Encontro de Contas</b> (motivo Permuta),
                que liquida o CP e o CR do parceiro no mesmo lançamento. A baixa abaixo vale para
                pagamento em dinheiro/banco.
              </div>
            )}
            <PagamentosInput
              linhas={linhas}
              setLinhas={setLinhas}
              formas={formas}
              contas={contasBanco}
              total={saldo}
              menuMinWidth={340}
            />
            {/* Encargos da baixa: juros/multa saem do caixa além do título; a
                taxa/tarifa é retida (paga MENOS) — quitação = linhas + taxa. */}
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
            {/* Rateio gerencial por natureza — classifica o título (igual ao Novo Lançamento). */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Naturezas financeiras</Label>
                <button type="button" onClick={() => setRateio((p) => [...p, { key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" }])} className="inline-flex items-center gap-1 text-xs text-info hover:text-info font-medium">
                  <Plus className="w-3.5 h-3.5" /> Adicionar natureza
                </button>
              </div>
              {rateio.map((l) => (
                <div key={l.key} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-center">
                  <NaturezaCombobox
                    value={l.naturezaFinanceiraId}
                    onChange={(id) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, naturezaFinanceiraId: id } : x)))}
                    naturezas={naturezasOpts}
                    defaultTipo="SAIDA"
                    allowCreate
                    onCreated={(n) => setNaturezasOpts((prev) => [...prev, n])}
                  />
                  <Input value={l.detalhamento} onChange={(e) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, detalhamento: e.target.value } : x)))} placeholder="Detalhamento (opcional)" className="h-9 min-w-0" />
                  <Input value={l.valor} onChange={(e) => setRateio((p) => p.map((x) => (x.key === l.key ? { ...x, valor: e.target.value } : x)))} placeholder="0,00" className="h-9 text-right font-mono min-w-0" />
                  <button type="button" onClick={() => setRateio((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={rateio.length <= 1} className="p-1.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-danger/10 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Classificação gerencial do título por natureza — a soma deve bater com o valor do título. Opcional.</p>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handlePagamento} disabled={saving || totalInformado <= 0}>
              {saving ? "Salvando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição do título em pop-up (mesma tela). Título AVULSO (sem material/folha)
          pode editar o centro de custo; título de material não. */}
      <EditarTituloDialog
        tipo="pagar"
        titulo={editar ? { ...editar, fornecedorId: editar.fornecedor?.id ?? null } : null}
        permiteCentro={!!editar && !editar.pedidoCompra && !editar.folhaId}
        onOpenChange={(o) => !o && setEditar(null)}
        onSaved={() => router.refresh()}
      />

      {/* Vincular título manual a um Documento de Entrada. */}
      {vincular && (
        <VincularDeDialog
          titulo={vincular}
          onClose={() => setVincular(null)}
          onVinculado={() => { setVincular(null); router.refresh(); }}
        />
      )}
    </>
  );
}

// ── Modal: vincular título manual a um Documento de Entrada ──────────────────
// Lista DEs concluídos SEM título (rota candidatas-cp), pré-filtrados pelo
// fornecedor do título; valor divergente é aviso, não bloqueio — a validação
// dura (empresa, fornecedor, duplicidade) fica no servidor.
type DeCandidata = {
  id: string; numero: string; numeroNF: string | null; dtEmissao: string | null;
  status: string; fornecedor: { id: string; razaoSocial: string; nomeFantasia: string | null } | null;
  pedido: string | null; valor: number;
};

function VincularDeDialog({ titulo, onClose, onVinculado }: {
  titulo: ContaRow; onClose: () => void; onVinculado: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<DeCandidata[] | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const saldoTitulo = decimalToNumber(titulo.valorOriginal);

  useEffect(() => {
    let vivo = true;
    const params = new URLSearchParams();
    if (titulo.fornecedor?.id) params.set("fornecedorId", titulo.fornecedor.id);
    if (busca.trim()) params.set("search", busca.trim());
    const t = setTimeout(() => {
      fetch(`/api/suprimentos/conferencias/candidatas-cp?${params.toString()}`)
        .then((r) => r.json())
        .then((j) => { if (vivo) setRows(j.data ?? []); })
        .catch(() => { if (vivo) setRows([]); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca, titulo.fornecedor?.id]);

  async function vincular(de: DeCandidata) {
    setSalvando(de.id); setErro(null);
    const res = await fetch(`/api/contas-pagar/${titulo.id}/vincular-de`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conferenciaId: de.id }),
    });
    if (!res.ok) { setErro((await res.json()).error ?? "Erro ao vincular"); setSalvando(null); return; }
    onVinculado();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-info" /> Vincular {titulo.numero} a um Documento de Entrada
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Documentos concluídos sem título vinculado{titulo.fornecedor ? <> do fornecedor <b>{titulo.fornecedor.razaoSocial}</b></> : null}.
          Ao vincular, a provisão contábil do título passa a ser a entrada do documento (sem crédito em dobro ao fornecedor).
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por número do DE, NF ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento de entrada sem título encontrado.</p>
          ) : rows.map((de) => {
            const difere = Math.abs(de.valor - saldoTitulo) > 0.005;
            return (
              <button
                key={de.id}
                type="button"
                disabled={salvando !== null}
                onClick={() => vincular(de)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors disabled:opacity-60"
              >
                <span className="font-mono text-xs text-info shrink-0 w-20">{de.numero}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{de.fornecedor?.nomeFantasia || de.fornecedor?.razaoSocial || "—"}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {de.dtEmissao ? formatDate(de.dtEmissao) : "—"}{de.numeroNF ? ` · NF ${de.numeroNF}` : ""}{de.pedido ? ` · ${de.pedido}` : ""}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm font-medium tabular-nums">{formatBRL(de.valor)}</span>
                  {difere && (
                    <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-400">difere do título ({formatBRL(saldoTitulo)})</span>
                  )}
                </span>
                {salvando === de.id && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
