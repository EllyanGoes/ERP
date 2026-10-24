"use client";

// Formulário de criação/edição do ativo da Manutenção (ManutAtivo).
// codApl de ativo novo é gerado no servidor; a tag é única por empresa.
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import { Autoria } from "@/components/shared/Autoria";
import { Save } from "lucide-react";
import type { AtivoNode } from "@/app/api/pcm/ativos/route";

export const TIPO_ATIVO_LABEL: Record<string, string> = {
  LOCAL: "Local / área",
  EQUIPAMENTO: "Equipamento",
  COMPONENTE: "Componente",
  VEICULO: "Veículo",
};

export interface Lookups {
  familias: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
  centrosCusto: { id: string; codigo: string; nome: string }[];
  imobilizados: { id: string; descricao: string }[];
  fornecedores: { id: string; razaoSocial: string; nomeFantasia: string | null }[];
}

/** Ficha do ativo como devolvida por GET /api/pcm/ativos/[codApl]. */
export interface AtivoFicha {
  id: string;
  codApl: number;
  tag: string;
  nome: string;
  tipo: string;
  status: string;
  ativo: boolean;
  paiId: string | null;
  familiaId: string | null;
  localizacao: string | null;
  setorId: string | null;
  centroCustoId: string | null;
  imobilizadoId: string | null;
  fornecedorId: string | null;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  numeroPatrimonio: string | null;
  placa: string | null;
  anoFabricacao: number | null;
  dataAquisicao: string | null;
  garantiaAte: string | null;
  observacoes: string | null;
  criadoPor: string | null;
  atualizadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

type Form = {
  tag: string; nome: string; tipo: string; paiId: string; familiaId: string; localizacao: string;
  setorId: string; centroCustoId: string; imobilizadoId: string; fornecedorId: string;
  fabricante: string; modelo: string; numeroSerie: string; numeroPatrimonio: string; placa: string;
  anoFabricacao: string; dataAquisicao: string; garantiaAte: string; observacoes: string; ativo: boolean;
};

const VAZIO: Form = {
  tag: "", nome: "", tipo: "EQUIPAMENTO", paiId: "", familiaId: "", localizacao: "", setorId: "",
  centroCustoId: "", imobilizadoId: "", fornecedorId: "", fabricante: "", modelo: "", numeroSerie: "",
  numeroPatrimonio: "", placa: "", anoFabricacao: "", dataAquisicao: "", garantiaAte: "", observacoes: "", ativo: true,
};

const iso = (d: string | null) => (d ? d.slice(0, 10) : "");

function formDe(a: AtivoFicha): Form {
  return {
    tag: a.tag, nome: a.nome, tipo: a.tipo, paiId: a.paiId ?? "", familiaId: a.familiaId ?? "",
    localizacao: a.localizacao ?? "", setorId: a.setorId ?? "", centroCustoId: a.centroCustoId ?? "",
    imobilizadoId: a.imobilizadoId ?? "", fornecedorId: a.fornecedorId ?? "", fabricante: a.fabricante ?? "",
    modelo: a.modelo ?? "", numeroSerie: a.numeroSerie ?? "", numeroPatrimonio: a.numeroPatrimonio ?? "",
    placa: a.placa ?? "", anoFabricacao: a.anoFabricacao ? String(a.anoFabricacao) : "",
    dataAquisicao: iso(a.dataAquisicao), garantiaAte: iso(a.garantiaAte), observacoes: a.observacoes ?? "", ativo: a.ativo,
  };
}

/** Lista plana da árvore (com caminho) para o droplist de pai. */
function achatar(nodes: AtivoNode[], trilha: string[] = [], out: { node: AtivoNode; caminho: string }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, caminho: trilha.join(" › ") });
    achatar(n.children, [...trilha, n.descricao], out);
  }
  return out;
}

/** ids do nó e de todos os descendentes (não podem ser escolhidos como pai). */
function idsDaSubarvore(nodes: AtivoNode[], id: string): Set<string> {
  const out = new Set<string>();
  const marcar = (n: AtivoNode) => { out.add(n.id); n.children.forEach(marcar); };
  const achar = (ns: AtivoNode[]) => {
    for (const n of ns) {
      if (n.id === id) { marcar(n); return; }
      achar(n.children);
    }
  };
  achar(nodes);
  return out;
}

export default function AtivoFormDialog({
  open,
  onOpenChange,
  editando,
  paiInicial,
  tree,
  lookups,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = novo ativo. */
  editando: AtivoFicha | null;
  /** id do pai sugerido ao criar ("novo filho"). */
  paiInicial?: string | null;
  tree: AtivoNode[];
  lookups: Lookups | null;
  onSalvo: (codApl: number) => void;
}) {
  const [f, setF] = useState<Form>(VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!open) return;
    setErro("");
    setF(editando ? formDe(editando) : { ...VAZIO, paiId: paiInicial ?? "" });
  }, [open, editando, paiInicial]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const opcoesPai = useMemo(() => {
    const bloqueados = editando ? idsDaSubarvore(tree, editando.id) : new Set<string>();
    return achatar(tree)
      .filter(({ node }) => !bloqueados.has(node.id))
      .map(({ node, caminho }) => ({
        value: node.id,
        code: node.tag,
        label: caminho ? `${node.descricao} — ${caminho}` : node.descricao,
      }));
  }, [tree, editando]);

  async function salvar() {
    if (!f.tag.trim()) { setErro("Informe a tag."); return; }
    if (!f.nome.trim()) { setErro("Informe o nome."); return; }
    setSaving(true);
    setErro("");
    const payload = { ...f, anoFabricacao: f.anoFabricacao || null };
    const res = await fetch(editando ? `/api/pcm/ativos/${editando.codApl}` : "/api/pcm/ativos", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) { setErro(j?.error || "Não foi possível salvar o ativo."); return; }
    onSalvo(editando ? editando.codApl : j.data.codApl);
    onOpenChange(false);
  }

  const lk = lookups;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? `Editar ativo ${editando.tag}` : "Novo ativo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label>Tag *</Label>
              <Input value={f.tag} onChange={(e) => set("tag", e.target.value.toUpperCase())} placeholder="FOR-0002" className="font-mono" />
            </div>
            <div className="sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Forno túnel 02" />
            </div>
            <div>
              <Label>Tipo</Label>
              <SelectMenu value={f.tipo} onChange={(v) => set("tipo", v)} options={Object.entries(TIPO_ATIVO_LABEL).map(([value, label]) => ({ value, label }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Pai na árvore</Label>
              <ComboboxWithCreate value={f.paiId} onChange={(v) => set("paiId", v)} options={opcoesPai} placeholder="Raiz (sem pai)" noneLabel="Raiz (sem pai)" menuMinWidth={460} />
            </div>
            <div>
              <Label>Família</Label>
              <ComboboxWithCreate value={f.familiaId} onChange={(v) => set("familiaId", v)} options={(lk?.familias ?? []).map((x) => ({ value: x.id, label: x.nome }))} placeholder="—" noneLabel="Sem família" />
            </div>
            <div>
              <Label>Localização</Label>
              <Input value={f.localizacao} onChange={(e) => set("localizacao", e.target.value)} placeholder="Galpão de queima" />
            </div>
            <div>
              <Label>Setor</Label>
              <ComboboxWithCreate value={f.setorId} onChange={(v) => set("setorId", v)} options={(lk?.setores ?? []).map((x) => ({ value: x.id, label: x.nome }))} placeholder="—" noneLabel="Sem setor" />
            </div>
            <div>
              <Label>Centro de custo</Label>
              <ComboboxWithCreate value={f.centroCustoId} onChange={(v) => set("centroCustoId", v)} options={(lk?.centrosCusto ?? []).map((x) => ({ value: x.id, code: x.codigo, label: x.nome }))} placeholder="—" noneLabel="Sem centro" menuMinWidth={320} />
            </div>
            <div>
              <Label>Imobilizado (bem patrimonial)</Label>
              <ComboboxWithCreate value={f.imobilizadoId} onChange={(v) => set("imobilizadoId", v)} options={(lk?.imobilizados ?? []).map((x) => ({ value: x.id, label: x.descricao }))} placeholder="—" noneLabel="Sem vínculo" menuMinWidth={360} />
            </div>
            <div className="sm:col-span-2">
              <Label>Fornecedor / assistência técnica</Label>
              <ComboboxWithCreate value={f.fornecedorId} onChange={(v) => set("fornecedorId", v)} options={(lk?.fornecedores ?? []).map((x) => ({ value: x.id, label: x.nomeFantasia ? `${x.nomeFantasia} (${x.razaoSocial})` : x.razaoSocial }))} placeholder="—" noneLabel="Sem fornecedor" menuMinWidth={400} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><Label>Fabricante</Label><Input value={f.fabricante} onChange={(e) => set("fabricante", e.target.value)} /></div>
            <div><Label>Modelo</Label><Input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></div>
            <div><Label>Nº de série</Label><Input value={f.numeroSerie} onChange={(e) => set("numeroSerie", e.target.value)} /></div>
            <div><Label>Patrimônio</Label><Input value={f.numeroPatrimonio} onChange={(e) => set("numeroPatrimonio", e.target.value)} /></div>
            <div><Label>Placa</Label><Input value={f.placa} onChange={(e) => set("placa", e.target.value.toUpperCase())} placeholder="veículos" /></div>
            <div><Label>Ano de fabricação</Label><Input type="number" value={f.anoFabricacao} onChange={(e) => set("anoFabricacao", e.target.value)} /></div>
            <div><Label>Aquisição</Label><DatePicker value={f.dataAquisicao} onChange={(v) => set("dataAquisicao", v)} allowClear /></div>
            <div><Label>Garantia até</Label><DatePicker value={f.garantiaAte} onChange={(v) => set("garantiaAte", v)} allowClear /></div>
          </div>

          <div>
            <Label>Observações</Label>
            <textarea
              value={f.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {editando && (
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={f.ativo} onChange={(e) => set("ativo", e.target.checked)} />
              Ativo em uso (desmarque para inativar — some das listas, histórico preservado)
            </label>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}
          {editando && (
            <Autoria
              criadoPor={editando.criadoPor}
              atualizadoPor={editando.atualizadoPor}
              criadoEm={editando.createdAt}
              atualizadoEm={editando.updatedAt}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" /> {saving ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
