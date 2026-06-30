"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, MapPin, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LocalizacaoMapa = dynamic(() => import("@/components/shared/LocalizacaoMapa"), { ssr: false });

export type LocalConcorrente = {
  id: string;
  nome: string | null;
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

function enderecoResumo(l: LocalConcorrente): string {
  return [l.logradouro, l.numero, l.bairro, [l.cidade, l.estado].filter(Boolean).join("/")].filter(Boolean).join(", ") || "Sem endereço";
}

export default function ConcorrenteLocais({
  concorrenteId,
  locaisIniciais,
}: {
  concorrenteId: string;
  locaisIniciais: LocalConcorrente[];
}) {
  const [locais, setLocais] = useState<LocalConcorrente[]>(locaisIniciais);
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const base = `/api/marketing/concorrentes/${concorrenteId}/locais`;

  async function adicionar() {
    setSalvando("novo");
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setSalvando(null);
    if (res.ok) {
      const { data } = await res.json();
      setLocais((l) => [...l, data]);
      setAberto(data.id);
    }
  }

  function patch(id: string, campo: keyof LocalConcorrente, valor: string) {
    setLocais((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  async function salvarEndereco(l: LocalConcorrente) {
    setSalvando(l.id);
    const res = await fetch(`${base}/${l.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: l.nome, cep: l.cep, logradouro: l.logradouro, numero: l.numero,
        complemento: l.complemento, bairro: l.bairro, cidade: l.cidade, estado: l.estado,
      }),
    });
    setSalvando(null);
    if (res.ok) {
      const { data } = await res.json();
      setLocais((ls) => ls.map((x) => (x.id === l.id ? data : x)));
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover este local?")) return;
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    if (res.ok) setLocais((ls) => ls.filter((l) => l.id !== id));
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wide flex items-center gap-2"><Building2 className="h-4 w-4" /> Outros locais físicos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Filiais, depósitos e pontos de venda além da matriz. Cada local é localizado no mapa do geomarketing.</p>
        </div>
        <Button type="button" onClick={adicionar} disabled={salvando === "novo"} className="h-9 gap-1.5 shrink-0">
          {salvando === "novo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar local
        </Button>
      </div>

      {locais.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum local adicional. A matriz é o endereço do concorrente (acima).</div>
      ) : (
        <div className="divide-y divide-border">
          {locais.map((l) => {
            const exp = aberto === l.id;
            const temGeo = l.latitude != null && l.longitude != null;
            return (
              <div key={l.id}>
                <div className="px-5 py-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer" onClick={() => setAberto(exp ? null : l.id)}>
                  {exp ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <MapPin className={cn("h-4 w-4 shrink-0", temGeo ? (l.geoManual ? "text-fuchsia-500" : "text-emerald-500") : "text-muted-foreground/40")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{l.nome || "Local sem nome"}</p>
                    <p className="text-xs text-muted-foreground truncate">{enderecoResumo(l)}</p>
                  </div>
                  {!temGeo && <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">sem localização</span>}
                  <button onClick={(e) => { e.stopPropagation(); remover(l.id); }} className="text-muted-foreground hover:text-danger shrink-0" title="Remover"><Trash2 className="h-4 w-4" /></button>
                </div>

                {exp && (
                  <div className="px-5 pb-5 space-y-4">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Nome do local</label>
                        <Input value={l.nome ?? ""} onChange={(e) => patch(l.id, "nome", e.target.value)} placeholder="Ex.: Filial Santana, Depósito" className="h-10 border-border" />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">CEP</label>
                        <Input value={l.cep ?? ""} onChange={(e) => patch(l.id, "cep", e.target.value)} placeholder="00000-000" className="h-10 border-border" />
                      </div>
                      <div className="col-span-7">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Logradouro</label>
                        <Input value={l.logradouro ?? ""} onChange={(e) => patch(l.id, "logradouro", e.target.value)} className="h-10 border-border" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Número</label>
                        <Input value={l.numero ?? ""} onChange={(e) => patch(l.id, "numero", e.target.value)} className="h-10 border-border" />
                      </div>
                      <div className="col-span-5">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Bairro</label>
                        <Input value={l.bairro ?? ""} onChange={(e) => patch(l.id, "bairro", e.target.value)} className="h-10 border-border" />
                      </div>
                      <div className="col-span-5">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">Cidade</label>
                        <Input value={l.cidade ?? ""} onChange={(e) => patch(l.id, "cidade", e.target.value)} className="h-10 border-border" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">UF</label>
                        <select value={l.estado ?? ""} onChange={(e) => patch(l.id, "estado", e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                          <option value="">UF</option>
                          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button type="button" onClick={() => salvarEndereco(l)} disabled={salvando === l.id} className="gap-1.5">
                        {salvando === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Salvar e localizar
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{l.geoManual ? "Ponto ajustado manualmente — salvar o endereço não move o pino." : "Salvar recalcula a localização pelo endereço."}</span>
                    </div>

                    <LocalizacaoMapa
                      endpoint={`${base}/${l.id}/localizacao`}
                      latitude={l.latitude}
                      longitude={l.longitude}
                      geoManual={l.geoManual}
                      geoReferencia={l.geoReferencia}
                      onChange={(lat, lng, manual, referencia) =>
                        setLocais((ls) => ls.map((x) => (x.id === l.id ? { ...x, latitude: lat, longitude: lng, geoManual: manual, geoReferencia: referencia } : x)))
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
