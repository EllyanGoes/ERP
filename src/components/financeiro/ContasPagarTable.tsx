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
import { formatBRL, formatDate, decimalToNumber, isVencida } from "@/lib/utils";
import PagamentosInput, {
  type FormaOpt, type ContaOpt, type LinhaPagamento,
  novaLinhaPagamento, parseValorBR, contaPadraoParaForma, pagamentoContaInvalida,
} from "@/components/pedidos-venda/PagamentosInput";

type ContaRow = {
  id: string; numero: string; descricao: string; categoria: string | null; status: string;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  fornecedor: { id: string; razaoSocial: string } | null;
};

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
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("TODOS");
  const contasFiltradas = useMemo(
    () => (statusFiltro === "TODOS" ? contas : contas.filter((c) => casaStatus(c, statusFiltro))),
    [contas, statusFiltro],
  );
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contasBanco, setContasBanco] = useState<ContaOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dados de apoio (formas de pagamento e contas de origem).
  useEffect(() => {
    fetch("/api/suprimentos/formas-pagamento").then((r) => r.json()).then((j) => setFormas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => setContasBanco(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, []);

  const saldo = selected ? decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago) : 0;

  function abrir(row: ContaRow) {
    setSelected(row);
    setErro(null);
    setDataPag(new Date().toISOString().split("T")[0]);
    const s = decimalToNumber(row.valorOriginal) - decimalToNumber(row.valorPago);
    setLinhas([novaLinhaPagamento("", contaPadraoParaForma("", formas, contasBanco), s > 0 ? s.toFixed(2).replace(".", ",") : "")]);
  }

  const columns = useMemo<ColumnDef<ContaRow>[]>(() => [
    { accessorKey: "numero", header: "Número", cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.numero}</span> },
    { id: "fornecedor", header: "Fornecedor", cell: ({ row }) => <span>{row.original.fornecedor?.razaoSocial ?? "—"}</span> },
    { accessorKey: "descricao", header: "Descrição" },
    { accessorKey: "categoria", header: "Categoria", cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.categoria ?? "—"}</span> },
    {
      accessorKey: "dataVencimento",
      header: "Vencimento",
      cell: ({ row }) => {
        const vencida = isVencida(row.original.dataVencimento, row.original.dataPagamento);
        return <span className={vencida ? "text-red-600 font-medium" : "text-gray-600"}>{formatDate(row.original.dataVencimento)}</span>;
      },
    },
    { accessorKey: "valorOriginal", header: "Valor", cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.valorOriginal))}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => row.original.status !== "PAGA" && row.original.status !== "CANCELADA" ? (
        <Button variant="outline" size="sm" onClick={() => abrir(row.original)}>Pagar</Button>
      ) : null,
    },
  ], [contasBanco]);

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
    setSaving(true); setErro(null);
    const res = await fetch(`/api/contas-pagar/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagamentos, dataPagamento: dataPag, valorMulta: 0, valorJuros: 0 }),
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
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")
              }
            >
              {f.label} <span className={ativo ? "opacity-80" : "text-gray-400"}>{n}</span>
            </button>
          );
        })}
      </div>
      <DataTable
        data={contasFiltradas}
        columns={columns}
        searchPlaceholder="Buscar por número, fornecedor ou descrição..."
        onRowClick={(row) => {
          if (row.status !== "PAGA" && row.status !== "CANCELADA") abrir(row);
        }}
      />
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            {selected && <p className="text-sm text-gray-500">{selected.numero} — Saldo: {formatBRL(saldo)}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Data do Pagamento</Label>
              <Input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} className="mt-1" />
            </div>
            <PagamentosInput
              linhas={linhas}
              setLinhas={setLinhas}
              formas={formas}
              contas={contasBanco}
              total={saldo}
            />
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handlePagamento} disabled={saving || totalInformado <= 0}>
              {saving ? "Salvando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
