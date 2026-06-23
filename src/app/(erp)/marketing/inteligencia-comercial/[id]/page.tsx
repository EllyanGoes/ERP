"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import ConcorrenteForm from "@/components/marketing/ConcorrenteForm";
import ConcorrentePrecos, { type PrecoConcorrente } from "@/components/marketing/ConcorrentePrecos";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, MapPin, Crosshair, Trash2, FileText, Map as MapIcon, Tag } from "lucide-react";

// Leaflet depende de `window` — carrega só no cliente.
const ConcorrenteLocalizacao = dynamic(() => import("@/components/marketing/ConcorrenteLocalizacao"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  ),
});

type Concorrente = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  geoManual: boolean;
  geoReferencia: string | null;
  precos: PrecoConcorrente[];
  [k: string]: any;
};

export default function ConcorrenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Concorrente | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [aba, setAba] = useState("dados");

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={excluir} className="gap-2 text-danger border-danger/30 hover:bg-danger/10">
              <Trash2 className="h-4 w-4" /> Inativar
            </Button>
          </div>
        }
      />

      <div className="px-8 pb-10">
        <Tabs value={aba} onValueChange={(v) => setAba(v as string)} className="gap-6">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="dados" className="gap-1.5"><FileText className="h-4 w-4" /> Dados cadastrais</TabsTrigger>
            <TabsTrigger value="localizacao" className="gap-1.5">
              <MapIcon className="h-4 w-4" /> Localização
              {temGeo && <span className={`ml-1 h-1.5 w-1.5 rounded-full ${data.geoManual ? "bg-fuchsia-500" : "bg-emerald-500"}`} />}
            </TabsTrigger>
            <TabsTrigger value="precos" className="gap-1.5"><Tag className="h-4 w-4" /> Preços ({data.precos.length})</TabsTrigger>
          </TabsList>

          {/* ── Dados cadastrais ──────────────────────────────────────────── */}
          <TabsContent value="dados">
            <ConcorrenteForm concorrente={data as any} />
          </TabsContent>

          {/* ── Localização ───────────────────────────────────────────────── */}
          <TabsContent value="localizacao" className="space-y-5">
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

            <ConcorrenteLocalizacao
              concorrenteId={data.id}
              latitude={data.latitude}
              longitude={data.longitude}
              geoManual={data.geoManual}
              geoReferencia={data.geoReferencia}
              onChange={(lat, lng, manual, referencia) =>
                setData((d) => (d ? { ...d, latitude: lat, longitude: lng, geoManual: manual, geoReferencia: referencia } : d))
              }
            />
          </TabsContent>

          {/* ── Preços ────────────────────────────────────────────────────── */}
          <TabsContent value="precos">
            <ConcorrentePrecos concorrenteId={data.id} precosIniciais={data.precos} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
