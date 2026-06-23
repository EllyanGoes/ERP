"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import { Building2, Store, Handshake, Loader2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

type Ponto = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  ehFornecedor: boolean;
  ehRevendedor: boolean;
  clienteId: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number;
  longitude: number;
  _count: { precos: number };
};

// Parceiro = está na nossa base de clientes (clienteId vinculado).
function ehParceiro(p: Ponto): boolean {
  return !!p.clienteId;
}

// Cor por categoria: fornecedor=âmbar, ambos=violeta, revendedor parceiro=verde,
// revendedor (não parceiro)=azul.
function corDe(p: Ponto): string {
  if (p.ehFornecedor && p.ehRevendedor) return "#8b5cf6";
  if (p.ehFornecedor) return "#f59e0b";
  if (p.ehRevendedor && ehParceiro(p)) return "#10b981";
  return "#3b82f6";
}

const CENTRO_BRASIL: [number, number] = [-15.78, -47.93];

export default function ConcorrentesMap() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketing/concorrentes/geo")
      .then((r) => r.json())
      .then((j) => setPontos(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const centro = useMemo<[number, number]>(() => {
    if (pontos.length === 0) return CENTRO_BRASIL;
    const lat = pontos.reduce((s, p) => s + p.latitude, 0) / pontos.length;
    const lng = pontos.reduce((s, p) => s + p.longitude, 0) / pontos.length;
    return [lat, lng];
  }, [pontos]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={centro} zoom={pontos.length ? 9 : 4} scrollWheelZoom className="h-full w-full rounded-xl z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pontos.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={9}
            pathOptions={{ color: corDe(p), fillColor: corDe(p), fillOpacity: 0.7, weight: 2 }}
          >
            <Tooltip>{p.nomeFantasia || p.razaoSocial}</Tooltip>
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold text-sm">{p.nomeFantasia || p.razaoSocial}</p>
                <p className="text-xs text-gray-600">{[p.cidade, p.estado].filter(Boolean).join("/") || "—"}</p>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {p.ehFornecedor && <span className="inline-flex items-center gap-0.5 text-amber-700">Fornecedor</span>}
                  {p.ehFornecedor && p.ehRevendedor && <span>·</span>}
                  {p.ehRevendedor && <span className="inline-flex items-center gap-0.5 text-blue-700">Revendedor</span>}
                  {ehParceiro(p) && <span className="inline-flex items-center gap-0.5 text-emerald-700">· Parceiro</span>}
                </div>
                <p className="text-xs text-gray-600">{p._count.precos} preço(s) mapeado(s)</p>
                <Link href={`/marketing/inteligencia-comercial/${p.id}`} className="text-xs text-blue-600 font-medium">Abrir cadastro →</Link>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legenda */}
      <div className="absolute bottom-4 right-4 z-[400] bg-card/95 backdrop-blur border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-foreground mb-1">Legenda</p>
        <div className="flex items-center gap-2 text-muted-foreground"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#f59e0b" }} /> <Building2 className="h-3 w-3" /> Fornecedor</div>
        <div className="flex items-center gap-2 text-muted-foreground"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#3b82f6" }} /> <Store className="h-3 w-3" /> Revendedor</div>
        <div className="flex items-center gap-2 text-muted-foreground"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#10b981" }} /> <Handshake className="h-3 w-3" /> Revendedor parceiro</div>
        <div className="flex items-center gap-2 text-muted-foreground"><span className="inline-block h-3 w-3 rounded-full" style={{ background: "#8b5cf6" }} /> Ambos</div>
      </div>

      {pontos.length === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="bg-card/95 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground shadow pointer-events-auto">
            Nenhum concorrente georreferenciado ainda. Cadastre o endereço e use “Localizar no mapa”.
          </div>
        </div>
      )}
    </div>
  );
}
