"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Pencil, Trash2, Loader2, Info, ArrowDownLeft, ArrowUpRight, FolderClosed, ChevronDown, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GRUPOS = ["RECEITA_OPERACIONAL", "CUSTO_OPERACIONAL", "DESPESA_OPERACIONAL", "INVESTIMENTO", "FINANCIAMENTO"] as const;
type Grupo = (typeof GRUPOS)[number];
const GRUPO_LABEL: Record<Grupo, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_OPERACIONAL: "Custos operacionais",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};

type Tipo = "ENTRADA" | "SAIDA";
type Subgrupo = { id: string; nome: string; grupo: Grupo };
type Natureza = {
  id: string; nome: string; tipo: Tipo; grupo: Grupo;
  subgrupoId: string | null; subgrupo: { id: string; nome: string } | null; ativo: boolean;
};

export default function NaturezasPage() {
  const [rows, setRows] = useState<Natureza[]>([]);
  const [subgrupos, setSubgrupos] = useState<Subgrupo[]>([]);
  const [loading, setLoading] = useState(true);

  // null = fechado; objeto vazio = novo; objeto preenchido = edição
  const [natModal, setNatModal] = useState<Natureza | "new" | null>(null);
  const [subModal, setSubModal] = useState<Subgrupo | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [n, s] = await Promise.all([
      fetch("/api/financeiro/naturezas").then((r) => r.json()),
      fetch("/api/financeiro/naturezas/subgrupos").then((r) => r.json()),
    ]);
    setRows(n.data ?? []);
    setSubgrupos(s.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function excluirNatureza(r: Natureza) {
    if (!confirm(`Excluir a natureza "${r.nome}"?`)) return;
    await fetch(`/api/financeiro/naturezas/${r.id}`, { method: "DELETE" });
    await load();
  }
  async function excluirSubgrupo(s: Subgrupo) {
    if (!confirm(`Excluir o subgrupo "${s.nome}"? As naturezas dentro dele ficarão sem subgrupo.`)) return;
    await fetch(`/api/financeiro/naturezas/subgrupos/${s.id}`, { method: "DELETE" });
    await load();
  }

  // Grupos que têm algum conteúdo (natureza ou subgrupo)
  const gruposComConteudo = GRUPOS.filter(
    (g) => rows.some((r) => r.grupo === g) || subgrupos.some((s) => s.grupo === g),
  );

  return (
    <div>
      <PageHeader
        title="Naturezas Financeiras"
        breadcrumbs={[{ label: "Financeiro" }, { label: "Cadastros" }, { label: "Naturezas Financeiras" }]}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <Plus className="w-4 h-4 mr-1.5" /> Adicionar <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setNatModal("new")}>
                <Tag className="w-4 h-4 mr-2" /> Nova natureza
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSubModal("new")}>
                <FolderClosed className="w-4 h-4 mr-2" /> Novo subgrupo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            A natureza classifica os títulos por <b>tipo</b> (entrada/saída) e <b>grupo</b> do fluxo de caixa. É escolhida no Pedido de Venda e no Documento de Entrada e diferente do plano de contas.
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
        ) : gruposComConteudo.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhuma natureza cadastrada.</div>
        ) : (
          <div className="space-y-8">
            {gruposComConteudo.map((g) => (
              <GrupoSecao
                key={g}
                grupo={g}
                naturezas={rows.filter((r) => r.grupo === g)}
                subgrupos={subgrupos.filter((s) => s.grupo === g)}
                onEditNat={setNatModal}
                onDelNat={excluirNatureza}
                onEditSub={setSubModal}
                onDelSub={excluirSubgrupo}
              />
            ))}
          </div>
        )}
      </div>

      {natModal && (
        <NaturezaDialog
          editing={natModal === "new" ? null : natModal}
          subgrupos={subgrupos}
          onClose={() => setNatModal(null)}
          onSaved={() => { setNatModal(null); load(); }}
        />
      )}
      {subModal && (
        <SubgrupoDialog
          editing={subModal === "new" ? null : subModal}
          onClose={() => setSubModal(null)}
          onSaved={() => { setSubModal(null); load(); }}
        />
      )}
    </div>
  );
}

function GrupoSecao({ grupo, naturezas, subgrupos, onEditNat, onDelNat, onEditSub, onDelSub }: {
  grupo: Grupo;
  naturezas: Natureza[];
  subgrupos: Subgrupo[];
  onEditNat: (n: Natureza) => void;
  onDelNat: (n: Natureza) => void;
  onEditSub: (s: Subgrupo) => void;
  onDelSub: (s: Subgrupo) => void;
}) {
  const semSubgrupo = naturezas.filter((n) => !n.subgrupoId);
  return (
    <section className="space-y-1">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-2">{GRUPO_LABEL[grupo]}</h2>
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm divide-y divide-gray-100 overflow-hidden">
        {subgrupos.map((s) => {
          const filhas = naturezas.filter((n) => n.subgrupoId === s.id);
          return (
            <div key={s.id}>
              <RowShell
                indent={0}
                left={
                  <span className="inline-flex items-center gap-2 text-gray-800 font-medium">
                    <FolderClosed className="w-4 h-4 text-gray-400" />
                    {s.nome}
                    <span className="text-xs font-normal text-gray-400">({filhas.length})</span>
                  </span>
                }
                onEdit={() => onEditSub(s)}
                onDelete={() => onDelSub(s)}
              />
              {filhas.map((n) => (
                <NaturezaRow key={n.id} n={n} indent={1} onEdit={onEditNat} onDelete={onDelNat} />
              ))}
            </div>
          );
        })}
        {semSubgrupo.map((n) => (
          <NaturezaRow key={n.id} n={n} indent={0} onEdit={onEditNat} onDelete={onDelNat} />
        ))}
      </div>
    </section>
  );
}

function NaturezaRow({ n, indent, onEdit, onDelete }: {
  n: Natureza; indent: number; onEdit: (n: Natureza) => void; onDelete: (n: Natureza) => void;
}) {
  const entrada = n.tipo === "ENTRADA";
  return (
    <RowShell
      indent={indent}
      faded={!n.ativo}
      left={
        <span className="inline-flex items-center gap-2 text-gray-700">
          {entrada
            ? <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
            : <ArrowDownLeft className="w-4 h-4 text-rose-500 shrink-0" />}
          {n.nome}
          {!n.ativo && <span className="text-[11px] text-gray-400">(inativa)</span>}
        </span>
      }
      onEdit={() => onEdit(n)}
      onDelete={() => onDelete(n)}
    />
  );
}

function RowShell({ indent, left, faded, onEdit, onDelete }: {
  indent: number; left: React.ReactNode; faded?: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div
      className={cn("group flex items-center justify-between pr-3 py-2.5 hover:bg-gray-50", faded && "opacity-50")}
      style={{ paddingLeft: `${16 + indent * 24}px` }}
    >
      <div className="text-sm">{left}</div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-rose-600" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function NaturezaDialog({ editing, subgrupos, onClose, onSaved }: {
  editing: Natureza | null;
  subgrupos: Subgrupo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [tipo, setTipo] = useState<Tipo>(editing?.tipo ?? "SAIDA");
  const [grupo, setGrupo] = useState<Grupo>(editing?.grupo ?? "DESPESA_OPERACIONAL");
  const [subgrupoId, setSubgrupoId] = useState(editing?.subgrupoId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subsDoGrupo = subgrupos.filter((s) => s.grupo === grupo);

  async function salvar() {
    if (!nome.trim()) { setError("Informe o nome."); return; }
    setSaving(true); setError(null);
    const url = editing ? `/api/financeiro/naturezas/${editing.id}` : "/api/financeiro/naturezas";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), tipo, grupo, subgrupoId: subgrupoId || null }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar natureza" : "Nova natureza"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-6">
            <TipoRadio label="Entrada" icon={<ArrowUpRight className="w-3.5 h-3.5" />} active={tipo === "ENTRADA"} onClick={() => setTipo("ENTRADA")} cor="emerald" />
            <TipoRadio label="Saída" icon={<ArrowDownLeft className="w-3.5 h-3.5" />} active={tipo === "SAIDA"} onClick={() => setTipo("SAIDA")} cor="rose" />
          </div>
          <div className="space-y-1.5">
            <Label>Nome da natureza *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Venda de mercadorias, Aluguel..." autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Grupo *</Label>
            <select value={grupo} onChange={(e) => { setGrupo(e.target.value as Grupo); setSubgrupoId(""); }} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Subgrupo (opcional)</Label>
            <select value={subgrupoId} onChange={(e) => setSubgrupoId(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              <option value="">— Sem subgrupo —</option>
              {subsDoGrupo.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubgrupoDialog({ editing, onClose, onSaved }: {
  editing: Subgrupo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [grupo, setGrupo] = useState<Grupo>(editing?.grupo ?? "DESPESA_OPERACIONAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setError("Informe o nome."); return; }
    setSaving(true); setError(null);
    const url = editing ? `/api/financeiro/naturezas/subgrupos/${editing.id}` : "/api/financeiro/naturezas/subgrupos";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), grupo }),
    });
    if (!res.ok) { setError((await res.json()).error ?? "Erro ao salvar"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar subgrupo" : "Novo subgrupo"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome do subgrupo *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Deduções sobre receita" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Grupo *</Label>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value as Grupo)} className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
              {GRUPOS.map((g) => <option key={g} value={g}>{GRUPO_LABEL[g]}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !nome.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TipoRadio({ label, icon, active, onClick, cor }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void; cor: "emerald" | "rose";
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 text-sm">
      <span className={cn("w-4 h-4 rounded-full border flex items-center justify-center",
        active ? (cor === "emerald" ? "border-emerald-500" : "border-rose-500") : "border-gray-300")}>
        {active && <span className={cn("w-2 h-2 rounded-full", cor === "emerald" ? "bg-emerald-500" : "bg-rose-500")} />}
      </span>
      <span className={cn("inline-flex items-center gap-1", active ? "text-gray-800 font-medium" : "text-gray-500")}>
        {icon}{label}
      </span>
    </button>
  );
}
