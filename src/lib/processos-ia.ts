// IA do módulo de Processos (docs/processos-prd.md, Fase 1.5). Mesmo padrão de src/lib/folha.ts:
// SDK oficial, chave em ANTHROPIC_API_KEY. Tudo best-effort: sem chave ou com erro devolve null
// e quem chamou segue sem a IA (a captura/cadastro nunca quebra por causa dela).
import Anthropic from "@anthropic-ai/sdk";

/** Resumo de andamento (curto e barato). */
export const MODELO_RESUMO = "claude-haiku-5-5";
/** Leitura de documento (auto de infração, intimação…): precisa entender PDF. */
export const MODELO_DOCUMENTO = "claude-sonnet-5-5";
/** Recusa por política no Sonnet 5.5 → a API refaz no Sonnet 5 dentro da mesma chamada. */
const FALLBACK_DOCUMENTO = "claude-sonnet-5";

export const iaDisponivel = () => !!process.env.ANTHROPIC_API_KEY;
const cliente = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const textoDe = (content: { type: string }[]) => content.map((c) => (c.type === "text" ? (c as unknown as { text: string }).text : "")).join("\n").trim();

export type MovimentoParaResumo = { nome: string; complementos: string[]; data: string };
export type ContextoProcesso = { titulo: string; tipo: string; classe?: string | null; orgao?: string | null; polo?: string | null };

const PROMPT_RESUMO = `Você explica andamentos de processos judiciais para o dono de uma empresa, que não é advogado.
Escreva 1 ou 2 frases curtas em português simples dizendo o que aconteceu e se há algo a fazer.
Regras:
- Não invente prazos, valores, datas ou resultados. Só cite prazo se ele estiver escrito nos dados do movimento; se não estiver, não fale de prazo.
- Se o movimento não permite saber se é bom ou ruim para a empresa, não opine.
- Quando fizer sentido, sugira falar com o advogado. Sem jargão; se usar um termo técnico, explique entre parênteses.
- Responda só com o resumo, sem título nem aspas.`;

/** Resumo em linguagem simples de UM movimento importante. null se a IA não estiver disponível ou falhar. */
export async function resumirMovimento(proc: ContextoProcesso, mov: MovimentoParaResumo): Promise<string | null> {
  if (!iaDisponivel()) return null;
  try {
    const dados = [
      `Processo: ${proc.titulo} (${proc.tipo}${proc.classe ? `, classe ${proc.classe}` : ""})`,
      proc.orgao ? `Órgão: ${proc.orgao}` : "",
      proc.polo ? `A empresa é: ${proc.polo.toLowerCase()}` : "",
      `Data do movimento: ${mov.data}`,
      `Movimento (nome técnico do tribunal): ${mov.nome}`,
      mov.complementos.length ? `Complementos: ${mov.complementos.join("; ")}` : "",
    ].filter(Boolean).join("\n");
    const r = await cliente().messages.create({
      model: MODELO_RESUMO,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: PROMPT_RESUMO,
      messages: [{ role: "user", content: dados }],
    });
    if (r.stop_reason === "refusal") return null;
    const t = textoDe(r.content);
    return t ? t.slice(0, 600) : null;
  } catch (e) {
    console.warn("[processos-ia] resumo falhou (segue sem resumo):", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Item 2: documento → processo ─────────────────────────────────────────────
export type ExtracaoDocumento = {
  tipoSugerido: string | null; // TIPOS_PROCESSO
  tipoDocumento: string | null; // "Auto de infração", "Intimação"…
  titulo: string | null;
  orgao: string | null;
  esfera: string | null; // MUNICIPAL | ESTADUAL | FEDERAL | JUDICIAL
  numero: string | null;
  dataCiencia: string | null; // AAAA-MM-DD
  valor: number | null;
  assunto: string | null;
  partes: { papel: string; nome: string; documento: string | null }[];
  prazo: { descricao: string; dias: number; diasUteis: boolean; trecho: string | null } | null;
  resumo: string | null;
};

const nullable = (t: string) => ({ type: [t, "null"] });
const SCHEMA_DOC = {
  type: "object",
  additionalProperties: false,
  required: ["tipoSugerido", "tipoDocumento", "titulo", "orgao", "esfera", "numero", "dataCiencia", "valor", "assunto", "partes", "prazo", "resumo"],
  properties: {
    tipoSugerido: { type: ["string", "null"], enum: ["FUNDIARIO", "AMBIENTAL", "ADMINISTRATIVO", "FISCAL", "JUDICIAL", "TRABALHISTA", "OUTRO", null] },
    tipoDocumento: nullable("string"),
    titulo: nullable("string"),
    orgao: nullable("string"),
    esfera: { type: ["string", "null"], enum: ["MUNICIPAL", "ESTADUAL", "FEDERAL", "JUDICIAL", null] },
    numero: nullable("string"),
    dataCiencia: nullable("string"),
    valor: nullable("number"),
    assunto: nullable("string"),
    partes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["papel", "nome", "documento"],
        properties: { papel: { type: "string", enum: ["ORGAO", "AUTOR", "REU", "ADVOGADO", "PERITO", "DESPACHANTE", "TECNICO", "OUTRO"] }, nome: { type: "string" }, documento: nullable("string") },
      },
    },
    prazo: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false, required: ["descricao", "dias", "diasUteis", "trecho"],
          properties: { descricao: { type: "string" }, dias: { type: "integer" }, diasUteis: { type: "boolean" }, trecho: nullable("string") },
        },
      ],
    },
    resumo: nullable("string"),
  },
};

const PROMPT_DOC = `Este PDF foi recebido por uma empresa (auto de infração, notificação, intimação, citação ou ofício).
Extraia os dados para cadastrar o processo no sistema da empresa. Regras:
- Use apenas o que está escrito no documento. Campo que não aparece → null. Não deduza número, valor, data ou prazo.
- tipoSugerido: FISCAL (SEFAZ/Receita/prefeitura cobrando tributo), TRABALHISTA (MTE/fiscalização do trabalho), JUDICIAL (qualquer vara/tribunal), AMBIENTAL, FUNDIARIO (terras/imóvel), ADMINISTRATIVO (demais órgãos), OUTRO.
- titulo: curto, ex.: "Auto de infração ICMS nº 123/2026 — SEFAZ-AP".
- orgao: nome do órgão, vara ou tribunal que emitiu.
- numero: número do processo ou do auto, como escrito (se for judicial, o número CNJ).
- dataCiencia: data em que a empresa recebeu/tomou ciência (AR, assinatura, data de recebimento); se não houver, null. Formato AAAA-MM-DD.
- valor: valor total em discussão (multa + tributo, ou valor da causa), em reais, número sem formatação.
- partes: órgão autuante, autor, réu, advogados e peritos que aparecem nominalmente.
- prazo: só se o documento disser o prazo para defesa, impugnação, manifestação ou pagamento. dias = número de dias; diasUteis = true só se o texto disser "dias úteis" (ou se for processo judicial cível/trabalhista contado pelo CPC/CLT e o texto não disser o contrário); trecho = a frase exata do documento que fixa o prazo.
- resumo: 1–2 frases em português simples dizendo o que o documento pede da empresa.`;

/** Lê o PDF e devolve os campos sugeridos. null se a IA não estiver disponível ou falhar. */
export async function extrairDocumentoProcesso(pdf: Buffer): Promise<ExtracaoDocumento | null> {
  if (!iaDisponivel()) return null;
  try {
    const r = await cliente().beta.messages.create({
      model: MODELO_DOCUMENTO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: FALLBACK_DOCUMENTO }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA_DOC } },
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: PROMPT_DOC },
        ],
      }],
    });
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return null;
    const t = textoDe(r.content);
    return t ? (JSON.parse(t) as ExtracaoDocumento) : null;
  } catch (e) {
    console.warn("[processos-ia] leitura do documento falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}
