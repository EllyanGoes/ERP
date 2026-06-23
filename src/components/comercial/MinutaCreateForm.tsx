"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle } from "lucide-react";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { useCreateDrawer, useVoltarCriacao } from "@/components/shared/CreateDrawer";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { TIPO_MINUTA_LABEL } from "@/lib/minuta-labels";
import { cn, parseDecimal } from "@/lib/utils";

type PedidoVendaResumido = {
  id: string;
  numero: string;
  numeroOrcamento: string | null;
  status: string;
  cliente: { razaoSocial: string; nomeFantasia: string | null };
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
    id: string;
    codigo: string;
    descricao: string;
    unidade: { id: string; sigla: string; nome: string } | null;
    itemUnidades: ItemUnidade[];
  };
  minutaItens: { quantidade: string }[];
};

type PedidoVenda = {
  id: string;
  numero: string;
  status: string;
  necessidadeEntrega?: string | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  itens: PedidoVendaItem[];
};

type Motorista = { id: string; nome: string };

type ItemRow = {
  pvItemId: string;
  itemId: string;
  descricao: string;
  codigo: string;
  unidadeBase: string;
  saldoDisponivel: number;
  quantidade: string;
  unidadeId: string;
  unidades: ItemUnidade[];
};

function calcSaldo(pvItem: PedidoVendaItem): number {
  const total = parseFloat(pvItem.quantidade.toString());
  const minutado = pvItem.minutaItens.reduce((s, mi) => s + parseFloat(mi.quantidade.toString()), 0);
  return Math.max(total - minutado, 0);
}

function fmtQty(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export default function MinutaCreateForm() {
  const drawer = useCreateDrawer();
  const voltar = useVoltarCriacao("/comercial/minutas");
  const { confirmCreated, dialog } = useCreateFlow({
    entity: "minuta",
    gender: "f",
    onNew: () => { window.location.href = "/comercial/minutas/nova"; },
    viewHref: (id) => `/comercial/minutas/${id}`,
  });
  const searchParams = useSearchParams();
  const pedidoVendaIdParam = searchParams.get("pedidoVendaId");

  const [pedidos, setPedidos] = useState<PedidoVendaResumido[]>([]);

  const SESSION_KEY = "nova-minuta:pedidoVendaId";
  const [pedidoVendaId, setPedidoVendaId] = useState(pedidoVendaIdParam ?? "");
  const [pedido, setPedido] = useState<PedidoVenda | null>(null);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  // Form fields
  const [tipo, setTipo] = useState<"ENTREGA" | "RETIRADA">("ENTREGA");
  const [motoristaId, setMotoristaId] = useState("");
  const [dataEntrega, setDataEntrega] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [placa, setPlaca] = useState("");
  const [numeroFisico, setNumeroFisico] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);
  // Local de saída resolvido automaticamente por item (categoria/saldo) — exibido
  // ao lado de cada item; substitui a escolha de um local único na logística.
  const [localSaida, setLocalSaida] = useState<Record<string, string | null>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Restore from sessionStorage on mount (if no URL param)
  useEffect(() => {
    if (!pedidoVendaIdParam) {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) setPedidoVendaId(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist pedidoVendaId to sessionStorage whenever it changes
  useEffect(() => {
    if (pedidoVendaId) {
      sessionStorage.setItem(SESSION_KEY, pedidoVendaId);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [pedidoVendaId]);

  // Load pedidos (for select when no param) — apenas Confirmado e Em Agendamento
  useEffect(() => {
    if (!pedidoVendaIdParam) {
      fetch("/api/pedidos-venda?limit=500")
        .then(r => r.json())
        .then(j => {
          const lista: PedidoVendaResumido[] = (j.data ?? []).filter(
            (p: PedidoVendaResumido) => p.status === "CONFIRMADO" || p.status === "EM_AGENDAMENTO"
          );
          setPedidos(lista);
        });
    }
  }, [pedidoVendaIdParam]);

  // Load motoristas
  useEffect(() => {
    fetch("/api/comercial/motoristas?ativo=true")
      .then(r => r.json())
      .then(j => setMotoristas(Array.isArray(j) ? j : []));
  }, []);

  // Load selected pedido
  const loadPedido = useCallback(async (id: string) => {
    if (!id) { setPedido(null); setRows([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/pedidos-venda/${id}`);
      const json = await res.json();
      const pv: PedidoVenda = json.data;
      setPedido(pv);
      // O tipo da minuta nasce conforme a necessidade de entrega do pedido
      // (Retirada → minuta de retirada; Entrega → de entrega). Pode ser trocado.
      if (pv.necessidadeEntrega === "RETIRADA" || pv.necessidadeEntrega === "ENTREGA") {
        setTipo(pv.necessidadeEntrega);
      }

      const newRows: ItemRow[] = pv.itens
        .map((pvItem) => {
          const saldo = calcSaldo(pvItem);
          return {
            pvItemId: pvItem.id,
            itemId: pvItem.itemId,
            descricao: pvItem.item.descricao,
            codigo: pvItem.item.codigo,
            unidadeBase: pvItem.item.unidade?.sigla ?? "UN",
            saldoDisponivel: saldo,
            quantidade: saldo > 0 ? String(saldo) : "0",
            unidadeId: pvItem.item.unidade?.id ?? "",
            unidades: pvItem.item.itemUnidades,
          };
        })
        .filter(r => r.saldoDisponivel > 0);

      setRows(newRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pedidoVendaId) loadPedido(pedidoVendaId);
  }, [pedidoVendaId, loadPedido]);

  // Local de saída automático por item (mesma regra da baixa real).
  useEffect(() => {
    if (!pedidoVendaId) { setLocalSaida({}); return; }
    fetch(`/api/comercial/minutas/locais-saida?pedidoVendaId=${pedidoVendaId}`)
      .then(r => r.json())
      .then(j => {
        const mapa: Record<string, string | null> = {};
        for (const e of (j.data ?? []) as { itemId: string; localNome: string | null }[]) {
          mapa[e.itemId] = e.localNome;
        }
        setLocalSaida(mapa);
      })
      .catch(() => setLocalSaida({}));
  }, [pedidoVendaId]);

  function updateRow(idx: number, field: keyof ItemRow, value: string) {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };

      // If switching unidade, keep quantidade as-is (user adjusts)
      if (field === "unidadeId") {
        const selUn = row.unidades.find(u => u.unidade.id === value);
        if (!selUn) {
          // switching back to base unit
          row.unidadeId = value;
        }
      }

      next[idx] = row;
      return next;
    });
  }

  async function handleSave() {
    if (!pedidoVendaId) { setError("Selecione um pedido de venda"); return; }
    const validRows = rows.filter(r => parseDecimal(r.quantidade || "0") > 0);
    if (validRows.length === 0) { setError("Informe ao menos um item com quantidade"); return; }
    // Local não é mais escolhido aqui: cada item sai do seu próprio local
    // (resolvido automaticamente na baixa). Ver coluna "Local (saída)".

    setSaving(true); setError("");
    try {
      // Build itens for API - convert quantities to base unit
      const itens = validRows.map(r => {
        const qtdTyped = parseDecimal(r.quantidade) || 0;

        // Find selected unit
        const selUn = r.unidades.find(u => u.unidade.id === r.unidadeId);
        const isConversion = selUn && r.unidadeId !== (pedido?.itens.find(i => i.id === r.pvItemId)?.item.unidade?.id);

        if (isConversion && selUn?.fatorConversao) {
          const fator = parseFloat(selUn.fatorConversao.toString());
          const qtdBase = qtdTyped * fator;
          return {
            pedidoVendaItemId: r.pvItemId,
            itemId: r.itemId,
            quantidade: qtdBase,
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

      const res = await fetch("/api/comercial/minutas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoVendaId,
          numeroFisico:   numeroFisico.trim() || null,
          tipo,
          localEstoqueId: null,
          motoristaId:    motoristaId || null,
          dataEntrega:    dataEntrega || null,
          placa:          placa || null,
          observacoes:    observacoes || null,
          itens,
        }),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao criar minuta"); return; }
      sessionStorage.removeItem(SESSION_KEY);
      confirmCreated(json.data.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={cn("grid gap-6 items-start", drawer ? "grid-cols-1" : "grid-cols-3")}>

        {/* LEFT — dados da minuta */}
        <div className={cn("space-y-6", !drawer && "col-span-2")}>

          {/* Pedido de Venda */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Pedido de Venda</h2>
            </div>
            <div className="p-5">
              {pedidoVendaIdParam ? (
                pedido ? (
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-foreground">{pedido.numero}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">{pedido.cliente.nomeFantasia || pedido.cliente.razaoSocial}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Carregando...</span>
                )
              ) : (
                <ComboboxWithCreate
                  className="max-w-md"
                  triggerClassName="h-10 border-border"
                  allowNone={false}
                  value={pedidoVendaId}
                  onChange={setPedidoVendaId}
                  placeholder="Busque por PV, orçamento ou cliente..."
                  options={pedidos.map((p) => {
                    const cliente = p.cliente.nomeFantasia || p.cliente.razaoSocial;
                    const orc = p.numeroOrcamento ?? "";
                    return {
                      value: p.id,
                      // label alimenta a busca (casa PV, cliente e nº do orçamento)
                      label: `${p.numero} — ${cliente}${orc ? `  ·  Orç. ${orc}` : ""}`,
                      render: () => (
                        <span className="flex items-baseline gap-1.5 truncate">
                          <span className="font-bold text-foreground shrink-0">{p.numero}</span>
                          <span className="text-muted-foreground shrink-0">—</span>
                          <span className="truncate">{cliente}</span>
                          {orc && (
                            <span className="ml-1 font-medium text-info shrink-0">Orç. {orc}</span>
                          )}
                        </span>
                      ),
                    };
                  })}
                />
              )}
            </div>
          </div>

          {/* Itens */}
          {pedido && (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted">
                <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Itens a {tipo === "RETIRADA" ? "Retirar" : "Entregar"}</h2>
              </div>
              {loading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Carregando itens...</div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Nenhum item com saldo disponível neste pedido.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-muted-foreground">Produto</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-muted-foreground w-44">Local (saída)</th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-muted-foreground w-32">Saldo</th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-muted-foreground w-40">Qtd. {tipo === "RETIRADA" ? "Retirada" : "Entrega"}</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-muted-foreground w-32">Unidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r, idx) => (
                      <tr key={r.pvItemId} className="hover:bg-muted">
                        <td className="px-4 py-3 align-middle">
                          <div className="font-medium text-foreground">{r.descricao}</div>
                          <div className="text-xs text-muted-foreground">{r.codigo}</div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {localSaida[r.itemId] ? (
                            <span className="text-sm text-foreground">{localSaida[r.itemId]}</span>
                          ) : localSaida[r.itemId] === null ? (
                            <span className="text-xs text-warning inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> sem local</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">…</span>
                          )}
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
                                <SelectItem value={pedido.itens.find(i => i.id === r.pvItemId)?.item.unidade?.id ?? ""}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
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
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wide mb-1.5">Data de {tipo === "RETIRADA" ? "Retirada" : "Entrega"}</label>
                <Input
                  type="date"
                  value={dataEntrega}
                  onChange={e => setDataEntrega(e.target.value)}
                  className="h-10 border-border"
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
        <Button onClick={handleSave} disabled={saving || !pedidoVendaId} className="font-semibold">
          {saving ? "Criando..." : "Criar Minuta"}
        </Button>
        <Button variant="outline" onClick={voltar} className="border-border text-muted-foreground">
          Cancelar
        </Button>
      </div>
      {dialog}
    </div>
  );
}
