"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, ArrowUpRight, ArrowDownLeft, CornerDownRight } from "lucide-react";

type Cat = {
  id: string;
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  paiId: string | null;
  ativo: boolean;
  filhos: Cat[];
};
type FlatCat = { id: string; nome: string; tipo: "RECEITA" | "DESPESA" };

export default function PlanoContasPage() {
  const [arvore, setArvore] = useState<Cat[]>([]);
  const [flat, setFlat] = useState<FlatCat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/financeiro/plano-contas").then((r) => r.json());
    setArvore(j.data ?? []);
    setFlat(j.flat ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const receitas = arvore.filter((c) => c.tipo === "RECEITA");
  const despesas = arvore.filter((c) => c.tipo === "DESPESA");

  return (
    <div>
      <PageHeader
        title="Plano de Contas"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Plano de Contas" }]}
        action={<NovaCategoriaDialog flat={flat} onDone={load} />}
      />
      <div className="px-8 pb-8 space-y-6">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Carregando...</p>
        ) : arvore.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">Nenhuma categoria cadastrada.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <Grupo titulo="Receitas" cor="emerald" cats={receitas} />
            <Grupo titulo="Despesas" cor="red" cats={despesas} />
          </div>
        )}
      </div>
    </div>
  );
}

function Grupo({ titulo, cor, cats }: { titulo: string; cor: "emerald" | "red"; cats: Cat[] }) {
  const Icon = cor === "emerald" ? ArrowUpRight : ArrowDownLeft;
  const headerColor = cor === "emerald" ? "text-emerald-700" : "text-red-700";
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className={`px-5 py-3 border-b border-gray-100 flex items-center gap-2 ${headerColor}`}>
        <Icon className="w-4 h-4" />
        <h2 className="font-semibold">{titulo}</h2>
      </div>
      <div className="p-3">
        {cats.length === 0 ? (
          <p className="px-2 py-4 text-sm text-gray-400 text-center">Nenhuma categoria.</p>
        ) : (
          <ul className="space-y-0.5">
            {cats.map((c) => <Node key={c.id} cat={c} nivel={0} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Node({ cat, nivel }: { cat: Cat; nivel: number }) {
  return (
    <li>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-gray-50 text-sm ${nivel === 0 ? "font-medium text-gray-900" : "text-gray-600"}`}
        style={{ paddingLeft: `${nivel * 18 + 8}px` }}
      >
        {nivel > 0 && <CornerDownRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
        <span>{cat.nome}</span>
        {!cat.ativo && <span className="text-xs text-gray-400">(inativa)</span>}
      </div>
      {cat.filhos.length > 0 && (
        <ul className="space-y-0.5">
          {cat.filhos.map((f) => <Node key={f.id} cat={f} nivel={nivel + 1} />)}
        </ul>
      )}
    </li>
  );
}

function NovaCategoriaDialog({ flat, onDone }: { flat: FlatCat[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"RECEITA" | "DESPESA">("DESPESA");
  const [paiId, setPaiId] = useState("");

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/plano-contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, tipo, paiId: paiId || null }),
    });
    setSaving(false);
    if (res.ok) { setOpen(false); setNome(""); setPaiId(""); onDone(); }
  }

  // Pais possíveis: categorias do mesmo tipo selecionado.
  const paisDisponiveis = flat.filter((c) => c.tipo === tipo);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" />Nova Categoria
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Folha de Pagamento" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select value={tipo} onChange={(e) => { setTipo(e.target.value as "RECEITA" | "DESPESA"); setPaiId(""); }} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              <option value="DESPESA">Despesa</option>
              <option value="RECEITA">Receita</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria pai (opcional)</Label>
            <select value={paiId} onChange={(e) => setPaiId(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              <option value="">— Raiz (sem pai) —</option>
              {paisDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
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
