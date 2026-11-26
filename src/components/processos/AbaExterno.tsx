"use client";

// Aba "Acesso externo" da ficha (fase 3): links por pessoa (advogado/despachante) para a página
// pública /externo/processo/<token>. O link aparece UMA vez, ao gerar (no banco só o hash);
// perdeu → "Gerar link novo" (o anterior deixa de valer). Revogar corta na hora.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DatePicker from "@/components/shared/DatePicker";
import { cn } from "@/lib/utils";
import { Ban, Check, Copy, FileText, History, Link2, Loader2, MessageCircle, Plus, RefreshCw } from "lucide-react";
import { api, fmtData } from "@/components/processos/comum";

type Acesso = {
  id: string; nome: string; email: string | null; telefone: string | null; validoAte: string | null; revogadoEm: string | null; revogadoPor: string | null;
  documentoIds: string[]; podeLancar: boolean; ultimoAcessoEm: string | null; criadoPor: string | null; createdAt: string; ativo: boolean;
};
type Log = { id: string; acao: string; autor: string; detalhe: string | null; createdAt: string };
type Doc = { id: string; titulo: string };
const ROTULO: Record<string, string> = {
  EXTERNO_LINK_CRIAR: "gerou link", EXTERNO_LINK_REVOGAR: "revogou link", EXTERNO_ACESSO: "abriu o link",
  EXTERNO_ANDAMENTO: "lançou andamento", EXTERNO_PRAZO: "marcou prazo cumprido", EXTERNO_DOCUMENTO: "enviou PDF",
};
const fmtDH = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AbaExterno({ processo, documentos, pode, onMudou }: { processo: { id: string; codigo: string; titulo: string }; documentos: Doc[]; pode: boolean; onMudou?: () => void }) {
  const [acessos, setAcessos] = useState<Acesso[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<{ nome: string; email: string; telefone: string; validoAte: string; podeLancar: boolean; documentoIds: string[] } | null>(null);
  const [docsDe, setDocsDe] = useState<Acesso | null>(null);
  const [gerado, setGerado] = useState<{ nome: string; url: string; telefone: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verLog, setVerLog] = useState(false);

  const load = useCallback(async () => {
    const j = await fetch(`/api/processos/${processo.id}/externo`).then((x) => x.json()).catch(() => null);
    if (!j || j.error) { setErro(j?.error ?? "Erro ao carregar."); return; }
    setAcessos(j.data); setLogs(j.logs ?? []);
  }, [processo.id]);
  useEffect(() => { load(); }, [load]);

  async function criar() {
    if (!novo) return;
    setSalvando(true); setErro("");
    const r = await api<{ url: string }>(`/api/processos/${processo.id}/externo`, "POST", { ...novo, validoAte: novo.validoAte || null });
    setSalvando(false);
    if (!r.ok || !r.data) { setErro(r.error ?? "Erro."); return; }
    setGerado({ nome: novo.nome, url: r.data.url, telefone: novo.telefone || null }); setNovo(null); load(); onMudou?.();
  }
  async function acao(a: Acesso, body: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return;
    setErro("");
    const r = await api<{ url: string } | null>(`/api/processos/${processo.id}/externo`, "PATCH", { acessoId: a.id, ...body });
    if (!r.ok) { setErro(r.error ?? "Erro."); return; }
    if (body.regenerar && r.data) setGerado({ nome: a.nome, url: r.data.url, telefone: a.telefone });
    load(); onMudou?.();
  }
  async function copiar(t: string) { try { await navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ } }
  const whats = (g: { nome: string; url: string; telefone: string | null }) => {
    const fone = (g.telefone ?? "").replace(/\D/g, "");
    const texto = `Olá, ${g.nome.split(" ")[0]}! Segue o link para acompanhar o processo ${processo.codigo} (${processo.titulo}) e registrar andamentos: ${g.url}`;
    return `https://wa.me/${fone.length >= 10 ? (fone.startsWith("55") ? fone : `55${fone}`) : ""}?text=${encodeURIComponent(texto)}`;
  };

  if (!acessos) return <div className="bg-card border border-border rounded-xl p-8 flex justify-center">{erro ? <span className="text-sm text-danger">{erro}</span> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}</div>;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {pode && <Button size="sm" className="gap-1.5" onClick={() => { setErro(""); setNovo({ nome: "", email: "", telefone: "", validoAte: "", podeLancar: true, documentoIds: [] }); }}><Plus className="w-3.5 h-3.5" /> Link para advogado/despachante</Button>}
        <span className="text-xs text-muted-foreground">A pessoa vê só título, número, órgão, situação, linha do tempo (sem os andamentos marcados como internos), prazos e os documentos que você escolher. Nunca acessos, financeiro ou outros processos.</span>
        {logs.length > 0 && <button onClick={() => setVerLog((v) => !v)} className="ml-auto text-xs text-info hover:underline inline-flex items-center gap-1"><History className="w-3.5 h-3.5" /> {verLog ? "Ocultar histórico" : "Histórico"}</button>}
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}

      {acessos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum link gerado.</p> : (
        <ul className="divide-y divide-border/60">
          {acessos.map((a) => (
            <li key={a.id} className={cn("py-3 flex flex-col sm:flex-row sm:items-center gap-2", !a.ativo && "opacity-60")}>
              <Link2 className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2 flex-wrap">{a.nome}
                  <span className={cn("text-[10px] px-1.5 py-px rounded-full border", a.ativo ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground")}>{a.revogadoEm ? "revogado" : a.ativo ? (a.podeLancar ? "ativo" : "só consulta") : "expirado"}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {[a.email, a.telefone].filter(Boolean).join(" · ")}{(a.email || a.telefone) && " · "}
                  {a.validoAte ? `válido até ${new Date(a.validoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "sem validade"} · {a.documentoIds.length} documento(s) compartilhado(s)
                  {a.ultimoAcessoEm ? ` · último acesso ${fmtDH(a.ultimoAcessoEm)}` : " · nunca abriu"}
                  {a.revogadoEm && ` · revogado ${fmtData(a.revogadoEm)}${a.revogadoPor ? ` por ${a.revogadoPor}` : ""}`}
                </div>
              </div>
              {pode && <div className="flex flex-wrap gap-1.5 text-xs">
                <button onClick={() => setDocsDe(a)} className="rounded-md border border-border px-2 py-1 inline-flex items-center gap-1 hover:bg-muted"><FileText className="w-3 h-3" /> Documentos</button>
                <button onClick={() => acao(a, { regenerar: true }, `Gerar um link novo para ${a.nome}? O link atual deixa de funcionar.`)} className="rounded-md border border-border px-2 py-1 inline-flex items-center gap-1 hover:bg-muted"><RefreshCw className="w-3 h-3" /> Link novo</button>
                {!a.revogadoEm && <button onClick={() => acao(a, { revogar: true }, `Revogar o link de ${a.nome}? Ele para de funcionar na hora.`)} className="rounded-md border border-danger/30 text-danger px-2 py-1 inline-flex items-center gap-1 hover:bg-danger/10"><Ban className="w-3 h-3" /> Revogar</button>}
              </div>}
            </li>
          ))}
        </ul>
      )}

      {verLog && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <ul className="space-y-1 text-xs">{logs.map((l) => <li key={l.id} className="text-muted-foreground"><span className="tabular-nums">{fmtDH(l.createdAt)}</span> · <b className="text-foreground">{l.autor}</b> {ROTULO[l.acao] ?? l.acao}{l.detalhe && ` — ${l.detalhe}`}</li>)}</ul>
        </div>
      )}

      {/* Novo link */}
      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Link para advogado/despachante</DialogTitle></DialogHeader>
          {novo && <div className="space-y-3">
            <div><Label>Nome</Label><Input autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Dr. Fulano (OAB/AP 1234)" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>E-mail (opcional)</Label><Input value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
              <div><Label>Telefone (opcional)</Label><Input value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} placeholder="para enviar por WhatsApp" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><Label>Válido até (opcional)</Label><DatePicker value={novo.validoAte} onChange={(v) => setNovo({ ...novo, validoAte: v ?? "" })} /></div>
              <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="rounded" checked={novo.podeLancar} onChange={(e) => setNovo({ ...novo, podeLancar: e.target.checked })} /> Pode registrar andamento e cumprir prazo</label>
            </div>
            <SeletorDocs documentos={documentos} valor={novo.documentoIds} onChange={(documentoIds) => setNovo({ ...novo, documentoIds })} />
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button><Button onClick={criar} disabled={salvando || !novo?.nome.trim()}>{salvando ? "Gerando…" : "Gerar link"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Documentos compartilhados de um link existente */}
      {docsDe && <DocsDialog acesso={docsDe} documentos={documentos} onFechar={() => setDocsDe(null)} onSalvar={async (ids) => { await acao(docsDe, { documentoIds: ids }); setDocsDe(null); }} />}

      {/* Link gerado — aparece uma vez só */}
      <Dialog open={!!gerado} onOpenChange={(o) => { if (!o) { setGerado(null); setCopiado(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Link de {gerado?.nome}</DialogTitle></DialogHeader>
          {gerado && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Copie e envie agora — por segurança o link <b className="text-foreground">não é mostrado de novo</b>. Se perder, gere um link novo.</p>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all select-all">{gerado.url}</div>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-1.5" onClick={() => copiar(gerado.url)}>{copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? "Copiado!" : "Copiar link"}</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => window.open(whats(gerado), "_blank")}><MessageCircle className="w-4 h-4" /> Enviar por WhatsApp</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeletorDocs({ documentos, valor, onChange }: { documentos: Doc[]; valor: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div>
      <Label>Documentos compartilhados</Label>
      {documentos.length === 0 ? <p className="text-xs text-muted-foreground mt-1">O processo não tem documentos no GED.</p> : (
        <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
          {documentos.map((d) => (
            <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
              <input type="checkbox" className="rounded" checked={valor.includes(d.id)} onChange={(e) => onChange(e.target.checked ? [...valor, d.id] : valor.filter((x) => x !== d.id))} />
              <span className="truncate">{d.titulo}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-1">Só os marcados aparecem para a pessoa (os PDFs que ela mesma enviar também).</p>
    </div>
  );
}

function DocsDialog({ acesso, documentos, onFechar, onSalvar }: { acesso: Acesso; documentos: Doc[]; onFechar: () => void; onSalvar: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(acesso.documentoIds);
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Documentos de {acesso.nome}</DialogTitle></DialogHeader>
        <SeletorDocs documentos={documentos} valor={ids} onChange={setIds} />
        <DialogFooter><Button variant="outline" onClick={onFechar}>Cancelar</Button><Button disabled={salvando} onClick={async () => { setSalvando(true); await onSalvar(ids); setSalvando(false); }}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
