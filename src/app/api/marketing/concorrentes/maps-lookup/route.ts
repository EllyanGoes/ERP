export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireModulo } from "@/lib/permissions";
import { reverseGeocode } from "@/lib/geocode";

// "Puxar do Google Maps": recebe uma URL do Google Maps (ou "lat, lng") e
// devolve nome (quando vem no link) + endereço (reverse geocoding das coords).
// Dados oficiais do Google (Places API) são pagos; aqui usamos só o que dá p/
// extrair do link + reverse pelo OSM (Nominatim/Photon).

function extrair(input: string): { nome: string | null; lat: number; lng: number } | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  // Coordenadas: @lat,lng  |  !3dlat!4dlng  |  "lat, lng"
  let lat: number | null = null, lng: number | null = null;
  const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const d3 = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const pair = s.match(/(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)/);
  if (d3) { lat = parseFloat(d3[1]); lng = parseFloat(d3[2]); }
  else if (at) { lat = parseFloat(at[1]); lng = parseFloat(at[2]); }
  else if (pair) { lat = parseFloat(pair[1]); lng = parseFloat(pair[2]); }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  // Nome: /maps/place/<Nome>/...  (decodifica e troca + por espaço)
  let nome: string | null = null;
  const place = s.match(/\/maps\/place\/([^/@]+)/);
  if (place) {
    try { nome = decodeURIComponent(place[1].replace(/\+/g, " ")).trim() || null; } catch { nome = place[1].replace(/\+/g, " "); }
    if (nome && /^-?\d+\.\d+,/.test(nome)) nome = null; // era só coordenada
  }
  return { nome, lat, lng };
}

export async function POST(req: NextRequest) {
  const auth = await requireModulo("marketing");
  if (!auth.ok) return auth.response;

  const { url } = await req.json().catch(() => ({ url: "" }));
  const ex = extrair(String(url ?? ""));
  if (!ex) {
    return NextResponse.json({ error: "Não reconheci coordenadas no link. Cole a URL do Google Maps (com @lat,lng) ou 'lat, lng'." }, { status: 400 });
  }

  const endereco = await reverseGeocode(ex.lat, ex.lng);
  return NextResponse.json({
    data: {
      nome: ex.nome,
      latitude: ex.lat,
      longitude: ex.lng,
      ...(endereco ?? { cep: null, logradouro: null, numero: null, bairro: null, cidade: null, estado: null }),
    },
  });
}
