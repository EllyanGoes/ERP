"use client";
import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { formatBRL, formatDate, decimalToNumber, isVencida, cn } from "@/lib/utils";
import { CalendarClock, Building2, Wallet, RotateCcw, ExternalLink, Pencil } from "lucide-react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import TituloDetalhesDialog, { type TituloCampo, type TituloAcao } from "@/components/financeiro/TituloDetalhesDialog";
import EditarTituloDialog from "@/components/financeiro/EditarTituloDialog";
import { useSession } from "@/lib/session-context";
import DatePicker from "@/components/shared/DatePicker";
import PagamentosInput, {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma, pagamentoContaInvalida,
} from "@/components/pedidos-venda/PagamentosInput";

type ContaRow = {
  id: string; numero: string; descricao: string; status: string;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  cliente: { id: string; razaoSocial: string };
  contasContrapartida?: { id: string; nome: string }[];
  pedidoVenda?: { id: string; numero: string } | null;
  centroCusto?: { codigo: string; nome: string } | null; centroCustoId?: string | null;
  recorrenciaId?: string | null; compensacaoOrigemId?: string | null; intragrupo?: boolean;
  naturezaFinanceiraId?: string | null; observacoes?: string | null; beneficiarioTipo?: string | null; beneficiarioId?: string | null;
  criadoPor?: string | null; atualizadoPor?: string | null;
};

// Documento de ORIGEM do título a receber: pedido de venda, encontro de contas,
// recorrência, intragrupo — ou avulso (manual).
function origemReceber(c: ContaRow): { label: string; ref: string | null } {
  if (c.pedidoVenda) return { label: "Pedido de Venda", ref: c.pedidoVenda.numero };
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

export default function ContasReceberTable({ contas }: { contas: ContaRow[] }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [editar, setEditar] = useState<ContaRow | null>(null);
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

  // Agrupamento (toggle): por data de VENCIMENTO ou por CLIENTE. Grupos com
  // contagem e soma dos valores.
  const [agrupamento, setAgrupamento] = useState<"none" | "vencimento" | "cliente">("none");
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
  }

  function renderAcoes(c: ContaRow) {
    const s = c.status;
    if (s === "PAGA" || s === "PARCIAL") {
      return (
        <div className="flex justify-end gap-1">
          {s === "PARCIAL" && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); abrir(c); }}>Receber</Button>}
          <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); estornar(c); }}>Estornar</Button>
        </div>
      );
    }
    return s !== "CANCELADA"
      ? <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); abrir(c); }}>Receber</Button>
      : null;
  }

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.numero}</span> },
    { id: "cliente", header: "Cliente", cell: ({ row }) => <span>{row.original.cliente.razaoSocial}</span> },
    { accessorKey: "descricao", header: "Descrição", cell: ({ row }) => <span className="text-sm">{row.original.descricao}</span> },
    { id: "origem", header: "Origem", cell: ({ row }) => {
      const o = origemReceber(row.original);
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
    { accessorKey: "valorPago", header: "Pago", cell: ({ row }) => <span className="text-success">{formatBRL(decimalToNumber(row.original.valorPago))}</span> },
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
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "PAGA" || s === "PARCIAL") {
          return (
            <div className="flex justify-end gap-1">
              {s === "PARCIAL" && <Button variant="outline" size="sm" onClick={() => abrir(row.original)}>Receber</Button>}
              <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700" onClick={() => estornar(row.original)}>Estornar</Button>
            </div>
          );
        }
        return s !== "CANCELADA"
          ? <Button variant="outline" size="sm" onClick={() => abrir(row.original)}>Receber</Button>
          : null;
      },
    },
  ], [contasBanco]);

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
    const pagamentos = linhas
      .filter((l) => parseValorBR(l.valor) > 0)
      .map((l) => ({ forma: l.forma || null, contaBancariaId: l.contaBancariaId || null, valor: parseValorBR(l.valor) }));
    if (pagamentos.length === 0) { setErro("Informe ao menos uma forma com valor."); return; }
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
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS_RECEBER.map((f) => {
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
          onClick={() => setAgrupamento((v) => (v === "cliente" ? "none" : "cliente"))}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
            agrupamento === "cliente" ? "bg-blue-600 border-blue-600 text-white" : "bg-card border-border text-muted-foreground hover:bg-muted",
          )}
          title="Agrupar por cliente"
        >
          <Building2 className="w-4 h-4" /> Cliente
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
      {agrupamento !== "none" ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
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
                      className="grid grid-cols-[7rem_1.2fr_1.4fr_8rem_6.5rem_5rem_auto] gap-3 items-center px-5 py-2.5 hover:bg-muted/40 cursor-pointer text-sm"
                    >
                      <span className="font-mono text-xs font-semibold text-info">{c.numero}</span>
                      <span className="truncate">{c.cliente?.razaoSocial ?? "—"}</span>
                      <span className="truncate text-muted-foreground">{c.descricao}</span>
                      {(() => { const o = origemReceber(c); return (
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
          searchPlaceholder="Buscar por número, cliente ou descrição..."
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
          { label: "Cliente", valor: detalhe.cliente?.razaoSocial ?? "—", full: true },
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
