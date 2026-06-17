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
  id: string; numero: string; descricao: string; status: string;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  cliente: { id: string; razaoSocial: string };
};

export default function ContasReceberTable({ contas }: { contas: ContaRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([novaLinhaPagamento()]);
  const [formas, setFormas] = useState<FormaOpt[]>([]);
  const [contasBanco, setContasBanco] = useState<ContaOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dados de apoio (formas de pagamento e contas de destino).
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
    { id: "cliente", header: "Cliente", cell: ({ row }) => <span>{row.original.cliente.razaoSocial}</span> },
    { accessorKey: "descricao", header: "Descrição", cell: ({ row }) => <span className="text-sm">{row.original.descricao}</span> },
    {
      accessorKey: "dataVencimento",
      header: "Vencimento",
      cell: ({ row }) => {
        const vencida = isVencida(row.original.dataVencimento, row.original.dataPagamento);
        return <span className={vencida ? "text-red-600 font-medium" : "text-gray-600"}>{formatDate(row.original.dataVencimento)}</span>;
      },
    },
    { accessorKey: "valorOriginal", header: "Valor", cell: ({ row }) => <span className="font-medium">{formatBRL(decimalToNumber(row.original.valorOriginal))}</span> },
    { accessorKey: "valorPago", header: "Pago", cell: ({ row }) => <span className="text-green-600">{formatBRL(decimalToNumber(row.original.valorPago))}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => row.original.status !== "PAGA" && row.original.status !== "CANCELADA" ? (
        <Button variant="outline" size="sm" onClick={() => abrir(row.original)}>Receber</Button>
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
      setErro(`Selecione a conta bancária de destino para "${contaRuim.forma || "a forma eletrônica"}" — formas que não são dinheiro não podem cair no Caixa em Dinheiro.`);
      return;
    }
    setSaving(true); setErro(null);
    const res = await fetch(`/api/contas-receber/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagamentos, dataPagamento: dataPag, valorMulta: 0, valorJuros: 0 }),
    });
    setSaving(false);
    if (!res.ok) { setErro((await res.json().catch(() => ({}))).error ?? "Erro ao receber."); return; }
    setSelected(null);
    router.refresh();
  }

  const totalInformado = linhas.reduce((s, l) => s + parseValorBR(l.valor), 0);

  return (
    <>
      <DataTable
        data={contas}
        columns={columns}
        searchPlaceholder="Buscar por número, cliente ou descrição..."
        onRowClick={(row) => {
          if (row.status !== "PAGA" && row.status !== "CANCELADA") abrir(row);
        }}
      />
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            {selected && <p className="text-sm text-gray-500">{selected.numero} — Saldo: {formatBRL(saldo)}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Data do Recebimento</Label>
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
              {saving ? "Salvando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
