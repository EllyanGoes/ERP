"use client";

// Séries fiscais da empresa ativa. A numeração vive AQUI (banco), nunca no
// provedor — reserva transacional em src/lib/fiscal/numeracao.ts. Séries são
// independentes por ambiente (homologação × produção nunca se misturam).

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Plus, Trash2, Loader2, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type Serie = {
  id: string;
  modelo: string;
  serie: number;
  ambiente: string;
  proximoNumero: number;
  ativo: boolean;
};

const MODELOS = [
  { value: "NFE", label: "NF-e (55)" },
  { value: "NFCE", label: "NFC-e (65)" },
  { value: "NFSE", label: "NFS-e" },
  { value: "CTE", label: "CT-e" },
  { value: "MDFE", label: "MDF-e" },
];

export default function SeriesFiscaisPage() {
  const [series, setSeries] = useState<Serie[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [fModelo, setFModelo] = useState("NFE");
  const [fSerie, setFSerie] = useState("1");
  const [fAmbiente, setFAmbiente] = useState("HOMOLOGACAO");
  const [fProximo, setFProximo] = useState("1");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fiscal/series");
    const data = await res.json();
    setSeries(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function salvar() {
    setSaving(true); setErro("");
    try {
      const res = await fetch("/api/fiscal/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo: fModelo, serie: Number(fSerie), ambiente: fAmbiente, proximoNumero: Number(fProximo) }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao salvar"); return; }
      await load();
      setFormOpen(false);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function alternarAtivo(s: Serie) {
    await fetch(`/api/fiscal/series/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !s.ativo }),
    });
    await load();
  }

  async function excluir(s: Serie) {
    setErro("");
    const res = await fetch(`/api/fiscal/series/${s.id}`, { method: "DELETE" });
    if (!res.ok) { setErro((await res.json()).error || "Erro ao excluir"); return; }
    await load();
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Séries Fiscais"
        breadcrumbs={[{ label: "Fiscal" }, { label: "Séries" }]}
        action={
          <Button onClick={() => { setFormOpen(true); setErro(""); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Série
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-3xl space-y-4">
        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}

        {formOpen && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm">Nova Série</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <select className={selectCls} value={fModelo} onChange={(e) => setFModelo(e.target.value)}>
                  {MODELOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Série</Label>
                <Input type="number" min={1} max={999} value={fSerie} onChange={(e) => setFSerie(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <select className={selectCls} value={fAmbiente} onChange={(e) => setFAmbiente(e.target.value)}>
                  <option value="HOMOLOGACAO">Homologação</option>
                  <option value="PRODUCAO">Produção</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Próximo nº</Label>
                <Input type="number" min={1} value={fProximo} onChange={(e) => setFProximo(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={salvar} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : series.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Hash className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma série cadastrada</p>
            <p className="text-muted-foreground text-sm mt-1">Cadastre ao menos a série 1 de NF-e em homologação para testar a emissão</p>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {series.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", s.ativo ? "bg-emerald-400" : "bg-muted")} />
                  <div>
                    <p className="text-sm font-medium">
                      {MODELOS.find((m) => m.value === s.modelo)?.label ?? s.modelo} · Série {s.serie}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ambiente === "PRODUCAO" ? "Produção" : "Homologação"} · próximo número: {s.proximoNumero}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => alternarAtivo(s)}>
                    {s.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => excluir(s)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
