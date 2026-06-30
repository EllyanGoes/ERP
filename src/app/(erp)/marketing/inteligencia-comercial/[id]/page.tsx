"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useTabTitle } from "@/lib/tabs-context";
import ConcorrenteForm from "@/components/marketing/ConcorrenteForm";
import ConcorrenteDadosView from "@/components/marketing/ConcorrenteDadosView";
import ConcorrentePrecos, { type PrecoConcorrente } from "@/components/marketing/ConcorrentePrecos";
import ConcorrenteLocais, { type LocalConcorrente } from "@/components/marketing/ConcorrenteLocais";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, MapPin, Crosshair, Trash2, Pencil, Building2, Store, Handshake } from "lucide-react";

// Leaflet depende de `window` — carrega só no cliente.
const LocalizacaoMapa = dynamic(() => import("@/components/shared/LocalizacaoMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  ),
});

type Concorrente = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  ativo: boolean;
  latitude: number | null;
  longitude: number | null;
  geoManual: boolean;
  geoReferencia: string | null;
  precos: PrecoConcorrente[];
  [k: string]: any;
};

type Aba = "dados" | "localizacao" | "precos";

export default function ConcorrenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Concorrente | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const [editando, setEditando] = useState(false);
  useTabTitle(data ? (data.nomeFantasia || data.razaoSocial) : null);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/marketing/concorrentes/${id}`);
    if (res.ok) setData((await res.json()).data);
    setLoading(false);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function geocodificar() {
    setGeocoding(true);
    setGeoMsg(null);
    const res = await fetch(`/api/marketing/concorrentes/${id}/geocodificar`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setData((d) => (d ? { ...d, latitude: json.data.latitude, longitude: json.data.longitude, geoManual: false, geoReferencia: null } : d));
      setGeoMsg(`Localizado: ${json.displayName ?? "coordenadas atualizadas"}`);
    } else {
      setGeoMsg(json.error ?? "Não foi possível localizar o endereço.");
    }
    setGeocoding(false);
  }

  async function excluir() {
    if (!confirm("Inativar este concorrente? Ele sai das listas e do mapa, mas o histórico de preços é mantido.")) return;
    await fetch(`/api/marketing/concorrentes/${id}`, { method: "DELETE" });
    router.push("/marketing/inteligencia-comercial");
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!data) {
    return <div className="px-8 py-16 text-center text-muted-foreground">Concorrente não encontrado.</div>;
  }

  const temGeo = data.latitude != null && data.longitude != null;

  const TABS: { key: Aba; label: string }[] = [
    { key: "dados", label: "Dados Cadastrais" },
    { key: "localizacao", label: "Localização" },
    { key: "precos", label: `Preços (${data.precos.length})` },
  ];

  return (
    <div>
      <PageHeader
        title={data.nomeFantasia || data.razaoSocial}
        breadcrumbs={[
          { label: "Marketing" },
          { label: "Inteligência Comercial", href: "/marketing/inteligencia-comercial" },
          { label: data.nomeFantasia || data.razaoSocial },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {data.clienteId && (
              <a
                href={`/clientes/${data.clienteId}`}
                title="Está na nossa base de clientes — atendido por uma empresa do grupo"
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 hover:underline"
              >
                <Handshake className="h-3 w-3" /> Parceiro
              </a>
            )}
            {data.ehFornecedor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"><Building2 className="h-3 w-3" /> Fornecedor</span>
            )}
            {data.ehRevendedor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"><Store className="h-3 w-3" /> Revendedor</span>
            )}
            <span className={cn("text-[11px] font-medium px-2 py-1 rounded-full", data.ativo ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
              {data.ativo ? "Ativo" : "Inativo"}
            </span>
            {aba === "dados" && !editando && (
              <Button variant="outline" onClick={() => setEditando(true)} className="gap-2"><Pencil className="h-4 w-4" /> Editar</Button>
            )}
            <Button variant="outline" onClick={excluir} className="gap-2 text-danger border-danger/30 hover:bg-danger/10">
              <Trash2 className="h-4 w-4" /> Inativar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-10">
        {/* Tab bar (estilo ClienteDetail) */}
        <div className="border-b border-border mb-6">
          <div className="flex gap-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setAba(t.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5",
                  aba === t.key ? "border-blue-600 text-info" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                {t.label}
                {t.key === "localizacao" && temGeo && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", data.geoManual ? "bg-fuchsia-500" : "bg-emerald-500")} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── DADOS CADASTRAIS ──────────────────────────────────────────── */}
        {aba === "dados" && (
          editando ? (
            <ConcorrenteForm
              concorrente={data as any}
              onSaved={() => { setEditando(false); carregar(); }}
              onCancel={() => setEditando(false)}
            />
          ) : (
            <ConcorrenteDadosView c={data as any} />
          )
        )}

        {/* ── LOCALIZAÇÃO ───────────────────────────────────────────────── */}
        {aba === "localizacao" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className={temGeo ? "h-4 w-4 text-emerald-500" : "h-4 w-4 text-muted-foreground/50"} />
                {temGeo ? (
                  <span className="text-muted-foreground">
                    Georreferenciado ({data.latitude!.toFixed(5)}, {data.longitude!.toFixed(5)})
                    {data.geoManual ? " · ajuste manual" : " · automático"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sem localização — preencha o endereço e clique em “Localizar no mapa”, ou ajuste o pino abaixo.</span>
                )}
              </div>
              <Button variant="outline" onClick={geocodificar} disabled={geocoding} className="gap-2 shrink-0">
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                {temGeo ? "Recalcular (automático)" : "Localizar no mapa"}
              </Button>
            </div>
            {geoMsg && <div className="rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">{geoMsg}</div>}

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Local principal (matriz)</p>
            <LocalizacaoMapa
              endpoint={`/api/marketing/concorrentes/${data.id}/localizacao`}
              latitude={data.latitude}
              longitude={data.longitude}
              geoManual={data.geoManual}
              geoReferencia={data.geoReferencia}
              onChange={(lat, lng, manual, referencia) =>
                setData((d) => (d ? { ...d, latitude: lat, longitude: lng, geoManual: manual, geoReferencia: referencia } : d))
              }
            />

            <ConcorrenteLocais concorrenteId={data.id} locaisIniciais={(data.locais as LocalConcorrente[]) ?? []} />
          </div>
        )}

        {/* ── PREÇOS ────────────────────────────────────────────────────── */}
        {aba === "precos" && <ConcorrentePrecos concorrenteId={data.id} precosIniciais={data.precos} />}
      </div>
    </div>
  );
}
