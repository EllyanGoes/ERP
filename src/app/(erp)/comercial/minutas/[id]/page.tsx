"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, ArrowRight, AlertCircle, Pencil, Save, Printer } from "lucide-react";
import { useTabTitle } from "@/lib/tabs-context";
import { statusMinutaLabel, confirmacaoMinutaLabel, TIPO_MINUTA_LABEL, type TipoMinuta } from "@/lib/minuta-labels";
import { cn, formatDate } from "@/lib/utils";
import { buildMinutaEscPos } from "@/lib/escpos-minuta";
import { printEscPosUSB } from "@/lib/webusb-print";

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

type ItemUnidade = {
  id: string;
  fatorConversao: string | null;
  unidade: { id: string; sigla: string; nome: string };
};

type PedidoVendaItem = {
  id: string;
  itemId: string;
  quantidade: string;
  item: {
    id: string; codigo: string; descricao: string;
    unidade: { id: string; sigla: string; nome: string } | null;
    itemUnidades: ItemUnidade[];
  };
  minutaItens: { quantidade: string }[];
};

type ItemRow = {
  pvItemId: string;
  itemId: string;
  descricao: string;
  codigo: string;
  unidadeBase: string;
  baseUnitId: string;
  saldoDisponivel: number;
  quantidade: string;
  unidadeId: string;
  unidades: ItemUnidade[];
};

type LocalEstoque = { id: string; nome: string };
type Motorista = { id: string; nome: string };

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
    itens: PedidoVendaItem[];
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
  // Datas de negócio (emissão/entrega) são salvas como meia-noite UTC.
  // formatDate (utils) formata em UTC, então o dia exibido bate com o que foi
  // escolhido no input de edição (evita o off-by-one em fuso UTC-3).
  return formatDate(iso);
}

function fmtQty(n: string | number) {
  return parseFloat(n.toString()).toLocaleString("pt-BR", {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

// Linhas editáveis a partir dos itens da minuta. O "saldo" é o máximo que ESTA
// minuta pode ter por item (qtd. do pedido − o que OUTRAS minutas não-canceladas
// já consumiram). Espelha a tela /editar.
function buildRows(minuta: Minuta): ItemRow[] {
  const pvById: Record<string, PedidoVendaItem> = {};
  for (const pv of minuta.pedidoVenda.itens) pvById[pv.id] = pv;

  const estaPorPv: Record<string, number> = {};
  for (const mi of minuta.itens) {
    const pvId = mi.pedidoVendaItem.id;
    estaPorPv[pvId] = (estaPorPv[pvId] ?? 0) + parseFloat(mi.quantidade.toString());
  }

  return minuta.itens.map((mi) => {
    const pv = pvById[mi.pedidoVendaItem.id];
    const baseUnitId = pv?.item.unidade?.id ?? "";
    const unidadeBase = pv?.item.unidade?.sigla ?? "UN";
    const pedidoQty = parseFloat(mi.pedidoVendaItem.quantidade.toString());
    const totalMinutado = (pv?.minutaItens ?? []).reduce((s, x) => s + parseFloat(x.quantidade.toString()), 0);
    const esta = minuta.status === "CANCELADA" ? 0 : (estaPorPv[mi.pedidoVendaItem.id] ?? 0);
    const outras = totalMinutado - esta;
    const saldo = Math.max(pedidoQty - outras, 0);

    const usouConversao = mi.quantidadeConvertida != null;
    return {
      pvItemId: mi.pedidoVendaItem.id,
      itemId: mi.itemId,
      descricao: mi.item.descricao,
      codigo: mi.item.codigo,
      unidadeBase,
      baseUnitId,
      saldoDisponivel: saldo,
      quantidade: usouConversao
        ? String(parseFloat((mi.quantidadeConvertida as string).toString()))
        : String(parseFloat(mi.quantidade.toString())),
      unidadeId: mi.unidadeId ?? baseUnitId,
      unidades: pv?.item.itemUnidades ?? [],
    };
  });
}

export default function MinutaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  // For SAIU_PARA_ENTREGA confirmation: require localEstoqueId if not set
  const [saindoLocalId, setSaindoLocalId] = useState("");
  const [showSaidaModal, setShowSaidaModal] = useState(false);

  // Edit mode — disponível para todos enquanto não finalizada;
  // administradores podem editar em qualquer status (inclusive Entregue/Cancelada).
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [eNumeroFisico, setENumeroFisico]   = useState("");
  const [eTipo, setETipo]                    = useState<TipoMinuta>("ENTREGA");
  const [eDataEntrega, setEDataEntrega]      = useState("");
  const [eMotoristaId, setEMotoristaId]      = useState("");
  const [ePlaca, setEPlaca]                  = useState("");
  const [eLocalEstoqueId, setELocalEstoqueId] = useState("");
  const [eObservacoes, setEObservacoes]      = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);

  useTabTitle(minuta?.numero ?? "Minuta");

  const load = useCallback(async () => {
    try {
      const [minRes, locRes, motRes] = await Promise.all([
        fetch(`/api/comercial/minutas/${params.id}`),
        fetch("/api/suprimentos/locais-estoque?ativo=true"),
        fetch("/api/comercial/motoristas?ativo=true"),
      ]);
      const [minJson, locJson, motJson] = await Promise.all([minRes.json(), locRes.json(), motRes.json()]);
      setMinuta(minJson.data);
      setLocais(Array.isArray(locJson) ? locJson : (locJson.data ?? []));
      setMotoristas(Array.isArray(motJson) ? motJson : (motJson.data ?? []));
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

  function updateRow(idx: number, field: keyof ItemRow, value: string) {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function startEditing() {
    if (!minuta) return;
    setENumeroFisico(minuta.numeroFisico ?? "");
    setETipo(minuta.tipo);
    setEDataEntrega(minuta.dataEntrega ? minuta.dataEntrega.slice(0, 10) : "");
    setEMotoristaId(minuta.motorista?.id ?? "");
    setEPlaca(minuta.placa ?? "");
    setELocalEstoqueId(minuta.localEstoque?.id ?? "");
    setEObservacoes(minuta.observacoes ?? "");
    setRows(buildRows(minuta));
    setError("");
    setEditing(true);
  }

  async function handlePrint() {
    if (!minuta) return;
    setPrinting(true); setError("");
    try {
      const bytes = buildMinutaEscPos(minuta, { cols: 48 });
      await printEscPosUSB(bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível imprimir.");
    } finally {
      setPrinting(false);
    }
  }

  async function saveEdits() {
    const validRows = rows.filter(r => parseFloat(r.quantidade || "0") > 0);
    if (validRows.length === 0) { setError("Informe ao menos um item com quantidade"); return; }

    // Converte as quantidades para a unidade base (igual à tela /editar). O backend
    // reconcilia o estoque pelo delta — re-salvar com os mesmos itens é efeito zero.
    const itens = validRows.map(r => {
      const qtdTyped = parseFloat(r.quantidade) || 0;
      const selUn = r.unidades.find(u => u.unidade.id === r.unidadeId);
      const isConversion = selUn && r.unidadeId !== r.baseUnitId;
      if (isConversion && selUn?.fatorConversao) {
        const fator = parseFloat(selUn.fatorConversao.toString());
        return { pedidoVendaItemId: r.pvItemId, itemId: r.itemId, quantidade: qtdTyped * fator, quantidadeConvertida: qtdTyped, unidadeId: r.unidadeId };
      }
      return { pedidoVendaItemId: r.pvItemId, itemId: r.itemId, quantidade: qtdTyped, quantidadeConvertida: null, unidadeId: r.unidadeId || null };
    });

    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/comercial/minutas/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroFisico:   eNumeroFisico,
          tipo:           eTipo,
          dataEntrega:    eDataEntrega || null,
          motoristaId:    eMotoristaId || null,
          placa:          ePlaca,
          localEstoqueId: eLocalEstoqueId || null,
          observacoes:    eObservacoes,
          itens,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao salvar"); return; }
      setMinuta(json.data);
      setSaindoLocalId(json.data?.localEstoque?.id ?? "");
      setEditing(false);
    } finally {
      setSaving(false);
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
      {editing ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={saveEdits}
            disabled={saving}
            className="gap-2 font-semibold bg-blue-600 hover:bg-blue-700"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setEditing(false); setError(""); }}
            disabled={saving}
            className="border-gray-300 text-gray-600"
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          {minuta.status === "PENDENTE" && (
            <Button
              onClick={() => {
                if (!minuta.localEstoque) {
                  setShowSaidaModal(true);
                } else {
                  changeStatus("SAIU_PARA_ENTREGA");
                }
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
            onClick={startEditing}
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
            title="Imprimir na impressora térmica (USB) — Chrome/Edge"
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
      )}

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
            {editing ? (
              <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pedido de Venda</div>
                  <div className="font-mono font-semibold text-gray-700">{minuta.pedidoVenda.numero}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</div>
                  <div className="text-gray-800 font-medium">
                    {minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
                  <Select value={eTipo} onValueChange={(v) => setETipo(v as TipoMinuta)}>
                    <SelectTrigger className="h-10 border-gray-300"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTREGA">{TIPO_MINUTA_LABEL.ENTREGA}</SelectItem>
                      <SelectItem value="RETIRADA">{TIPO_MINUTA_LABEL.RETIRADA}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Local de Estoque</label>
                  {minuta.status === "PENDENTE" ? (
                    <Select value={eLocalEstoqueId} onValueChange={setELocalEstoqueId}>
                      <SelectTrigger className="h-10 border-gray-300"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {locais.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400 italic">Nenhum local cadastrado</div>
                        ) : locais.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-gray-800 pt-2">
                      {minuta.localEstoque?.nome ?? "—"}
                      {(minuta.status === "SAIU_PARA_ENTREGA" || minuta.status === "ENTREGUE") && (
                        <span className="ml-1 text-xs text-gray-400">(estoque já baixado)</span>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de Emissão</div>
                  <div className="text-gray-800 pt-2">{fmtDate(minuta.dataEmissao)}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data de {eTipo === "RETIRADA" ? "Retirada" : "Entrega"}</label>
                  <Input type="date" value={eDataEntrega} onChange={e => setEDataEntrega(e.target.value)} className="h-10 border-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motorista</label>
                  <Select value={eMotoristaId} onValueChange={setEMotoristaId}>
                    <SelectTrigger className="h-10 border-gray-300"><SelectValue placeholder="Selecione o motorista..." /></SelectTrigger>
                    <SelectContent>
                      {motoristas.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-400 italic">Nenhum motorista cadastrado</div>
                      ) : motoristas.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Placa</label>
                  <Input value={ePlaca} onChange={e => setEPlaca(e.target.value)} className="h-10 border-gray-300" placeholder="AAA-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nº da Minuta Física</label>
                  <Input value={eNumeroFisico} onChange={e => setENumeroFisico(e.target.value)} className="h-10 border-gray-300" placeholder="Número do bloco físico" />
                </div>
              </div>
            ) : (
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
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Itens</h2>
            </div>
            {editing ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500">Produto</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-gray-500 w-32">Saldo</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-gray-500 w-40">Qtd.</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-gray-500 w-32">Unidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, idx) => (
                    <tr key={r.pvItemId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 align-middle">
                        <div className="font-medium text-gray-800">{r.descricao}</div>
                        <div className="text-xs text-gray-400">{r.codigo}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-middle text-gray-600 tabular-nums">
                        {fmtQty(r.saldoDisponivel)} <span className="text-gray-400 text-xs">{r.unidadeBase}</span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Input
                          type="number" min="0" step="0.001"
                          value={r.quantidade}
                          onChange={e => updateRow(idx, "quantidade", e.target.value)}
                          className="h-8 w-full text-right text-sm font-semibold border-blue-400 bg-blue-50 text-blue-900 focus-visible:border-blue-500 focus-visible:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {r.unidades.length > 0 ? (
                          <Select value={r.unidadeId} onValueChange={(v) => updateRow(idx, "unidadeId", v)}>
                            <SelectTrigger className="h-8 border-gray-300 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={r.baseUnitId}>{r.unidadeBase} (base)</SelectItem>
                              {r.unidades.map(u => (
                                <SelectItem key={u.unidade.id} value={u.unidade.id}>
                                  {u.unidade.sigla}{u.fatorConversao ? ` (×${parseFloat(u.fatorConversao.toString())})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-gray-500 text-sm px-1">{r.unidadeBase}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
                            <div className="text-xs text-gray-400">
                              = {fmtQty(item.quantidade)} UN
                            </div>
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
            )}
          </div>
        </div>

        {/* RIGHT — observações */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-sm text-gray-800 uppercase tracking-wide">Observações</h2>
            </div>
            <div className="p-5">
              {editing ? (
                <Textarea
                  value={eObservacoes}
                  onChange={e => setEObservacoes(e.target.value)}
                  rows={4}
                  placeholder={`Observações sobre a ${eTipo === "RETIRADA" ? "retirada" : "entrega"}...`}
                  className="resize-none border-gray-300"
                />
              ) : minuta.observacoes ? (
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
