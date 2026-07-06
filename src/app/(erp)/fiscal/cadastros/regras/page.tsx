"use client";

// Regras de tributação — motor do módulo Fiscal. Dimensões em branco = "qualquer"
// (fallback); a resolução pontua por especificidade (item > grupo > UF >
// contribuinte). Sem regra que case, a emissão FALHA — o motor nunca chuta CST.
// Os valores calculados são sugestão sobre a NF, revisáveis antes de transmitir.

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Plus, Pencil, Trash2, Loader2, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type Operacao = { id: string; codigo: string; descricao: string };
type Grupo = { id: string; codigo: string; nome: string };
type Regra = {
  id: string;
  operacaoFiscalId: string;
  ufDestino: string | null;
  dentroEstado: boolean | null;
  tipoContribuinte: string | null;
  grupoTributacaoId: string | null;
  itemId: string | null;
  cfop: string;
  cstIcms: string;
  aliqIcms: string | null;
  pRedBcIcms: string | null;
  temSt: boolean;
  mvaSt: string | null;
  cstIpi: string | null;
  aliqIpi: string | null;
  cstPis: string | null;
  aliqPis: string | null;
  cstCofins: string | null;
  aliqCofins: string | null;
  cClassTrib: string | null;
  cBeneficio: string | null;
  mensagemFiscal: string | null;
  prioridade: number;
  ativo: boolean;
  operacaoFiscal: { codigo: string; descricao: string };
  grupoTributacao: { codigo: string; nome: string } | null;
};

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Form = {
  operacaoFiscalId: string;
  ufDestino: string;
  dentroEstado: string; // "" | "true" | "false"
  tipoContribuinte: string;
  grupoTributacaoId: string;
  cfop: string;
  cstIcms: string;
  aliqIcms: string;
  pRedBcIcms: string;
  temSt: boolean;
  mvaSt: string;
  cstIpi: string;
  aliqIpi: string;
  cstPis: string;
  aliqPis: string;
  cstCofins: string;
  aliqCofins: string;
  cClassTrib: string;
  mensagemFiscal: string;
  prioridade: string;
};

const FORM_VAZIO: Form = {
  operacaoFiscalId: "", ufDestino: "", dentroEstado: "", tipoContribuinte: "", grupoTributacaoId: "",
  cfop: "", cstIcms: "", aliqIcms: "", pRedBcIcms: "", temSt: false, mvaSt: "",
  cstIpi: "", aliqIpi: "", cstPis: "", aliqPis: "", cstCofins: "", aliqCofins: "",
  cClassTrib: "", mensagemFiscal: "", prioridade: "0",
};

export default function RegrasTributacaoPage() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroOp, setFiltroOp] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState<Form>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    const [rRegras, rOps, rGrupos] = await Promise.all([
      fetch(`/api/fiscal/regras${filtroOp ? `?operacaoFiscalId=${filtroOp}` : ""}`),
      fetch("/api/fiscal/operacoes"),
      fetch("/api/fiscal/grupos-tributacao"),
    ]);
    setRegras(await rRegras.json());
    setOperacoes(await rOps.json());
    setGrupos(await rGrupos.json());
    setLoading(false);
  }, [filtroOp]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setF({ ...FORM_VAZIO, operacaoFiscalId: filtroOp || operacoes[0]?.id || "" });
    setErro(""); setFormOpen(true);
  }

  function openEdit(r: Regra) {
    setEditingId(r.id);
    setF({
      operacaoFiscalId: r.operacaoFiscalId,
      ufDestino: r.ufDestino ?? "",
      dentroEstado: r.dentroEstado === null ? "" : String(r.dentroEstado),
      tipoContribuinte: r.tipoContribuinte ?? "",
      grupoTributacaoId: r.grupoTributacaoId ?? "",
      cfop: r.cfop,
      cstIcms: r.cstIcms,
      aliqIcms: r.aliqIcms ?? "",
      pRedBcIcms: r.pRedBcIcms ?? "",
      temSt: r.temSt,
      mvaSt: r.mvaSt ?? "",
      cstIpi: r.cstIpi ?? "",
      aliqIpi: r.aliqIpi ?? "",
      cstPis: r.cstPis ?? "",
      aliqPis: r.aliqPis ?? "",
      cstCofins: r.cstCofins ?? "",
      aliqCofins: r.aliqCofins ?? "",
      cClassTrib: r.cClassTrib ?? "",
      mensagemFiscal: r.mensagemFiscal ?? "",
      prioridade: String(r.prioridade),
    });
    setErro(""); setFormOpen(true);
  }

  async function salvar() {
    setSaving(true); setErro("");
    try {
      const body = {
        ...f,
        dentroEstado: f.dentroEstado === "" ? null : f.dentroEstado === "true",
        prioridade: Number(f.prioridade || 0),
      };
      const url = editingId ? `/api/fiscal/regras/${editingId}` : "/api/fiscal/regras";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function excluir(r: Regra) {
    setErro("");
    const res = await fetch(`/api/fiscal/regras/${r.id}`, { method: "DELETE" });
    if (!res.ok) { setErro((await res.json()).error || "Erro ao excluir"); return; }
    await load();
  }

  function escopoLabel(r: Regra): string {
    const partes: string[] = [];
    if (r.itemId) partes.push("item específico");
    if (r.grupoTributacao) partes.push(`grupo ${r.grupoTributacao.codigo}`);
    if (r.ufDestino) partes.push(`UF ${r.ufDestino}`);
    else if (r.dentroEstado !== null) partes.push(r.dentroEstado ? "dentro do estado" : "fora do estado");
    if (r.tipoContribuinte) partes.push(r.tipoContribuinte.toLowerCase().replace("_", " "));
    return partes.length ? partes.join(" · ") : "geral (qualquer item/destino)";
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div>
      <PageHeader
        title="Regras de Tributação"
        breadcrumbs={[{ label: "Fiscal" }, { label: "Regras de Tributação" }]}
        action={
          <Button onClick={openCreate} disabled={operacoes.length === 0}>
            <Plus className="w-4 h-4 mr-1" /> Nova Regra
          </Button>
        }
      />

      <div className="px-8 pb-8 max-w-4xl space-y-4">
        <div className="max-w-xs">
          <select className={selectCls} value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}>
            <option value="">Todas as operações</option>
            {operacoes.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.descricao}</option>)}
          </select>
        </div>

        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}

        {formOpen && (
          <div className="border border-border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm">{editingId ? "Editar Regra" : "Nova Regra"}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Operação fiscal <span className="text-red-500">*</span></Label>
                <select className={selectCls} value={f.operacaoFiscalId} onChange={(e) => set({ operacaoFiscalId: e.target.value })} disabled={!!editingId}>
                  {operacoes.map((o) => <option key={o.id} value={o.id}>{o.codigo} — {o.descricao}</option>)}
                </select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mb-2">Escopo — em branco = qualquer (regra geral)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Grupo de tributação</Label>
                <select className={selectCls} value={f.grupoTributacaoId} onChange={(e) => set({ grupoTributacaoId: e.target.value })}>
                  <option value="">qualquer</option>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.codigo}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>UF de destino</Label>
                <select className={selectCls} value={f.ufDestino} onChange={(e) => set({ ufDestino: e.target.value })}>
                  <option value="">qualquer</option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Dentro/fora do estado</Label>
                <select className={selectCls} value={f.dentroEstado} onChange={(e) => set({ dentroEstado: e.target.value })} disabled={!!f.ufDestino}>
                  <option value="">qualquer</option>
                  <option value="true">dentro do estado</option>
                  <option value="false">fora do estado</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Destinatário</Label>
                <select className={selectCls} value={f.tipoContribuinte} onChange={(e) => set({ tipoContribuinte: e.target.value })}>
                  <option value="">qualquer</option>
                  <option value="CONTRIBUINTE">contribuinte</option>
                  <option value="ISENTO">isento de IE</option>
                  <option value="NAO_CONTRIBUINTE">não contribuinte</option>
                </select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mb-2">Tributação aplicada</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>CFOP <span className="text-red-500">*</span></Label>
                <Input value={f.cfop} onChange={(e) => set({ cfop: e.target.value })} placeholder="5102" maxLength={4} />
              </div>
              <div className="space-y-1.5">
                <Label>CST/CSOSN ICMS <span className="text-red-500">*</span></Label>
                <Input value={f.cstIcms} onChange={(e) => set({ cstIcms: e.target.value })} placeholder="00 ou 102" />
              </div>
              <div className="space-y-1.5">
                <Label>Alíq. ICMS %</Label>
                <Input type="number" step="0.01" value={f.aliqIcms} onChange={(e) => set({ aliqIcms: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Red. BC ICMS %</Label>
                <Input type="number" step="0.01" value={f.pRedBcIcms} onChange={(e) => set({ pRedBcIcms: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CST IPI</Label>
                <Input value={f.cstIpi} onChange={(e) => set({ cstIpi: e.target.value })} placeholder="53" />
              </div>
              <div className="space-y-1.5">
                <Label>Alíq. IPI %</Label>
                <Input type="number" step="0.01" value={f.aliqIpi} onChange={(e) => set({ aliqIpi: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CST PIS</Label>
                <Input value={f.cstPis} onChange={(e) => set({ cstPis: e.target.value })} placeholder="01" />
              </div>
              <div className="space-y-1.5">
                <Label>Alíq. PIS %</Label>
                <Input type="number" step="0.0001" value={f.aliqPis} onChange={(e) => set({ aliqPis: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CST COFINS</Label>
                <Input value={f.cstCofins} onChange={(e) => set({ cstCofins: e.target.value })} placeholder="01" />
              </div>
              <div className="space-y-1.5">
                <Label>Alíq. COFINS %</Label>
                <Input type="number" step="0.0001" value={f.aliqCofins} onChange={(e) => set({ aliqCofins: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>cClassTrib (IBS/CBS)</Label>
                <Input value={f.cClassTrib} onChange={(e) => set({ cClassTrib: e.target.value })} placeholder="reforma 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade (desempate)</Label>
                <Input type="number" value={f.prioridade} onChange={(e) => set({ prioridade: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem fiscal (infCpl — fundamentação legal)</Label>
              <Input value={f.mensagemFiscal} onChange={(e) => set({ mensagemFiscal: e.target.value })} placeholder="Ex: ICMS ST recolhido conforme art..." />
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
        ) : regras.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Scale className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma regra cadastrada</p>
            <p className="text-muted-foreground text-sm mt-1">
              {operacoes.length === 0
                ? "Cadastre primeiro as operações fiscais (ou use “Criar padrão” na tela de Operações)"
                : "Sem regra que case com o item, a emissão falha — cadastre ao menos a regra geral de cada operação"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {regras.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", r.ativo ? "bg-emerald-400" : "bg-muted")} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.operacaoFiscal.codigo} · CFOP {r.cfop} · CST {r.cstIcms}
                      {r.aliqIcms ? ` · ICMS ${Number(r.aliqIcms)}%` : ""}
                      {r.aliqIpi ? ` · IPI ${Number(r.aliqIpi)}%` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{escopoLabel(r)}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(r)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-danger hover:bg-danger/10" onClick={() => excluir(r)}>
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
