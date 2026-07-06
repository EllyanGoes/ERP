// Camada de abstração do módulo Fiscal (docs/fiscal-prd.md, seção 4).
// O ERP fala SEMPRE neste contrato normalizado; cada provedor (Focus NFe,
// Nuvem Fiscal, futuro emissor próprio) tem um adapter. Trocar de provedor
// não pode mudar numeração nem payload interno — por isso a numeração vive
// no banco (SerieFiscal) e o `ref` de idempotência é o NotaFiscal.id.

import { prismaSemEscopo } from "@/lib/prisma";
import { focusNfeProvider } from "@/lib/fiscal/providers/focus-nfe";

export type AmbienteFiscal = "HOMOLOGACAO" | "PRODUCAO";

export interface CredencialFiscal {
  token: string;
  ambiente: AmbienteFiscal;
  cnpjEmitente: string;
}

export interface EnderecoFiscal {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipioIBGE: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface DestinatarioPayload {
  cpfCnpj?: string | null; // null = consumidor não identificado (NFC-e)
  nome: string;
  ie?: string | null;
  indIE: number; // 1 contribuinte | 2 isento | 9 não contribuinte
  email?: string | null;
  endereco?: EnderecoFiscal | null;
}

export interface ItemFiscalPayload {
  ordem: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string | null;
  gtin: string; // "SEM GTIN" quando não houver
  cfop: string;
  unidade: string;
  quantidade: number;
  vUnitario: number;
  vDesconto: number;
  vTotal: number;
  origem: number;
  cstIcms?: string | null; // CST ou CSOSN conforme CRT
  aliqIcms?: number | null;
  vBcIcms?: number | null;
  vIcms?: number | null;
  cstIpi?: string | null;
  vIpi?: number | null;
  cstPis?: string | null;
  aliqPis?: number | null;
  vPis?: number | null;
  cstCofins?: string | null;
  aliqCofins?: number | null;
  vCofins?: number | null;
  cClassTrib?: string | null; // reforma tributária (NT 2025.002)
}

export interface NfePayload {
  serie: number;
  numero: number;
  naturezaOperacao: string;
  tipoOperacao: 0 | 1; // 0 entrada | 1 saída
  finalidade: 1 | 2 | 3 | 4;
  dataEmissao: string; // ISO
  consumidorFinal: boolean;
  presencial: boolean;
  crt: number; // regime do emitente (EmpresaFiscal.crt)
  destinatario: DestinatarioPayload;
  itens: ItemFiscalPayload[];
  totais: {
    vProdutos: number;
    vDesconto: number;
    vFrete: number;
    vSeguro: number;
    vOutro: number;
    vBcIcms: number;
    vIcms: number;
    vIcmsSt: number;
    vIpi: number;
    vPis: number;
    vCofins: number;
    vTotal: number;
  };
  modalidadeFrete: number; // 9 = sem frete (default F1)
  chaveReferenciada?: string | null; // NFref (devolução/complementar)
  observacoes?: string | null; // infCpl
}

export type ResultadoEmissao =
  | { situacao: "PROCESSANDO"; provedorRef: string }
  | {
      situacao: "AUTORIZADA";
      chave: string;
      protocolo: string;
      xmlPath?: string | null; // caminho no provedor — o serviço copia p/ blob
      danfePath?: string | null;
    }
  | { situacao: "REJEITADA" | "DENEGADA" | "ERRO"; codigo?: string | null; mensagem: string }
  | { situacao: "CANCELADA"; protocolo?: string | null };

export interface ResultadoEvento {
  status: "REGISTRADO" | "REJEITADO" | "PENDENTE";
  protocolo?: string | null;
  mensagem?: string | null;
  xmlPath?: string | null;
}

// Documento vindo da Distribuição DF-e, já normalizado.
export interface DocumentoDFe {
  chave: string;
  nsu: string;
  tipoDocumento: "NFE" | "RESUMO_NFE" | "EVENTO" | "CTE";
  emitenteCnpj: string;
  emitenteNome: string;
  emitenteUf?: string | null;
  dataEmissao?: string | null; // ISO
  valorTotal?: number | null;
  situacaoSefaz?: string | null;
  xmlPath?: string | null; // presente quando o XML completo está disponível
}

export type TipoManifestacao = "CIENCIA" | "CONFIRMACAO" | "DESCONHECIMENTO" | "NAO_REALIZADA";

// Corpo de webhook já normalizado (independente do provedor).
export interface EventoFiscalNormalizado {
  ref: string; // NotaFiscal.id
  resultado: ResultadoEmissao;
}

export interface DadosEmitente {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  ie?: string | null;
  im?: string | null;
  crt: number;
  endereco: EnderecoFiscal;
  email?: string | null;
  telefone?: string | null;
}

export interface FiscalProvider {
  readonly nome: string; // "FOCUS_NFE"
  emitirNfe(cred: CredencialFiscal, ref: string, nota: NfePayload): Promise<ResultadoEmissao>;
  consultar(cred: CredencialFiscal, ref: string): Promise<ResultadoEmissao>;
  cancelar(cred: CredencialFiscal, ref: string, justificativa: string): Promise<ResultadoEvento>;
  cartaCorrecao(cred: CredencialFiscal, ref: string, correcao: string): Promise<ResultadoEvento>;
  inutilizar(
    cred: CredencialFiscal,
    p: { serie: number; numeroInicial: number; numeroFinal: number; justificativa: string },
  ): Promise<ResultadoEvento>;
  distribuicaoDFe(
    cred: CredencialFiscal,
    ultimoNsu: string,
  ): Promise<{ documentos: DocumentoDFe[]; ultimoNsu: string }>;
  manifestar(
    cred: CredencialFiscal,
    chave: string,
    evento: TipoManifestacao,
    justificativa?: string,
  ): Promise<ResultadoEvento>;
  /** Baixa um arquivo do provedor (caminho retornado por consultar/distribuicao). */
  baixarArquivo(cred: CredencialFiscal, path: string): Promise<Buffer>;
  /** Registra/atualiza a empresa emitente no provedor (certificado A1 fica lá). */
  sincronizarEmpresa(
    masterToken: string,
    ambiente: AmbienteFiscal,
    empresa: DadosEmitente,
  ): Promise<{ provedorEmpresaRef: string; tokenHomologacao?: string | null; tokenProducao?: string | null }>;
  /** Valida e normaliza o corpo de um webhook do provedor. */
  parseWebhook(body: unknown): EventoFiscalNormalizado | null;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export class FiscalConfigError extends Error {}

export interface ContextoFiscal {
  provider: FiscalProvider;
  credencial: CredencialFiscal;
  empresaFiscal: NonNullable<Awaited<ReturnType<typeof carregarEmpresaFiscal>>>;
}

export async function carregarEmpresaFiscal(empresaId: string) {
  return prismaSemEscopo.empresaFiscal.findUnique({ where: { empresaId } });
}

/**
 * Resolve provider + credencial da empresa. Usa prismaSemEscopo com empresaId
 * explícito (funciona em crons e webhooks, fora da sessão).
 */
export async function getFiscalProvider(empresaId: string): Promise<ContextoFiscal> {
  const ef = await carregarEmpresaFiscal(empresaId);
  if (!ef) throw new FiscalConfigError("Empresa sem configuração fiscal (cadastre em Fiscal → Cadastros).");

  const ambiente = (ef.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO") as AmbienteFiscal;
  const token = ambiente === "PRODUCAO" ? ef.tokenProducao : ef.tokenHomologacao;
  if (!token) throw new FiscalConfigError(`Empresa sem token de ${ambiente.toLowerCase()} do provedor fiscal.`);

  const empresa = await prismaSemEscopo.empresa.findUnique({
    where: { id: empresaId },
    select: { cnpj: true },
  });
  if (!empresa) throw new FiscalConfigError("Empresa não encontrada.");

  const provider = resolverProvider(ef.provedor);
  return {
    provider,
    credencial: { token, ambiente, cnpjEmitente: somenteDigitos(empresa.cnpj) },
    empresaFiscal: ef,
  };
}

function resolverProvider(nome: string): FiscalProvider {
  switch (nome) {
    case "FOCUS_NFE":
      return focusNfeProvider;
    default:
      throw new FiscalConfigError(`Provedor fiscal desconhecido: ${nome}`);
  }
}

export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Mascara um secret para exibição (padrão IntegracaoPagamento). */
export function mascararSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
