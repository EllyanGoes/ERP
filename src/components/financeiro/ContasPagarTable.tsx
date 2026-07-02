"use client";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
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
import { Plus, Trash2, Wallet, CalendarClock, Pencil, Building2, RotateCcw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Linha do rateio gerencial por natureza no modal de baixa.
type RateioLinha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

type ContaRow = {
  id: string; numero: string; descricao: string; categoria: string | null; status: string; antecipado?: boolean;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  fornecedor: { id: string; razaoSocial: string } | null;
  contasContrapartida?: { id: string; nome: string }[];
  naturezas?: { naturezaFinanceiraId: string; detalhamento: string | null; valor: unknown }[];
  pedidoCompra?: {
    id: string; numero: string; conferencia?: { id: string; numero: string } | null;
    itens?: { tes?: { codigo: string; nome: string } | null; centroCusto?: { codigo: string; nome: string } | null }[];
  } | null;
  centroCusto?: { codigo: string; nome: string } | null; centroCustoId?: string | null;
  folhaId?: string | null; recorrenciaId?: string | null; compensacaoOrigemId?: string | null; intragrupo?: boolean;
  naturezaFinanceiraId?: string | null; observacoes?: string | null; beneficiarioTipo?: string | null; beneficiarioId?: string | null;
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
  const itens = c.pedidoCompra?.itens ?? [];
  if (itens.length > 0) {
    return {
      tes: rotulosDistintos(itens.map((i) => i.tes ? `${i.tes.codigo} ${i.tes.nome}` : null)),
      centro: rotulosDistintos(itens.map((i) => i.centroCusto ? `${i.centroCusto.codigo} - ${i.centroCusto.nome}` : null)),
    };
  }
  // Título avulso/despesa: centro é do próprio título; sem TES.
  return { tes: "—", centro: c.centroCusto ? `${c.centroCusto.codigo} - ${c.centroCusto.nome}` : "—" };
}

// Documento de ORIGEM do título a pagar: de onde ele veio (documento de entrada,
// pedido antecipado, folha, encontro de contas, recorrência, intragrupo) ou avulso.
function origemPagar(c: ContaRow): { label: string; ref: string | null } {
  if (c.pedidoCompra) {
    if (c.antecipado) return { label: "Pedido de Compra (PA)", ref: c.pedidoCompra.numero };
    return { label: "Documento de Entrada", ref: c.pedidoCompra.conferencia?.numero ?? c.pedidoCompra.numero };
  }
  if (c.folhaId) return { label: "Folha de Pagamento", ref: null };
  if (c.compensacaoOrigemId) return { label: "Encontro de Contas", ref: null };
  if (c.recorrenciaId) return { label: "Recorrência", ref: null };
  if (c.intragrupo) return { label: "Intragrupo", ref: null };
  return { label: "Manual", ref: null };
}

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

const FILTROS_PAGAR: { key: StatusFiltro; label: string }[] = [
  { key: "TODOS", label: "Todas" },
  { key: "ABERTA", label: "Em aberto" },
  { key: "PARCIAL", label: "Parciais" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "PAGA", label: "Pagas" },
];

export default function ContasPagarTable({ contas }: { contas: ContaRow[] }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("ABERTA");
  const [contaFiltro, setContaFiltro] = useState<string>("");
  // Contas de contrapartida distintas presentes na lista (para o filtro).
  const contasDisponiveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contas) for (const cc of c.contasContrapartida ?? []) m.set(cc.id, cc.nome);
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contas]);
  const contasFiltradas = useMemo(
    () => contas.filter((c) =>
      (statusFiltro === "TODOS" || casaStatus(c, statusFiltro)) &&
      (contaFiltro === "" || (c.contasContrapartida ?? []).some((cc) => cc.id === contaFiltro)),
    ),
    [contas, statusFiltro, contaFiltro],
  );
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [detalhe, setDetalhe] = useState<ContaRow | null>(null);
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

  // Rastreabilidade: ?focus=<id> destaca o título vindo do Razão/contabilidade.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f) setFocusId(f);
  }, []);

  // Dados de apoio (formas de pagamento e contas de origem).
  useEffect(() => {
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setContasBanco(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/naturezas?tipo=SAIDA&ativo=1").then((r) => r.json()).then((j) => setNaturezasOpts(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

  const saldo = selected ? decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago) : 0;

  function abrir(row: ContaRow) {
    setSelected(row);
    setErro(null);
    setDataPag(new Date().toISOString().split("T")[0]);
    const s = decimalToNumber(row.valorOriginal) - decimalToNumber(row.valorPago);
    setLinhas([novaLinhaPagamento("", contaPadraoParaForma("", formas, contasBanco), s > 0 ? s.toFixed(2).replace(".", ",") : "")]);
    // Rateio por natureza: pré-carrega o existente ou 1 linha com o valor do título.
    const valOrig = decimalToNumber(row.valorOriginal);
    setRateio(
      row.naturezas && row.naturezas.length
        ? row.naturezas.map((n) => ({ key: crypto.randomUUID(), naturezaFinanceiraId: n.naturezaFinanceiraId, detalhamento: n.detalhamento ?? "", valor: decimalToNumber(n.valor).toFixed(2).replace(".", ",") }))
        : [{ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: valOrig > 0 ? valOrig.toFixed(2).replace(".", ",") : "" }],
    );
  }

  // Estorna o pagamento: o título volta para "em aberto" e o lançamento no
  // caixa/banco é removido.
  async function estornar(row: ContaRow) {
    if (!confirm(`Reabrir o título ${row.numero}? O pagamento é estornado, ele volta para "em aberto" e o lançamento no caixa/banco é removido.`)) return;
    const res = await fetch(`/api/contas-pagar/${row.id}/estorno`, { method: "POST" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Não foi possível estornar."); return; }
    router.refresh();
  }

  // Ações da linha (Editar + Pagar destacado). Reusadas na tabela e na visão agrupada.
  function renderAcoes(c: ContaRow) {
    const podePagar = c.status !== "PAGA" && c.status !== "CANCELADA";
    return (
      <div className="flex items-center justify-end gap-2">
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditar(c); }} className="gap-1 text-muted-foreground">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
        )}
        {podePagar && (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); abrir(c); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <Wallet className="w-4 h-4" /> Pagar
          </Button>
        )}
      </div>
    );
  }

  // Agrupamento (toggle): por data de VENCIMENTO (grupos por data, sem vencimento
  // por último) ou por FORNECEDOR (grupos por parceiro, em ordem alfabética). Cada
  // grupo tem contagem e soma dos valores.
  const [agrupamento, setAgrupamento] = useState<"none" | "vencimento" | "fornecedor">("none");
  const agrupado = agrupamento !== "none";
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
        const nome = c.fornecedor?.razaoSocial ?? "Sem fornecedor";
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

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold">{row.original.numero}</span>
        {row.original.antecipado && (
          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400" title="Pagamento antecipado — adiantamento a fornecedor gerado no pedido">PA</span>
        )}
      </span>
    ) },
    { id: "fornecedor", header: "Fornecedor", cell: ({ row }) => <span>{row.original.fornecedor?.razaoSocial ?? "—"}</span> },
    { accessorKey: "descricao", header: "Descrição" },
    { id: "origem", header: "Origem", cell: ({ row }) => {
      const o = origemPagar(row.original);
      return (
        <span className="inline-flex flex-col leading-tight">
          <span className="text-xs text-foreground">{o.label}</span>
          {o.ref && <span className="font-mono text-[10px] text-muted-foreground">{o.ref}</span>}
        </span>
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
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "conta",
      header: "Conta",
      cell: ({ row }) => {
        const cs = row.original.contasContrapartida ?? [];
        return cs.length ? <span className="text-xs text-muted-foreground">{cs.map((c) => c.nome).join(" + ")}</span> : <span className="text-muted-foreground/60">—</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => renderAcoes(row.original),
    },
  ], [contasBanco, isAdmin]);

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
    setSaving(true); setErro(null);
    const res = await fetch(`/api/contas-pagar/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagamentos, dataPagamento: dataPag, valorMulta: 0, valorJuros: 0,
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
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS_PAGAR.map((f) => {
          const n = f.key === "TODOS" ? contas.length : contas.filter((c) => casaStatus(c, f.key)).length;
          const ativo = statusFiltro === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFiltro(f.key)}
              className={
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors " +
                (ativo
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-card border-border text-muted-foreground hover:bg-muted")
              }
            >
              {f.label} <span className={ativo ? "opacity-80" : "text-muted-foreground"}>{n}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAgrupamento((v) => (v === "vencimento" ? "none" : "vencimento"))}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
            agrupamento === "vencimento" ? "bg-blue-600 border-blue-600 text-white" : "bg-card border-border text-muted-foreground hover:bg-muted",
          )}
          title="Agrupar por data de vencimento"
        >
          <CalendarClock className="w-4 h-4" /> Vencimento
        </button>
        <button
          type="button"
          onClick={() => setAgrupamento((v) => (v === "fornecedor" ? "none" : "fornecedor"))}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
            agrupamento === "fornecedor" ? "bg-blue-600 border-blue-600 text-white" : "bg-card border-border text-muted-foreground hover:bg-muted",
          )}
          title="Agrupar por fornecedor"
        >
          <Building2 className="w-4 h-4" /> Fornecedor
        </button>
        {contasDisponiveis.length > 0 && (
          <div className="w-60">
            <ComboboxWithCreate
              value={contaFiltro}
              onChange={setContaFiltro}
              noneLabel="Todas as contas"
              triggerClassName="h-9 rounded-lg"
              options={contasDisponiveis.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
        )}
      </div>
      {agrupado ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {grupos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma conta.</div>
          ) : grupos.map((g) => {
            const soma = g.itens.reduce((s, c) => s + decimalToNumber(c.valorOriginal), 0);
            const vencido = g.itens.some((c) => isVencida(c.dataVencimento, c.dataPagamento));
            return (
              <div key={g.chave}>
                <div className={cn("flex items-center gap-2 px-5 py-2 bg-muted border-y border-border text-sm font-semibold", vencido && agrupamento === "vencimento" ? "text-danger" : "text-foreground")}>
                  {agrupamento === "fornecedor" ? <Building2 className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />} {g.label}
                  <span className="text-xs font-normal text-muted-foreground">· {g.itens.length} título{g.itens.length !== 1 ? "s" : ""}</span>
                  <span className="ml-auto tabular-nums">{formatBRL(soma)}</span>
                </div>
                <div className="divide-y divide-border">
                  {g.itens.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setDetalhe(c)}
                      className="grid grid-cols-[7rem_1.2fr_1.4fr_8rem_6.5rem_5rem_auto] gap-3 items-center px-5 py-2.5 hover:bg-muted/40 cursor-pointer text-sm"
                    >
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="font-mono text-xs font-semibold text-info">{c.numero}</span>
                        {c.antecipado && <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-700 dark:text-amber-400" title="Pagamento antecipado">PA</span>}
                      </span>
                      <span className="truncate">{c.fornecedor?.razaoSocial ?? "—"}</span>
                      <span className="truncate text-muted-foreground">{c.descricao}</span>
                      {(() => { const o = origemPagar(c); return (
                        <span className="truncate text-xs text-muted-foreground" title={o.ref ? `${o.label} · ${o.ref}` : o.label}>{o.label}{o.ref ? ` ${o.ref}` : ""}</span>
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
          searchPlaceholder="Buscar por número, fornecedor ou descrição..."
          focusId={focusId}
          getRowId={(c) => c.id}
          onRowClick={(row) => setDetalhe(row)}
        />
      )}
      {detalhe && (() => {
        const podePagar = detalhe.status !== "PAGA" && detalhe.status !== "CANCELADA";
        const vo = decimalToNumber(detalhe.valorOriginal);
        const vp = decimalToNumber(detalhe.valorPago);
        const contas = detalhe.contasContrapartida ?? [];
        const org = origemPagar(detalhe);
        const conf = detalhe.pedidoCompra?.conferencia;
        const campos: TituloCampo[] = [
          { label: "Fornecedor", valor: detalhe.fornecedor?.razaoSocial ?? "—", full: true },
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
          { label: "Vencimento", valor: <span className={isVencida(detalhe.dataVencimento, detalhe.dataPagamento) ? "text-danger font-medium" : undefined}>{formatDate(detalhe.dataVencimento)}</span> },
          { label: "Valor", valor: formatBRL(vo) },
          { label: "Pago", valor: formatBRL(vp) },
          { label: "Saldo", valor: <span className="font-medium">{formatBRL(vo - vp)}</span> },
          ...(detalhe.dataPagamento ? [{ label: "Pagamento", valor: formatDate(detalhe.dataPagamento) }] : []),
          ...(contas.length ? [{ label: "Conta", valor: contas.map((c) => c.nome).join(" + "), full: true }] : []),
        ];
        const podeEstornar = detalhe.status === "PAGA" || detalhe.status === "PARCIAL";
        const acoes: TituloAcao[] = [
          ...(podePagar ? [{ label: "Pagar", tone: "primary" as const, icon: <Wallet className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); abrir(r); } }] : []),
          ...(podeEstornar ? [{ label: "Reabrir", tone: "danger" as const, icon: <RotateCcw className="w-4 h-4" />, onClick: () => { const r = detalhe; setDetalhe(null); estornar(r); } }] : []),
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
            <div>
              <Label>Data do Pagamento</Label>
              <DatePicker value={dataPag} onChange={(v) => setDataPag(v)} className="mt-1 w-full" />
            </div>
            <PagamentosInput
              linhas={linhas}
              setLinhas={setLinhas}
              formas={formas}
              contas={contasBanco}
              total={saldo}
              menuMinWidth={340}
            />
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
    </>
  );
}
