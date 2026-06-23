"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardPaste, Hand } from "lucide-react";

// Pino em SVG (divIcon) — evita o problema dos ícones default do Leaflet.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#7c3aed" stroke="white" stroke-width="1.4" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-6-5.686-6-10a6 6 0 1112 0c0 4.314-6 10-6 10z"/><circle cx="12" cy="11" r="2.3" fill="white"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const CENTRO_BRASIL: [number, number] = [-15.78, -47.93];

/** Aceita "lat, lng", "lat lng" ou uma URL do Google Maps (@lat,lng ou !3d!4d). */
export function parseCoords(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const d3 = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (d3) return { lat: parseFloat(d3[1]), lng: parseFloat(d3[2]) };
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  }
  return null;
}

function Recenter({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, Math.max(map.getZoom(), 15));
  }, [pos, map]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function ConcorrenteLocalizacao({
  concorrenteId,
  latitude,
  longitude,
  geoManual,
  geoReferencia,
  onChange,
}: {
  concorrenteId: string;
  latitude: number | null;
  longitude: number | null;
  geoManual: boolean;
  geoReferencia?: string | null;
  onChange?: (lat: number, lng: number, manual: boolean, referencia: string) => void;
}) {
  const [pos, setPos] = useState<[number, number] | null>(
    latitude != null && longitude != null ? [latitude, longitude] : null,
  );
  const [manual, setManual] = useState(geoManual);
  // Mantém visível a referência salva (URL do Google ou "lat, lng").
  const [paste, setPaste] = useState(
    geoReferencia ?? (latitude != null && longitude != null ? `${latitude}, ${longitude}` : ""),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function salvar(lat: number, lng: number, referencia: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/marketing/concorrentes/${concorrenteId}/localizacao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, referencia }),
      });
      if (res.ok) {
        setPos([lat, lng]);
        setManual(true);
        setPaste(referencia);
        setMsg("Localização salva (ajuste manual).");
        onChange?.(lat, lng, true, referencia);
      } else {
        setMsg("Erro ao salvar a localização.");
      }
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  function aplicarColado() {
    const c = parseCoords(paste);
    if (!c) {
      setMsg('Não reconheci as coordenadas. Cole no formato "lat, lng" ou a URL do Google Maps.');
      return;
    }
    // Mantém a URL salva quando o usuário colou um link; senão salva as coords.
    salvar(c.lat, c.lng, paste.trim());
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm text-foreground uppercase tracking-wide">Localização precisa</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Arraste o pino ou clique no mapa para o ponto exato.</p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${manual ? "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400" : "bg-muted-foreground/10 text-muted-foreground"}`}>
          {manual ? "Ajuste manual" : "Automático"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Colar coordenadas do Google Maps */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <ClipboardPaste className="h-3 w-3" /> Colar do Google Maps
            </label>
            <Input
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarColado(); } }}
              placeholder="Ex.: 0.040751, -51.048017 — ou cole a URL do Google Maps"
              className="h-10 border-border"
            />
          </div>
          <Button type="button" onClick={aplicarColado} disabled={saving || !paste.trim()} className="h-10">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
          </Button>
        </div>

        <div className="h-[320px] rounded-lg overflow-hidden border border-border">
          <MapContainer center={pos ?? CENTRO_BRASIL} zoom={pos ? 15 : 4} scrollWheelZoom className="h-full w-full z-0">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter pos={pos} />
            <ClickHandler onPick={(lat, lng) => salvar(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`)} />
            {pos && (
              <Marker
                position={pos}
                draggable
                icon={pinIcon}
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    salvar(ll.lat, ll.lng, `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`);
                  },
                }}
              />
            )}
          </MapContainer>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Hand className="h-3 w-3" />
            {pos ? `${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}` : "Clique no mapa ou cole as coordenadas para posicionar."}
          </p>
          {msg && <p className="text-[11px] text-muted-foreground">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
