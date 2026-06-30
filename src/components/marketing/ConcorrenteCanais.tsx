"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CANAIS_AQUISICAO, labelCanal, ehCanalLocal } from "@/lib/canais-aquisicao";
import {
  Plus, Trash2, Loader2, X, Share2, Pencil, ExternalLink,
  MessageCircle, Send, Camera, ThumbsUp, Globe, Mail, Phone, Store, MapPin, ShoppingBag, Users, Link2,
} from "lucide-react";

const LocalizacaoMapa = dynamic(() => import("@/components/shared/LocalizacaoMapa"), { ssr: false });

export type CanalConcorrente = {
  id: string;
  tipo: string;
  valor: string | null;
  observacao: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  geoManual: boolean;
  geoReferencia: string | null;
};

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

// Ícone + cor por tipo de canal.
const ICONES: Record<string, { Icon: React.ComponentType<{ className?: string }>; cor: string }> = {
  LOCALIZACAO: { Icon: Store, cor: "text-fuchsia-600 dark:text-fuchsia-400" },
  WHATSAPP:    { Icon: MessageCircle, cor: "text-emerald-600 dark:text-emerald-400" },
  TELEGRAM:    { Icon: Send, cor: "text-sky-600 dark:text-sky-400" },
  INSTAGRAM:   { Icon: Camera, cor: "text-pink-600 dark:text-pink-400" },
  FACEBOOK:    { Icon: ThumbsUp, cor: "text-blue-600 dark:text-blue-400" },
  SITE:        { Icon: Globe, cor: "text-indigo-600 dark:text-indigo-400" },
  EMAIL:       { Icon: Mail, cor: "text-amber-600 dark:text-amber-400" },
  TELEFONE:    { Icon: Phone, cor: "text-teal-600 dark:text-teal-400" },
  GOOGLE:      { Icon: MapPin, cor: "text-red-600 dark:text-red-400" },
  MARKETPLACE: { Icon: ShoppingBag, cor: "text-orange-600 dark:text-orange-400" },
  INDICACAO:   { Icon: Users, cor: "text-violet-600 dark:text-violet-400" },
  OUTRO:       { Icon: Link2, cor: "text-muted-foreground" },
};
export function IconeCanal({ tipo, className }: { tipo: string; className?: string }) {
  const { Icon, cor } = ICONES[tipo] ?? ICONES.OUTRO;
  return <Icon className={className ?? `h-4 w-4 ${cor}`} />;
}

// Placeholder do campo "valor" conforme o tipo.
function placeholderValor(tipo: string): string {
  switch (tipo) {
    case "WHATSAPP": case "TELEFONE": return "(96) 90000-0000";
    case "TELEGRAM": case "INSTAGRAM": return "@perfil";
    case "SITE": case "FACEBOOK": case "GOOGLE": case "MARKETPLACE": return "https://...";
    case "EMAIL": return "contato@empresa.com";
    case "LOCALIZACAO": return "Nome do local (ex.: Loja Centro)";
    default: return "Link / contato / descrição";
  }
}

type Rascunho = Partial<CanalConcorrente> & { tipo: string };

export default function ConcorrenteCanais({
  concorrenteId,
  canaisIniciais,
  onCount,
}: {
  concorrenteId: string;
  canaisIniciais: CanalConcorrente[];
  onCount?: (n: number) => void;
}) {
  const [canais, setCanais] = useState<CanalConcorrente[]>(canaisIniciais);
  const [editando, setEditando] = useState<Rascunho | null>(null); // popup aberto (novo ou edição)
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const base = `/api/marketing/concorrentes/${concorrenteId}/canais`;

  function sync(next: CanalConcorrente[]) { setCanais(next); onCount?.(next.length); }
  function abrirNovo() { setErro(null); setEditando({ tipo: "WHATSAPP" }); }
  function abrirEdicao(c: CanalConcorrente) { setErro(null); setEditando({ ...c }); }

  async function salvar() {
    if (!editando) return;
    setSalvando(true); setErro(null);
    const r = editando;
    const body = {
      tipo: r.tipo, valor: r.valor ?? null, observacao: r.observacao ?? null,
      cep: r.cep ?? null, logradouro: r.logradouro ?? null, numero: r.numero ?? null,
      complemento: r.complemento ?? null, bairro: r.bairro ?? null, cidade: r.cidade ?? null, estado: r.estado ?? null,
    };
    const url = r.id ? `${base}/${r.id}` : base;
    const res = await fetch(url, { method: r.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSalvando(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErro(j.error ?? "Erro ao salvar."); return; }
    const { data } = await res.json();
    if (r.id) { setCanais((cs) => cs.map((x) => (x.id === r.id ? data : x))); setEditando(ehCanalLocal(data.tipo) ? data : null); }
    else { sync([...canais, data]); setEditando(ehCanalLocal(data.tipo) ? data : null); } // local: mantém aberto p/ ajustar pino
  }

  async function remover(id: string) {
    if (!confirm("Remover este canal?")) return;
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    if (res.ok) sync(canais.filter((c) => c.id !== id));
  }

  function set<K extends keyof CanalConcorrente>(campo: K, valor: CanalConcorrente[K]) {
    setEditando((e) => (e ? { ...e, [campo]: valor } : e));
  }

  const ehLocal = editando ? ehCanalLocal(editando.tipo) : false;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden max-w-4xl">
      <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-2"><Share2 className="h-4 w-4" /> Canais de aquisição</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Por onde o concorrente capta clientes. A <b>loja física</b> é um canal geolocalizado (vai pro mapa).</p>
        </div>
        <Button type="button" onClick={abrirNovo} className="h-9 gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Adicionar canal</Button>
      </div>

      {canais.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum canal cadastrado.</div>
      ) : (
        <div className="divide-y divide-border">
          {canais.map((c) => {
            const temGeo = c.latitude != null && c.longitude != null;
            const isLink = /^https?:\/\//i.test(c.valor ?? "");
            return (
              <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0"><IconeCanal tipo={c.tipo} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{labelCanal(c.tipo)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.valor || (ehCanalLocal(c.tipo) ? [c.logradouro, c.bairro, c.cidade].filter(Boolean).join(", ") : "—")}
                    {c.observacao ? ` · ${c.observacao}` : ""}
                  </p>
                </div>
                {ehCanalLocal(c.tipo) && (
                  <span className={`text-[11px] shrink-0 ${temGeo ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {temGeo ? "no mapa" : "sem localização"}
                  </span>
                )}
                {isLink && <a href={c.valor!} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-info shrink-0" title="Abrir"><ExternalLink className="h-4 w-4" /></a>}
                <button onClick={() => abrirEdicao(c)} className="text-muted-foreground hover:text-info shrink-0" title="Editar"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remover(c.id)} className="text-muted-foreground hover:text-danger shrink-0" title="Remover"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* Popup novo/editar canal */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditando(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><IconeCanal tipo={editando.tipo} /> {editando.id ? "Editar canal" : "Novo canal"}</h3>
              <button onClick={() => setEditando(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            {/* Grade de tipos (com ícone) */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {CANAIS_AQUISICAO.map((o) => (
                <button key={o.value} type="button" onClick={() => set("tipo", o.value)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${editando.tipo === o.value ? "border-info bg-info/10 text-foreground font-medium" : "border-border hover:bg-muted text-muted-foreground"}`}>
                  <IconeCanal tipo={o.value} className="h-4 w-4" /> <span className="truncate">{o.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ehLocal ? "Nome do local" : "Contato / link"}</label>
                <Input value={editando.valor ?? ""} onChange={(e) => set("valor", e.target.value)} placeholder={placeholderValor(editando.tipo)} className="h-10 border-border" />
              </div>

              {ehLocal && (
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4"><label className="text-[11px] font-semibold text-muted-foreground uppercase">CEP</label><Input value={editando.cep ?? ""} onChange={(e) => set("cep", e.target.value)} className="h-10 border-border" /></div>
                  <div className="col-span-8"><label className="text-[11px] font-semibold text-muted-foreground uppercase">Logradouro</label><Input value={editando.logradouro ?? ""} onChange={(e) => set("logradouro", e.target.value)} className="h-10 border-border" /></div>
                  <div className="col-span-3"><label className="text-[11px] font-semibold text-muted-foreground uppercase">Número</label><Input value={editando.numero ?? ""} onChange={(e) => set("numero", e.target.value)} className="h-10 border-border" /></div>
                  <div className="col-span-5"><label className="text-[11px] font-semibold text-muted-foreground uppercase">Bairro</label><Input value={editando.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} className="h-10 border-border" /></div>
                  <div className="col-span-3"><label className="text-[11px] font-semibold text-muted-foreground uppercase">Cidade</label><Input value={editando.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} className="h-10 border-border" /></div>
                  <div className="col-span-1"><label className="text-[11px] font-semibold text-muted-foreground uppercase">UF</label>
                    <select value={editando.estado ?? ""} onChange={(e) => set("estado", e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-1 text-sm">
                      <option value="">—</option>{UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Observação</label>
                <Input value={editando.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} placeholder="Opcional" className="h-10 border-border" />
              </div>

              {/* Mapa do local — só após salvar (precisa de id). */}
              {ehLocal && editando.id && (
                <LocalizacaoMapa
                  endpoint={`${base}/${editando.id}/localizacao`}
                  latitude={editando.latitude ?? null}
                  longitude={editando.longitude ?? null}
                  geoManual={editando.geoManual ?? false}
                  geoReferencia={editando.geoReferencia}
                  onChange={(lat, lng, manual, referencia) => {
                    setEditando((e) => (e ? { ...e, latitude: lat, longitude: lng, geoManual: manual, geoReferencia: referencia } : e));
                    setCanais((cs) => cs.map((x) => (x.id === editando.id ? { ...x, latitude: lat, longitude: lng, geoManual: manual, geoReferencia: referencia } : x)));
                  }}
                />
              )}
              {ehLocal && !editando.id && (
                <p className="text-[11px] text-muted-foreground">Salve o local para localizar no mapa (geocodifica pelo endereço; depois você pode ajustar o pino).</p>
              )}

              {erro && <p className="text-xs text-danger">{erro}</p>}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setEditando(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Fechar</button>
              <Button type="button" onClick={salvar} disabled={salvando} className="h-10 gap-1.5">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editando.id ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
