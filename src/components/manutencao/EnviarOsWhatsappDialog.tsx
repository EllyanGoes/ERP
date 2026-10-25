"use client";

// Envio da OS por WhatsApp aos mecânicos (que podem não ter login no ERP).
// Gera/reaproveita o link público /os/<linkToken> (POST /api/pcm/os/[id]/link),
// monta a mensagem padrão (editável) e abre o wa.me de cada destinatário numa
// aba nova — o envio em si é pelo WhatsApp de quem clicou. Cada clique grava o
// evento "Enviada por WhatsApp" no histórico da OS.
// Usado no cabeçalho do detalhe da OS e no cartão do quadro (Kanban).
import { useEffect, useMemo, useState } from "react";
import ComboboxWithCreate from "@/components/shared/ComboboxWithCreate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Copy, Loader2, MessageCircle, Phone, Plus, RefreshCw, Send, X } from "lucide-react";
import { api, useManutLookups, type ManutLookups } from "@/components/manutencao/comum";
import { formatarTelefone, linkWhatsapp, telefoneValido } from "@/lib/manutencao/whatsapp";

type Colab = ManutLookups["colaboradores"][number];
type Destinatario = { key: string; colaboradorId: string | null; nome: string; telefone: string; semCadastro: boolean; enviado: boolean };
type LinkResp = { url: string; numero: string; mensagem: string; sugeridos: string[] };

type Props = {
  /** OS a enviar; null = dialog fechado. */
  osId: string | null;
  onFechar: () => void;
  /** Colaboradores (dos lookups) — se não vier, o dialog busca sozinho. */
  colaboradores?: Colab[];
  /** Depois de registrar um envio (o detalhe recarrega o histórico). */
  onEnviado?: () => void;
};

export default function EnviarOsWhatsappDialog({ osId, onFechar, colaboradores, onEnviado }: Props) {
  return (
    <Dialog open={!!osId} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {osId && (colaboradores ? <Conteudo osId={osId} colaboradores={colaboradores} onFechar={onFechar} onEnviado={onEnviado} />
          : <ConteudoComLookups osId={osId} onFechar={onFechar} onEnviado={onEnviado} />)}
      </DialogContent>
    </Dialog>
  );
}

/** Sem lookups de fora (quadro): busca a lista só quando o dialog abre. */
function ConteudoComLookups(p: { osId: string; onFechar: () => void; onEnviado?: () => void }) {
  const lk = useManutLookups();
  return <Conteudo {...p} colaboradores={lk.colaboradores} />;
}

function Conteudo({ osId, colaboradores, onFechar, onEnviado }: { osId: string; colaboradores: Colab[]; onFechar: () => void; onEnviado?: () => void }) {
  const [link, setLink] = useState<LinkResp | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [dest, setDest] = useState<Destinatario[]>([]);
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [renovando, setRenovando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api<LinkResp>(`/api/pcm/os/${osId}/link`, "POST", {}).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.data) { setErro(r.error || "Não foi possível gerar o link."); return; }
      setLink(r.data); setMensagem(r.data.mensagem);
    });
    return () => { vivo = false; };
  }, [osId]);

  const porId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const sugeridos = useMemo(() => (link?.sugeridos ?? []).map((id) => porId.get(id)).filter((c): c is Colab => !!c), [link, porId]);

  // Um sugerido só (ex.: o responsável) já entra marcado.
  const [preSelecionou, setPreSelecionou] = useState(false);
  useEffect(() => {
    if (preSelecionou || !link || colaboradores.length === 0) return;
    setPreSelecionou(true);
    if (sugeridos.length === 1) adicionarColab(sugeridos[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, colaboradores.length, sugeridos, preSelecionou]);

  function adicionarColab(c: Colab) {
    setDest((d) => d.some((x) => x.colaboradorId === c.id) ? d : [...d, {
      key: c.id, colaboradorId: c.id, nome: c.nome, telefone: c.telefone ?? "", semCadastro: !telefoneValido(c.telefone), enviado: false,
    }]);
  }
  function digitarNumero() {
    setDest((d) => [...d, { key: `num-${Date.now()}`, colaboradorId: null, nome: "", telefone: "", semCadastro: true, enviado: false }]);
  }
  const atualizar = (key: string, campos: Partial<Destinatario>) => setDest((d) => d.map((x) => (x.key === key ? { ...x, ...campos } : x)));
  const remover = (key: string) => setDest((d) => d.filter((x) => x.key !== key));

  const escolhidos = new Set(dest.map((d) => d.colaboradorId).filter(Boolean));
  const idsSugeridos = new Set(sugeridos.map((c) => c.id));
  const opcoes = [...sugeridos, ...colaboradores.filter((c) => !idsSugeridos.has(c.id))]
    .filter((c) => !escolhidos.has(c.id))
    .map((c) => ({
      value: c.id,
      label: `${c.nome} ${c.telefone ? formatarTelefone(c.telefone) : "sem telefone"}`,
      group: idsSugeridos.has(c.id) ? "Equipe da OS" : "Colaboradores",
      render: () => (
        <span className="flex items-center gap-2 min-w-0 w-full">
          <span className="truncate">{c.nome}</span>
          <span className={cn("ml-auto text-xs shrink-0 tabular-nums", c.telefone ? "text-muted-foreground" : "text-warning")}>{c.telefone ? formatarTelefone(c.telefone) : "sem telefone"}</span>
        </span>
      ),
    }));

  // Abre o wa.me ANTES do await (senão o navegador bloqueia o pop-up) e grava o evento.
  async function enviar(d: Destinatario) {
    if (!telefoneValido(d.telefone) || !mensagem.trim()) return;
    window.open(linkWhatsapp(d.telefone, mensagem), "_blank", "noopener,noreferrer");
    atualizar(d.key, { enviado: true });
    const r = await api(`/api/pcm/os/${osId}/link`, "POST", { registrarEnvio: { nome: d.nome.trim(), telefone: d.telefone } });
    if (!r.ok) setErro(r.error || "WhatsApp aberto, mas o envio não ficou registrado no histórico.");
    else onEnviado?.();
  }

  async function renovar() {
    if (!link) return;
    setRenovando(true);
    const r = await api<LinkResp>(`/api/pcm/os/${osId}/link`, "POST", { renovar: true });
    setRenovando(false);
    if (!r.ok || !r.data) { setErro(r.error || "Não foi possível trocar o link."); return; }
    // troca a URL dentro do texto já editado
    setMensagem((m) => m.split(link.url).join(r.data!.url));
    setLink(r.data);
  }
  async function copiar() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem permissão */ }
  }

  const validos = dest.filter((d) => telefoneValido(d.telefone));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Enviar {link?.numero ?? "OS"} por WhatsApp
        </DialogTitle>
      </DialogHeader>

      {!link && !erro && <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
      {erro && <p className="text-xs text-danger bg-danger/5 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}

      {link && (
        <div className="space-y-4 max-h-[65vh] overflow-y-auto -mx-1 px-1">
          {/* Destinatários */}
          <div className="space-y-2">
            <Label>Para quem</Label>
            {sugeridos.some((c) => !escolhidos.has(c.id)) && (
              <div className="flex flex-wrap gap-1.5">
                {sugeridos.filter((c) => !escolhidos.has(c.id)).map((c) => (
                  <button key={c.id} type="button" onClick={() => adicionarColab(c)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted text-foreground">
                    <Plus className="w-3 h-3" /> {c.nome.split(" ")[0]}
                    <span className={cn(c.telefone ? "text-muted-foreground" : "text-warning")}>{c.telefone ? formatarTelefone(c.telefone) : "sem tel."}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ComboboxWithCreate value={busca} onChange={(v) => { const c = porId.get(v); if (c) adicionarColab(c); setBusca(""); }}
                  options={opcoes} placeholder={colaboradores.length ? "Buscar colaborador…" : "Carregando colaboradores…"} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={digitarNumero} className="gap-1 shrink-0"><Phone className="w-3.5 h-3.5" /> Digitar número</Button>
            </div>

            {dest.length > 0 && (
              <ul className="space-y-1.5">
                {dest.map((d) => {
                  const ok = telefoneValido(d.telefone);
                  return (
                    <li key={d.key} className="rounded-lg border border-border px-2.5 py-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        {d.colaboradorId ? (
                          <span className="text-sm font-medium text-foreground truncate flex-1">{d.nome}</span>
                        ) : (
                          <Input value={d.nome} onChange={(e) => atualizar(d.key, { nome: e.target.value })} placeholder="Nome (opcional)" className="h-8 flex-1" />
                        )}
                        {!d.semCadastro && <span className="text-xs text-muted-foreground tabular-nums">{formatarTelefone(d.telefone)}</span>}
                        {d.enviado && <span className="text-[11px] text-success inline-flex items-center gap-0.5"><Check className="w-3 h-3" /> aberto</span>}
                        <button type="button" onClick={() => remover(d.key)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Remover"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      {d.semCadastro && (
                        <div className="space-y-1">
                          {d.colaboradorId && (
                            <p className="text-[11px] text-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Sem telefone — cadastre o telefone no colaborador. Por enquanto, digite abaixo:</p>
                          )}
                          <Input inputMode="tel" value={d.telefone} onChange={(e) => atualizar(d.key, { telefone: e.target.value })} placeholder="(DDD) 9 0000-0000"
                            className={cn("h-8", d.telefone && !ok && "border-danger focus-visible:ring-danger/40")} />
                          {d.telefone && !ok && <p className="text-[11px] text-danger">Informe DDD + número.</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Mensagem */}
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} className="text-sm" />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate flex-1 font-mono" title={link.url}>{link.url}</span>
              <button type="button" onClick={copiar} className="inline-flex items-center gap-1 hover:text-foreground shrink-0">
                {copiado ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />} {copiado ? "Copiado" : "Copiar link"}
              </button>
              <button type="button" onClick={renovar} disabled={renovando} title="Gera um link novo — o anterior para de funcionar"
                className="inline-flex items-center gap-1 hover:text-foreground shrink-0 disabled:opacity-50">
                <RefreshCw className={cn("w-3 h-3", renovando && "animate-spin")} /> Trocar link
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">O link abre a OS no celular sem login (só leitura, sem custos). Quem tem acesso ao ERP pode abrir a OS completa por lá.</p>
          </div>
        </div>
      )}

      <DialogFooter className="flex-col sm:flex-row sm:flex-wrap gap-2">
        <Button variant="outline" onClick={onFechar}>Fechar</Button>
        {link && validos.length === 0 && (
          <Button disabled className="gap-1.5"><Send className="w-4 h-4" /> Escolha o destinatário</Button>
        )}
        {link && validos.map((d) => (
          <Button key={d.key} onClick={() => enviar(d)} disabled={!mensagem.trim()}
            className={cn("gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700", d.enviado && "opacity-80")}>
            {d.enviado ? <Check className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
            {validos.length === 1 ? (d.enviado ? "Abrir de novo" : "Abrir WhatsApp") : (d.nome.trim().split(" ")[0] || formatarTelefone(d.telefone))}
          </Button>
        ))}
      </DialogFooter>
    </>
  );
}
