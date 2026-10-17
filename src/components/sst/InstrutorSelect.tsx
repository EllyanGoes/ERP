"use client";

// Instrutor de treinamento: combobox com os instrutores cadastrados e, num grupo
// à parte, os colaboradores (instrutor interno). Escolher devolve o instrutor
// inteiro — a turma preenche a entidade sozinha. Colaborador escolhido vira
// instrutor cadastrado na hora (entidade = a própria empresa).
import { useCallback, useEffect, useState } from "react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Instrutor = { id: string; nome: string; entidade: string | null; registro: string | null; colaboradorId: string | null; ativo: boolean; _count?: { turmas: number } };

const rotulo = (i: Pick<Instrutor, "nome" | "entidade">) => (i.entidade ? `${i.nome} · ${i.entidade}` : i.nome);

export function useInstrutores(todos = false) {
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const recarregar = useCallback(async () => {
    const j = await fetch(`/api/sst/instrutores${todos ? "?todos=1" : ""}`).then((r) => r.json()).catch(() => ({}));
    setInstrutores(j.data ?? []);
  }, [todos]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { instrutores, recarregar, setInstrutores };
}

export function InstrutorDialog({ open, onOpenChange, instrutor, nomeInicial = "", onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; instrutor?: Instrutor | null; nomeInicial?: string; onSaved: (i: Instrutor) => void;
}) {
  const [nome, setNome] = useState(""); const [entidade, setEntidade] = useState(""); const [registro, setRegistro] = useState("");
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState("");
  useEffect(() => {
    if (!open) return;
    setNome(instrutor?.nome ?? nomeInicial); setEntidade(instrutor?.entidade ?? ""); setRegistro(instrutor?.registro ?? ""); setErro("");
  }, [open, instrutor, nomeInicial]);
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    setSalvando(true); setErro("");
    const res = await fetch(instrutor ? `/api/sst/instrutores/${instrutor.id}` : "/api/sst/instrutores", {
      method: instrutor ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, entidade, registro }),
    });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { setErro(j.error || "Erro ao salvar."); return; }
    onSaved(j.data); onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{instrutor ? "Editar instrutor" : "Novo instrutor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus autoComplete="off" /></div>
          <div><Label>Entidade / empresa</Label><Input value={entidade} onChange={(e) => setEntidade(e.target.value)} placeholder="Ex.: SENAI, C. P. Engenharia" autoComplete="off" /></div>
          <div><Label>Registro profissional</Label><Input value={registro} onChange={(e) => setRegistro(e.target.value)} placeholder="Ex.: CREA, MTE (técnico de segurança)" autoComplete="off" /></div>
          <p className="text-[11px] text-muted-foreground">Instrutor que é colaborador: escolha direto na lista, no grupo “Colaboradores”.</p>
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InstrutorSelect({ value, onChange, colaboradores }: {
  value: string; onChange: (i: Instrutor | null) => void; colaboradores: { id: string; nome: string }[];
}) {
  const { instrutores, setInstrutores } = useInstrutores();
  const internos = new Set(instrutores.map((i) => i.colaboradorId).filter(Boolean));
  async function escolher(v: string) {
    if (!v) { onChange(null); return; }
    if (v.startsWith("colab:")) {
      const res = await fetch("/api/sst/instrutores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: v.slice(6) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setInstrutores((l) => (l.some((i) => i.id === j.data.id) ? l : [...l, j.data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))));
      onChange(j.data);
      return;
    }
    onChange(instrutores.find((i) => i.id === v) ?? null);
  }
  return (
    <ComboboxWithCreate
      value={value}
      onChange={escolher}
      options={[
        ...instrutores.map((i) => ({ value: i.id, label: rotulo(i), group: "Instrutores" })),
        ...colaboradores.filter((c) => !internos.has(c.id)).map((c) => ({ value: `colab:${c.id}`, label: c.nome, group: "Colaboradores" })),
      ]}
      placeholder="Buscar instrutor ou colaborador…"
      noneLabel="Nenhum"
      createHref="#"
      createLabel="instrutor"
      menuMinWidth={340}
      renderCreateModal={({ initialValue, onCreated, onClose }) => (
        <InstrutorDialog open onOpenChange={(o) => { if (!o) onClose(); }} nomeInicial={initialValue}
          onSaved={(i) => { setInstrutores((l) => [...l, i].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))); onCreated(i.id, rotulo(i)); onChange(i); }} />
      )}
    />
  );
}
