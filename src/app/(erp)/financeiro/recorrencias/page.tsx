"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL, formatDate } from "@/lib/utils";
import { Plus, Repeat, Play, ArrowUpRight, ArrowDownLeft } from "lucide-react";

type Recorrencia = {
  id: string;
  tipo: "RECEBER" | "PAGAR";
  descricao: string;
  valor: string | number;
  periodicidade: string;
  diaVencimento: number;
  proximaGeracao: string;
  ativo: boolean;
  categoriaFinanceira: { id: string; nome: string } | null;
  contaBancaria: { id: string; nome: string } | null;
  cliente: { id: string; razaoSocial: string } | null;
  fornecedor: { id: string; razaoSocial: string } | null;
};
type Opt = { id: string; nome?: string; razaoSocial?: string };

const PERIODO_LABEL: Record<string, string> = {
  SEMANAL: "Semanal", MENSAL: "Mensal", BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual",
};

export default function RecorrenciasPage() {
  const [recs, setRecs] = useState<Recorrencia[]>([]);
  const [categorias, setCategorias] = useState<Opt[]>([]);
  const [contas, setContas] = useState<Opt[]>([]);
  const [clientes, setClientes] = useState<Opt[]>([]);
  const [fornecedores, setFornecedores] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, pc, ct, cl, fo] = await Promise.all([
      fetch("/api/financeiro/recorrencias").then((x) => x.json()),
      fetch("/api/financeiro/plano-contas").then((x) => x.json()),
      fetch("/api/financeiro/contas").then((x) => x.json()),
      fetch("/api/clientes").then((x) => x.json()),
      fetch("/api/suprimentos/fornecedores").then((x) => x.json()),
    ]);
    setRecs(r.data ?? []);
    setCategorias((pc.flat ?? []).map((c: any) => ({ id: c.id, nome: c.nome })));
    setContas((ct.data ?? []).map((c: any) => ({ id: c.id, nome: c.nome })));
    setClientes((cl.data ?? []).map((c: any) => ({ id: c.id, razaoSocial: c.razaoSocial })));
    setFornecedores((Array.isArray(fo) ? fo : fo.data ?? []).map((f: any) => ({ id: f.id, razaoSocial: f.razaoSocial })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function gerar(id: string) {
    setGerando(id);
    const res = await fetch(`/api/financeiro/recorrencias/${id}/gerar`, { method: "POST" });
    setGerando(null);
    if (res.ok) load();
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Erro ao gerar título");
    }
  }

  return (
    <div>
      <PageHeader
        title="Recorrências"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Recorrências" }]}
        action={<NovaRecorrenciaDialog categorias={categorias} contas={contas} clientes={clientes} fornecedores={fornecedores} onDone={load} />}
      />
      <div className="px-8 pb-8">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">Carregando...</p>
          ) : recs.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">
              Nenhuma recorrência. Clique em &quot;Nova Recorrência&quot;.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Descrição</th>
                  <th className="px-6 py-3 font-medium">Tipo</th>
                  <th className="px-6 py-3 font-medium">Periodicidade</th>
                  <th className="px-6 py-3 font-medium">Próx. geração</th>
                  <th className="px-6 py-3 font-medium text-right">Valor</th>
                  <th className="px-6 py-3 font-medium w-32" />
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!r.ativo ? "opacity-50" : ""}`}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{r.descricao}</p>
                      <p className="text-xs text-gray-400">
                        {r.cliente?.razaoSocial || r.fornecedor?.razaoSocial || "—"}
                        {r.categoriaFinanceira ? ` · ${r.categoriaFinanceira.nome}` : ""}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      {r.tipo === "RECEBER" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowUpRight className="w-3.5 h-3.5" />Receber</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600"><ArrowDownLeft className="w-3.5 h-3.5" />Pagar</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{PERIODO_LABEL[r.periodicidade] ?? r.periodicidade}</td>
                    <td className="px-6 py-3 text-gray-600">{formatDate(r.proximaGeracao)}</td>
                    <td className="px-6 py-3 text-right tabular-nums font-semibold">{formatBRL(Number(r.valor))}</td>
                    <td className="px-6 py-3 text-right">
                      {r.ativo && (
                        <Button size="sm" variant="outline" disabled={gerando === r.id} onClick={() => gerar(r.id)}>
                          <Play className="w-3.5 h-3.5 mr-1" />{gerando === r.id ? "..." : "Gerar"}
                        </Button>
                      )}
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

function NovaRecorrenciaDialog({ categorias, contas, clientes, fornecedores, onDone }: {
  categorias: Opt[]; contas: Opt[]; clientes: Opt[]; fornecedores: Opt[]; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<"RECEBER" | "PAGAR">("PAGAR");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [periodicidade, setPeriodicidade] = useState("MENSAL");
  const [diaVencimento, setDiaVencimento] = useState("1");
  const [proximaGeracao, setProximaGeracao] = useState(new Date().toISOString().slice(0, 10));
  const [categoriaFinanceiraId, setCategoriaFinanceiraId] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  async function salvar() {
    if (!descricao.trim() || !valor) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/recorrencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo, descricao, valor, periodicidade, diaVencimento,
        proximaGeracao,
        categoriaFinanceiraId: categoriaFinanceiraId || null,
        contaBancariaId: contaBancariaId || null,
        clienteId: tipo === "RECEBER" ? (clienteId || null) : null,
        fornecedorId: tipo === "PAGAR" ? (fornecedorId || null) : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setDescricao(""); setValor(""); setClienteId(""); setFornecedorId("");
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" />Nova Recorrência
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Nova recorrência</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "RECEBER" | "PAGAR")} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
                <option value="PAGAR">A Pagar</option>
                <option value="RECEBER">A Receber</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Aluguel do galpão" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Periodicidade</Label>
              <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
                {Object.entries(PERIODO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Próxima geração</Label>
              <Input type="date" value={proximaGeracao} onChange={(e) => setProximaGeracao(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <ComboboxWithCreate value={categoriaFinanceiraId} onChange={setCategoriaFinanceiraId} placeholder="— Nenhuma —" noneLabel="Nenhuma" triggerClassName="h-10 rounded-lg"
                options={categorias.map((c) => ({ value: c.id, label: c.nome ?? "" }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta de liquidação</Label>
              <ComboboxWithCreate value={contaBancariaId} onChange={setContaBancariaId} placeholder="— Nenhuma —" noneLabel="Nenhuma" triggerClassName="h-10 rounded-lg"
                options={contas.map((c) => ({ value: c.id, label: c.nome ?? "" }))} />
            </div>
          </div>
          {tipo === "RECEBER" ? (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ComboboxWithCreate value={clienteId} onChange={setClienteId} placeholder="Selecione..." noneLabel="Nenhum" triggerClassName="h-10 rounded-lg"
                options={clientes.map((c) => ({ value: c.id, label: c.razaoSocial ?? "" }))} />
              <p className="text-xs text-gray-400">Obrigatório para gerar títulos a receber.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <ComboboxWithCreate value={fornecedorId} onChange={setFornecedorId} placeholder="— Nenhum —" noneLabel="Nenhum" triggerClassName="h-10 rounded-lg"
                options={fornecedores.map((f) => ({ value: f.id, label: f.razaoSocial ?? "" }))} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !descricao.trim() || !valor}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
