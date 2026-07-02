import { z } from "zod"

export const contaReceberSchema = z.object({
  // Cliente é o beneficiário CLIENTE; receita sem vínculo (rendimento, devolução
  // de imposto) não tem cliente — quem define as contas é a natureza.
  clienteId: z.string().optional().nullable(),
  beneficiarioTipo: z.enum(["CLIENTE"]).optional().nullable(),
  beneficiarioId: z.string().optional().nullable(),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valorOriginal: z.coerce.number().min(0.01, "Valor inválido"),
  dataVencimento: z.string().min(1, "Data de vencimento é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  naturezaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
}).refine((d) => d.beneficiarioTipo !== "CLIENTE" || !!d.clienteId, { message: "Selecione o cliente", path: ["clienteId"] })

export const contaPagarSchema = z.object({
  // Beneficiário polimórfico: FORNECEDOR / COLABORADOR / sem vínculo (null, p/
  // encargos como INSS patronal/FGTS). fornecedorId só quando tipo=FORNECEDOR.
  fornecedorId: z.string().optional().nullable(),
  beneficiarioTipo: z.enum(["FORNECEDOR", "COLABORADOR"]).optional().nullable(),
  beneficiarioId: z.string().optional().nullable(),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  categoria: z.string().optional().nullable(),
  valorOriginal: z.coerce.number().min(0.01, "Valor inválido"),
  dataVencimento: z.string().min(1, "Data de vencimento é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  notaFiscal: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  naturezaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
}).refine((d) => d.beneficiarioTipo !== "FORNECEDOR" || !!d.fornecedorId, { message: "Selecione o fornecedor", path: ["fornecedorId"] })
  .refine((d) => d.beneficiarioTipo !== "COLABORADOR" || !!d.beneficiarioId, { message: "Selecione o colaborador", path: ["beneficiarioId"] })

export const pagamentoSchema = z.object({
  // valorPago/forma/conta únicos = baixa de 1 forma (compat). Para múltiplas
  // formas (mesma estrutura do Pedido de Venda), use `pagamentos`.
  valorPago: z.coerce.number().min(0.01, "Valor inválido").optional(),
  dataPagamento: z.string().min(1, "Data é obrigatória"),
  formaPagamento: z.string().optional().nullable(),
  valorMulta: z.coerce.number().min(0).default(0),
  valorJuros: z.coerce.number().min(0).default(0),
  // Taxa/tarifa RETIDA no ato (recebe/paga MENOS que o baixado — ex.: taxa de
  // cartão, tarifa bancária). O título é quitado pelo original; a taxa vira
  // despesa com natureza TRAVADA do sistema (taxaNaturezaId; default por lado).
  valorTaxa: z.coerce.number().min(0).default(0),
  taxaNaturezaId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
  pagamentos: z.array(z.object({
    forma: z.string().optional().nullable(),
    contaBancariaId: z.string().optional().nullable(),
    valor: z.coerce.number().min(0.01),
  })).optional(),
  // Rateio gerencial por natureza (classificação do título na baixa). Cada linha =
  // natureza + valor; a soma deve bater com o valor do título. Opcional.
  naturezas: z.array(z.object({
    naturezaFinanceiraId: z.string().min(1),
    detalhamento: z.string().optional().nullable(),
    valor: z.coerce.number().min(0.01),
  })).optional(),
}).refine(
  (d) => (d.pagamentos && d.pagamentos.length > 0) || (d.valorPago != null && d.valorPago > 0),
  { message: "Informe o valor recebido/pago", path: ["valorPago"] },
)

// ── Tesouraria (Fase 1) ─────────────────────────────────────────────────────

export const bancoSchema = z.object({
  codigo: z.string().optional().nullable(),
  nome: z.string().min(2, "Nome é obrigatório"),
  ativo: z.boolean().default(true),
})

export const contaBancariaSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório"),
  bancoId: z.string().optional().nullable(),
  agencia: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  tipo: z.enum(["CORRENTE", "POUPANCA", "CAIXA"]).default("CORRENTE"),
  saldoInicial: z.coerce.number().default(0),
  ativo: z.boolean().default(true),
  // Conta de terceiros (dinheiro de 3º sob guarda) → contábil em "Contas de Terceiros".
  ehTerceiro: z.boolean().default(false),
  terceiroNome: z.string().optional().nullable(),
})

export const lancamentoFinanceiroSchema = z.object({
  tipo: z.enum(["RECEITA", "DESPESA"]),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
  dataVencimento: z.string().optional().nullable(),
  dataCompetencia: z.string().optional().nullable(),
  contaBancariaId: z.string().min(1, "Conta bancária é obrigatória"),
  naturezaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  favorecido: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

export const transferenciaSchema = z.object({
  contaOrigemId: z.string().min(1, "Conta de origem é obrigatória"),
  contaDestinoId: z.string().min(1, "Conta de destino é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  dataLancamento: z.string().min(1, "Data é obrigatória"),
  descricao: z.string().optional().nullable(),
}).refine((d) => d.contaOrigemId !== d.contaDestinoId, {
  message: "Conta de origem e destino devem ser diferentes",
  path: ["contaDestinoId"],
})

// ── Recorrências & parcelamento (Fase 2) ────────────────────────────────────

export const recorrenciaSchema = z.object({
  tipo: z.enum(["RECEBER", "PAGAR"]),
  descricao: z.string().min(2, "Descrição é obrigatória"),
  valor: z.coerce.number().min(0.01, "Valor inválido"),
  naturezaFinanceiraId: z.string().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  fornecedorId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
  periodicidade: z.enum(["SEMANAL", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]).default("MENSAL"),
  diaVencimento: z.coerce.number().int().min(1).max(31).default(1),
  proximaGeracao: z.string().min(1, "Data da próxima geração é obrigatória"),
  ativo: z.boolean().default(true),
  observacoes: z.string().optional().nullable(),
})

// Baixa em lote (agendamento) — quita vários títulos de uma vez numa conta.
export const baixaLoteSchema = z.object({
  tipo: z.enum(["RECEBER", "PAGAR"]),
  ids: z.array(z.string()).min(1, "Selecione ao menos um título"),
  contaBancariaId: z.string().min(1, "Conta bancária é obrigatória"),
  dataPagamento: z.string().min(1, "Data é obrigatória"),
})

export type RecorrenciaFormData = z.infer<typeof recorrenciaSchema>
export type BaixaLoteFormData = z.infer<typeof baixaLoteSchema>

// ── Conciliação bancária OFX (Fase 3) ───────────────────────────────────────

export const ofxImportarSchema = z.object({
  contaBancariaId: z.string().min(1, "Conta bancária é obrigatória"),
  nomeArquivo: z.string().optional().nullable(),
  conteudo: z.string().min(1, "Arquivo OFX vazio"),
})

export const ofxConciliarSchema = z.object({
  linhaId: z.string().min(1),
  lancamentoId: z.string().min(1),
})

export const ofxCriarLancamentoSchema = z.object({
  linhaId: z.string().min(1),
  naturezaFinanceiraId: z.string().optional().nullable(),
  centroCustoId: z.string().optional().nullable(),
})

export type OfxImportarData = z.infer<typeof ofxImportarSchema>
export type OfxConciliarData = z.infer<typeof ofxConciliarSchema>

export type ContaReceberFormData = z.infer<typeof contaReceberSchema>
export type ContaPagarFormData = z.infer<typeof contaPagarSchema>
export type PagamentoFormData = z.infer<typeof pagamentoSchema>
export type BancoFormData = z.infer<typeof bancoSchema>
export type ContaBancariaFormData = z.infer<typeof contaBancariaSchema>
export type LancamentoFinanceiroFormData = z.infer<typeof lancamentoFinanceiroSchema>
export type TransferenciaFormData = z.infer<typeof transferenciaSchema>
