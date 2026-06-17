"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { Plus, CornerDownRight, Pencil, Trash2, Loader2 } from "lucide-react";

type Grupo = "ATIVO" | "PASSIVO" | "PATRIMONIO_LIQUIDO" | "RESULTADO";
type Natureza = "DEVEDORA" | "CREDORA";
type Tipo = "SINTETICA" | "ANALITICA";

type Conta = {
  id: string;
  codigo: string;
  nome: string;
  grupo: Grupo;
  natureza: Natureza;
  tipo: Tipo;
  nivel: number;
  aceitaLancamento: boolean;
  paiId: string | null;
  clienteId: string | null;
  fornecedorId: string | null;
  ativo: boolean;
  filhos: Conta[];
};
type FlatConta = Omit<Conta, "filhos">;

const GRUPO_LABEL: Record<Grupo, string> = {
  ATIVO: "1 — Ativo",
  PASSIVO: "2 — Passivo",
  PATRIMONIO_LIQUIDO: "2.3 — Patrimônio Líquido",
  RESULTADO: "3 — Resultado",
};

export default function PlanoContasContabilPage() {
  useTabTitle("Plano de Contas Contábil");
  const [arvore, setArvore] = useState<Conta[]>([]);
  const [flat, setFlat] = useState<FlatConta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contabilidade/plano-contas").then((r) => r.json());
    setArvore(j.data ?? []);
    setFlat(j.flat ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Raízes na ordem dos grupos (1, 2, 3).
  const raizes = useMemo(
    () => [...arvore].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })),
    [arvore],
  );

  return (
    <div>
      <PageHeader
        title="Plano de Contas Contábil"
        breadcrumbs={[{ label: "Contabilidade" }, { label: "Plano de Contas" }]}
        action={<NovaContaDialog flat={flat} onDone={load} />}
      />
      <div className="px-8 pb-8">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>
        ) : raizes.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">
            Plano de contas vazio. Rode a migration do módulo Contabilidade para semear a estrutura padrão.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Conta</span>
              <span className="text-center w-16">D/C</span>
              <span className="text-center w-20">Tipo</span>
              <span className="w-16 text-right">Ações</span>
            </div>
            <ul>
              {raizes.map((c) => <Node key={c.id} conta={c} onChanged={load} flat={flat} />)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Node({ conta, onChanged, flat }: { conta: Conta; onChanged: () => void; flat: FlatConta[] }) {
  const auto = !!(conta.clienteId || conta.fornecedorId);
  return (
    <li>
      <div
        className={cn(
          "grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2 border-b border-gray-50 hover:bg-gray-50/60 text-sm",
          !conta.ativo && "opacity-50",
        )}
      >
        <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${(conta.nivel - 1) * 18}px` }}>
          {conta.nivel > 1 && <CornerDownRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
          <span className="font-mono text-xs text-gray-500 shrink-0">{conta.codigo}</span>
          <span className={cn("truncate", conta.tipo === "SINTETICA" ? "font-semibold text-gray-900" : "text-gray-700")}>
            {conta.nome}
          </span>
          {auto && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 shrink-0">auto</span>}
          {!conta.ativo && <span className="text-xs text-gray-400 shrink-0">(inativa)</span>}
        </div>
        <span className="w-16 text-center">
          <span className={cn(
            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
            conta.natureza === "DEVEDORA" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700",
          )} title={conta.natureza === "DEVEDORA" ? "Devedora" : "Credora"}>
            {conta.natureza === "DEVEDORA" ? "D" : "C"}
          </span>
        </span>
        <span className="w-20 text-center text-xs text-gray-500">
          {conta.tipo === "SINTETICA" ? "Sintética" : "Analítica"}
        </span>
        <div className="w-16 flex items-center justify-end gap-1">
          {!auto && <EditarContaButton conta={conta} onDone={onChanged} />}
          {!auto && conta.filhos.length === 0 && <ExcluirContaButton conta={conta} onDone={onChanged} />}
        </div>
      </div>
      {conta.filhos.length > 0 && (
        <ul>
          {[...conta.filhos]
            .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
            .map((f) => <Node key={f.id} conta={f} onChanged={onChanged} flat={flat} />)}
        </ul>
      )}
    </li>
  );
}

function NovaContaDialog({ flat, onDone }: { flat: FlatConta[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [paiId, setPaiId] = useState("");
  const [tipo, setTipo] = useState<Tipo>("ANALITICA");

  // Pais possíveis: contas sintéticas (que agrupam) e não geridas por entidade.
  const pais = flat
    .filter((c) => c.tipo === "SINTETICA" && !c.clienteId && !c.fornecedorId)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  async function salvar() {
    if (!nome.trim() || !paiId) return;
    setSaving(true); setErro("");
    const res = await fetch("/api/contabilidade/plano-contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), paiId, tipo }),
    });
    setSaving(false);
    if (res.ok) { setOpen(false); setNome(""); setPaiId(""); setTipo("ANALITICA"); onDone(); }
    else setErro((await res.json()).error || "Erro ao salvar");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" />Nova Conta
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova conta contábil</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
          <div className="space-y-1.5">
            <Label>Conta pai *</Label>
            <ComboboxWithCreate
              value={paiId}
              onChange={setPaiId}
              placeholder="Selecione a conta sintética..."
              triggerClassName="h-10 rounded-lg"
              options={pais.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
            />
            <p className="text-xs text-gray-400">Código, grupo e natureza são herdados da conta pai.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Caixa Geral" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              <option value="ANALITICA">Analítica (aceita lançamento)</option>
              <option value="SINTETICA">Sintética (agrupadora)</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim() || !paiId}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarContaButton({ conta, onDone }: { conta: Conta; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [natureza, setNatureza] = useState<Natureza>(conta.natureza);
  const [ativo, setAtivo] = useState(conta.ativo);

  async function salvar() {
    setSaving(true);
    const res = await fetch(`/api/contabilidade/plano-contas/${conta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), natureza, ativo }),
    });
    setSaving(false);
    if (res.ok) { setOpen(false); onDone(); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className="text-gray-300 hover:text-blue-500 transition-colors" title="Editar" />}>
        <Pencil className="w-3.5 h-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar conta {conta.codigo}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Natureza</Label>
            <select value={natureza} onChange={(e) => setNatureza(e.target.value as Natureza)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              <option value="DEVEDORA">Devedora</option>
              <option value="CREDORA">Credora</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            Conta ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirContaButton({ conta, onDone }: { conta: Conta; onDone: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [erro, setErro] = useState("");

  async function excluir() {
    setDeleting(true); setErro("");
    const res = await fetch(`/api/contabilidade/plano-contas/${conta.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onDone();
    else setErro((await res.json()).error || "Erro ao excluir");
  }

  return (
    <button
      type="button"
      onClick={excluir}
      disabled={deleting}
      className="text-gray-300 hover:text-red-500 transition-colors"
      title={erro || "Excluir"}
    >
      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}
