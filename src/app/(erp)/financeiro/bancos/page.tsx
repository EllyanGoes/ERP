"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type Banco = { id: string; codigo: string | null; nome: string; ativo: boolean };

export default function BancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/financeiro/bancos").then((r) => r.json());
    setBancos(j.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Bancos"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Bancos" }]}
        action={<NovoBancoDialog onDone={load} />}
      />
      <div className="px-8 pb-8">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">Carregando...</p>
          ) : bancos.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">Nenhum banco cadastrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium w-32">Código</th>
                  <th className="px-6 py-3 font-medium">Nome</th>
                </tr>
              </thead>
              <tbody>
                {bancos.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-gray-500">{b.codigo || "—"}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">{b.nome}</td>
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

function NovoBancoDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/financeiro/bancos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo || null, nome }),
    });
    setSaving(false);
    if (res.ok) { setOpen(false); setCodigo(""); setNome(""); onDone(); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="w-4 h-4 mr-1.5" />Novo Banco
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Novo banco</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Código (FEBRABAN)</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: 341" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Itaú Unibanco" />
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
