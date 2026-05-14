"use client";
import { useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { decimalToNumber } from "@/lib/utils";
import { AlertTriangle, ArrowUpDown } from "lucide-react";

type EstoqueRow = {
  id: string;
  itemId: string;
  quantidadeAtual: unknown;
  quantidadeMin: unknown;
  quantidadeMax: unknown;
  localizacao: string | null;
  item: { id: string; codigo: string; descricao: string; tipo: string; unidadeMedida: string; ativo: boolean };
};

export default function EstoqueTable({ estoques }: { estoques: EstoqueRow[] }) {
  const router = useRouter();
  const [ajusteItem, setAjusteItem] = useState<EstoqueRow | null>(null);
  const [tipo, setTipo] = useState<string>("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<EstoqueRow>[]>(() => [
    { accessorKey: "item.codigo", header: "Código", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.item.codigo}</span> },
    { accessorKey: "item.descricao", header: "Descrição" },
    { accessorKey: "item.unidadeMedida", header: "Un.", cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.item.unidadeMedida}</span> },
    {
      id: "quantidadeAtual",
      header: "Qtd. Atual",
      cell: ({ row }) => {
        const atual = decimalToNumber(row.original.quantidadeAtual);
        const min = decimalToNumber(row.original.quantidadeMin);
        const baixo = atual <= min && min > 0;
        return (
          <div className="flex items-center gap-1">
            <span className={`font-semibold ${atual === 0 ? "text-red-600" : baixo ? "text-amber-600" : "text-gray-900"}`}>{atual}</span>
            {baixo && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
          </div>
        );
      },
    },
    {
      id: "quantidadeMin",
      header: "Qtd. Min.",
      cell: ({ row }) => <span className="text-gray-500">{decimalToNumber(row.original.quantidadeMin)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const atual = decimalToNumber(row.original.quantidadeAtual);
        const min = decimalToNumber(row.original.quantidadeMin);
        if (atual === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Zerado</span>;
        if (atual <= min && min > 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Baixo</span>;
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>;
      },
    },
    { id: "localizacao", header: "Localização", cell: ({ row }) => <span className="text-xs text-gray-400">{row.original.localizacao || "—"}</span> },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => { setAjusteItem(row.original); setTipo("ENTRADA"); setQuantidade(""); setObs(""); }}>
          Ajustar
        </Button>
      ),
    },
  ], []);

  async function handleAjuste() {
    if (!ajusteItem || !quantidade) return;
    setSaving(true);
    await fetch("/api/estoque/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: ajusteItem.itemId, tipo, quantidade: parseFloat(quantidade), observacoes: obs }),
    });
    setSaving(false);
    setAjusteItem(null);
    router.refresh();
  }

  return (
    <>
      <DataTable data={estoques} columns={columns} searchPlaceholder="Buscar por código ou descrição..." />
      <Dialog open={!!ajusteItem} onOpenChange={(o) => !o && setAjusteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste de Estoque</DialogTitle>
            {ajusteItem && <p className="text-sm text-gray-500">{ajusteItem.item.codigo} — {ajusteItem.item.descricao}</p>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tipo de Movimentação</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTRADA">Entrada</SelectItem>
                  <SelectItem value="SAIDA">Saída</SelectItem>
                  <SelectItem value="AJUSTE">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" step="0.001" min="0" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteItem(null)}>Cancelar</Button>
            <Button onClick={handleAjuste} disabled={saving || !quantidade}>
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
