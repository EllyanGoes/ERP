"use client";

// Edição do plano: cabeçalho, checklist (vira as linhas da OS gerada), kit de
// materiais previstos e a aplicação a cada ativo (calendário ou medidor).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import SelectMenu from "@/components/shared/SelectMenu";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import DatePicker from "@/components/shared/DatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { AtivoCombobox, StatusOSBadge, api, fmtData, useManutLookups } from "@/components/manutencao/comum";

type Medidor = { id: string; nome: string; unidade: string; acumulado: string };
type Aplicacao = {
  id: string; gatilho: string; intervaloDias: number | null; intervaloMedida: string | null; medidorId: string | null; ultimaExecucao: string | null; ultimaMedida: string | null;
  proximoVencimento: string | null; proximaMedida: string | null; ativo: boolean;
  ativoRef: { id: string; tag: string; nome: string; medidores: Medidor[] }; medidor: Medidor | null;
};
type Plano = {
  id: string; codigo: string; nome: string; tipoId: string; equipeId: string | null; horasEstimadas: string | null; exigeParada: boolean;
  antecedenciaDias: number; toleranciaPct: number; baseNaConclusao: boolean; observacoes: string | null; ativo: boolean;
  tarefas: { descricao: string; tipoResposta: string; faixaMin: string | null; faixaMax: string | null; servicoId: string | null; ativoId: string | null }[];
  materiais: { itemId: string; quantidade: string; item: { codigo: string; descricao: string } }[];
  ativos: Aplicacao[];
  ordens: { id: string; numero: string; status: string; createdAt: string; programadaPara: string | null; concluidaEm: string | null; ativo: { tag: string } | null }[];
};
type Tarefa = { descricao: string; tipoResposta: string; faixaMin: string; faixaMax: string; servicoId: string; ativoId: string };
type Mat = { itemId: string; quantidade: string; rotulo: string };

const RESPOSTAS = [{ value: "OK_NOK", label: "OK / NOK" }, { value: "NUMERO", label: "Medição (número)" }, { value: "TEXTO", label: "Texto" }, { value: "NENHUMA", label: "Título / sem resposta" }];

export default function PlanoEdicaoPage() {
  const { id } = useParams<{ id: string }>();
  const lk = useManutLookups();
  const [p, setP] = useState<Plano | null>(null);
  useTabTitle(p ? `Plano ${p.codigo}` : "Plano");
  const [cab, setCab] = useState<Record<string, string | boolean>>({});
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [itens, setItens] = useState<{ id: string; codigo: string; descricao: string }[]>([]);
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(""); const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const j = await fetch(`/api/pcm/planos-cadastro/${id}`).then((r) => r.json()).catch(() => ({}));
    const d: Plano | undefined = j.data;
    if (!d) { setMsg(j.error || "Plano não encontrado."); return; }
    setP(d);
    setCab({ codigo: d.codigo, nome: d.nome, tipoId: d.tipoId, equipeId: d.equipeId ?? "", horasEstimadas: d.horasEstimadas ?? "", exigeParada: d.exigeParada,
      antecedenciaDias: String(d.antecedenciaDias), toleranciaPct: String(d.toleranciaPct), baseNaConclusao: d.baseNaConclusao, observacoes: d.observacoes ?? "", ativo: d.ativo });
    setTarefas(d.tarefas.map((t) => ({ descricao: t.descricao, tipoResposta: t.tipoResposta, faixaMin: t.faixaMin ?? "", faixaMax: t.faixaMax ?? "", servicoId: t.servicoId ?? "", ativoId: t.ativoId ?? "" })));
    setMats(d.materiais.map((m) => ({ itemId: m.itemId, quantidade: String(Number(m.quantidade)), rotulo: `${m.item.codigo} — ${m.item.descricao}` })));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/itens?limit=3000").then((r) => r.json()).then((j) => setItens(j.data ?? [])).catch(() => {}); }, []);

  async function salvar() {
    setSaving(true); setMsg(""); setOk("");
    const r = await api(`/api/pcm/planos-cadastro/${id}`, "PATCH", { ...cab, tarefas, materiais: mats });
    setSaving(false);
    if (!r.ok) { setMsg(r.error!); return; }
    setOk("Plano salvo."); load();
  }
  const mover = (i: number, d: number) => { const t = [...tarefas]; const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; setTarefas(t); };

  // aplicação a ativos
  const [apl, setApl] = useState<{ paId?: string; ativoId: string; gatilho: string; intervaloDias: string; medidorId: string; intervaloMedida: string; ultimaMedida: string; ultimaExecucao: string } | null>(null);
  const [erroApl, setErroApl] = useState("");
  const [medidoresDoAtivo, setMedidoresDoAtivo] = useState<Medidor[]>([]);
  const [novoMedidor, setNovoMedidor] = useState("");
  async function carregarMedidores(ativoId: string) {
    if (!ativoId) { setMedidoresDoAtivo([]); return; }
    const j = await fetch("/api/pcm/medidores").then((r) => r.json()).catch(() => ({}));
    setMedidoresDoAtivo((j.data ?? []).filter((m: { ativoRef: { id: string } }) => m.ativoRef.id === ativoId));
  }
  function abrirApl(a?: Aplicacao) {
    setErroApl(""); setNovoMedidor("");
    const base = a ? { paId: a.id, ativoId: a.ativoRef.id, gatilho: a.gatilho, intervaloDias: a.intervaloDias ? String(a.intervaloDias) : "", medidorId: a.medidorId ?? "", intervaloMedida: a.intervaloMedida ? String(Number(a.intervaloMedida)) : "", ultimaMedida: a.ultimaMedida ? String(Number(a.ultimaMedida)) : "", ultimaExecucao: a.ultimaExecucao?.slice(0, 10) ?? "" }
      : { ativoId: "", gatilho: "CALENDARIO", intervaloDias: "30", medidorId: "", intervaloMedida: "", ultimaMedida: "", ultimaExecucao: "" };
    setApl(base);
    if (a) setMedidoresDoAtivo(a.ativoRef.medidores); else setMedidoresDoAtivo([]);
  }
  async function criarMedidor() {
    if (!apl?.ativoId) return;
    const r = await api<{ id: string }>("/api/pcm/medidores", "POST", { acao: "criar", ativoId: apl.ativoId, nome: novoMedidor || "Horímetro", unidade: "h" });
    if (!r.ok) { setErroApl(r.error!); return; }
    await carregarMedidores(apl.ativoId); setApl({ ...apl, medidorId: r.data!.id }); setNovoMedidor("");
  }
  async function salvarApl() {
    if (!apl) return;
    setErroApl("");
    const r = apl.paId ? await api(`/api/pcm/planos-cadastro/${id}/ativos`, "PATCH", apl) : await api(`/api/pcm/planos-cadastro/${id}/ativos`, "POST", apl);
    if (!r.ok) { setErroApl(r.error!); return; }
    setApl(null); load();
  }
  async function alternarApl(a: Aplicacao) { await api(`/api/pcm/planos-cadastro/${id}/ativos`, "PATCH", { paId: a.id, ativo: !a.ativo }); load(); }
  async function removerApl(a: Aplicacao) { await api(`/api/pcm/planos-cadastro/${id}/ativos?paId=${a.id}`, "DELETE"); load(); }

  if (!p) return msg ? <div className="p-8 text-sm text-danger">{msg}</div> : <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <PageHeader title={`${p.codigo} — ${p.nome}`} subtitle={p.ativo ? "Plano ativo" : "Plano inativo (não gera OS)"} breadcrumbs={[{ label: "Manutenção" }, { label: "Planos", href: "/pcm/planos/cadastro" }, { label: p.codigo }]}
        action={<Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar plano"}</Button>} />
      <div className="px-8 pb-10 space-y-4">
        {msg && <p className="text-sm text-danger">{msg}</p>}
        {ok && <p className="text-sm text-success">{ok}</p>}

        <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>Código</Label><Input value={String(cab.codigo ?? "")} onChange={(e) => setCab({ ...cab, codigo: e.target.value })} /></div>
          <div className="md:col-span-3"><Label>Nome</Label><Input value={String(cab.nome ?? "")} onChange={(e) => setCab({ ...cab, nome: e.target.value })} /></div>
          <div><Label>Tipo</Label><SelectMenu value={String(cab.tipoId ?? "")} onChange={(v) => setCab({ ...cab, tipoId: v })} options={lk.tipos.map((t) => ({ value: t.id, label: `${t.sigla} — ${t.nome}` }))} /></div>
          <div><Label>Equipe</Label><SelectMenu value={String(cab.equipeId ?? "")} onChange={(v) => setCab({ ...cab, equipeId: v })} options={[{ value: "", label: "—" }, ...lk.equipes.map((e) => ({ value: e.id, label: e.nome }))]} /></div>
          <div><Label>Horas estimadas</Label><Input inputMode="decimal" value={String(cab.horasEstimadas ?? "")} onChange={(e) => setCab({ ...cab, horasEstimadas: e.target.value })} /></div>
          <div><Label>Gerar OS com antecedência (dias)</Label><Input inputMode="numeric" value={String(cab.antecedenciaDias ?? "")} onChange={(e) => setCab({ ...cab, antecedenciaDias: e.target.value })} /></div>
          <div><Label>Tolerância p/ aderência (%)</Label><Input inputMode="numeric" value={String(cab.toleranciaPct ?? "")} onChange={(e) => setCab({ ...cab, toleranciaPct: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm md:col-span-3 pt-5"><input type="checkbox" className="rounded" checked={!!cab.baseNaConclusao} onChange={(e) => setCab({ ...cab, baseNaConclusao: e.target.checked })} /> Próximo vencimento conta da execução real (desmarcado: da data teórica)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={!!cab.exigeParada} onChange={(e) => setCab({ ...cab, exigeParada: e.target.checked })} /> Exige parar o ativo</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="rounded" checked={!!cab.ativo} onChange={(e) => setCab({ ...cab, ativo: e.target.checked })} /> Plano ativo</label>
          <div className="md:col-span-4"><Label>Observações</Label><Textarea rows={2} value={String(cab.observacoes ?? "")} onChange={(e) => setCab({ ...cab, observacoes: e.target.value })} /></div>
        </div>

        {/* Ativos */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Ativos e gatilho</h3><Button size="sm" variant="outline" className="gap-1" onClick={() => abrirApl()}><Plus className="w-3.5 h-3.5" /> Aplicar a um ativo</Button></div>
          {p.ativos.length === 0 ? <p className="text-xs text-warning">Sem ativo aplicado — o plano não gera OS.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Ativo</th><th className="text-left py-1">Gatilho</th><th className="text-left py-1">Última</th><th className="text-left py-1">Próxima</th><th /></tr></thead>
              <tbody>{p.ativos.map((a) => (
                <tr key={a.id} className={cn("border-t border-border/60", !a.ativo && "opacity-50")}>
                  <td className="py-1.5">{a.ativoRef.tag} — {a.ativoRef.nome}</td>
                  <td className="py-1.5 text-xs">{a.gatilho === "CALENDARIO" ? `a cada ${a.intervaloDias} dias` : `a cada ${Number(a.intervaloMedida)} ${a.medidor?.unidade ?? ""} (${a.medidor?.nome ?? "sem medidor"})`}</td>
                  <td className="py-1.5 text-xs">{fmtData(a.ultimaExecucao)}{a.ultimaMedida ? ` · ${Number(a.ultimaMedida)}` : ""}</td>
                  <td className="py-1.5 text-xs">{a.gatilho === "CALENDARIO" ? fmtData(a.proximoVencimento) : `${a.proximaMedida ? Number(a.proximaMedida) : "—"} (atual ${a.medidor ? Number(a.medidor.acumulado) : "—"})`}</td>
                  <td className="py-1.5 text-right whitespace-nowrap text-xs">
                    <button className="text-info hover:underline" onClick={() => abrirApl(a)}>editar</button>
                    <button className="ml-3 text-muted-foreground hover:underline" onClick={() => alternarApl(a)}>{a.ativo ? "pausar" : "reativar"}</button>
                    <button className="ml-3 text-muted-foreground hover:text-danger" onClick={() => removerApl(a)}><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {/* Checklist */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Checklist ({tarefas.length})</h3><Button size="sm" variant="outline" className="gap-1" onClick={() => setTarefas([...tarefas, { descricao: "", tipoResposta: "OK_NOK", faixaMin: "", faixaMax: "", servicoId: "", ativoId: "" }])}><Plus className="w-3.5 h-3.5" /> Item</Button></div>
          <div className="space-y-1.5">
            {tarefas.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}</span>
                <Input className={cn("flex-1 min-w-[16rem] h-8 text-sm", t.tipoResposta === "NENHUMA" && "font-semibold")} value={t.descricao} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, descricao: e.target.value }; setTarefas(n); }} placeholder="Verificar / trocar / medir…" />
                <SelectMenu value={t.tipoResposta} onChange={(v) => { const n = [...tarefas]; n[i] = { ...t, tipoResposta: v }; setTarefas(n); }} options={RESPOSTAS} triggerClassName="h-8 text-xs w-40" />
                {t.tipoResposta === "NUMERO" && <>
                  <Input className="h-8 w-20 text-xs" placeholder="mín" value={t.faixaMin} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, faixaMin: e.target.value }; setTarefas(n); }} />
                  <Input className="h-8 w-20 text-xs" placeholder="máx" value={t.faixaMax} onChange={(e) => { const n = [...tarefas]; n[i] = { ...t, faixaMax: e.target.value }; setTarefas(n); }} />
                </>}
                <button onClick={() => mover(i, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => mover(i, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setTarefas(tarefas.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {tarefas.length === 0 && <p className="text-xs text-muted-foreground">Sem checklist — a OS gerada vem só com a descrição do plano.</p>}
          </div>
        </div>

        {/* Kit */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">Kit de materiais previstos ({mats.length})</h3></div>
          <div className="space-y-1.5">
            {mats.map((m, i) => (
              <div key={m.itemId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{m.rotulo}</span>
                <Input className="h-8 w-24 text-xs" inputMode="decimal" value={m.quantidade} onChange={(e) => { const n = [...mats]; n[i] = { ...m, quantidade: e.target.value }; setMats(n); }} />
                <button onClick={() => setMats(mats.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="w-full max-w-md"><ComboboxWithCreate value="" onChange={(v) => { const it = itens.find((x) => x.id === v); if (it && !mats.some((m) => m.itemId === v)) setMats([...mats, { itemId: v, quantidade: "1", rotulo: `${it.codigo} — ${it.descricao}` }]); }} options={itens.map((x) => ({ value: x.id, label: `${x.codigo} — ${x.descricao}` }))} placeholder="Adicionar produto ao kit…" /></div>
            <p className="text-[11px] text-muted-foreground">O kit aparece na OS como “previsto”; a baixa real é pela requisição vinculada à OS.</p>
          </div>
        </div>

        {/* Histórico */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Últimas OS do plano</h3>
          {p.ordens.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma OS gerada ainda.</p> : (
            <div className="flex flex-wrap gap-2">{p.ordens.map((o) => <Link key={o.id} href={`/pcm/os/${o.id}`} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted inline-flex items-center gap-1.5">{o.numero} {o.ativo?.tag ?? ""} {fmtData(o.programadaPara ?? o.createdAt)} <StatusOSBadge s={o.status} /></Link>)}</div>
          )}
        </div>
      </div>

      <Dialog open={!!apl} onOpenChange={(v) => !v && setApl(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{apl?.paId ? "Editar aplicação" : "Aplicar plano a um ativo"}</DialogTitle></DialogHeader>
          {apl && <div className="space-y-3">
            <div><Label>Ativo</Label><AtivoCombobox ativos={lk.ativos} value={apl.ativoId} disabled={!!apl.paId} onChange={(v) => { setApl({ ...apl, ativoId: v, medidorId: "" }); carregarMedidores(v); }} /></div>
            <div><Label>Gatilho</Label><SelectMenu value={apl.gatilho} onChange={(v) => setApl({ ...apl, gatilho: v })} options={[{ value: "CALENDARIO", label: "Calendário (a cada N dias)" }, { value: "MEDIDOR", label: "Medidor (horímetro, km…)" }]} /></div>
            {apl.gatilho === "CALENDARIO" ? (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>A cada (dias)</Label><Input inputMode="numeric" value={apl.intervaloDias} onChange={(e) => setApl({ ...apl, intervaloDias: e.target.value })} /></div>
                <div><Label>Última execução</Label><DatePicker value={apl.ultimaExecucao} onChange={(v) => setApl({ ...apl, ultimaExecucao: v })} allowClear /></div>
              </div>
            ) : (<>
              <div><Label>Medidor</Label>
                <SelectMenu value={apl.medidorId} onChange={(v) => setApl({ ...apl, medidorId: v })} placeholder={medidoresDoAtivo.length ? "Escolha…" : "Ativo sem medidor"} options={medidoresDoAtivo.map((m) => ({ value: m.id, label: `${m.nome} (atual ${Number(m.acumulado)} ${m.unidade})` }))} />
                {apl.ativoId && <div className="flex gap-2 mt-2"><Input className="h-8 text-xs" placeholder="Nome do novo medidor (ex.: Horímetro)" value={novoMedidor} onChange={(e) => setNovoMedidor(e.target.value)} /><Button size="sm" variant="outline" onClick={criarMedidor}>Criar medidor</Button></div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>A cada</Label><Input inputMode="decimal" value={apl.intervaloMedida} onChange={(e) => setApl({ ...apl, intervaloMedida: e.target.value })} placeholder="250" /></div>
                <div><Label>Leitura na última execução</Label><Input inputMode="decimal" value={apl.ultimaMedida} onChange={(e) => setApl({ ...apl, ultimaMedida: e.target.value })} placeholder="0" /></div>
              </div>
            </>)}
            {erroApl && <p className="text-sm text-danger">{erroApl}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setApl(null)}>Cancelar</Button><Button onClick={salvarApl}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
