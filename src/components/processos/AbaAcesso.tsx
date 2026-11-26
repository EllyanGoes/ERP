"use client";

// Aba "Acesso" da ficha do processo (fase 2): cofre de logins de portal (SICARF, PJe, e-CAC…).
// Senha nunca vem na listagem: Mostrar/Copiar chamam /credenciais/revelar, que registra no log
// quem, quando e qual. Sem PROCESSOS_CRED_KEY o cofre fica bloqueado (aviso), sem quebrar a ficha.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Copy, ExternalLink, Eye, EyeOff, History, KeyRound, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "@/components/processos/comum";

type Cred = { id: string; portal: string; url: string | null; observacao: string | null; usuarioMascarado: string; atualizadoPor: string | null; updatedAt: string };
type Log = { id: string; acao: string; autor: string; detalhe: string | null; createdAt: string };
type Resp = { data: Cred[]; logs: Log[]; configurado: boolean; podeVer: boolean; podeEditar: boolean };

const ROTULO: Record<string, string> = {
  CREDENCIAL_VER: "viu a senha", CREDENCIAL_COPIAR_SENHA: "copiou a senha", CREDENCIAL_COPIAR_USUARIO: "copiou o usuário",
  CREDENCIAL_CRIAR: "cadastrou", CREDENCIAL_EDITAR: "alterou", CREDENCIAL_EXCLUIR: "excluiu",
};
const fmtDH = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const OCULTAR_EM_MS = 30_000;

/** Copia um valor que vem de uma chamada assíncrona — ClipboardItem com Promise (Safari) e fallback. */
async function copiarAssincrono(obter: () => Promise<string>): Promise<boolean> {
  const valor = obter();
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": valor.then((t) => new Blob([t], { type: "text/plain" })) })]);
      return true;
    }
  } catch { /* cai no writeText */ }
  try { await navigator.clipboard.writeText(await valor); return true; } catch { return false; }
}

export default function AbaAcesso({ processoId, onContagem }: { processoId: string; onContagem?: (n: number) => void }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [revelado, setRevelado] = useState<Record<string, { usuario: string; senha: string }>>({});
  const [copiado, setCopiado] = useState<string>("");
  const [form, setForm] = useState<{ id?: string; portal: string; url: string; usuario: string; senha: string; observacao: string } | null>(null);
  const [verSenhaForm, setVerSenhaForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verLog, setVerLog] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    const j = await fetch(`/api/processos/${processoId}/credenciais`).then((x) => x.json()).catch(() => null);
    if (!j || j.error) { setErro(j?.error ?? "Erro ao carregar."); return; }
    setR(j); onContagem?.(j.data.length);
  }, [processoId, onContagem]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  async function revelar(c: Cred) {
    if (revelado[c.id]) { setRevelado((x) => { const y = { ...x }; delete y[c.id]; return y; }); return; }
    const res = await api<{ usuario: string; senha: string }>(`/api/processos/${processoId}/credenciais/revelar`, "POST", { credencialId: c.id, acao: "VER" });
    if (!res.ok || !res.data) { setErro(res.error ?? "Erro."); return; }
    setRevelado((x) => ({ ...x, [c.id]: res.data! }));
    clearTimeout(timers.current[c.id]);
    timers.current[c.id] = setTimeout(() => setRevelado((x) => { const y = { ...x }; delete y[c.id]; return y; }), OCULTAR_EM_MS);
    load();
  }
  async function copiar(c: Cred, campo: "senha" | "usuario") {
    setErro("");
    const ok = await copiarAssincrono(async () => {
      const res = await api<{ usuario?: string; senha?: string }>(`/api/processos/${processoId}/credenciais/revelar`, "POST", { credencialId: c.id, acao: campo === "senha" ? "COPIAR_SENHA" : "COPIAR_USUARIO" });
      if (!res.ok || !res.data) throw new Error(res.error ?? "Erro.");
      return String(res.data[campo] ?? "");
    });
    if (!ok) { setErro("Não foi possível copiar — use Mostrar."); return; }
    setCopiado(`${c.id}:${campo}`); setTimeout(() => setCopiado(""), 1500);
    load();
  }
  async function salvar() {
    if (!form) return;
    setSalvando(true); setErro("");
    const body = form.id
      ? { credencialId: form.id, portal: form.portal, url: form.url, observacao: form.observacao, ...(form.usuario.trim() ? { usuario: form.usuario } : {}), ...(form.senha ? { senha: form.senha } : {}) }
      : form;
    const res = await api(`/api/processos/${processoId}/credenciais`, form.id ? "PATCH" : "POST", body);
    setSalvando(false);
    if (!res.ok) { setErro(res.error ?? "Erro."); return; }
    setForm(null); setVerSenhaForm(false); load();
  }
  async function excluir(c: Cred) {
    if (!confirm(`Excluir o acesso "${c.portal}"? A senha some do cofre (o log continua).`)) return;
    const res = await api(`/api/processos/${processoId}/credenciais?credencialId=${c.id}`, "DELETE");
    if (!res.ok) setErro(res.error ?? "Erro.");
    load();
  }

  if (!r) return <div className="bg-card border border-border rounded-xl p-8 flex justify-center">{erro ? <span className="text-sm text-danger">{erro}</span> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}</div>;
  if (!r.podeVer) return (
    <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground flex items-start gap-3">
      <ShieldAlert className="w-5 h-5 shrink-0" /> Os acessos de portal deste processo ficam no cofre e só aparecem para quem tem a permissão <b className="text-foreground">Processos › Cofre de acessos</b>. Peça ao administrador.
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      {!r.configurado && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 text-warning text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>Cofre não configurado.</b> Falta a chave <span className="font-mono">PROCESSOS_CRED_KEY</span> no servidor — enquanto isso não é possível gravar nem ler senhas. O resto do processo funciona normalmente.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.podeEditar && r.configurado && <Button size="sm" className="gap-1.5" onClick={() => { setErro(""); setVerSenhaForm(false); setForm({ portal: "", url: "", usuario: "", senha: "", observacao: "" }); }}><Plus className="w-3.5 h-3.5" /> Acesso</Button>}
        <span className="text-xs text-muted-foreground">Senhas cifradas (AES-256). Mostrar e copiar ficam registrados no histórico.</span>
        {r.logs.length > 0 && <button onClick={() => setVerLog((v) => !v)} className="ml-auto text-xs text-info hover:underline inline-flex items-center gap-1"><History className="w-3.5 h-3.5" /> {verLog ? "Ocultar histórico" : "Histórico de acessos"}</button>}
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}

      {r.data.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum acesso cadastrado. Guarde aqui o login do portal do órgão (em vez de PDF ou mensagem).</p> : (
        <ul className="divide-y divide-border/60">
          {r.data.map((c) => {
            const v = revelado[c.id];
            return (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-3">
                <KeyRound className="w-4 h-4 text-muted-foreground shrink-0 mt-1 hidden sm:block" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.portal}</span>
                    {c.url && <a href={c.url} target="_blank" rel="noreferrer noopener" className="text-xs text-info hover:underline inline-flex items-center gap-1">abrir portal <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-muted-foreground w-12 shrink-0">Usuário</span>
                      <span className="font-mono truncate">{v ? v.usuario : c.usuarioMascarado}</span>
                      {r.configurado && <button onClick={() => copiar(c, "usuario")} className="text-muted-foreground hover:text-foreground" title="Copiar usuário">{copiado === `${c.id}:usuario` ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}</button>}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-muted-foreground w-12 shrink-0">Senha</span>
                      <span className={cn("font-mono truncate", !v && "tracking-widest")}>{v ? v.senha : "••••••••"}</span>
                      {r.configurado && <>
                        <button onClick={() => revelar(c)} className="text-muted-foreground hover:text-foreground" title={v ? "Ocultar" : "Mostrar (fica registrado)"}>{v ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                        <button onClick={() => copiar(c, "senha")} className="text-muted-foreground hover:text-foreground" title="Copiar senha (fica registrado)">{copiado === `${c.id}:senha` ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}</button>
                      </>}
                    </div>
                  </div>
                  {c.observacao && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{c.observacao}</div>}
                  <div className="text-[11px] text-muted-foreground">Atualizado {fmtDH(c.updatedAt)}{c.atualizadoPor && ` por ${c.atualizadoPor}`}{v && " · a senha some da tela em 30 s"}</div>
                </div>
                {r.podeEditar && r.configurado && <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setErro(""); setVerSenhaForm(false); setForm({ id: c.id, portal: c.portal, url: c.url ?? "", usuario: "", senha: "", observacao: c.observacao ?? "" }); }} className="text-muted-foreground hover:text-foreground" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => excluir(c)} className="text-muted-foreground hover:text-danger" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>}
              </li>
            );
          })}
        </ul>
      )}

      {verLog && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-xs font-medium mb-2">Histórico (últimos 30)</div>
          <ul className="space-y-1 text-xs">
            {r.logs.map((l) => <li key={l.id} className="text-muted-foreground"><span className="tabular-nums">{fmtDH(l.createdAt)}</span> · <b className="text-foreground">{l.autor}</b> {ROTULO[l.acao] ?? l.acao}{l.detalhe && ` — ${l.detalhe}`}</li>)}
          </ul>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) { setForm(null); setVerSenhaForm(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Editar acesso" : "Novo acesso de portal"}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <div><Label>Portal / descrição</Label><Input autoFocus value={form.portal} onChange={(e) => setForm({ ...form, portal: e.target.value })} placeholder="Ex.: SICARF-AP" /></div>
            <div><Label>Endereço (opcional)</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
            <div><Label>Usuário / login</Label><Input autoComplete="off" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder={form.id ? "deixe em branco para manter" : "CPF, e-mail ou login"} /></div>
            <div><Label>Senha</Label>
              <div className="relative">
                <Input type={verSenhaForm ? "text" : "password"} autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder={form.id ? "deixe em branco para manter" : ""} className="pr-9" />
                <button type="button" onClick={() => setVerSenhaForm((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{verSenhaForm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div><Label>Observação (opcional)</Label><Textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: conta no CPF do dono; 2FA no celular dele" /></div>
            {erro && <p className="text-sm text-danger">{erro}</p>}
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setForm(null); setVerSenhaForm(false); }}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !form?.portal.trim() || (!form?.id && (!form?.usuario.trim() || !form?.senha))}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
