"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle2, AlertCircle, X, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatBRL, formatDate, cn } from "@/lib/utils";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { useSession } from "@/lib/session-context";

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
  criadoPor?: string | null;
  atualizadoPor?: string | null;
  cliente: { id: string; razaoSocial: string; nomeFantasia: string | null };
  item: { id: string; codigo: string; descricao: string };
};

function autoriaTitle(criadoPor?: string | null, atualizadoPor?: string | null) {
  const partes = [];
  if (criadoPor) partes.push(`Criado por ${criadoPor}`);
  if (atualizadoPor) partes.push(`Atualizado por ${atualizadoPor}`);
  return partes.length ? partes.join(" · ") : undefined;
}

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
  const { user } = useSession();
  const isAdmin = user?.perfil === "ADMIN";
  const [activeTab, setActiveTab] = useState<"saldos" | "lancamentos">("saldos");
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
      pushToast({ type: "error", message: "Preencha cliente, item em comodato e quantidade." });
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

  // Agrupado por cliente (um cabeçalho por cliente + itens aninhados e subtotal).
  const gruposPorCliente = useMemo(() => {
    const map = new Map<string, { clienteId: string; clienteNome: string; itens: typeof saldos; totalQtd: number; totalValor: number }>();
    for (const s of saldos) {
      const g = map.get(s.clienteId) ?? { clienteId: s.clienteId, clienteNome: s.clienteNome, itens: [], totalQtd: 0, totalValor: 0 };
      g.itens.push(s);
      g.totalQtd += s.qtd;
      g.totalValor += s.valor;
      map.set(s.clienteId, g);
    }
    return Array.from(map.values());
  }, [saldos]);

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
        <div className="rounded-xl p-4 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300">
          <p className="text-sm font-medium opacity-75">Clientes com saldo</p>
          <p className="text-3xl font-bold mt-1">{totais.clientesComSaldo}</p>
        </div>
        <div className="rounded-xl p-4 bg-warning/10 text-warning">
          <p className="text-sm font-medium opacity-75">Itens em poder dos clientes</p>
          <p className="text-3xl font-bold mt-1">{totais.totalQtd.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl p-4 bg-success/10 text-success">
          <p className="text-sm font-medium opacity-75">Valor em aberto</p>
          <p className="text-3xl font-bold mt-1">{formatBRL(totais.totalValor)}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo lançamento
          </Button>
        </div>
      )}

      {/* Formulário de lançamento manual (apenas administradores) */}
      {isAdmin && showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Cliente</label>
              <ComboboxWithCreate
                value={clienteId}
                onChange={setClienteId}
                placeholder="Selecione..."
                noneLabel="Selecione"
                triggerClassName="h-10 rounded-lg"
                options={clientes.map((c) => ({ value: c.id, label: c.nomeFantasia || c.razaoSocial }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Item em Comodato</label>
              <ComboboxWithCreate
                value={itemId}
                onChange={onItemChange}
                placeholder="Selecione..."
                noneLabel="Selecione"
                triggerClassName="h-10 rounded-lg"
                options={itens.map((i) => ({ value: i.id, label: `${i.codigo} — ${i.descricao}` }))}
              />
              {itens.length === 0 && (
                <p className="text-xs text-warning mt-1">
                  Nenhum item marcado como comodato. Marque a opção &quot;Comodato&quot; no cadastro do item.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "SAIDA" | "RETORNO")}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="SAIDA">Saída (cliente levou)</option>
                <option value="RETORNO">Retorno (cliente devolveu)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Quantidade</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Valor unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Data</label>
              <DatePicker
                value={data}
                onChange={(v) => setData(v)}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Documento (opcional)</label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Ex: nota, pedido..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Observações (opcional)</label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
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

      {/* Abas */}
      <div className="flex border-b border-border gap-1">
        {([
          { key: "saldos", label: "Saldos por cliente", count: saldos.length },
          { key: "lancamentos", label: "Últimos lançamentos", count: movimentos.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === t.key
                ? "border-blue-600 text-info"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {t.label}
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-semibold",
                activeTab === t.key ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Saldos por cliente */}
      {activeTab === "saldos" && (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {saldos.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">Nenhum saldo de comodato em aberto.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Item em Comodato</th>
                <th className="px-6 py-3 font-medium text-right">Saldo (qtd)</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {gruposPorCliente.map((g) => (
                <Fragment key={g.clienteId}>
                  {/* Cabeçalho do cliente + subtotal */}
                  <tr className="border-b border-border bg-muted/40">
                    <td className="px-6 py-2.5 font-semibold text-foreground" colSpan={2}>{g.clienteNome}</td>
                    <td className="px-6 py-2.5 text-right font-semibold tabular-nums">{g.totalQtd.toLocaleString("pt-BR")}</td>
                    <td className="px-6 py-2.5 text-right font-semibold tabular-nums">{formatBRL(g.totalValor)}</td>
                  </tr>
                  {/* Itens do cliente */}
                  {g.itens.map((s) => (
                    <tr key={`${s.clienteId}|${s.itemId}`} className="border-b border-gray-50">
                      <td className="px-6 py-2"></td>
                      <td className="px-6 py-2 pl-10 text-muted-foreground">{s.itemNome}</td>
                      <td className="px-6 py-2 text-right tabular-nums">{s.qtd.toLocaleString("pt-BR")}</td>
                      <td className="px-6 py-2 text-right tabular-nums">{formatBRL(s.valor)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Últimos lançamentos */}
      {activeTab === "lancamentos" && (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {movimentos.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">Nenhum lançamento ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Item em Comodato</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium text-right">Qtd</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
                <th className="px-6 py-3 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.slice(0, 30).map((m) => (
                <tr key={m.id} title={autoriaTitle(m.criadoPor, m.atualizadoPor)} className="border-b border-gray-50">
                  <td className="px-6 py-3 text-muted-foreground">{formatDate(m.data)}</td>
                  <td className="px-6 py-3 text-foreground">{m.cliente.nomeFantasia || m.cliente.razaoSocial}</td>
                  <td className="px-6 py-3 text-muted-foreground">{m.item.codigo} — {m.item.descricao}</td>
                  <td className="px-6 py-3">
                    {m.tipo === "SAIDA" ? (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Saída
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-success">
                        <ArrowDownLeft className="w-3.5 h-3.5" /> Retorno
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{m.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatBRL(m.quantidade * m.valorUnitario)}</td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">{m.origem === "MANUAL" ? "Manual" : "Automático"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

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
