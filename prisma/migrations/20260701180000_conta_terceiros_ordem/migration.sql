-- Conta bancária de terceiros + ordem de exibição no plano/balanço. Idempotente.
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "ehTerceiro" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "terceiroNome" TEXT;
ALTER TABLE "ContaContabil" ADD COLUMN IF NOT EXISTS "ordem" INTEGER;

-- Ordem de liquidez das sintéticas do Ativo Circulante (1.1.x). Deixa o slot 2 livre
-- para "Contas de Terceiros" (1.1.6), criada sob demanda com ordem=2. Não sobrescreve.
UPDATE "ContaContabil" SET "ordem" = CASE codigo
    WHEN '1.1.1' THEN 1  -- Disponibilidades
    WHEN '1.1.2' THEN 3  -- Clientes a Receber
    WHEN '1.1.3' THEN 4  -- Estoques
    WHEN '1.1.4' THEN 5  -- Custos a Apropriar
    WHEN '1.1.5' THEN 6  -- Outros a Receber
  END
WHERE codigo IN ('1.1.1','1.1.2','1.1.3','1.1.4','1.1.5') AND "ordem" IS NULL;
