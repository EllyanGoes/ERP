"use client";

// Informações complementares do colaborador — as que a cautela de EPI imprime
// (CPF, RG, matrícula, admissão, setor, cargo). Aberto pelo aviso de cadastro
// incompleto da cautela e da nova entrega.
import { useEffect, useState } from "react";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export type ColabCadastro = {
  id: string; nome: string; cpf: string | null; rg: string | null; matricula: string | null; cargo: string | null;
  dataAdmissao: string | null; setor: { id: string; nome: string } | null; temFuncao: boolean;
};

/** Faixa amarela "Cadastro incompleto — falta: …" com o botão de completar. */
export function AvisoCadastroIncompleto({ faltando, onCompletar, bloqueia }: { faltando: string[]; onCompletar: () => void; bloqueia?: string }) {
  if (faltando.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>Cadastro incompleto — falta: <b>{faltando.join(", ")}</b>{bloqueia && <span className="text-xs"> · {bloqueia}</span>}</span></span>
      <button type="button" onClick={onCompletar} className="rounded border border-amber-400 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100">Completar cadastro</button>
    </div>
  );
}

export default function CadastroComplementarDialog({ open, onOpenChange, colaborador: c, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; colaborador: ColabCadastro; onSaved: () => void }) {
  const [cpf, setCpf] = useState(""); const [rg, setRg] = useState(""); const [matricula, setMatricula] = useState("");
  const [cargo, setCargo] = useState(""); const [admissao, setAdmissao] = useState(""); const [setorId, setSetorId] = useState("");
  const [setores, setSetores] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => {
    if (!open) return;
    setCpf(c.cpf ?? ""); setRg(c.rg ?? ""); setMatricula(c.matricula ?? ""); setCargo(c.cargo ?? "");
    setAdmissao(c.dataAdmissao?.slice(0, 10) ?? ""); setSetorId(c.setor?.id ?? ""); setErro("");
    fetch("/api/empresa/setores?ativo=true").then((r) => r.json()).then((j: { id: string; nome: string }[]) => setSetores(Array.isArray(j) ? j.map((s) => ({ value: s.id, label: s.nome })) : [])).catch(() => {});
  }, [open, c]);
  async function salvar() {
    setSaving(true); setErro("");
    const res = await fetch(`/api/sst/colaboradores/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cpf, rg, matricula, cargo, dataAdmissao: admissao || null, setorId: setorId || null }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar"); return; }
    onOpenChange(false); onSaved();
  }
  const marca = (vazio: boolean) => (vazio ? "border-amber-400" : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Informações complementares — {c.nome}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" className={marca(!cpf)} /></div>
          <div><Label>RG</Label><Input value={rg} onChange={(e) => setRg(e.target.value)} className={marca(!rg)} /></div>
          <div><Label>Matrícula</Label><Input value={matricula} onChange={(e) => setMatricula(e.target.value)} className={marca(!matricula)} /></div>
          <div><Label>Admissão</Label><DatePicker value={admissao} onChange={setAdmissao} /></div>
          <div className="col-span-2"><Label>Setor</Label><ComboboxWithCreate options={setores} value={setorId} onChange={setSetorId} placeholder="Selecione o setor" /></div>
          {!c.temFuncao && <div className="col-span-2"><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} className={marca(!cargo)} /></div>}
        </div>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
