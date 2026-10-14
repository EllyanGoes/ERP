// Normalização do body do formulário de contrato (create e edição de minuta).
const TIPOS = ["FORNECIMENTO", "SERVICO", "LOCACAO", "SOFTWARE_ASSINATURA", "SEGURO", "PLANO_SAUDE", "TRANSPORTE", "OBRA", "VENDA_RECORRENTE", "VENDA_A_ORDEM", "TERCEIRIZACAO", "OUTRO"];
const dt = (v: unknown) => (v ? new Date(String(v)) : null);
const dec = (v: unknown) => (v === "" || v == null ? null : Number(v));
const int = (v: unknown) => (v === "" || v == null ? null : parseInt(String(v)) || null);

/** Campos editáveis vindos do body (create e edição de minuta). */
export function camposContrato(b: Record<string, unknown>) {
  return {
    titulo: String(b.titulo ?? "").trim(),
    tipo: (TIPOS.includes(String(b.tipo)) ? String(b.tipo) : "OUTRO") as never,
    lado: (b.lado === "RECEITA" ? "RECEITA" : "DESPESA") as never,
    fornecedorId: b.lado === "RECEITA" ? null : (b.fornecedorId ? String(b.fornecedorId) : null),
    clienteId: b.lado === "RECEITA" ? (b.clienteId ? String(b.clienteId) : null) : null,
    centroCustoId: b.centroCustoId ? String(b.centroCustoId) : null,
    naturezaFinanceiraId: b.naturezaFinanceiraId ? String(b.naturezaFinanceiraId) : null,
    objeto: b.objeto ? String(b.objeto).trim() : null,
    inicio: dt(b.inicio) ?? new Date(),
    fim: dt(b.fim),
    renovacao: (["NENHUMA", "AUTOMATICA", "MANUAL"].includes(String(b.renovacao)) ? String(b.renovacao) : "NENHUMA") as never,
    renovacaoMeses: int(b.renovacaoMeses),
    avisoPrevioDias: int(b.avisoPrevioDias),
    modalidade: (["FIXO_MENSAL", "FIXO_UNICO", "POR_MEDICAO", "POR_CONSUMO", "ESTIMADO"].includes(String(b.modalidade)) ? String(b.modalidade) : "FIXO_MENSAL") as never,
    valor: dec(b.valor),
    valorTotalEstimado: dec(b.valorTotalEstimado),
    periodicidade: (["MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"].includes(String(b.periodicidade)) ? String(b.periodicidade) : null) as never,
    diaVencimento: int(b.diaVencimento),
    primeiroVencimento: dt(b.primeiroVencimento),
    reajusteTipo: (["NENHUM", "INDICE", "PERCENTUAL", "NEGOCIADO"].includes(String(b.reajusteTipo)) ? String(b.reajusteTipo) : "NENHUM") as never,
    reajusteIndice: (["IPCA", "IGPM", "INPC", "SELIC", "OUTRO"].includes(String(b.reajusteIndice)) ? String(b.reajusteIndice) : null) as never,
    reajustePercentual: dec(b.reajustePercentual),
    reajusteMesBase: int(b.reajusteMesBase),
    reajusteProximo: dt(b.reajusteProximo),
    multaRescisoria: b.multaRescisoria ? String(b.multaRescisoria).trim() : null,
    garantia: b.garantia ? String(b.garantia).trim() : null,
    observacoes: b.observacoes ? String(b.observacoes).trim() : null,
    tags: Array.isArray(b.tags) ? (b.tags as string[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean) : typeof b.tags === "string" ? b.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
  };
}

