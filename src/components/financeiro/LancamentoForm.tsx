"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { useCreateFlow } from "@/components/shared/useCreateFlow";
import { formatBRL, parseDecimal } from "@/lib/utils";

type Contato = { id: string; razaoSocial: string };
type NaturezaOpt = { id: string; nome: string; subgrupo: { nome: string } | null };
type ContaOpt = { id: string; nome: string; tipo?: string; ativo?: boolean };
type Linha = { key: string; naturezaFinanceiraId: string; detalhamento: string; valor: string };

function hojeInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const novaLinha = (): Linha => ({ key: crypto.randomUUID(), naturezaFinanceiraId: "", detalhamento: "", valor: "" });

/**
 * "Novo Lançamento" — cria contas a receber/pagar no formato flow-charted-funds:
 * status (Pagamento/Agendamento), conta, contato, datas (pagamento/vencimento/
 * competência) e rateio (várias categorias = naturezas). Cada linha vira um
 * título via POST /api/financeiro/titulos.
 */
export default function LancamentoForm({ tipo, contatos }: { tipo: "receber" | "pagar"; contatos: Contato[] }) {
  const isReceber = tipo === "receber";
  const [status, setStatus] = useState<"AGENDAMENTO" | "PAGAMENTO">("AGENDAMENTO");
  const [contatoId, setContatoId] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hojeInput());
  const [dataVencimento, setDataVencimento] = useState(hojeInput());
  const [dataCompetencia, setDataCompetencia] = useState(hojeInput());
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [contas, setContas] = useState<ContaOpt[]>([]);
  const [naturezas, setNaturezas] = useState<NaturezaOpt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { confirmCreated, dialog } = useCreateFlow({
    entity: "lançamento", gender: "m",
    onNew: () => {
      setStatus("AGENDAMENTO"); setContatoId(""); setContaBancariaId(""); setDescricao("");
      setDataPagamento(hojeInput()); setDataVencimento(hojeInput()); setDataCompetencia(hojeInput());
      setLinhas([novaLinha()]); setErro(null);
    },
  });

  useEffect(() => {
    fetch("/api/financeiro/contas").then((r) => r.json()).then((j) => {
      const cs: ContaOpt[] = Array.isArray(j) ? j : (j.data ?? []);
      setContas(cs);
      setContaBancariaId((cs.find((c) => c.tipo === "CAIXA") ?? cs[0])?.id ?? "");
    }).catch(() => {});
    fetch(`/api/financeiro/naturezas?tipo=${isReceber ? "ENTRADA" : "SAIDA"}&ativo=1`)
      .then((r) => r.json()).then((j) => setNaturezas(Array.isArray(j) ? j : (j.data ?? []))).catch(() => {});
  }, [isReceber]);

  const valorLinha = (s: string) => { const v = parseDecimal(s); return Number.isFinite(v) ? v : 0; };
  const total = linhas.reduce((s, l) => s + valorLinha(l.valor), 0);
  const pago = status === "PAGAMENTO";

  function up(key: string, campo: keyof Linha, valor: string) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  async function salvar() {
    setErro(null);
    if (isReceber && !contatoId) { setErro("Selecione o cliente."); return; }
    const linhasValidas = linhas.filter((l) => parseDecimal(l.valor) > 0);
    if (linhasValidas.length === 0) { setErro("Informe ao menos uma categoria com valor."); return; }
    if (pago && !contaBancariaId) { setErro("Selecione a conta de destino."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/financeiro/titulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, status,
          contatoId: contatoId || null,
          contaBancariaId: pago ? contaBancariaId : null,
          descricao: descricao.trim() || null,
          dataPagamento: pago ? dataPagamento : null,
          dataVencimento,
          dataCompetencia,
          linhas: linhasValidas.map((l) => ({ naturezaFinanceiraId: l.naturezaFinanceiraId || null, detalhamento: l.detalhamento.trim() || null, valor: parseDecimal(l.valor) })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error ?? "Erro ao salvar."); return; }
      confirmCreated();
    } catch { setErro("Erro de conexão."); }
    finally { setSalvando(false); }
  }

  const inputCls = "w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-5">
      {/* Tipo + Status + Conta */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Tipo de Movimentação</Label>
          <div className={`h-10 rounded-lg border px-3 flex items-center gap-1.5 text-sm font-medium ${isReceber ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {isReceber ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
            {isReceber ? "Entrada" : "Saída"}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value as "AGENDAMENTO" | "PAGAMENTO")} className={inputCls}>
            <option value="AGENDAMENTO">Agendamento ({isReceber ? "a receber" : "a pagar"})</option>
            <option value="PAGAMENTO">{isReceber ? "Recebimento" : "Pagamento"} (já {isReceber ? "recebido" : "pago"})</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Conta {pago && <span className="text-red-500">*</span>}</Label>
          <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)} disabled={!pago} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
            <option value="">Selecione</option>
            {contas.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      {/* Nome + Descrição */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{isReceber ? "Cliente" : "Fornecedor"} {isReceber && <span className="text-red-500">*</span>}</Label>
          <ComboboxWithCreate
            value={contatoId}
            onChange={setContatoId}
            options={contatos.map((c) => ({ value: c.id, label: c.razaoSocial }))}
            placeholder={isReceber ? "Selecione o cliente..." : "Selecione o fornecedor..."}
            createHref={isReceber ? "/clientes/novo" : "/suprimentos/fornecedores/novo"}
            createLabel={isReceber ? "cliente" : "fornecedor"}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Descrição <span className="text-gray-400">(opcional)</span></Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Serviço prestado" />
        </div>
      </div>

      {/* Datas + Total */}
      <div className="grid grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{isReceber ? "Recebimento" : "Pagamento"}</Label>
          <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} disabled={!pago} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Vencimento</Label>
          <input type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Competência</Label>
          <input type="date" value={dataCompetencia} onChange={(e) => setDataCompetencia(e.target.value)} className={inputCls} />
        </div>
        <div className="text-right">
          <Label className="text-xs text-gray-500 block">Total</Label>
          <span className={`text-lg font-bold tabular-nums ${total > 0 ? "text-gray-900" : "text-gray-300"}`}>{formatBRL(total)}</span>
        </div>
      </div>

      {/* Rateio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Categorias</Label>
          <button type="button" onClick={() => setLinhas((p) => [...p, novaLinha()])} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Adicionar categoria
          </button>
        </div>
        {linhas.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2 items-center">
            <select value={l.naturezaFinanceiraId} onChange={(e) => up(l.key, "naturezaFinanceiraId", e.target.value)} className="h-9 rounded-lg border border-gray-300 px-2 text-sm bg-white min-w-0">
              <option value="">— Categoria —</option>
              {naturezas.map((n) => <option key={n.id} value={n.id}>{n.subgrupo ? `${n.subgrupo.nome} · ` : ""}{n.nome}</option>)}
            </select>
            <Input value={l.detalhamento} onChange={(e) => up(l.key, "detalhamento", e.target.value)} placeholder="Detalhamento (opcional)" className="h-9 min-w-0" />
            <Input value={l.valor} onChange={(e) => up(l.key, "valor", e.target.value)} placeholder="0,00" className="h-9 text-right font-mono min-w-0" />
            <button type="button" onClick={() => setLinhas((p) => (p.length > 1 ? p.filter((x) => x.key !== l.key) : p))} disabled={linhas.length <= 1} className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <p className="text-[11px] text-gray-400">Cada categoria vira um título. Crie/edite categorias em Financeiro → Naturezas Financeiras.</p>
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

      <Button onClick={salvar} disabled={salvando} className="w-full">
        {salvando ? "Salvando..." : "Adicionar"}
      </Button>
      {dialog}
    </div>
  );
}
