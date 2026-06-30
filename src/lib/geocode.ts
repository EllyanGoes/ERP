// Geocodificação de endereço → lat/lng usando o Nominatim (OpenStreetMap).
// Gratuito e sem chave de API. Uso server-side apenas (respeita a política de
// uso do Nominatim: User-Agent identificável, sem abuso).
//
// Estratégia: tenta do mais específico ao mais genérico (endereço completo →
// cidade/UF → CEP → texto livre). Assim, mesmo um cadastro só com cidade cai
// no centroide do município em vez de ficar sem ponto no mapa.
//
// Doc: https://nominatim.org/release-docs/develop/api/Search/

export type EnderecoParaGeocode = {
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
};

export type GeocodeResultado = {
  latitude: number;
  longitude: number;
  displayName: string;
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const HEADERS = {
  "User-Agent": "ERP-Tramontin/1.0 (inteligencia-comercial)",
  "Accept-Language": "pt-BR",
};

function limpo(v?: string | null): string {
  return (v ?? "").trim();
}

async function consultar(params: Record<string, string>): Promise<GeocodeResultado | null> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url.toString(), { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { latitude: lat, longitude: lon, displayName: data[0].display_name };
  } catch {
    return null;
  }
}

// Fallback: Photon (komoot), também baseado em OSM e sem chave. Útil quando o
// Nominatim bloqueia/limita requisições vindas de IPs de datacenter (Vercel).
async function consultarPhoton(q: string): Promise<GeocodeResultado | null> {
  if (!q) return null;
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "default");
  try {
    const res = await fetch(url.toString(), { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }> };
    const f = data.features?.[0];
    const coords = f?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lon, lat] = coords; // GeoJSON: [lon, lat]
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    const p = f?.properties ?? {};
    const nome = [p.name, p.city, p.state, p.country].filter(Boolean).join(", ");
    return { latitude: lat, longitude: lon, displayName: nome || q };
  } catch {
    return null;
  }
}

/**
 * Geocodifica um endereço, tentando do mais preciso ao mais genérico. Retorna
 * null só quando não há dados suficientes nem o município é encontrável.
 * Nunca lança (best-effort).
 */
export async function geocodificarEndereco(
  e: EnderecoParaGeocode,
): Promise<GeocodeResultado | null> {
  const logradouro = limpo(e.logradouro);
  const numero = limpo(e.numero);
  const cidade = limpo(e.cidade);
  const estado = limpo(e.estado);
  const cep = limpo(e.cep).replace(/\D/g, "");

  // Sem cidade nem CEP não dá para localizar de forma confiável.
  if (!cidade && cep.length < 8) return null;

  const tentativas: Array<Record<string, string>> = [];

  // 1) Endereço completo (estruturado) — rua + cidade + UF + CEP.
  if (logradouro && cidade) {
    tentativas.push({
      street: [numero, logradouro].filter(Boolean).join(" "),
      city: cidade,
      state: estado,
      postalcode: cep.length === 8 ? cep : "",
      country: "Brasil",
    });
  }

  // 2) CEP isolado (no Brasil costuma cair no bairro/rua certos).
  if (cep.length === 8) {
    tentativas.push({ postalcode: cep, country: "Brasil" });
  }

  // 3) Cidade + UF (centroide do município).
  if (cidade) {
    tentativas.push({ city: cidade, state: estado, country: "Brasil" });
  }

  // 4) Texto livre com tudo o que houver (último recurso).
  const livre = [
    [logradouro, numero].filter(Boolean).join(", "),
    cidade,
    estado,
    "Brasil",
  ].filter((p) => limpo(p).length > 0).join(", ");
  if (livre) tentativas.push({ q: livre });

  for (const params of tentativas) {
    const r = await consultar(params);
    if (r) return r;
  }

  // Fallback final: Photon (caso o Nominatim esteja bloqueado/limitado).
  const queriesPhoton = [
    livre,
    [cidade, estado, "Brasil"].filter((p) => limpo(p).length > 0).join(", "),
  ].filter(Boolean);
  for (const q of queriesPhoton) {
    const r = await consultarPhoton(q);
    if (r) return r;
  }
  return null;
}

// ── Reverse geocoding (coords → endereço) ───────────────────────────────────
export type EnderecoReverso = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null; // UF (2 letras)
};

const NOME_UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapá: "AP", amapa: "AP", amazonas: "AM", bahia: "BA",
  ceará: "CE", ceara: "CE", "distrito federal": "DF", "espírito santo": "ES", "espirito santo": "ES",
  goiás: "GO", goias: "GO", maranhão: "MA", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", pará: "PA", para: "PA", paraíba: "PB", paraiba: "PB", paraná: "PR", parana: "PR",
  pernambuco: "PE", piauí: "PI", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  "rio grande do sul": "RS", rondônia: "RO", rondonia: "RO", roraima: "RR", "santa catarina": "SC",
  "são paulo": "SP", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
function paraUF(v?: string | null): string | null {
  const s = limpo(v);
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return NOME_UF[s.toLowerCase()] ?? null;
}

/**
 * Coordenadas → endereço (CEP, logradouro, bairro, cidade, UF). Best-effort,
 * Nominatim reverse com fallback Photon. Server-side. Nunca lança.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<EnderecoReverso | null> {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  // 1) Nominatim reverse (mais rico em endereço estruturado no Brasil).
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    const res = await fetch(url.toString(), { headers: HEADERS, cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { address?: Record<string, string> };
      const a = j.address;
      if (a) {
        const uf = paraUF(a["ISO3166-2-lvl4"]?.split("-")[1] ?? a.state);
        return {
          cep: a.postcode ?? null,
          logradouro: a.road ?? a.pedestrian ?? null,
          numero: a.house_number ?? null,
          bairro: a.suburb ?? a.neighbourhood ?? a.quarter ?? null,
          cidade: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
          estado: uf,
        };
      }
    }
  } catch { /* tenta o fallback */ }

  // 2) Photon reverse (quando o Nominatim limita IP de datacenter).
  try {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    const res = await fetch(url.toString(), { headers: HEADERS, cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { features?: Array<{ properties?: Record<string, string> }> };
      const p = j.features?.[0]?.properties;
      if (p) {
        return {
          cep: p.postcode ?? null,
          logradouro: p.street ?? p.name ?? null,
          numero: p.housenumber ?? null,
          bairro: p.district ?? null,
          cidade: p.city ?? p.county ?? null,
          estado: paraUF(p.state),
        };
      }
    }
  } catch { /* desiste */ }

  return null;
}
