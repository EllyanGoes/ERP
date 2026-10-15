"use client";

// Médico examinador (PCMSO/ASO): combobox do cadastro com criação na hora.
// Ao escolher, devolve o médico inteiro — o formulário do ASO preenche o CRM
// sozinho. MedicoDialog também serve à lista de médicos em ASO e exames.
import { useCallback, useEffect, useState } from "react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Medico = { id: string; nome: string; crm: string; uf: string | null; especialidade: string | null; ativo: boolean; _count?: { asos: number } };

export const crmCompleto = (m: Pick<Medico, "crm" | "uf">) => (m.uf ? `${m.crm}/${m.uf}` : m.crm);

export function useMedicos(todos = false) {
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const recarregar = useCallback(async () => {
    const j = await fetch(`/api/sst/medicos${todos ? "?todos=1" : ""}`).then((r) => r.json()).catch(() => ({}));
    setMedicos(j.data ?? []);
  }, [todos]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { medicos, recarregar, setMedicos };
}

export function MedicoDialog({ open, onOpenChange, medico, nomeInicial = "", onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; medico?: Medico | null; nomeInicial?: string; onSaved: (m: Medico) => void;
}) {
  const [nome, setNome] = useState(""); const [crm, setCrm] = useState(""); const [uf, setUf] = useState(""); const [esp, setEsp] = useState("");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => {
    if (!open) return;
    setNome(medico?.nome ?? nomeInicial); setCrm(medico?.crm ?? ""); setUf(medico?.uf ?? ""); setEsp(medico?.especialidade ?? ""); setErro("");
  }, [open, medico, nomeInicial]);
  async function salvar() {
    if (!nome.trim() || !crm.trim()) { setErro("Informe nome e CRM."); return; }
    setSalvando(true); setErro("");
    const res = await fetch(medico ? `/api/sst/medicos/${medico.id}` : "/api/sst/medicos", {
      method: medico ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, crm, uf, especialidade: esp }),
    });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar."); return; }
    onSaved(j.data); onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{medico ? "Editar médico" : "Novo médico examinador"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Dr(a). …" autoFocus /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Label>CRM</Label><Input value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="12345" /></div>
            <div><Label>UF</Label><Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="AP" /></div>
          </div>
          <div><Label>Especialidade</Label><Input value={esp} onChange={(e) => setEsp(e.target.value)} placeholder="Medicina do trabalho" /></div>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MedicoSelect({ value, onChange }: { value: string; onChange: (m: Medico | null) => void }) {
  const { medicos, setMedicos } = useMedicos();
  return (
    <ComboboxWithCreate
      value={value}
      onChange={(id) => onChange(medicos.find((m) => m.id === id) ?? null)}
      options={medicos.map((m) => ({ value: m.id, label: `${m.nome} · CRM ${crmCompleto(m)}` }))}
      placeholder="Selecionar médico…"
      noneLabel="Nenhum"
      createHref="#"
      createLabel="médico"
      menuMinWidth={320}
      renderCreateModal={({ initialValue, onCreated, onClose }) => (
        <MedicoDialog open onOpenChange={(o) => { if (!o) onClose(); }} nomeInicial={initialValue}
          onSaved={(m) => { setMedicos((l) => [...l, m].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))); onCreated(m.id, `${m.nome} · CRM ${crmCompleto(m)}`); onChange(m); }} />
      )}
    />
  );
}
