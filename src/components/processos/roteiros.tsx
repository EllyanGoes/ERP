"use client";

// Roteiros (tarefas padrão) por tipo de processo — hook de leitura e editor da tela de configuração.
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { TIPOS_PROCESSO, api } from "./comum";

export type Etapa = { id?: string; titulo: string; responsavelId: string | null; dias: number; diasUteis: boolean; base: string; avisoDias: number; responsavel?: { id: string; nome: string } | null };
export type Roteiro = { id: string; tipo: string; nome: string; descricao: string | null; ativo: boolean; etapas: Etapa[] };

/** Roteiros ativos (de um tipo, se informado). `tipo` undefined = não busca. */
export function useRoteiros(tipo: string | undefined) {
  const [lista, setLista] = useState<Roteiro[]>([]);
  useEffect(() => {
    if (!tipo) { setLista([]); return; }
    fetch(`/api/processos/roteiros?tipo=${encodeURIComponent(tipo)}`).then((r) => r.json()).then((j) => setLista(j.data ?? [])).catch(() => setLista([]));
  }, [tipo]);
  return lista;
}

export const BASES: Record<string, string> = { ABERTURA: "da abertura", CIENCIA: "da ciência / notificação" };

type Rascunho = { id?: string; tipo: string; nome: string; descricao: string; ativo: boolean; etapas: { titulo: string; responsavelId: string; dias: string; diasUteis: boolean; base: string; avisoDias: string }[] };
const rascunhoDe = (r?: Roteiro): Rascunho => r
  ? { id: r.id, tipo: r.tipo, nome: r.nome, descricao: r.descricao ?? "", ativo: r.ativo, etapas: r.etapas.map((e) => ({ titulo: e.titulo, responsavelId: e.responsavelId ?? "", dias: String(e.dias), diasUteis: e.diasUteis, base: e.base, avisoDias: String(e.avisoDias) })) }
  : { tipo: "ADMINISTRATIVO", nome: "", descricao: "", ativo: true, etapas: [{ titulo: "", responsavelId: "", dias: "5", diasUteis: true, base: "ABERTURA", avisoDias: "2" }] };

/** Editor de um roteiro (criar/editar). */
export function RoteiroEditor({ roteiro, usuarios, onSalvo, onCancelar }: { roteiro?: Roteiro; usuarios: { id: string; nome: string }[]; onSalvo: () => void; onCancelar: () => void }) {
  const [r, setR] = useState<Rascunho>(rascunhoDe(roteiro));
  const [erro, setErro] = useState(""); const [salvando, setSalvando] = useState(false);
  const setEtapa = (i: number, k: keyof Rascunho["etapas"][number], v: string | boolean) => setR((x) => ({ ...x, etapas: x.etapas.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
  const mover = (i: number, d: -1 | 1) => setR((x) => { const e = [...x.etapas]; const j = i + d; if (j < 0 || j >= e.length) return x; [e[i], e[j]] = [e[j], e[i]]; return { ...x, etapas: e }; });
  const salvar = useCallback(async () => {
    setSalvando(true); setErro("");
    const res = await api("/api/processos/roteiros", r.id ? "PUT" : "POST", { ...r, etapas: r.etapas.map((e) => ({ ...e, dias: Number(e.dias) || 0, avisoDias: Number(e.avisoDias) || 0, responsavelId: e.responsavelId || null })) });
    setSalvando(false);
    if (!res.ok) { setErro(res.error!); return; }
    onSalvo();
  }, [r, onSalvo]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Label>Tipo de processo</Label><SelectMenu value={r.tipo} onChange={(v) => setR({ ...r, tipo: v })} options={Object.entries(TIPOS_PROCESSO).map(([value, label]) => ({ value, label }))} /></div>
        <div className="sm:col-span-2"><Label>Nome do roteiro</Label><Input value={r.nome} onChange={(e) => setR({ ...r, nome: e.target.value })} placeholder="Auto de infração (SEFAZ)" /></div>
      </div>
      <div><Label>Descrição</Label><Textarea rows={2} value={r.descricao} onChange={(e) => setR({ ...r, descricao: e.target.value })} /></div>
      <div className="space-y-2">
        <Label>Etapas (viram prazos do processo)</Label>
        {r.etapas.map((e, i) => (
          <div key={i} className="rounded-lg border border-border p-2 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
              <Input className="flex-1" value={e.titulo} onChange={(ev) => setEtapa(i, "titulo", ev.target.value)} placeholder="Ex.: reunir documentos pedidos" />
              <button type="button" onClick={() => mover(i, -1)} className="text-muted-foreground hover:text-foreground" title="Subir"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => mover(i, 1)} className="text-muted-foreground hover:text-foreground" title="Descer"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => setR({ ...r, etapas: r.etapas.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-danger" title="Remover"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pl-7">
              <Input inputMode="numeric" value={e.dias} onChange={(ev) => setEtapa(i, "dias", ev.target.value.replace(/\D/g, ""))} placeholder="dias" />
              <SelectMenu value={e.diasUteis ? "U" : "C"} onChange={(v) => setEtapa(i, "diasUteis", v === "U")} options={[{ value: "U", label: "dias úteis" }, { value: "C", label: "dias corridos" }]} />
              <SelectMenu value={e.base} onChange={(v) => setEtapa(i, "base", v)} options={Object.entries(BASES).map(([value, label]) => ({ value, label }))} />
              <Input inputMode="numeric" value={e.avisoDias} onChange={(ev) => setEtapa(i, "avisoDias", ev.target.value.replace(/\D/g, ""))} placeholder="avisar N dias antes" title="Avisar N dias antes" />
              <ComboboxWithCreate value={e.responsavelId} onChange={(v) => setEtapa(i, "responsavelId", v)} allowNone options={usuarios.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Responsável do processo" />
            </div>
          </div>
        ))}
        <button type="button" className="text-xs text-info hover:underline inline-flex items-center gap-1" onClick={() => setR({ ...r, etapas: [...r.etapas, { titulo: "", responsavelId: "", dias: "5", diasUteis: true, base: r.etapas.at(-1)?.base ?? "ABERTURA", avisoDias: "2" }] })}><Plus className="w-3 h-3" /> etapa</button>
      </div>
      {r.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} /> Ativo (aparece ao criar processos)</label>}
      <p className="text-[11px] text-muted-foreground">Prazos legais variam por órgão e por caso: use estes números como referência e ajuste o prazo no processo quando o documento disser outro.</p>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar roteiro"}</Button>
      </div>
    </div>
  );
}
