"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/shared/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Plus, X } from "lucide-react";
import { useTabTitle, useTabsContext } from "@/lib/tabs-context";
import { TIPO_MINUTA_LABEL, statusMinutaLabel, type StatusMinuta } from "@/lib/minuta-labels";
import { cn, parseDecimal } from "@/lib/utils";
import { enviarPermitindoSaldoNegativo } from "@/lib/saldo-negativo-retry";

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
    id: string;
    codigo: string;
    descricao: string;
    unidade: { id: string; sigla: string; nome: string } | null;
    itemUnidades: ItemUnidade[];
  };
  minutaItens: { quantidade: string }[];
};

type MinutaItem = {
  id: string;
  itemId: string;
  quantidade: string;
  quantidadeConvertida: string | null;
  unidadeId: string | null;
  item: { id: string; codigo: string; descricao: string };
  unidade: { id: string; sigla: string; nome: string } | null;
  pedidoVendaItem: { id: string; quantidade: string };
};

type LocalEstoque = { id: string; nome: string };
type Motorista = { id: string; nome: string };

type Minuta = {
  id: string;
  numero: string;
  numeroFisico: string | null;
  status: "PENDENTE" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "CANCELADA";
  tipo: "ENTREGA" | "RETIRADA";
  dataEntrega: string | null;
  placa: string | null;
  observacoes: string | null;
  localEstoque: LocalEstoque | null;
  motorista: Motorista | null;
  pedidoVenda: {
    id: string;
    numero: string;
    cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
    itens: PedidoVendaItem[];
  };
  itens: MinutaItem[];
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

function fmtQty(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Saldo do item de pedido ainda não consumido por minutas não-canceladas — o
// máximo que um item recém-adicionado pode levar nesta minuta. Como só oferecemos
// itens que NÃO estão nesta minuta, `pv.minutaItens` (não-canceladas) não inclui
// esta minuta, então o resultado já é o disponível para adicionar.
function calcSaldo(pv: PedidoVendaItem): number {
  const total = parseFloat(pv.quantidade.toString());
  const minutado = pv.minutaItens.reduce((s, mi) => s + parseFloat(mi.quantidade.toString()), 0);
  return Math.max(total - minutado, 0);
}

// Constrói uma linha editável para um item do pedido que ainda não está na minuta.
function rowFromPedidoItem(pv: PedidoVendaItem): ItemRow {
  const saldo = calcSaldo(pv);
  return {
    pvItemId: pv.id,
    itemId: pv.itemId,
    descricao: pv.item.descricao,
    codigo: pv.item.codigo,
    unidadeBase: pv.item.unidade?.sigla ?? "UN",
    baseUnitId: pv.item.unidade?.id ?? "",
    saldoDisponivel: saldo,
    quantidade: saldo > 0 ? String(saldo) : "0",
    unidadeId: pv.item.unidade?.id ?? "",
    unidades: pv.item.itemUnidades,
  };
}

// Constrói as linhas editáveis a partir dos itens da minuta. O "saldo" mostrado é
// o máximo que ESTA minuta pode ter para cada item (qtd. do pedido − o que as
// OUTRAS minutas não-canceladas já consumiram).
function buildRows(minuta: Minuta): ItemRow[] {
  const pvById: Record<string, PedidoVendaItem> = {};
  for (const pv of minuta.pedidoVenda.itens) pvById[pv.id] = pv;

  // Quanto ESTA minuta consome por item de pedido (em unidade base).
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
    // Se esta minuta está cancelada, ela não entra no agregado de minutaItens.
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

export default function EditarMinutaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { replaceCurrentTab } = useTabsContext();

  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  // Form fields
  const [status, setStatus] = useState<StatusMinuta>("SAIU_PARA_ENTREGA");
  const [tipo, setTipo] = useState<"ENTREGA" | "RETIRADA">("ENTREGA");
  const [localEstoqueId, setLocalEstoqueId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [placa, setPlaca] = useState("");
  const [numeroFisico, setNumeroFisico] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useTabTitle(minuta ? `Editar ${minuta.numero}` : "Editar Minuta");

  const load = useCallback(async () => {
    try {
      const [minRes, locRes, motRes] = await Promise.all([
        fetch(`/api/comercial/minutas/${params.id}`),
        fetch("/api/suprimentos/locais-estoque?ativo=true"),
        fetch("/api/comercial/motoristas?ativo=true"),
      ]);
      const [minJson, locJson, motJson] = await Promise.all([minRes.json(), locRes.json(), motRes.json()]);
      const m: Minuta | null = minJson.data ?? null;
      setMinuta(m);
      setLocais(Array.isArray(locJson) ? locJson : (locJson.data ?? []));
      setMotoristas(Array.isArray(motJson) ? motJson : (motJson.data ?? []));

      if (m) {
        setStatus(m.status);
        setTipo(m.tipo);
        setLocalEstoqueId(m.localEstoque?.id ?? "");
        setMotoristaId(m.motorista?.id ?? "");
        setDataEntrega(m.dataEntrega ? m.dataEntrega.slice(0, 10) : "");
        setPlaca(m.placa ?? "");
        setNumeroFisico(m.numeroFisico ?? "");
        setObservacoes(m.observacoes ?? "");
        setRows(buildRows(m));
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  function updateRow(idx: number, field: keyof ItemRow, value: string) {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addItem(pvItemId: string) {
    const pv = minuta?.pedidoVenda.itens.find(p => p.id === pvItemId);
    if (!pv) return;
    setRows(prev => [...prev, rowFromPedidoItem(pv)]);
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  // Itens do pedido que ainda têm saldo e não estão nesta minuta — disponíveis para adicionar.
  const currentPvIds = new Set(rows.map(r => r.pvItemId));
  const itensAdicionaveis = (minuta?.pedidoVenda.itens ?? []).filter(
    pv => !currentPvIds.has(pv.id) && calcSaldo(pv) > 0
  );

  async function handleSave() {
    const validRows = rows.filter(r => parseDecimal(r.quantidade || "0") > 0);
    if (validRows.length === 0) { setError("Informe ao menos um item com quantidade"); return; }
    if ((status === "SAIU_PARA_ENTREGA" || status === "ENTREGUE") && !localEstoqueId) {
      setError("Selecione o Local de Estoque para registrar a saída");
      return;
    }

    setSaving(true); setError("");
    try {
      // Converte as quantidades para a unidade base, igual à Nova Minuta
      const itens = validRows.map(r => {
        const qtdTyped = parseDecimal(r.quantidade) || 0;
        const selUn = r.unidades.find(u => u.unidade.id === r.unidadeId);
        const isConversion = selUn && r.unidadeId !== r.baseUnitId;

        if (isConversion && selUn?.fatorConversao) {
          const fator = parseFloat(selUn.fatorConversao.toString());
          return {
            pedidoVendaItemId: r.pvItemId,
            itemId: r.itemId,
            quantidade: qtdTyped * fator,
            quantidadeConvertida: qtdTyped,
            unidadeId: r.unidadeId,
          };
        }
        return {
          pedidoVendaItemId: r.pvItemId,
          itemId: r.itemId,
          quantidade: qtdTyped,
          quantidadeConvertida: null,
          unidadeId: r.unidadeId || null,
        };
      });

      // Editar/entregar minuta baixa estoque: se deixar saldo negativo, o helper
      // avisa e reenvia com permitirSaldoNegativo.
      const res = await enviarPermitindoSaldoNegativo((permitirSaldoNegativo) =>
        fetch(`/api/comercial/minutas/${params.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            numeroFisico:   numeroFisico.trim() || null,
            tipo,
            localEstoqueId: localEstoqueId || null,
            motoristaId:    motoristaId || null,
            dataEntrega:    dataEntrega || null,
            placa:          placa || null,
            observacoes:    observacoes || null,
            itens,
            permitirSaldoNegativo,
          }),
        }),
      );
      if (!res) return; // usuário recusou o aviso de saldo negativo

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao salvar minuta"); return; }
      // Volta para o detalhe reaproveitando a aba de edição (sem deixar a aba
      // "Editar …" para trás), espelhando o fluxo do Pedido de Venda.
      replaceCurrentTab(`/comercial/minutas/${params.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pb-8">
        <div className="h-20 animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }

  if (!minuta) {
    return <div className="px-8 pb-8 text-muted-foreground">Minuta não encontrada.</div>;
  }

  const cliente = minuta.pedidoVenda.cliente.nomeFantasia || minuta.pedidoVenda.cliente.razaoSocial;
  const precisaLocal = status === "SAIU_PARA_ENTREGA" || status === "ENTREGUE";

  return (
    <div className="px-8 pb-8 space-y-6">
      <PageHeader title={`Editar Minuta ${minuta.numero}`} />

      <div className="grid grid-cols-3 gap-6 items-start">

        {/* LEFT — dados da minuta */}
        <div className="col-span-2 space-y-6">

          {/* Pedido de Venda */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Pedido de Venda</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-foreground">{minuta.pedidoVenda.numero}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-foreground">{cliente}</span>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Itens a {tipo === "RETIRADA" ? "Retirar" : "Entregar"}</h2>
            </div>
            {rows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Esta minuta não tem itens.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-muted-foreground">Produto</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-muted-foreground w-32">Saldo</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-muted-foreground w-40">Qtd. {tipo === "RETIRADA" ? "Retirada" : "Entrega"}</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-muted-foreground w-32">Unidade</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, idx) => (
                    <tr key={r.pvItemId} className="hover:bg-muted">
                      <td className="px-4 py-3 align-middle">
                        <div className="font-medium text-foreground">{r.descricao}</div>
                        <div className="text-xs text-muted-foreground">{r.codigo}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-middle text-muted-foreground tabular-nums">
                        {fmtQty(r.saldoDisponivel)} <span className="text-muted-foreground text-xs">{r.unidadeBase}</span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Input
                          inputMode="decimal"
                          value={r.quantidade}
                          onChange={e => updateRow(idx, "quantidade", e.target.value)}
                          className="h-8 w-full text-right text-sm font-semibold border-blue-400 bg-info/10 text-blue-900 focus-visible:border-blue-500 focus-visible:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {r.unidades.length > 0 ? (
                          <Select
                            value={r.unidadeId}
                            onValueChange={(v) => updateRow(idx, "unidadeId", v)}
                          >
                            <SelectTrigger className="h-8 border-border text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Base unit option */}
                              <SelectItem value={r.baseUnitId}>
                                {r.unidadeBase} (base)
                              </SelectItem>
                              {r.unidades.map(u => (
                                <SelectItem key={u.unidade.id} value={u.unidade.id}>
                                  {u.unidade.sigla}
                                  {u.fatorConversao ? ` (×${parseFloat(u.fatorConversao.toString())})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-sm px-1">{r.unidadeBase}</span>
                        )}
                      </td>
                      <td className="px-2 py-3 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-muted-foreground/60 hover:text-red-500 transition-colors"
                          title="Remover item da minuta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {itensAdicionaveis.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-muted">
                <Select value="" onValueChange={addItem}>
                  <SelectTrigger className="h-9 w-auto gap-2 border-dashed border-border text-sm text-muted-foreground">
                    <Plus className="w-4 h-4" />
                    <SelectValue placeholder="Adicionar item do pedido..." />
                  </SelectTrigger>
                  <SelectContent>
                    {itensAdicionaveis.map(pv => (
                      <SelectItem key={pv.id} value={pv.id}>
                        {pv.item.descricao}
                        <span className="text-muted-foreground">
                          {" "}— saldo {fmtQty(calcSaldo(pv))} {pv.item.unidade?.sigla ?? "UN"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — detalhes */}
        <div className="col-span-1 space-y-4">

          {/* Logística */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Logística</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusMinuta)}>
                  <SelectTrigger className="h-10 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">{statusMinutaLabel("PENDENTE", tipo)}</SelectItem>
                    <SelectItem value="SAIU_PARA_ENTREGA">{statusMinutaLabel("SAIU_PARA_ENTREGA", tipo)}</SelectItem>
                    <SelectItem value="ENTREGUE">{statusMinutaLabel("ENTREGUE", tipo)}</SelectItem>
                    <SelectItem value="CANCELADA">{statusMinutaLabel("CANCELADA", tipo)}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  O estoque é ajustado automaticamente conforme o status.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Nº da Minuta Física</label>
                <Input
                  value={numeroFisico}
                  onChange={e => setNumeroFisico(e.target.value)}
                  className="h-10 border-border"
                  placeholder="Número do bloco físico"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Tipo</label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as "ENTREGA" | "RETIRADA")}>
                  <SelectTrigger className="h-10 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENTREGA">{TIPO_MINUTA_LABEL.ENTREGA}</SelectItem>
                    <SelectItem value="RETIRADA">{TIPO_MINUTA_LABEL.RETIRADA}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Local de Estoque {precisaLocal && <span className="text-red-500">*</span>}</label>
                <Select value={localEstoqueId} onValueChange={setLocalEstoqueId}>
                  <SelectTrigger className="h-10 border-border">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locais.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum local cadastrado</div>
                    ) : locais.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Data de {tipo === "RETIRADA" ? "Retirada" : "Entrega"}</label>
                <DatePicker
                  value={dataEntrega}
                  onChange={v => setDataEntrega(v)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Motorista</label>
                <Select value={motoristaId} onValueChange={setMotoristaId}>
                  <SelectTrigger className="h-10 border-border">
                    <SelectValue placeholder="Selecione o motorista..." />
                  </SelectTrigger>
                  <SelectContent>
                    {motoristas.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum motorista cadastrado</div>
                    ) : motoristas.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Placa</label>
                <Input
                  value={placa}
                  onChange={e => setPlaca(e.target.value)}
                  className="h-10 border-border"
                  placeholder="AAA-0000"
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Observações</h2>
            </div>
            <div className="p-5">
              <Textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={4}
                placeholder={`Observações sobre a ${tipo === "RETIRADA" ? "retirada" : "entrega"}...`}
                className="resize-none border-border"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
        )}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || (precisaLocal && !localEstoqueId)} className="font-semibold">
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
        <Button variant="outline" onClick={() => router.back()} className="border-border text-muted-foreground">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
