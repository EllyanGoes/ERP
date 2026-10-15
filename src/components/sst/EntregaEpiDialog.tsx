"use client";

// Nova entrega de EPI em dois modos:
//  • Para um colaborador — vários EPIs de uma vez, vira FICHA (termo p/ assinar,
//    depois o escaneado é anexado e arquivado no GED).
//  • Em lote — um EPI para vários colaboradores (campanha de troca).
// Regra de prazo: EPI retirado antes do fim da vida útil exige motivo; a tela
// avisa antes e o servidor confere de novo (422 precisaMotivo).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SelectMenu from "@/components/shared/SelectMenu";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Printer, User, Users } from "lucide-react";
import { fmtData, hojeISO, UploadAnexo, TIPO_ENTREGA, type Lookups } from "@/components/sst/comum";

export type EpiOpt = {
  id: string; nome: string; ca: string | null; vidaUtilDias: number | null; itemId: string | null; ativo: boolean;
  /** Tamanhos (um item de estoque cada). Com 2+ a entrega exige escolher o tamanho. */
  itens?: { itemId: string; tamanho: string | null; saldo?: number }[];
};
const temEstoque = (e: EpiOpt) => !!e.itemId || (e.itens?.length ?? 0) > 0;
const grade = (e?: EpiOpt | null) => (e?.itens ?? []).filter((i) => i.tamanho);
// Botão mostra só o tamanho; a lista mostra também o saldo de cada um.
const opcoesTamanho = (e: EpiOpt) => grade(e).map((i) => ({
  value: i.tamanho!, label: i.tamanho!,
  render: () => <span>{i.tamanho}{i.saldo !== undefined && <span className={cn("ml-1.5 text-xs", i.saldo <= 0 ? "text-danger" : "text-muted-foreground")}>{i.saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} em estoque</span>}</span>,
}));
export type ColabOpt = { id: string; nome: string; ativo: boolean; funcao: { nome: string } | null };
type FichaCriada = { id: string; numero: number; colaborador: { id: string; nome: string }; itens: { id: string }[] };

type Linha = { sel: boolean; qtd: string; tipo: string; motivo: string; local: string; tamanho: string };
type DetalheColab = {
  episStatus: { epi: { id: string }; obrigatorio: boolean; quantidade: number; entregaVigente: { data: string; vencimentoUso: string | null } | null }[];
  sstEpiEntregas: { epiId: string; tipo: string; data: string; vencimentoUso: string | null; tamanho?: string | null }[];
};

export default function EntregaEpiDialog({ open, onOpenChange, epis, colabs, lk, colaboradorFixo, epiInicialId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; epis: EpiOpt[]; colabs: ColabOpt[]; lk: Lookups;
  /** Aberto a partir da ficha do colaborador: trava o colaborador e esconde o modo lote. */
  colaboradorFixo?: { id: string; nome: string } | null;
  /** EPI já marcado ao abrir (botão "Entregar/Trocar" da ficha do colaborador). */
  epiInicialId?: string | null;
  onSaved: () => void;
}) {
  const [modo, setModo] = useState<"colaborador" | "lote">("colaborador");
  const [data, setData] = useState(hojeISO());
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const episAtivos = useMemo(() => epis.filter((e) => e.ativo), [epis]);

  // ── modo colaborador ──
  const [colabId, setColabId] = useState("");
  const [detalhe, setDetalhe] = useState<DetalheColab | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [localPadrao, setLocalPadrao] = useState("");
  const [obs, setObs] = useState("");
  const [ficha, setFicha] = useState<FichaCriada | null>(null);
  const [docAssinado, setDocAssinado] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErro(""); setFicha(null); setDocAssinado(null); setObs(""); setData(hojeISO());
    setColabId(colaboradorFixo?.id ?? ""); setDetalhe(null); setLinhas({});
    setLEpiId(""); setLSel({}); setLMotivo(""); setLPrecisa([]); setLTam({});
    if (colaboradorFixo) setModo("colaborador");
  }, [open, colaboradorFixo]);

  useEffect(() => {
    if (!colabId) { setDetalhe(null); setLinhas({}); return; }
    fetch(`/api/sst/colaboradores/${colabId}`).then((r) => r.json()).then((j) => {
      const d: DetalheColab | null = j.data ?? null;
      setDetalhe(d);
      // Pré-marca o que a função exige e ainda não foi entregue (ou venceu).
      const ini: Record<string, Linha> = {};
      for (const e of episAtivos) {
        const req = d?.episStatus.find((s) => s.epi.id === e.id);
        const vig = vigente(d, e.id);
        const vencido = vig?.vencimentoUso ? new Date(vig.vencimentoUso).getTime() < Date.now() : false;
        // Tamanho: o da última entrega desse EPI p/ o colaborador (se ainda existir na grade).
        const ultTam = d?.sstEpiEntregas.filter((x) => x.epiId === e.id && x.tamanho).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]?.tamanho ?? "";
        const tamanho = grade(e).some((i) => i.tamanho === ultTam) ? ultTam : grade(e).length === 1 ? grade(e)[0].tamanho! : "";
        ini[e.id] = { sel: (!!req && (!vig || vencido)) || e.id === epiInicialId, qtd: String(req?.quantidade ?? 1), tipo: vig ? "TROCA" : "ENTREGA", motivo: "", local: "", tamanho };
      }
      setLinhas(ini);
    }).catch(() => {});
  }, [colabId, episAtivos, epiInicialId]);

  function vigente(d: DetalheColab | null, epiId: string) {
    const ult = d?.sstEpiEntregas.filter((x) => x.epiId === epiId).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
    if (!ult || ult.tipo === "DEVOLUCAO") return null;
    return ult;
  }
  /** Retirada antes do fim da vida útil → motivo obrigatório. */
  function antecipada(epiId: string) {
    const v = vigente(detalhe, epiId);
    if (!v?.vencimentoUso) return null;
    return new Date(v.vencimentoUso).getTime() > new Date(`${data}T12:00:00`).getTime() ? v.vencimentoUso : null;
  }
  const setLinha = (id: string, p: Partial<Linha>) => setLinhas((l) => ({ ...l, [id]: { ...l[id], ...p } }));
  const selecionadas = Object.entries(linhas).filter(([, l]) => l.sel);

  // Ordem: exigidos pela função primeiro, depois os demais.
  const episOrdenados = useMemo(() => {
    const req = new Set(detalhe?.episStatus.map((s) => s.epi.id) ?? []);
    return [...episAtivos].sort((a, b) => Number(req.has(b.id)) - Number(req.has(a.id)) || a.nome.localeCompare(b.nome));
  }, [episAtivos, detalhe]);

  async function salvarFicha() {
    if (!colabId) { setErro("Escolha o colaborador."); return; }
    if (selecionadas.length === 0) { setErro("Selecione ao menos um EPI."); return; }
    const semMotivo = selecionadas.filter(([id, l]) => l.tipo !== "DEVOLUCAO" && antecipada(id) && !l.motivo.trim());
    if (semMotivo.length > 0) { setErro("Há EPI retirado antes do prazo: informe o motivo nas linhas destacadas."); return; }
    const semTamanho = selecionadas.filter(([id, l]) => l.tipo !== "DEVOLUCAO" && grade(episAtivos.find((e) => e.id === id)).length > 1 && !l.tamanho);
    if (semTamanho.length > 0) { setErro("Escolha o tamanho dos EPIs destacados."); return; }
    setSaving(true); setErro("");
    const itens = selecionadas.map(([epiId, l]) => {
      const epi = episAtivos.find((e) => e.id === epiId)!;
      return { epiId, quantidade: Number(l.qtd) || 1, tipo: l.tipo, motivo: l.motivo || null, tamanho: l.tamanho || null, localEstoqueId: temEstoque(epi) ? (l.local || localPadrao || null) : null };
    });
    const res = await fetch("/api/sst/entregas/fichas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorId: colabId, data, observacoes: obs || null, itens }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro ao registrar"); return; }
    setFicha(j.data); onSaved();
  }
  async function anexarAssinado(documentoId: string | null) {
    setDocAssinado(documentoId);
    if (!ficha) return;
    await fetch(`/api/sst/entregas/fichas/${ficha.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoId }) });
    onSaved();
  }

  // ── modo lote ──
  const [lEpiId, setLEpiId] = useState("");
  const [lSel, setLSel] = useState<Record<string, boolean>>({});
  const [lLocal, setLLocal] = useState("");
  const [lTipo, setLTipo] = useState("ENTREGA");
  const [lBusca, setLBusca] = useState("");
  const [lMotivo, setLMotivo] = useState("");
  const [lPrecisa, setLPrecisa] = useState<{ colaboradorId: string; ate: string }[]>([]);
  const [lTam, setLTam] = useState<Record<string, string>>({});
  const epiLote = epis.find((e) => e.id === lEpiId);
  const loteComTamanho = grade(epiLote).length > 0;
  async function salvarLote() {
    const ids = Object.entries(lSel).filter(([, v]) => v).map(([k]) => k);
    if (!lEpiId || ids.length === 0) { setErro("Escolha o EPI e ao menos um colaborador."); return; }
    if (grade(epiLote).length > 1 && ids.some((id) => !lTam[id])) { setErro("Escolha o tamanho de cada colaborador selecionado."); return; }
    setSaving(true); setErro("");
    const tamanhos = Object.fromEntries(ids.map((id) => [id, lTam[id] || null]));
    const res = await fetch("/api/sst/entregas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colaboradorIds: ids, epiId: lEpiId, tipo: lTipo, quantidade: 1, data, localEstoqueId: lLocal || null, motivo: lMotivo || null, tamanhos }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 422 && j.precisaMotivo) { setLPrecisa(j.precisaMotivo); setErro("Alguns colaboradores ainda estão dentro do prazo deste EPI — informe o motivo da troca antecipada."); return; }
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    onSaved(); onOpenChange(false);
  }

  const nomeColab = colaboradorFixo?.nome ?? colabs.find((c) => c.id === colabId)?.nome ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ficha ? `Ficha de EPI nº ${String(ficha.numero).padStart(4, "0")}` : "Nova entrega de EPI"}</DialogTitle></DialogHeader>

        {ficha ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Entrega registrada para {ficha.colaborador.nome} — {ficha.itens.length} item(ns).</p>
                <p className="text-muted-foreground mt-0.5">Imprima o termo, colha a assinatura e anexe o escaneado aqui (ou depois, na aba Fichas). Sem o termo assinado a ficha fica como pendente.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">1. Imprimir e assinar</p>
                <Link href={`/sst/epis/fichas/${ficha.id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm text-info hover:underline"><Printer className="w-4 h-4" /> Abrir termo para impressão</Link>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">2. Arquivar o termo assinado</p>
                <UploadAnexo tipo="termo-epi" titulo={`Ficha de EPI nº ${String(ficha.numero).padStart(4, "0")} — ${ficha.colaborador.nome}`} colaboradorId={ficha.colaborador.id} value={docAssinado} onChange={anexarAssinado} label="Enviar termo assinado (PDF/foto)" />
              </div>
            </div>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Concluir</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {!colaboradorFixo && (
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 text-sm">
                <button type="button" onClick={() => { setModo("colaborador"); setErro(""); }} className={cn("px-3 py-1.5 rounded-md inline-flex items-center gap-1.5", modo === "colaborador" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}><User className="w-4 h-4" /> Para um colaborador</button>
                <button type="button" onClick={() => { setModo("lote"); setErro(""); }} className={cn("px-3 py-1.5 rounded-md inline-flex items-center gap-1.5", modo === "lote" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground")}><Users className="w-4 h-4" /> Em lote (um EPI, vários)</button>
              </div>
            )}

            {modo === "colaborador" ? (
              <>
                <div className="grid grid-cols-[1fr_170px] gap-3">
                  <div><Label>Colaborador</Label>
                    {colaboradorFixo ? <Input value={colaboradorFixo.nome} disabled /> :
                      <ComboboxWithCreate value={colabId} onChange={setColabId} allowNone={false} placeholder="Buscar colaborador…" menuMinWidth={360} options={colabs.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome, code: c.funcao?.nome ?? undefined }))} />}
                  </div>
                  <div><Label>Data da entrega</Label><DatePicker value={data} onChange={setData} /></div>
                </div>

                {colabId && (
                  <div className="rounded-lg border border-border">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-t-lg text-xs text-muted-foreground">
                      <span><b className="text-foreground">{selecionadas.length}</b> EPI(s) selecionado(s) · os exigidos pela função aparecem primeiro</span>
                      {episAtivos.some(temEstoque) && (
                        <span className="inline-flex items-center gap-2">Baixar do estoque:
                          <SelectMenu value={localPadrao} onChange={setLocalPadrao} triggerClassName="h-7 text-xs" options={[{ value: "", label: "— Não baixar —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} />
                        </span>
                      )}
                    </div>
                    <div className="max-h-[46vh] overflow-y-auto divide-y divide-border/60">
                      {episOrdenados.map((e) => {
                        const l = linhas[e.id]; if (!l) return null;
                        const req = detalhe?.episStatus.find((s) => s.epi.id === e.id);
                        const vig = vigente(detalhe, e.id);
                        const ate = l.sel && l.tipo !== "DEVOLUCAO" ? antecipada(e.id) : null;
                        const vencido = vig?.vencimentoUso ? new Date(vig.vencimentoUso).getTime() < Date.now() : false;
                        return (
                          <div key={e.id} className={cn("px-3 py-2", l.sel && "bg-info/5", ((ate && !l.motivo.trim()) || (l.sel && l.tipo !== "DEVOLUCAO" && grade(e).length > 1 && !l.tamanho)) && "bg-warning/5")}>
                            <div className="flex items-center gap-3">
                              <input type="checkbox" className="rounded" checked={l.sel} onChange={(ev) => setLinha(e.id, { sel: ev.target.checked })} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{e.nome}{e.ca ? <span className="text-xs text-muted-foreground"> · CA {e.ca}</span> : null}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {req ? <span className="text-info font-medium">exigido pela função{!req.obrigatorio && " (opcional)"}</span> : "não exigido pela função"}
                                  {" · "}
                                  {!vig ? "nunca entregue" : vencido ? <span className="text-danger">vencido em {fmtData(vig.vencimentoUso)}</span> : vig.vencimentoUso ? `em uso até ${fmtData(vig.vencimentoUso)}` : `entregue em ${fmtData(vig.data)}`}
                                  {e.vidaUtilDias ? ` · vida útil ${e.vidaUtilDias} d` : " · sem prazo definido"}
                                </p>
                              </div>
                              {l.sel && (
                                <>
                                  <SelectMenu value={l.tipo} onChange={(v) => setLinha(e.id, { tipo: v })} triggerClassName="h-8 w-[120px] text-xs" options={Object.entries(TIPO_ENTREGA).map(([value, label]) => ({ value, label }))} />
                                  {grade(e).length > 0 && <SelectMenu value={l.tamanho} onChange={(v) => setLinha(e.id, { tamanho: v })} placeholder="Tamanho" title="Tamanho" triggerClassName={cn("h-8 w-[92px] text-xs", !l.tamanho && l.tipo !== "DEVOLUCAO" && grade(e).length > 1 && "border-warning")} options={opcoesTamanho(e)} />}
                                  <Input type="number" min={1} value={l.qtd} onChange={(ev) => setLinha(e.id, { qtd: ev.target.value })} className="h-8 w-16 text-xs text-center" title="Quantidade" />
                                  {temEstoque(e) && l.tipo !== "DEVOLUCAO" && <SelectMenu value={l.local} onChange={(v) => setLinha(e.id, { local: v })} triggerClassName="h-8 w-[150px] text-xs" options={[{ value: "", label: localPadrao ? "local padrão" : "— sem baixa —" }, ...lk.locais.map((x) => ({ value: x.id, label: x.nome }))]} />}
                                </>
                              )}
                            </div>
                            {ate && (
                              <div className="mt-1.5 ml-7 flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                                <span className="text-xs text-warning whitespace-nowrap">Antes do prazo (até {fmtData(ate)}) — motivo obrigatório:</span>
                                <Input value={l.motivo} onChange={(ev) => setLinha(e.id, { motivo: ev.target.value })} placeholder="Ex.: dano, perda, extravio, troca por defeito…" className={cn("h-7 text-xs", !l.motivo.trim() && "border-warning")} />
                              </div>
                            )}
                            {l.sel && !ate && (
                              <div className="mt-1 ml-7"><Input value={l.motivo} onChange={(ev) => setLinha(e.id, { motivo: ev.target.value })} placeholder="Observação (opcional)" className="h-7 text-xs" /></div>
                            )}
                          </div>
                        );
                      })}
                      {episAtivos.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum EPI ativo cadastrado.</p>}
                    </div>
                  </div>
                )}
                <div><Label>Observações da ficha</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional — aparece no termo impresso" /></div>
                {erro && <p className="text-sm text-danger">{erro}</p>}
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvarFicha} disabled={saving || !colabId}>{saving ? "Registrando…" : `Registrar e gerar termo${nomeColab ? ` — ${nomeColab.split(" ")[0]}` : ""}`}</Button></DialogFooter>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label>EPI</Label><SelectMenu value={lEpiId} onChange={setLEpiId} placeholder="Selecionar…" options={episAtivos.map((e) => ({ value: e.id, label: e.ca ? `${e.nome} · CA ${e.ca}` : e.nome }))} /></div>
                  <div><Label>Data</Label><DatePicker value={data} onChange={setData} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label><SelectMenu value={lTipo} onChange={setLTipo} options={Object.entries(TIPO_ENTREGA).filter(([k]) => k !== "DEVOLUCAO").map(([value, label]) => ({ value, label }))} /></div>
                  {epiLote && temEstoque(epiLote) && <div><Label>Baixar do estoque (local)</Label><SelectMenu value={lLocal} onChange={setLLocal} options={[{ value: "", label: "— Não baixar —" }, ...lk.locais.map((l) => ({ value: l.id, label: l.nome }))]} /></div>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1"><Label>Colaboradores ({Object.values(lSel).filter(Boolean).length} selecionados)</Label>
                    <div className="flex items-center gap-2">
                      <button type="button" className="text-xs text-info hover:underline" onClick={() => setLSel(Object.fromEntries(colabs.filter((c) => c.ativo).map((c) => [c.id, true])))}>todos</button>
                      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setLSel({})}>nenhum</button>
                      {loteComTamanho && epiLote && <SelectMenu value="" onChange={(v) => setLTam(Object.fromEntries(Object.entries(lSel).filter(([, x]) => x).map(([k]) => [k, v])))} placeholder="tamanho p/ todos" triggerClassName="h-7 text-xs w-[140px]" options={opcoesTamanho(epiLote)} />}
                      <input value={lBusca} onChange={(e) => setLBusca(e.target.value)} placeholder="filtrar…" className="text-xs border border-border rounded px-2 py-1 bg-card" />
                    </div></div>
                  <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border/60">
                    {colabs.filter((c) => c.ativo && (!lBusca || c.nome.toLowerCase().includes(lBusca.toLowerCase()))).map((c) => {
                      const p = lPrecisa.find((x) => x.colaboradorId === c.id);
                      return (
                        <label key={c.id} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40", p && "bg-warning/5")}>
                          <input type="checkbox" className="rounded" checked={!!lSel[c.id]} onChange={(e) => setLSel({ ...lSel, [c.id]: e.target.checked })} />
                          <span className="flex-1 text-foreground">{c.nome}</span>
                          {p && <span className="text-[11px] text-warning">dentro do prazo até {fmtData(p.ate)}</span>}
                          {loteComTamanho && epiLote && lSel[c.id] && <span onClick={(ev) => ev.preventDefault()}><SelectMenu value={lTam[c.id] ?? ""} onChange={(v) => setLTam((t) => ({ ...t, [c.id]: v }))} placeholder="Tam." triggerClassName={cn("h-7 text-xs w-[80px]", !lTam[c.id] && grade(epiLote).length > 1 && "border-warning")} options={opcoesTamanho(epiLote)} /></span>}
                          <span className="text-xs text-muted-foreground">{c.funcao?.nome ?? "sem função"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {lPrecisa.length > 0 && <div><Label className="text-warning">Motivo da troca antecipada</Label><Input value={lMotivo} onChange={(e) => setLMotivo(e.target.value)} placeholder="Ex.: campanha de troca, lote com defeito…" className="border-warning" /></div>}
                <p className="text-xs text-muted-foreground">Entrega em lote não gera ficha individual — o termo assinado pode ser anexado depois, na ficha de cada colaborador.</p>
                {erro && <p className="text-sm text-danger">{erro}</p>}
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvarLote} disabled={saving}>{saving ? "Registrando…" : "Registrar entregas"}</Button></DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
