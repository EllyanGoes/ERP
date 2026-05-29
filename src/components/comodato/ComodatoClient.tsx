"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle2, AlertCircle, X, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils";

type Cliente = { id: string; razaoSocial: string; nomeFantasia: string | null };
type Item = { id: string; codigo: string; descricao: string; precoVenda: number };
type Movimento = {
  id: string;
  clienteId: string;
  itemId: string;
  tipo: "SAIDA" | "RETORNO";
  quantidade: number;
  valorUnitario: number;
  origem: "MANUAL" | "AUTOMATICO";
  data: string;
  documento: string | null;
  observacoes: string | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  item: { id: string; codigo: string; descricao: string };
};

type Toast = { id: number; type: "success" | "error"; message: string };

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ComodatoClient({
  clientes,
  itens,
  movimentos,
}: {
  clientes: Cliente[];
  itens: Item[];
  movimentos: Movimento[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const [clienteId, setClienteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [tipo, setTipo] = useState<"SAIDA" | "RETORNO">("SAIDA");
  const [quantidade, setQuantidade] = useState("");
  const [valorUnitario, setValorUnitario] = useState("");
  const [data, setData] = useState(todayInput());
  const [documento, setDocumento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  function pushToast(t: Omit<Toast, "id">, durationMs = 5000) {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), durationMs);
  }

  function onItemChange(id: string) {
    setItemId(id);
    const item = itens.find((i) => i.id === id);
    if (item) setValorUnitario(String(item.precoVenda));
  }

  function resetForm() {
    setClienteId("");
    setItemId("");
    setTipo("SAIDA");
    setQuantidade("");
    setValorUnitario("");
    setData(todayInput());
    setDocumento("");
    setObservacoes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clienteId || !itemId || !quantidade) {
      pushToast({ type: "error", message: "Preencha cliente, vasilhame e quantidade." });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/comodato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        itemId,
        tipo,
        quantidade,
        valorUnitario: valorUnitario || undefined,
        data,
        documento: documento || undefined,
        observacoes: observacoes || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      pushToast({ type: "error", message: "Erro ao salvar lançamento." });
      return;
    }
    pushToast({ type: "success", message: "Lançamento registrado." });
    resetForm();
    setShowForm(false);
    router.refresh();
  }

  // Saldo por cliente + item: SAÍDA debita (+), RETORNO credita (-)
  const saldos = useMemo(() => {
    const map = new Map<
      string,
      { clienteId: string; clienteNome: string; itemId: string; itemNome: string; qtd: number; valor: number }
    >();
    for (const m of movimentos) {
      const key = `${m.clienteId}|${m.itemId}`;
      const sign = m.tipo === "SAIDA" ? 1 : -1;
      const cur =
        map.get(key) ?? {
          clienteId: m.clienteId,
          clienteNome: m.cliente.nomeFantasia || m.cliente.razaoSocial,
          itemId: m.itemId,
          itemNome: `${m.item.codigo} — ${m.item.descricao}`,
          qtd: 0,
          valor: 0,
        };
      cur.qtd += sign * m.quantidade;
      cur.valor += sign * m.quantidade * m.valorUnitario;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .filter((s) => Math.abs(s.qtd) > 0.0001 || Math.abs(s.valor) > 0.0001)
      .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome) || a.itemNome.localeCompare(b.itemNome));
  }, [movimentos]);

  const totais = useMemo(() => {
    const clientesComSaldo = new Set(saldos.map((s) => s.clienteId)).size;
    const totalQtd = saldos.reduce((s, x) => s + (x.qtd > 0 ? x.qtd : 0), 0);
    const totalValor = saldos.reduce((s, x) => s + x.valor, 0);
    return { clientesComSaldo, totalQtd, totalValor };
  }, [saldos]);

  return (
    <>
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 bg-sky-50 text-sky-700">
          <p className="text-sm font-medium opacity-75">Clientes com saldo</p>
          <p className="text-3xl font-bold mt-1">{totais.clientesComSaldo}</p>
        </div>
        <div className="rounded-xl p-4 bg-amber-50 text-amber-700">
          <p className="text-sm font-medium opacity-75">Vasilhames em poder dos clientes</p>
          <p className="text-3xl font-bold mt-1">{totais.totalQtd.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl p-4 bg-emerald-50 text-emerald-700">
          <p className="text-sm font-medium opacity-75">Valor em aberto</p>
          <p className="text-3xl font-bold mt-1">{formatBRL(totais.totalValor)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo lançamento
        </Button>
      </div>

      {/* Formulário de lançamento manual */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeFantasia || c.razaoSocial}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vasilhame</label>
              <select
                value={itemId}
                onChange={(e) => onItemChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {itens.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo} — {i.descricao}
                  </option>
                ))}
              </select>
              {itens.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Nenhum item marcado como comodato. Marque a opção &quot;Comodato&quot; no cadastro do item.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "SAIDA" | "RETORNO")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="SAIDA">Saída (cliente levou)</option>
                <option value="RETORNO">Retorno (cliente devolveu)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Documento (opcional)</label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Ex: nota, pedido..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações (opcional)</label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar lançamento"}
            </Button>
          </div>
        </form>
      )}

      {/* Saldos por cliente */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Saldos por cliente</h2>
        </div>
        {saldos.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">Nenhum saldo de comodato em aberto.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Vasilhame</th>
                <th className="px-6 py-3 font-medium text-right">Saldo (qtd)</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={`${s.clienteId}|${s.itemId}`} className="border-b border-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{s.clienteNome}</td>
                  <td className="px-6 py-3 text-gray-600">{s.itemNome}</td>
                  <td className="px-6 py-3 text-right font-semibold tabular-nums">
                    {s.qtd.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatBRL(s.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Últimos lançamentos */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Últimos lançamentos</h2>
        </div>
        {movimentos.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">Nenhum lançamento ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Vasilhame</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium text-right">Qtd</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
                <th className="px-6 py-3 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.slice(0, 30).map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-6 py-3 text-gray-600">{formatDate(m.data)}</td>
                  <td className="px-6 py-3 text-gray-900">{m.cliente.nomeFantasia || m.cliente.razaoSocial}</td>
                  <td className="px-6 py-3 text-gray-600">{m.item.codigo} — {m.item.descricao}</td>
                  <td className="px-6 py-3">
                    {m.tipo === "SAIDA" ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Saída
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ArrowDownLeft className="w-3.5 h-3.5" /> Retorno
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{m.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatBRL(m.quantidade * m.valorUnitario)}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{m.origem === "MANUAL" ? "Manual" : "Automático"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Toasts */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm text-white pointer-events-auto max-w-lg ${
              t.type === "success" ? "bg-emerald-700" : "bg-red-600"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{t.message}</span>
            <button
              type="button"
              className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
