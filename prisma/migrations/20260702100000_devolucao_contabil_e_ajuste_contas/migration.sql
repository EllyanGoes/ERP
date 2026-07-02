-- Devolução de venda passa a ter lançamento contábil próprio (origem DEVOLUCAO):
-- estorno de receita ((-) Devoluções de Vendas) + retorno do estoque ao custo.
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'DEVOLUCAO';

-- Correção da colisão de código 3.3.9004: três helpers get-or-create disputavam o
-- MESMO código (Despesas Gerais × Juros e Multas Passivos × Perda na Baixa de
-- Imobilizado) — quem rodasse primeiro criava a conta e os demais herdavam-na com
-- nome alheio. O código 3.3.9004 fica com Despesas Gerais; Juros e Multas Passivos
-- foi renumerada para 3.3.9005 e Perda na Baixa de Imobilizado para 3.3.9006
-- (recriadas pelo get-or-create no primeiro uso). Se a conta 3.3.9004 nasceu com um
-- dos nomes errados, é renomeada — o histórico já lançado permanece MESCLADO nela
-- (impossível separar retroativamente; casos novos vão às contas certas).
UPDATE "ContaContabil" SET "nome" = 'Despesas Gerais'
WHERE "codigo" = '3.3.9004' AND "nome" IN ('Juros e Multas Passivos', 'Perda na Baixa de Imobilizado');

-- Vínculo explícito do estorno em dinheiro à devolução (substitui matching por
-- descrição) e parcela da devolução abatida de CR aberta (usada pelo motor
-- contábil para creditar Clientes a Receber em vez de caixa/crédito).
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "devolucaoId" TEXT;
CREATE INDEX IF NOT EXISTS "LancamentoCaixa_devolucaoId_idx" ON "LancamentoCaixa"("devolucaoId");
ALTER TABLE "Devolucao" ADD COLUMN IF NOT EXISTS "valorAbatidoCr" DECIMAL(15,2);
