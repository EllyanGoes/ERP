"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ArrowRight, AlertCircle, Pencil, Printer } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { statusMinutaLabel, confirmacaoMinutaLabel, TIPO_MINUTA_LABEL, type TipoMinuta } from "@/lib/minuta-labels";
import { cn, formatDate } from "@/lib/utils";
import { buildMinutaEscPos } from "@/lib/escpos-minuta";
import { printEscPosUSB } from "@/lib/webusb-print";
import { printMinutaViaDialog } from "@/lib/print-minuta-dialog";

type StatusMinuta = "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";

type MinutaItem = {
  id: string;
  itemId: string;
  pedidoVendaItemId: string;
  quantidade: string;
  quantidadeConvertida: string | null;
  unidadeId: string | null;
  item: { id: string; codigo: string; descricao: string };
  unidade: { id: string; sigla: string; nome: string } | null;
  pedidoVendaItem: { id: string; quantidade: string };
};

type LocalEstoque = { id: string; nome: string };

type Minuta = {
  id: string;
  numero: string;
  numeroFisico: string | null;
  tipo: TipoMinuta;
  status: StatusMinuta;
  dataEmissao: string;
  dataEntrega: string | null;
  motorista: { id: string; nome: string } | null;
  placa: string | null;
  observacoes: string | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  };
  localEstoque: LocalEstoque | null;
  itens: MinutaItem[];
};

const STATUS_COLOR: Record<StatusMinuta, string> = {
  PENDENTE:          "bg-amber-100 text-amber-700 border border-amber-200",
  SAIU_PARA_ENTREGA: "bg-blue-100 text-blue-700 border border-blue-200",
  ENTREGUE:          "bg-emerald-100 text-emerald-700 border border-emerald-200",
  CANCELADA:         "bg-gray-100 text-gray-500 border border-gray-200",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  // Datas de negócio (emissão/entrega) são salvas como meia-noite UTC. formatDate
  // formata em UTC, então o dia exibido bate com o escolhido (evita off-by-one).
  return formatDate(iso);
}

function fmtQty(n: string | number) {
  return parseFloat(n.toString()).toLocaleString("pt-BR", {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

export default function MinutaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  // Para SAIU_PARA_ENTREGA: exige localEstoqueId se ainda não definido.
  const [saindoLocalId, setSaindoLocalId] = useState("");
  const [showSaidaModal, setShowSaidaModal] = useState(false);

  useTabTitle(minuta?.numero ?? "Minuta");

  const load = useCallback(async () => {
    try {
      const [minRes, locRes] = await Promise.all([
        fetch(`/api/comercial/minutas/${params.id}`),
        fetch("/api/suprimentos/locais-estoque?ativo=true"),
      ]);
      const [minJson, locJson] = await Promise.all([minRes.json(), locRes.json()]);
      setMinuta(minJson.data);
      setLocais(Array.isArray(locJson) ? locJson : (locJson.data ?? []));
      setSaindoLocalId(minJson.data?.localEstoque?.id ?? "");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus: StatusMinuta, extra?: Record<string, string>) {
    setTransitioning(true); setError("");
    try {
      const res = await fetch(`/api/comercial/minutas/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao atualizar status"); return; }
      setMinuta(json.data);
      setShowSaidaModal(false);
    } finally {
      setTransitioning(false);
    }
  }

  async function handlePrint() {
    if (!minuta) return;
    setPrinting(true); setError("");
    try {
      const bytes = buildMinutaEscPos(minuta, { cols: 48 });
      await printEscPosUSB(bytes);
    } catch {
      // Qualquer falha do WebUSB cai no diálogo do navegador (bobina 80mm).
      try {
        printMinutaViaDialog(minuta);
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : "Não foi possível imprimir.");
      }
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-8">
        <div className="h-20 animate-pulse bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (!minuta) {
    return <div className="px-8 pb-8 text-gray-500">Minuta não encontrada.</div>;
  }

  return (
    <div className="px-8 pb-8 space-y-6">
      <PageHeader
        title={minuta.numero}
        breadcrumbs={[
          { label: "Minutas", href: "/comercial/minutas" },
          { label: minuta.numero },
        ]}
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-600 border border-gray-200">
              {TIPO_MINUTA_LABEL[minuta.tipo] ?? "Entrega"}
            </span>
            <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold", STATUS_COLOR[minuta.status])}>
              {statusMinutaLabel(minuta.status, minuta.tipo)}
            </span>
          </div>
        }
      />

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {minuta.status === "PENDENTE" && (
          <Button
            onClick={() => {
              if (!minuta.localEstoque) setShowSaidaModal(true);
              else changeStatus("SAIU_PARA_ENTREGA");
            }}
            disabled={transitioning}
            className="gap-2 font-semibold bg-blue-600 hover:bg-blue-700"
          >
            <ArrowRight className="w-4 h-4" />
            Registrar Saída
          </Button>
        )}
        {minuta.status === "SAIU_PARA_ENTREGA" && (
          <Button
            onClick={() => changeStatus("ENTREGUE")}
            disabled={transitioning}
            className="gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="w-4 h-4" />
            {confirmacaoMinutaLabel(minuta.tipo)}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => router.push(`/comercial/minutas/${params.id}/editar`)}
          disabled={transitioning}
          className="gap-2 border-gray-300 text-gray-700"
        >
          <Pencil className="w-4 h-4" />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={handlePrint}
          disabled={printing || transitioning}
          className="gap-2 border-gray-300 text-gray-700"
          title="Imprime direto via USB (Chrome/Edge); sem impressora USB autorizada, abre o diálogo de impressão"
        >
          <Printer className="w-4 h-4" />
          {printing ? "Imprimindo..." : "Imprimir"}
        </Button>
        {minuta.status === "PENDENTE" && (
          <>
            <span className="w-px h-6 bg-gray-200" />
            <Button
              variant="ghost"
              onClick={() => changeStatus("CANCELADA")}
              disabled={transitioning}
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4" />
              Cancelar Minuta
            </Button>
          </>
        )}
      </div>

      {/* SAIDA modal — choose local if not set */}
      {showSaidaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800">Selecionar Local de Estoque</h3>
            <p className="text-sm text-gray-600">
              Escolha o local de onde os itens sairão para registrar o movimento de estoque.
            </p>
            <Select value={saindoLocalId} onValueChange={setSaindoLocalId}>
              <SelectTrigger className="h-10 border-gray-300">
                <SelectValue placeholder="Selecione o local..." />
              </SelectTrigger>
              <SelectContent>
                {locais.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => {
                  if (!saindoLocalId) { setError("Selecione o local de estoque"); return; }
                  changeStatus("SAIU_PARA_ENTREGA", { localEstoqueId: saindoLocalId });
                }}
                disabled={transitioning || !saindoLocalId}
                className="flex-1 font-semibold"
              >
                {transitioning ? "Processando..." : "Confirmar Saída"}
              </Button>
              <Button variant="outline" onClick={() => setShowSaidaModal(false)} className="border-gray-300">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !showSaidaModal && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">

        {/* LEFT — dados principais */}
        <div className="col-span-2 space-y-4">

          {/* Info card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Dados da Minuta</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pedido de Venda</div>
                <button
                  onClick={() => router.push(`/pedidos-venda/${minuta.pedidoVenda.id}`)}
                  className="font-mono font-semibold text-blue-600 hover:underline"
                >
                  {minuta.pedidoVenda.numero}
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</div>
                <div className="text-gray-800 font-medium">
                  {minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Local de Estoque</div>
                <div className="text-gray-800">{minuta.localEstoque?.nome ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Emissão</div>
                <div className="text-gray-800">{fmtDate(minuta.dataEmissao)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de {minuta.tipo === "RETIRADA" ? "Retirada" : "Entrega"}</div>
                <div className="text-gray-800">{fmtDate(minuta.dataEntrega)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motorista</div>
                <div className="text-gray-800">{minuta.motorista?.nome ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Placa</div>
                <div className="text-gray-800">{minuta.placa ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nº da Minuta Física</div>
                <div className="text-gray-800">{minuta.numeroFisico ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Itens</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Produto</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-gray-500 w-36">Quantidade</th>
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500 w-24">Unidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {minuta.itens.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-gray-800">{item.item.descricao}</div>
                      <div className="text-xs text-gray-400">{item.item.codigo}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums text-gray-800">
                      {item.quantidadeConvertida && item.unidade ? (
                        <div>
                          <span className="font-semibold">{fmtQty(item.quantidadeConvertida)}</span>
                          <span className="text-gray-400 ml-1 text-xs">{item.unidade.sigla}</span>
                          <div className="text-xs text-gray-400">= {fmtQty(item.quantidade)} UN</div>
                        </div>
                      ) : (
                        <span className="font-semibold">{fmtQty(item.quantidade)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-gray-500">
                      {item.unidade?.sigla ?? "UN"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT — observações */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Observações</h2>
            </div>
            <div className="p-5">
              {minuta.observacoes ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{minuta.observacoes}</p>
              ) : (
                <p className="text-sm text-gray-400 italic">Sem observações.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
