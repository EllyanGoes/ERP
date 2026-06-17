"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/utils";
import { Wallet, Plus, ArrowLeftRight, ExternalLink, Landmark } from "lucide-react";

type Conta = {
  id: string;
  nome: string;
  agencia: string | null;
  numero: string | null;
  tipo: "CORRENTE" | "POUPANCA" | "CAIXA";
  saldoInicial: string | number;
  saldoAtual: number;
  ativo: boolean;
  banco: { id: string; nome: string } | null;
  contasContabeis?: { id: string; codigo: string; nome: string }[];
};
type Banco = { id: string; nome: string };

const TIPO_LABEL: Record<Conta["tipo"], string> = {
  CORRENTE: "Conta Corrente",
  POUPANCA: "Poupança",
  CAIXA: "Caixa",
};

export default function ContasBancariasPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, b] = await Promise.all([
      fetch("/api/financeiro/contas").then((r) => r.json()),
      fetch("/api/financeiro/bancos").then((r) => r.json()),
    ]);
    setContas(c.data ?? []);
    setBancos(b.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = contas.filter((c) => c.ativo).reduce((s, c) => s + (c.saldoAtual ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Contas"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Contas" }]}
        action={
          <div className="flex gap-2">
            <TransferenciaDialog contas={contas.filter((c) => c.ativo)} onDone={load} />
            <NovaContaDialog bancos={bancos} onDone={load} />
          </div>
        }
      />
      <div className="px-8 pb-8 space-y-6">
        {/* Saldo total */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 bg-blue-50 text-blue-700">
            <p className="text-sm font-medium opacity-75">Saldo total</p>
            <p className="text-3xl font-bold mt-1">{formatBRL(total)}</p>
          </div>
          <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
            <p className="text-sm font-medium opacity-75">Contas ativas</p>
            <p className="text-3xl font-bold mt-1">{contas.filter((c) => c.ativo).length}</p>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">Carregando...</p>
          ) : contas.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">
              Nenhuma conta cadastrada. Clique em &quot;Nova Conta&quot;.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Conta</th>
                  <th className="px-6 py-3 font-medium">Banco</th>
                  <th className="px-6 py-3 font-medium">Tipo</th>
                  <th className="px-6 py-3 font-medium text-right">Saldo atual</th>
                  <th className="px-6 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!c.ativo ? "opacity-50" : ""}`}>
                    <td className="px-6 py-3">
                      <Link href={`/financeiro/contas/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {c.nome}
                      </Link>
                      {(c.agencia || c.numero) && (
                        <p className="text-xs text-gray-400">
                          {c.agencia ? `Ag. ${c.agencia}` : ""}{c.agencia && c.numero ? " · " : ""}{c.numero ? `C/C ${c.numero}` : ""}
                        </p>
                      )}
                      {c.contasContabeis?.[0] && (
                        <p className="text-[11px] text-gray-400">Conta contábil {c.contasContabeis[0].codigo}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {c.banco ? (
                        <span className="inline-flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5 text-gray-400" />{c.banco.nome}</span>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{TIPO_LABEL[c.tipo]}</td>
                    <td className={`px-6 py-3 text-right font-semibold tabular-nums ${c.saldoAtual >= 0 ? "text-gray-900" : "text-red-600"}`}>
                      {formatBRL(c.saldoAtual)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/financeiro/contas/${c.id}`} className="text-gray-300 hover:text-blue-500">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function NovaContaDialog({ bancos, onDone }: { bancos: Banco[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState<Conta["tipo"]>("CORRENTE");
  const [saldoInicial, setSaldoInicial] = useState("0");

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, bancoId: bancoId || null, agencia, numero, tipo, saldoInicial }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setNome(""); setBancoId(""); setAgencia(""); setNumero(""); setTipo("CORRENTE"); setSaldoInicial("0");
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" />Nova Conta
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova conta bancária</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Itaú Movimento" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <ComboboxWithCreate value={bancoId} onChange={setBancoId} placeholder="— Nenhum —" noneLabel="Nenhum" triggerClassName="h-10 rounded-lg"
                options={bancos.map((b) => ({ value: b.id, label: b.nome }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as Conta["tipo"])} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
                <option value="CORRENTE">Conta Corrente</option>
                <option value="POUPANCA">Poupança</option>
                <option value="CAIXA">Caixa</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Agência</Label>
              <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <Input type="number" step="0.01" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferenciaDialog({ contas, onDone }: { contas: Conta[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [valor, setValor] = useState("");
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");

  async function salvar() {
    setError("");
    const res = await fetch("/api/financeiro/transferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contaOrigemId, contaDestinoId, valor, dataLancamento, descricao }),
    });
    if (res.ok) {
      setOpen(false);
      setContaOrigemId(""); setContaDestinoId(""); setValor(""); setDescricao("");
      onDone();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Erro ao transferir");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <ArrowLeftRight className="w-4 h-4 mr-1.5" />Transferência
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
          <div className="space-y-1.5">
            <Label>De (origem)</Label>
            <ComboboxWithCreate value={contaOrigemId} onChange={setContaOrigemId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contas.map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Para (destino)</Label>
            <ComboboxWithCreate value={contaDestinoId} onChange={setContaDestinoId} placeholder="Selecione..." noneLabel="Selecione" triggerClassName="h-10 rounded-lg"
              options={contas.map((c) => ({ value: c.id, label: `${c.nome} (${formatBRL(c.saldoAtual)})` }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Transferência entre contas" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !contaOrigemId || !contaDestinoId || !valor}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
