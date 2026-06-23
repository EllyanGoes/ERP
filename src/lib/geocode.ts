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
  return null;
}
