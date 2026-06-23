// Geocodificação de endereço → lat/lng usando o Nominatim (OpenStreetMap).
// Gratuito e sem chave de API. Uso server-side apenas (respeita a política de
// uso do Nominatim: User-Agent identificável, 1 req/s, sem abuso).
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

function montarConsulta(e: EnderecoParaGeocode): string {
  const partes = [
    [e.logradouro, e.numero].filter(Boolean).join(", "),
    e.bairro,
    e.cidade,
    e.estado,
    e.cep,
    "Brasil",
  ].filter((p) => p && String(p).trim().length > 0);
  return partes.join(", ");
}

/**
 * Geocodifica um endereço. Retorna null quando não há dados suficientes ou o
 * serviço não encontra correspondência — nunca lança (best-effort).
 */
export async function geocodificarEndereco(
  e: EnderecoParaGeocode,
): Promise<GeocodeResultado | null> {
  const q = montarConsulta(e);
  // Sem cidade nem CEP não vale a pena consultar.
  if (!e.cidade && !e.cep) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "0");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "ERP-Tramontin/1.0 (inteligencia-comercial)",
        "Accept-Language": "pt-BR",
      },
      // Não cachear no Next — endereços mudam pouco mas a consulta é pontual.
      cache: "no-store",
    });
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
