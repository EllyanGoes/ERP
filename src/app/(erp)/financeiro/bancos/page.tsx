"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";

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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Carregando...</p>
          ) : bancos.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground text-center">Nenhum banco cadastrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="px-6 py-3 font-medium w-32">Código</th>
                  <th className="px-6 py-3 font-medium">Nome</th>
                  <th className="px-6 py-3 font-medium w-24">Status</th>
                  <th className="px-6 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {bancos.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-muted">
                    <td className="px-6 py-3 font-mono text-muted-foreground">{b.codigo || "—"}</td>
                    <td className="px-6 py-3 font-medium text-foreground">{b.nome}</td>
                    <td className="px-6 py-3">
                      <span className={b.ativo
                        ? "inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success"
                        : "inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"}>
                        {b.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <EditarBancoDialog banco={b} onDone={load} />
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

function EditarBancoDialog({ banco, onDone }: { banco: Banco; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codigo, setCodigo] = useState(banco.codigo ?? "");
  const [nome, setNome] = useState(banco.nome);
  const [ativo, setAtivo] = useState(banco.ativo);
  const [erro, setErro] = useState("");

  function abrir(v: boolean) {
    if (v) { setCodigo(banco.codigo ?? ""); setNome(banco.nome); setAtivo(banco.ativo); setErro(""); }
    setOpen(v);
  }

  async function salvar() {
    if (!nome.trim()) return;
    setSaving(true);
    setErro("");
    const res = await fetch(`/api/financeiro/bancos/${banco.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo || null, nome, ativo }),
    });
    setSaving(false);
    if (res.ok) { setOpen(false); onDone(); }
    else {
      const j = await res.json().catch(() => ({}));
      setErro(j.error ?? "Não foi possível salvar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger render={<button className="p-1.5 rounded-md text-muted-foreground hover:text-info hover:bg-info/10 transition-colors" title="Editar banco" />}>
        <Pencil className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Editar banco</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {erro && <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">{erro}</p>}
          <div className="space-y-1.5">
            <Label>Código (FEBRABAN)</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: 341" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Itaú Unibanco" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="rounded border-border" />
            Banco ativo
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
