-- Impostos por item na proposta do fornecedor (IPI %, ICMS %, Valor ICMS ST)
ALTER TABLE "CotacaoFornecedorItem" ADD COLUMN IF NOT EXISTS "ipi" DECIMAL(5,2);
ALTER TABLE "CotacaoFornecedorItem" ADD COLUMN IF NOT EXISTS "icms" DECIMAL(5,2);
ALTER TABLE "CotacaoFornecedorItem" ADD COLUMN IF NOT EXISTS "valorIcmsSt" DECIMAL(15,2);
