"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate, { type ComboboxOption } from "@/components/shared/ComboboxWithCreate";
import { Autoria } from "@/components/shared/Autoria";
import { cn, formatBRL } from "@/lib/utils";
import { useTabTitle } from "@/lib/tabs-context";
import { Loader2, Plus, Trash2, Save, Printer, Lock, LockOpen, X, Users, Upload, FileCheck2 } from "lucide-react";

type ItemRow = { _key: string; colaboradorId: string; servico: string; valor: string };
type GrupoRow = { _key: string; tipo: string; setor: string; turno: string; itens: ItemRow[] };

const TURNOS = [{ v: "DIA", l: "Dia" }, { v: "NOITE", l: "Noite" }];
const key = () => Math.random().toString(36).slice(2);
const novoItem = (): ItemRow => ({ _key: key(), colaboradorId: "", servico: "", valor: "" });
// O bloco é POR SETOR: quem está dentro dele estava nesse setor nessa diária.
// tipo segue no modelo (default DIVERSAS) mas não é mais editável na tela.
const novoGrupo = (): GrupoRow => ({ _key: key(), tipo: "DIVERSAS", setor: "", turno: "DIA", itens: [novoItem()] });
const num = (v: string) => { const n = parseFloat((v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

export default function DiariaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useTabTitle("Folha de Diárias");

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [status, setStatus] = useState("ABERTA");
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [colabs, setColabs] = useState<ComboboxOption[]>([]);
  const [setores, setSetores] = useState<ComboboxOption[]>([]);
  // Folha assinada escaneada (upload após a coleta de assinaturas)
  const [arquivoAssinado, setArquivoAssinado] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const [rf, rc, rs] = await Promise.all([
      fetch(`/api/rh/diaristas/${id}`),
      fetch("/api/empresa/colaboradores?ativo=true"),
      fetch("/api/empresa/setores"),
    ]);
    if (rf.ok) {
      const { data: f } = await rf.json();
      setData(f.data?.slice(0, 10) ?? "");
      setObservacoes(f.observacoes ?? "");
      setStatus(f.status ?? "ABERTA");
      setCriadoPor(f.criadoPor ?? null);
      setArquivoAssinado(f.arquivoAssinadoNome ?? null);
      setGrupos(
        (f.grupos ?? []).map((g: { tipo: string; setor: string | null; turno: string; itens: { colaboradorId: string; servico: string | null; valor: string }[] }) => ({
          _key: key(), tipo: g.tipo, setor: g.setor ?? "", turno: g.turno,
          itens: (g.itens ?? []).map((it) => ({ _key: key(), colaboradorId: it.colaboradorId, servico: it.servico ?? "", valor: String(it.valor ?? "") })),
        })),
      );
    }
    if (rc.ok) {
      const jc = await rc.json();
      const lista: { id: string; nome: string; cargo?: string | null; setor?: { nome: string } | null }[] = jc.data ?? jc ?? [];
      setColabs(lista.map((c) => ({ value: c.id, label: c.nome, code: c.cargo ?? c.setor?.nome ?? undefined })));
    }
    if (rs.ok) {
      const js = await rs.json();
      const lista: { id: string; nome: string; ativo: boolean }[] = Array.isArray(js) ? js : (js.data ?? []);
      // O valor do bloco é o NOME do setor (DiariaGrupo.setor é texto).
      setSetores(lista.filter((s) => s.ativo).map((s) => ({ value: s.nome, label: s.nome })));
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const bloqueado = status === "FECHADA";

  const totalGeral = useMemo(() => grupos.reduce((s, g) => s + g.itens.reduce((a, it) => a + (it.colaboradorId ? num(it.valor) : 0), 0), 0), [grupos]);
  const totalPessoas = useMemo(() => grupos.reduce((s, g) => s + g.itens.filter((it) => it.colaboradorId).length, 0), [grupos]);

  function upGrupo(gk: string, patch: Partial<GrupoRow>) { setGrupos((gs) => gs.map((g) => (g._key === gk ? { ...g, ...patch } : g))); }
  function upItem(gk: string, ik: string, patch: Partial<ItemRow>) {
    setGrupos((gs) => gs.map((g) => (g._key === gk ? { ...g, itens: g.itens.map((it) => (it._key === ik ? { ...it, ...patch } : it)) } : g)));
  }

  // Upload do escaneado assinado pelos diaristas (substitui o anterior).
  async function enviarAssinada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoArquivo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/rh/diaristas/${id}/arquivo`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Falha ao enviar o arquivo"); return; }
      setArquivoAssinado(file.name);
    } finally {
      setEnviandoArquivo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar(novoStatus?: string) {
    setSalvando(true);
    const body = {
      data, observacoes, status: novoStatus ?? status,
      grupos: grupos.map((g) => ({ tipo: g.tipo, setor: g.setor, turno: g.turno, itens: g.itens.filter((it) => it.colaboradorId).map((it) => ({ colaboradorId: it.colaboradorId, servico: it.servico, valor: num(it.valor) })) })),
    };
    const res = await fetch(`/api/rh/diaristas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSalvando(false);
    if (res.ok && novoStatus) setStatus(novoStatus);
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader
        title="Folha de Diárias"
        breadcrumbs={[{ label: "Gestão de Pessoas" }, { label: "Diárias", href: "/rh/diaristas" }, { label: data ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR") : "Folha" }]}
        actions={
          <div className="flex items-center gap-2">
            <span className={cn("text-[11px] font-medium px-2 py-1 rounded-full", bloqueado ? "bg-success/15 text-success" : "bg-info/15 text-info")}>{bloqueado ? "Fechada" : "Aberta"}</span>
            <Button variant="outline" onClick={() => window.open(`/rh/diaristas/${id}/imprimir`, "_blank")} className="gap-2"><Printer className="h-4 w-4" /> Baixar PDF</Button>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={enviarAssinada} />
            {arquivoAssinado && (
              <a href={`/api/rh/diaristas/${id}/arquivo`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-success hover:underline" title={arquivoAssinado}>
                <FileCheck2 className="h-4 w-4" /> Assinada
              </a>
            )}
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={enviandoArquivo} className="gap-2" title="Subir a folha escaneada com as assinaturas dos diaristas">
              {enviandoArquivo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {arquivoAssinado ? "Substituir assinada" : "Enviar assinada"}
            </Button>
            {!bloqueado ? (
              <>
                <Button variant="outline" onClick={() => salvar()} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                <Button onClick={() => salvar("FECHADA")} disabled={salvando} className="gap-2"><Lock className="h-4 w-4" /> Fechar folha</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => salvar("ABERTA")} disabled={salvando} className="gap-2"><LockOpen className="h-4 w-4" /> Reabrir</Button>
            )}
          </div>
        }
      />

      <div className="px-8 pb-10 space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
            <DatePicker value={data} disabled={bloqueado} onChange={(v) => setData(v)} className="w-48" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observações</label>
            <Input value={observacoes} disabled={bloqueado} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" className="h-10 border-border" />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total geral · {totalPessoas} pessoa{totalPessoas !== 1 ? "s" : ""}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatBRL(totalGeral)}</p>
          </div>
        </div>

        {/* Blocos */}
        {grupos.map((g) => {
          const subtotal = g.itens.reduce((a, it) => a + (it.colaboradorId ? num(it.valor) : 0), 0);
          return (
            <div key={g._key} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-muted border-b border-border">
                <div className="flex-1 min-w-[220px]">
                  <ComboboxWithCreate
                    value={g.setor}
                    onChange={(v) => upGrupo(g._key, { setor: v })}
                    // Folhas antigas têm setor em texto livre — mantém o valor visível.
                    options={g.setor && !setores.some((s) => s.value === g.setor) ? [{ value: g.setor, label: g.setor }, ...setores] : setores}
                    disabled={bloqueado}
                    placeholder="Setor do bloco..."
                    noneLabel="— selecionar setor —"
                    menuMinWidth={280}
                    triggerClassName="h-9 rounded-lg font-medium"
                  />
                </div>
                <select value={g.turno} disabled={bloqueado} onChange={(e) => upGrupo(g._key, { turno: e.target.value })} className="h-9 rounded-lg border border-border bg-card px-2 text-sm">
                  {TURNOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{formatBRL(subtotal)}</span>
                {!bloqueado && <button onClick={() => setGrupos((gs) => gs.filter((x) => x._key !== g._key))} className="text-muted-foreground hover:text-danger" title="Remover bloco"><X className="h-4 w-4" /></button>}
              </div>

              <div className="divide-y divide-border">
                <div className="grid grid-cols-[2rem_1.4fr_2fr_7rem_2rem] gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                  <span>#</span><span>Nome</span><span>Serviços</span><span className="text-right">Valor</span><span />
                </div>
                {g.itens.map((it, i) => (
                  <div key={it._key} className="grid grid-cols-[2rem_1.4fr_2fr_7rem_2rem] gap-2 px-4 py-2 items-center">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    <ComboboxWithCreate value={it.colaboradorId} onChange={(v) => upItem(g._key, it._key, { colaboradorId: v })} options={colabs} allowNone={false} disabled={bloqueado} placeholder="Colaborador..." triggerClassName="h-9 rounded-lg" />
                    <Input value={it.servico} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { servico: e.target.value })} placeholder="Serviço (ex.: MOTORISTA 120/8*8)" className="h-9 border-border" />
                    <Input value={it.valor} disabled={bloqueado} onChange={(e) => upItem(g._key, it._key, { valor: e.target.value })} inputMode="decimal" placeholder="0,00" className="h-9 text-right tabular-nums border-border" />
                    {!bloqueado && <button onClick={() => setGrupos((gs) => gs.map((x) => (x._key === g._key ? { ...x, itens: x.itens.length > 1 ? x.itens.filter((y) => y._key !== it._key) : x.itens } : x)))} className="text-muted-foreground hover:text-danger flex justify-center"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
              {!bloqueado && (
                <div className="px-4 py-2 border-t border-border">
                  <button onClick={() => upGrupo(g._key, { itens: [...g.itens, novoItem()] })} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"><Plus className="h-3.5 w-3.5" /> Adicionar pessoa</button>
                </div>
              )}
            </div>
          );
        })}

        {!bloqueado && (
          <Button variant="outline" onClick={() => setGrupos((gs) => [...gs, novoGrupo()])} className="gap-2 border-dashed"><Plus className="h-4 w-4" /> Adicionar bloco</Button>
        )}
        {grupos.length === 0 && (
          <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />Nenhum bloco. Clique em &quot;Adicionar bloco&quot; para começar.
          </div>
        )}

        <Autoria criadoPor={criadoPor} />
      </div>
    </div>
  );
}
