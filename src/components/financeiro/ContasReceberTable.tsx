"use client";
import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { formatBRL, formatDate, decimalToNumber, isVencida } from "@/lib/utils";

type ContaRow = {
  id: string; numero: string; descricao: string; status: string;
  dataVencimento: Date | string; dataPagamento: Date | string | null;
  valorOriginal: unknown; valorPago: unknown;
  cliente: { id: string; razaoSocial: string };
};

export default function ContasReceberTable({ contas }: { contas: ContaRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ContaRow | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [forma, setForma] = useState("");
  const [saving, setSaving] = useState(false);

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
        <Button variant="outline" size="sm" onClick={() => { setSelected(row.original); setValorPago(""); setForma(""); }}>
          Receber
        </Button>
      ) : null,
    },
  ], []);

  async function handlePagamento() {
    if (!selected || !valorPago) return;
    setSaving(true);
    await fetch(`/api/contas-receber/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorPago: parseFloat(valorPago), dataPagamento: dataPag, formaPagamento: forma, valorMulta: 0, valorJuros: 0 }),
    });
    setSaving(false);
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <DataTable
        data={contas}
        columns={columns}
        searchPlaceholder="Buscar por número, cliente ou descrição..."
        onRowClick={(row) => {
          if (row.status !== "PAGA" && row.status !== "CANCELADA") {
            setSelected(row); setValorPago(""); setForma("");
          }
        }}
      />
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            {selected && <p className="text-sm text-gray-500">{selected.numero} — Saldo: {formatBRL(decimalToNumber(selected.valorOriginal) - decimalToNumber(selected.valorPago))}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Valor Recebido (R$)</Label><Input type="number" step="0.01" min="0" value={valorPago} onChange={(e) => setValorPago(e.target.value)} className="mt-1" /></div>
            <div><Label>Data do Recebimento</Label><Input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {["PIX", "Boleto", "Transferência", "Cartão de Crédito", "Cartão de Débito", "Dinheiro"].map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={handlePagamento} disabled={saving || !valorPago}>
              {saving ? "Salvando..." : "Confirmar Recebimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
