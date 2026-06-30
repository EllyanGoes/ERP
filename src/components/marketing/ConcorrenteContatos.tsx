"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Save, Users } from "lucide-react";

export type ContatoConcorrente = {
  id: string;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
};

export default function ConcorrenteContatos({
  concorrenteId,
  contatosIniciais,
  onCount,
}: {
  concorrenteId: string;
  contatosIniciais: ContatoConcorrente[];
  onCount?: (n: number) => void;
}) {
  const [contatos, setContatos] = useState<ContatoConcorrente[]>(contatosIniciais);
  const [salvando, setSalvando] = useState<string | null>(null);
  const base = `/api/marketing/concorrentes/${concorrenteId}/contatos`;

  function sync(next: ContatoConcorrente[]) { setContatos(next); onCount?.(next.length); }

  async function adicionar() {
    setSalvando("novo");
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Novo contato" }) });
    setSalvando(null);
    if (res.ok) { const { data } = await res.json(); sync([...contatos, data]); }
  }
  function patch(id: string, campo: keyof ContatoConcorrente, valor: string) {
    setContatos((cs) => cs.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
  }
  async function salvar(c: ContatoConcorrente) {
    if (!c.nome.trim()) return;
    setSalvando(c.id);
    const res = await fetch(`${base}/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    setSalvando(null);
    if (res.ok) { const { data } = await res.json(); setContatos((cs) => cs.map((x) => (x.id === c.id ? data : x))); }
  }
  async function remover(id: string) {
    if (!confirm("Remover este contato?")) return;
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    if (res.ok) sync(contatos.filter((c) => c.id !== id));
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden max-w-4xl">
      <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-2"><Users className="h-4 w-4" /> Contatos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pessoas de contato no concorrente (vendedor, gerente, dono...).</p>
        </div>
        <Button type="button" onClick={adicionar} disabled={salvando === "novo"} className="h-9 gap-1.5 shrink-0">
          {salvando === "novo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar contato
        </Button>
      </div>

      {contatos.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum contato cadastrado.</div>
      ) : (
        <div className="divide-y divide-border">
          {contatos.map((c) => (
            <div key={c.id} className="px-5 py-3 grid grid-cols-[1.4fr_1fr_1fr_1.3fr_auto_auto] gap-2 items-center">
              <Input value={c.nome} onChange={(e) => patch(c.id, "nome", e.target.value)} placeholder="Nome *" className="h-9 border-border" />
              <Input value={c.cargo ?? ""} onChange={(e) => patch(c.id, "cargo", e.target.value)} placeholder="Cargo" className="h-9 border-border" />
              <Input value={c.telefone ?? ""} onChange={(e) => patch(c.id, "telefone", e.target.value)} placeholder="Telefone" className="h-9 border-border" />
              <Input value={c.email ?? ""} onChange={(e) => patch(c.id, "email", e.target.value)} placeholder="E-mail" className="h-9 border-border" />
              <Button type="button" variant="outline" onClick={() => salvar(c)} disabled={salvando === c.id} className="h-9 w-9 p-0" title="Salvar">
                {salvando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
              <button onClick={() => remover(c.id)} className="text-muted-foreground hover:text-danger" title="Remover"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
