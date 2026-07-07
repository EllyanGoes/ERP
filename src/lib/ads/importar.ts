import { prismaSemEscopo } from "@/lib/prisma";
import { intervaloDiaSP } from "@/lib/tracking/agrega";
import { Prisma } from "@prisma/client";

// ── Importação de métricas das plataformas de anúncios (Marketing F5) ────────
// Lê as credenciais salvas em Configuracao (tela Configurações → Integrações →
// Plataformas de Anúncios) e, para cada plataforma configurada, busca as
// campanhas ativas com idExterno preenchido e importa spend/impressões/cliques
// do dia em MetricaCampanhaDiaria (upsert por campanhaId+data; `bruto` guarda o
// payload cru p/ auditoria). Cada plataforma roda em try/catch independente —
// uma falhar não derruba as outras. Conversões ficam 0 na v1: cada plataforma
// define "conversão" de um jeito (e exige configuração de eventos); melhor não
// inventar número — o funil usa os leads do próprio ERP.

const TIMEOUT_MS = 30_000;

const CHAVES_ADS = [
  "ads_meta_access_token",
  "ads_meta_ad_account_id",
  "ads_google_developer_token",
  "ads_google_client_id",
  "ads_google_client_secret",
  "ads_google_refresh_token",
  "ads_google_customer_id",
  "ads_tiktok_access_token",
  "ads_tiktok_advertiser_id",
] as const;

export type ResultadoImportacao = {
  plataforma: "META" | "GOOGLE" | "TIKTOK";
  /** Campanhas com métrica gravada no dia. */
  campanhas: number;
  erros: string[];
};

type CampanhaAds = { id: string; idExterno: string };

type Metrica = {
  spend: number;
  impressoes: number;
  cliques: number;
  bruto: unknown;
};

/** Trunca mensagens de erro de API (nunca inclui credenciais). */
function resumoErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 300);
}

/** Upsert da métrica do dia (unique campanhaId+data). */
async function gravarMetrica(campanhaId: string, dataMetrica: Date, m: Metrica) {
  const dados = {
    spend: new Prisma.Decimal(m.spend.toFixed(2)),
    impressoes: m.impressoes,
    cliques: m.cliques,
    conversoes: 0, // v1: sem conversões da plataforma (ver comentário no topo)
    bruto: m.bruto as Prisma.InputJsonValue,
  };
  await prismaSemEscopo.metricaCampanhaDiaria.upsert({
    where: { campanhaId_data: { campanhaId, data: dataMetrica } },
    update: dados,
    create: { campanhaId, data: dataMetrica, ...dados },
  });
}

/** Campanhas ativas da plataforma com id externo preenchido. */
async function campanhasDaPlataforma(plataforma: string): Promise<CampanhaAds[]> {
  const campanhas = await prismaSemEscopo.campanha.findMany({
    where: { ativo: true, plataforma, idExterno: { not: null } },
    select: { id: true, idExterno: true },
  });
  return campanhas
    .filter((c): c is { id: string; idExterno: string } => !!c.idExterno?.trim())
    .map((c) => ({ id: c.id, idExterno: c.idExterno.trim() }));
}

// ── Meta (Graph API) ──────────────────────────────────────────────────────────

async function importarMeta(
  cfg: Record<string, string>,
  dia: string,
  dataMetrica: Date,
): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = { plataforma: "META", campanhas: 0, erros: [] };
  const campanhas = await campanhasDaPlataforma("META");

  // Uma chamada de insights por campanha (nível campanha, dia único).
  for (const c of campanhas) {
    try {
      const params = new URLSearchParams({
        fields: "spend,impressions,clicks",
        time_range: JSON.stringify({ since: dia, until: dia }),
        access_token: cfg.ads_meta_access_token,
      });
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(c.idExterno)}/insights?${params}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const json = (await res.json()) as {
        data?: { spend?: string; impressions?: string; clicks?: string }[];
        error?: { message?: string; code?: number };
      };
      if (!res.ok || json.error) {
        resultado.erros.push(
          `Campanha ${c.idExterno}: ${json.error?.message ?? `HTTP ${res.status}`}`.slice(0, 300),
        );
        continue;
      }
      const linha = json.data?.[0];
      if (!linha) continue; // sem entrega no dia — nada a gravar
      await gravarMetrica(c.id, dataMetrica, {
        spend: Number(linha.spend ?? 0),
        impressoes: Number(linha.impressions ?? 0),
        cliques: Number(linha.clicks ?? 0),
        bruto: linha,
      });
      resultado.campanhas++;
    } catch (e) {
      resultado.erros.push(`Campanha ${c.idExterno}: ${resumoErro(e)}`);
    }
  }
  return resultado;
}

// ── Google Ads (REST) ─────────────────────────────────────────────────────────

/** Troca o refresh token por um access token OAuth. */
async function tokenGoogle(cfg: Record<string, string>): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.ads_google_client_id,
      client_secret: cfg.ads_google_client_secret,
      refresh_token: cfg.ads_google_refresh_token,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth falhou (${json.error ?? `HTTP ${res.status}`})`);
  }
  return json.access_token;
}

async function importarGoogle(
  cfg: Record<string, string>,
  dia: string,
  dataMetrica: Date,
): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = { plataforma: "GOOGLE", campanhas: 0, erros: [] };
  const campanhas = await campanhasDaPlataforma("GOOGLE");
  if (campanhas.length === 0) return resultado;

  const accessToken = await tokenGoogle(cfg);

  // Uma query GAQL só, filtrando pelos ids das campanhas cadastradas.
  // Ids do Google são numéricos — descarta valores inválidos p/ não quebrar a query.
  const validas = campanhas.filter((c) => /^\d+$/.test(c.idExterno));
  for (const c of campanhas) {
    if (!validas.includes(c)) resultado.erros.push(`Campanha ${c.idExterno}: id externo não numérico`);
  }
  if (validas.length === 0) return resultado;

  const query =
    `SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks ` +
    `FROM campaign WHERE segments.date = '${dia}' ` +
    `AND campaign.id IN (${validas.map((c) => c.idExterno).join(",")})`;

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${encodeURIComponent(cfg.ads_google_customer_id)}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "developer-token": cfg.ads_google_developer_token,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    // Corpo de erro do Google não ecoa credenciais; ainda assim truncamos.
    const corpo = await res.text().catch(() => "");
    throw new Error(`searchStream HTTP ${res.status}: ${corpo.slice(0, 200)}`);
  }

  // searchStream devolve um array de chunks, cada um com `results`.
  type LinhaGoogle = {
    campaign?: { id?: string };
    metrics?: { costMicros?: string; impressions?: string; clicks?: string };
  };
  const chunks = (await res.json()) as { results?: LinhaGoogle[] }[];
  const porIdExterno = new Map<string, LinhaGoogle>();
  for (const chunk of chunks) {
    for (const linha of chunk.results ?? []) {
      if (linha.campaign?.id) porIdExterno.set(String(linha.campaign.id), linha);
    }
  }

  for (const c of validas) {
    const linha = porIdExterno.get(c.idExterno);
    if (!linha) continue; // sem entrega no dia
    try {
      await gravarMetrica(c.id, dataMetrica, {
        spend: Number(linha.metrics?.costMicros ?? 0) / 1e6, // cost_micros → moeda
        impressoes: Number(linha.metrics?.impressions ?? 0),
        cliques: Number(linha.metrics?.clicks ?? 0),
        bruto: linha,
      });
      resultado.campanhas++;
    } catch (e) {
      resultado.erros.push(`Campanha ${c.idExterno}: ${resumoErro(e)}`);
    }
  }
  return resultado;
}

// ── TikTok (Business API) ─────────────────────────────────────────────────────

async function importarTikTok(
  cfg: Record<string, string>,
  dia: string,
  dataMetrica: Date,
): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = { plataforma: "TIKTOK", campanhas: 0, erros: [] };
  const campanhas = await campanhasDaPlataforma("TIKTOK");
  if (campanhas.length === 0) return resultado;

  const params = new URLSearchParams({
    advertiser_id: cfg.ads_tiktok_advertiser_id,
    report_type: "BASIC",
    dimensions: JSON.stringify(["campaign_id"]),
    data_level: "AUCTION_CAMPAIGN",
    metrics: JSON.stringify(["spend", "impressions", "clicks"]),
    start_date: dia,
    end_date: dia,
    filtering: JSON.stringify([
      { field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify(campanhas.map((c) => c.idExterno)) },
    ]),
    page_size: "200",
  });
  const res = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`,
    {
      headers: { "Access-Token": cfg.ads_tiktok_access_token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  type LinhaTikTok = {
    dimensions?: { campaign_id?: string };
    metrics?: { spend?: string; impressions?: string; clicks?: string };
  };
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { list?: LinhaTikTok[] };
  };
  // TikTok devolve HTTP 200 com code != 0 em erro de negócio.
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(`report HTTP ${res.status} code ${json.code}: ${(json.message ?? "").slice(0, 200)}`);
  }

  const porIdExterno = new Map<string, LinhaTikTok>();
  for (const linha of json.data?.list ?? []) {
    if (linha.dimensions?.campaign_id) porIdExterno.set(String(linha.dimensions.campaign_id), linha);
  }

  for (const c of campanhas) {
    const linha = porIdExterno.get(c.idExterno);
    if (!linha) continue; // sem entrega no dia
    try {
      await gravarMetrica(c.id, dataMetrica, {
        spend: Number(linha.metrics?.spend ?? 0),
        impressoes: Number(linha.metrics?.impressions ?? 0),
        cliques: Number(linha.metrics?.clicks ?? 0),
        bruto: linha,
      });
      resultado.campanhas++;
    } catch (e) {
      resultado.erros.push(`Campanha ${c.idExterno}: ${resumoErro(e)}`);
    }
  }
  return resultado;
}

// ── Orquestração ──────────────────────────────────────────────────────────────

/**
 * Importa as métricas de anúncios do dia civil SP que contém o instante dado.
 * Só roda as plataformas com a credencial mínima configurada; cada uma em
 * try/catch independente. Erros nunca incluem as credenciais.
 */
export async function importarMetricasAds(dia: Date): Promise<ResultadoImportacao[]> {
  const { dia: diaStr, dataMetrica } = intervaloDiaSP(dia);

  const records = await prismaSemEscopo.configuracao.findMany({
    where: { chave: { in: [...CHAVES_ADS] } },
  });
  const cfg: Record<string, string> = {};
  for (const r of records) if (r.valor) cfg[r.chave] = r.valor;

  const resultados: ResultadoImportacao[] = [];

  if (cfg.ads_meta_access_token && cfg.ads_meta_ad_account_id) {
    try {
      resultados.push(await importarMeta(cfg, diaStr, dataMetrica));
    } catch (e) {
      resultados.push({ plataforma: "META", campanhas: 0, erros: [resumoErro(e)] });
    }
  }

  if (cfg.ads_google_developer_token && cfg.ads_google_refresh_token && cfg.ads_google_customer_id) {
    try {
      resultados.push(await importarGoogle(cfg, diaStr, dataMetrica));
    } catch (e) {
      resultados.push({ plataforma: "GOOGLE", campanhas: 0, erros: [resumoErro(e)] });
    }
  }

  if (cfg.ads_tiktok_access_token && cfg.ads_tiktok_advertiser_id) {
    try {
      resultados.push(await importarTikTok(cfg, diaStr, dataMetrica));
    } catch (e) {
      resultados.push({ plataforma: "TIKTOK", campanhas: 0, erros: [resumoErro(e)] });
    }
  }

  return resultados;
}
