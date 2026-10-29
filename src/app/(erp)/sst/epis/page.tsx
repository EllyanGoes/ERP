"use client";

// Cadastro de EPIs (CA, validade, vida útil, descartável, tamanhos ↔ itens de
// estoque) + entregas e fichas (termo avulso ou ficha de histórico aberta/fechada).
import { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DatePicker from "@/components/shared/DatePicker";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTabTitle } from "@/lib/tabs-context";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Loader2, Plus, Pencil, Trash2, HardHat, Printer, Paperclip, Power, X, Lock, LockOpen } from "lucide-react";
import { fmtData, useLookups, UploadAnexo, DocLink, AcoesLinha } from "@/components/sst/comum";
import EntregaEpiDialog from "@/components/sst/EntregaEpiDialog";
import CautelaEpiDialog from "@/components/sst/CautelaEpiDialog";

type ItemRef = { id: string; codigo: string; descricao: string; unidadeMedida: string };
type Epi = {
  id: string; nome: string; ca: string | null; caValidade: string | null; vidaUtilDias: number | null; fabricante: string | null; itemId: string | null; ativo: boolean; descartavel: boolean;
  item: ItemRef | null; itens: { itemId: string; tamanho: string | null; saldo: number; item: ItemRef }[]; saldoEstoque: number | null; _count: { entregas: number; requisitos: number };
};
type LinhaTamanho = { key: number; tamanho: string; itemId: string };
/** Falta arquivar o papel — a ficha de histórico aberta ainda está em uso, não conta. */
const semPapel = (f: FichaRow) => !f.documentoId && !(f.historico && !f.fechadaEm);
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
type Colab = { id: string; nome: string; ativo: boolean; funcao: { nome: string } | null };
type FichaRow = { id: string; numero: number; data: string; documentoId: string | null; assinadaEm: string | null; historico: boolean; fechadaEm: string | null; colaborador: { id: string; nome: string }; itens: { id: string; quantidade: number; epi: { nome: string } }[] };

export default function SstEpisPage() {
  useTabTitle("SST — EPIs");
  const [epis, setEpis] = useState<Epi[]>([]);
  const [loading, setLoading] = useState(true);
  const lk = useLookups();
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [fichas, setFichas] = useState<FichaRow[]>([]);
  const [aba, setAba] = useState<"epis" | "fichas">("epis");
  // ?aba=fichas (link das pendências) — lido após a hidratação p/ não divergir do SSR.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("aba") === "fichas") setAba("fichas"); }, []);
  const [soPendentes, setSoPendentes] = useState(false);
  async function load() {
    const [j, jf] = await Promise.all([fetch("/api/sst/epis").then((r) => r.json()), fetch("/api/sst/entregas/fichas").then((r) => r.json())]);
    setEpis(j.data ?? []); setFichas(jf.data ?? []); setLoading(false);
  }
  useEffect(() => { load(); fetch("/api/sst/colaboradores").then((r) => r.json()).then((j) => setColabs(j.data ?? [])); }, []);
  const [anexarFicha, setAnexarFicha] = useState<FichaRow | null>(null);
  const [delFicha, setDelFicha] = useState<FichaRow | null>(null);
  async function patchFicha(f: FichaRow, body: Record<string, unknown>) {
    const res = await fetch(`/api/sst/entregas/fichas/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) alert(j.error || "Erro");
    load();
  }
  async function anexarAssinada(documentoId: string | null) {
    if (!anexarFicha) return;
    await fetch(`/api/sst/entregas/fichas/${anexarFicha.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoId }) });
    setAnexarFicha(null); load();
  }
  async function excluirFicha() { if (!delFicha) return; setSaving(true); await fetch(`/api/sst/entregas/fichas/${delFicha.id}`, { method: "DELETE" }); setSaving(false); setDelFicha(null); load(); }

  // form
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState(""); const [ca, setCa] = useState(""); const [caValidade, setCaValidade] = useState(""); const [vida, setVida] = useState(""); const [fab, setFab] = useState(""); const [descartavel, setDescartavel] = useState(false);
  const [tamanhos, setTamanhos] = useState<LinhaTamanho[]>([]);
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState("");
  function abrir(e?: Epi) {
    setEditId(e?.id ?? null); setNome(e?.nome ?? ""); setCa(e?.ca ?? ""); setCaValidade(e?.caValidade ? e.caValidade.slice(0, 10) : ""); setVida(e?.vidaUtilDias ? String(e.vidaUtilDias) : ""); setFab(e?.fabricante ?? ""); setDescartavel(!!e?.descartavel);
    const base = e?.itens.length ? e.itens.map((i, k) => ({ key: k, tamanho: i.tamanho ?? "", itemId: i.itemId })) : [{ key: 0, tamanho: "", itemId: "" }];
    setTamanhos(base); setErro(""); setOpen(true);
  }
  async function salvar() {
    if (!nome.trim()) { setErro("Informe o nome."); return; }
    const preenchidas = tamanhos.filter((t) => t.itemId);
    if (preenchidas.length > 1 && preenchidas.some((t) => !t.tamanho.trim())) { setErro("Com mais de um item, informe o tamanho de cada um."); return; }
    setSaving(true); setErro("");
    const res = await fetch(editId ? `/api/sst/epis/${editId}` : "/api/sst/epis", { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, ca: ca || null, caValidade: caValidade || null, vidaUtilDias: vida || null, fabricante: fab || null, descartavel, itens: tamanhos.filter((t) => t.itemId).map((t) => ({ itemId: t.itemId, tamanho: t.tamanho || null })) }) });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErro(j.error || "Erro"); return; }
    setOpen(false); load();
  }
  const [del, setDel] = useState<Epi | null>(null);
  async function excluir() { if (!del) return; setSaving(true); const res = await fetch(`/api/sst/epis/${del.id}`, { method: "DELETE" }); const j = await res.json().catch(() => ({})); setSaving(false); if (!res.ok) { alert(j.error || "Erro"); } setDel(null); load(); }
  async function alternarAtivo(e: Epi) { await fetch(`/api/sst/epis/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !e.ativo }) }); load(); }

  const [entrega, setEntrega] = useState(false);
  const [cautela, setCautela] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="EPIs e entregas" subtitle="Equipamentos de proteção individual (NR-06)" breadcrumbs={[{ label: "SST", href: "/sst" }, { label: "EPIs" }]}
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => setEntrega(true)} className="gap-1.5"><HardHat className="w-4 h-4" /> Nova entrega</Button><Button onClick={() => abrir()} className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" /> Novo EPI</Button></div>} />
      <div className="px-8 pb-8">
        <div className="flex items-center gap-1 mb-4 border-b border-border">
          {([["epis", "Cadastro de EPIs"], ["fichas", `Fichas de entrega${fichas.filter(semPapel).length ? ` · ${fichas.filter(semPapel).length} sem papel assinado` : ""}`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)} className={cn("px-3 py-2 text-sm -mb-px border-b-2", aba === k ? "border-info text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
          {aba === "fichas" && <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"><input type="checkbox" className="rounded" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> só sem papel assinado</label>}
        </div>
        {loading ? <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : aba === "fichas" ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">Ficha</th><th className="text-left px-3 py-2 font-semibold">Data</th><th className="text-left px-3 py-2 font-semibold">Colaborador</th><th className="text-left px-3 py-2 font-semibold">Itens</th><th className="text-left px-3 py-2 font-semibold">Papel assinado</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {fichas.filter((f) => !soPendentes || semPapel(f)).map((f) => (
                  <tr key={f.id} className="border-t border-border/60">
                    <td className="px-4 py-2 tabular-nums text-foreground whitespace-nowrap">nº {String(f.numero).padStart(4, "0")}<span className="block text-[11px] text-muted-foreground">{f.historico ? "histórico" : "termo avulso"}</span></td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{f.historico ? <>{fmtData(f.data)}<span className="block text-[11px]">{f.fechadaEm ? `até ${fmtData(f.fechadaEm)}` : "em aberto"}</span></> : fmtData(f.data)}</td>
                    <td className="px-3 py-2"><Link href={`/sst/colaboradores/${f.colaborador.id}`} className="text-foreground hover:text-info">{f.colaborador.nome}</Link></td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{f.itens.map((i) => `${i.quantidade}× ${i.epi.nome}`).join(", ")}</td>
                    <td className="px-3 py-2">{f.documentoId ? <span className="inline-flex items-center gap-2 text-xs"><span className="text-success font-medium">arquivado {fmtData(f.assinadaEm)}</span><DocLink id={f.documentoId} label="ver" /></span>
                      : f.historico && !f.fechadaEm ? <span className="text-xs text-info">em uso · {f.itens.length} linha(s)</span>
                      : <span className="text-xs font-medium text-warning">aguardando {f.historico ? "arquivo" : "assinatura"}</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <AcoesLinha acoes={[
                        { label: f.historico ? "Imprimir ficha" : "Imprimir cautela", icon: <Printer className="w-4 h-4 mr-2" />, onClick: () => setCautela(f.id) },
                        ...(f.historico && !f.fechadaEm ? [{ label: "Fechar ficha (papel cheio / fim do mês)", icon: <Lock className="w-4 h-4 mr-2" />, onClick: () => patchFicha(f, { fechar: true }) }] : []),
                        ...(!f.documentoId ? [{ label: f.historico ? (f.fechadaEm ? "Anexar papel assinado" : "Fechar e anexar papel assinado") : "Anexar termo assinado", icon: <Paperclip className="w-4 h-4 mr-2" />, onClick: () => setAnexarFicha(f) }] : []),
                        ...(f.historico && f.fechadaEm ? [{ label: "Reabrir ficha", icon: <LockOpen className="w-4 h-4 mr-2" />, onClick: () => patchFicha(f, { reabrir: true }) }] : []),
                        { label: "Desfazer ficha", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDelFicha(f), danger: true, separadorAntes: true },
                      ]} />
                    </td>
                  </tr>
                ))}
                {fichas.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma ficha de entrega ainda — use &quot;Nova entrega&quot; → &quot;Para um colaborador&quot;.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground"><tr>
                <th className="text-left px-4 py-2 font-semibold">EPI</th><th className="text-left px-3 py-2 font-semibold">CA</th><th className="text-left px-3 py-2 font-semibold">Validade do CA</th><th className="text-right px-3 py-2 font-semibold">Vida útil</th><th className="text-left px-3 py-2 font-semibold">Item de estoque</th><th className="text-right px-3 py-2 font-semibold">Em estoque</th><th className="text-right px-3 py-2 font-semibold">Entregas</th><th className="text-right px-3 py-2 font-semibold">Funções</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {epis.map((e) => {
                  const caVencido = e.caValidade ? new Date(e.caValidade).getTime() < Date.now() : false;
                  return (
                    <tr key={e.id} className={cn("border-t border-border/60", !e.ativo && "opacity-50")}>
                      <td className="px-4 py-2 text-foreground">{e.nome}{e.fabricante ? <span className="text-xs text-muted-foreground"> · {e.fabricante}</span> : null}{e.descartavel && <span className="ml-1.5 text-[10px] px-1 rounded border border-border text-muted-foreground">descartável</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.ca ?? "—"}</td>
                      <td className={cn("px-3 py-2", caVencido ? "text-danger font-medium" : "text-muted-foreground")}>{fmtData(e.caValidade)}{caVencido && " (vencido)"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{e.vidaUtilDias ? `${e.vidaUtilDias} d` : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {e.itens.length === 0 ? "—" : e.itens.length === 1 && !e.itens[0].tamanho ? (
                          <Link href={`/suprimentos/produtos/${e.itens[0].item.id}`} className="hover:text-info hover:underline" title="Abrir cadastro do produto">{e.itens[0].item.codigo} {e.itens[0].item.descricao}</Link>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {e.itens.map((i) => (
                              <Link key={i.itemId} href={`/suprimentos/produtos/${i.item.id}`} title={`${i.item.codigo} ${i.item.descricao} — saldo ${fmtQtd(i.saldo)}`}
                                className={cn("text-[11px] px-1.5 py-0.5 rounded border tabular-nums hover:border-info hover:text-info", i.saldo <= 0 ? "border-danger/30 text-danger bg-danger/5" : "border-border text-foreground")}>
                                {i.tamanho || i.item.codigo} <span className="text-muted-foreground">· {fmtQtd(i.saldo)}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap", e.saldoEstoque == null ? "text-muted-foreground" : e.saldoEstoque <= 0 ? "text-danger font-medium" : "text-foreground")} title={e.saldoEstoque == null ? "Sem item de estoque vinculado" : e.itens.length > 1 ? e.itens.map((i) => `${i.tamanho || i.item.codigo}: ${fmtQtd(i.saldo)}`).join("\n") : "Saldo próprio somado em todos os locais"}>
                        {e.saldoEstoque == null ? "—" : <>{fmtQtd(e.saldoEstoque)} <span className="text-xs text-muted-foreground font-normal">{e.itens[0]?.item.unidadeMedida?.toLowerCase()}</span></>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{e._count.entregas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{e._count.requisitos}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <AcoesLinha acoes={[
                          { label: "Editar", icon: <Pencil className="w-4 h-4 mr-2" />, onClick: () => abrir(e) },
                          { label: e.ativo ? "Inativar" : "Ativar", icon: <Power className="w-4 h-4 mr-2" />, onClick: () => alternarAtivo(e) },
                          { label: "Excluir", icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDel(e), danger: true, separadorAntes: true },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
                {epis.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum EPI cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar EPI" : "Novo EPI"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Protetor auricular tipo plug" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>CA</Label><Input value={ca} onChange={(e) => setCa(e.target.value)} /></div>
              <div><Label>Validade do CA</Label><DatePicker value={caValidade} onChange={setCaValidade} /></div>
              <div><Label>Vida útil (dias)</Label><Input type="number" min={1} value={vida} onChange={(e) => setVida(e.target.value)} placeholder="troca a cada" /></div>
            </div>
            <div><Label>Fabricante</Label><Input value={fab} onChange={(e) => setFab(e.target.value)} /></div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="rounded mt-0.5" checked={descartavel} onChange={(e) => setDescartavel(e.target.checked)} />
              <span><span className="font-medium text-foreground">Descartável / consumo frequente</span>
                <span className="block text-[11px] text-muted-foreground">Máscara, luva, protetor plug… Sem regra de prazo (retirar de novo não pede motivo) e a entrega sempre baixa do estoque.</span></span>
            </label>
            <div>
              <div className="flex items-center justify-between"><Label>Itens do almoxarifado por tamanho (opcional)</Label>
                <button type="button" onClick={() => setTamanhos((l) => [...l, { key: Date.now(), tamanho: "", itemId: "" }])} className="text-xs text-info hover:underline inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Tamanho</button>
              </div>
              <div className="space-y-1.5 mt-1">
                {tamanhos.map((t) => (
                  <div key={t.key} className="flex items-center gap-2">
                    <Input value={t.tamanho} onChange={(ev) => setTamanhos((l) => l.map((x) => x.key === t.key ? { ...x, tamanho: ev.target.value.toUpperCase() } : x))} placeholder={tamanhos.length > 1 ? "Tam." : "Tam. (opc.)"} className="w-24 shrink-0" />
                    <ComboboxWithCreate className="flex-1 min-w-0" value={t.itemId} onChange={(v) => setTamanhos((l) => l.map((x) => x.key === t.key ? { ...x, itemId: v } : x))} allowNone noneLabel="Sem vínculo com estoque" placeholder="Buscar item…" menuMinWidth={420}
                      disabledValues={tamanhos.filter((x) => x.key !== t.key && x.itemId).map((x) => x.itemId)}
                      options={lk.itens.map((i) => ({ value: i.id, label: i.descricao, code: i.codigo, saldo: i.saldo }))} />
                    <button type="button" onClick={() => setTamanhos((l) => l.length > 1 ? l.filter((x) => x.key !== t.key) : [{ key: Date.now(), tamanho: "", itemId: "" }])} className="text-muted-foreground hover:text-danger shrink-0" title="Remover"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Um EPI (um CA) pode ter um item por tamanho — ex.: bota 37…44, camisa P/M/G. Na entrega escolhe-se o tamanho e o sistema baixa o item certo.</p>
            </div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <EntregaEpiDialog open={entrega} onOpenChange={setEntrega} epis={epis} colabs={colabs} lk={lk} onSaved={load} />
      <CautelaEpiDialog fichaId={cautela} onClose={() => setCautela(null)} />

      <Dialog open={!!anexarFicha} onOpenChange={(o) => !o && setAnexarFicha(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Arquivar {anexarFicha?.historico ? "papel" : "termo"} assinado — ficha nº {anexarFicha ? String(anexarFicha.numero).padStart(4, "0") : ""}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{anexarFicha?.colaborador.nome} · {fmtData(anexarFicha?.data)}. O arquivo vai para o GED (categoria SST — Termo de EPI) e fica ligado a cada item da ficha.{anexarFicha?.historico && !anexarFicha.fechadaEm && " A ficha é fechada e a próxima entrega abre uma nova."}</p>
          {anexarFicha?.historico && <p className="text-xs text-muted-foreground">Confira antes: o papel deve ter as {anexarFicha.itens.length} linha(s) lançadas no sistema, cada uma assinada.</p>}
          {anexarFicha && <UploadAnexo tipo="termo-epi" titulo={`Ficha de EPI nº ${String(anexarFicha.numero).padStart(4, "0")} — ${anexarFicha.colaborador.nome}`} colaboradorId={anexarFicha.colaborador.id} value={null} onChange={anexarAssinada} label="Enviar termo assinado (PDF/foto)" />}
          <DialogFooter><Button variant="outline" onClick={() => setAnexarFicha(null)}>Cancelar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!delFicha} onOpenChange={(o) => !o && setDelFicha(null)} title="Desfazer ficha de entrega?" description={`Ficha nº ${delFicha ? String(delFicha.numero).padStart(4, "0") : ""} — ${delFicha?.colaborador.nome ?? ""}: as ${delFicha?.itens.length ?? 0} entregas são apagadas e o estoque (se baixado) é estornado.`} onConfirm={excluirFicha} loading={saving} confirmLabel="Desfazer" />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir EPI?" description={`${del?.nome ?? ""} — só é possível sem entregas registradas.`} onConfirm={excluir} loading={saving} confirmLabel="Excluir" />
    </div>
  );
}
