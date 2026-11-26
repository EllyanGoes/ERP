-- Processos externos — pagamentos em processos (docs/processos-prd.md §8.3):
--  • ProcessoPrazo: valor a pagar, desconto por pagamento antecipado e título ligado
--    (quitação do título cumpre o prazo; estorno reabre);
--  • ProcessoDepositoDestino: destino do depósito judicial (levantado / convertido);
--  • origem contábil PROCESSO_DEPOSITO (reclassificação do depósito convertido);
--  • conta do ATIVO 1.2.9001 "Depósitos Judiciais e Garantias" (faixa .9xxx de sistema)
--    em toda empresa com 1.2 (Ativo Não Circulante);
--  • naturezas TRAVADAS "deposito-judicial" (SAÍDA) e "levantamento-deposito-judicial"
--    (ENTRADA), grupo Investimento, afetaResultado=false: na Tramontin (plano hierárquico)
--    no grupo "7. Investimento" com o próximo código livre (7.03/7.04); nas demais
--    empresas com naturezas travadas, sem código. A de depósito fica ligada à 1.2.9001
--    (D Depósitos Judiciais no pagamento, nunca despesa); a de levantamento tem a 1.2.9001
--    como contrapartida (o recebimento credita o depósito, sem receita).
-- Aditivo e idempotente: re-rodar não duplica nem re-liga.

-- ── Origem contábil nova ────────────────────────────────────────────────────────
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'PROCESSO_DEPOSITO';

-- ── Prazo ↔ pagamento ───────────────────────────────────────────────────────────
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "valorPagar" DECIMAL(15,2);
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "descontoAte" TIMESTAMP(3);
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "valorComDesconto" DECIMAL(15,2);
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "descontoPercentual" DECIMAL(7,4);
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "contaPagarId" TEXT;
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "cumpridoPorPagamento" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "ProcessoPrazo_contaPagarId_idx" ON "ProcessoPrazo"("contaPagarId");
DO $$ BEGIN
  ALTER TABLE "ProcessoPrazo" ADD CONSTRAINT "ProcessoPrazo_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Destino do depósito judicial ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProcessoDepositoDestino" (
  "id"                   TEXT NOT NULL,
  "empresaId"            TEXT NOT NULL,
  "processoId"           TEXT NOT NULL,
  "contaPagarId"         TEXT NOT NULL,
  "tipo"                 TEXT NOT NULL,
  "valor"                DECIMAL(15,2) NOT NULL,
  "data"                 TIMESTAMP(3) NOT NULL,
  "naturezaFinanceiraId" TEXT,
  "contaReceberId"       TEXT,
  "observacao"           TEXT,
  "criadoPor"            TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoDepositoDestino_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessoDepositoDestino_contaReceberId_key" ON "ProcessoDepositoDestino"("contaReceberId");
CREATE INDEX IF NOT EXISTS "ProcessoDepositoDestino_processoId_idx" ON "ProcessoDepositoDestino"("processoId");
CREATE INDEX IF NOT EXISTS "ProcessoDepositoDestino_contaPagarId_idx" ON "ProcessoDepositoDestino"("contaPagarId");
DO $$ BEGIN
  ALTER TABLE "ProcessoDepositoDestino" ADD CONSTRAINT "ProcessoDepositoDestino_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoDepositoDestino" ADD CONSTRAINT "ProcessoDepositoDestino_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoDepositoDestino" ADD CONSTRAINT "ProcessoDepositoDestino_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoDepositoDestino" ADD CONSTRAINT "ProcessoDepositoDestino_naturezaFinanceiraId_fkey"
    FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Conta do ATIVO: 1.2.9001 Depósitos Judiciais e Garantias ───────────────────
INSERT INTO "ContaContabil" (
  id, "empresaId", codigo, nome, grupo, natureza, tipo, nivel, "aceitaLancamento", "paiId",
  ativo, manual, "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, p."empresaId", '1.2.9001', 'Depósitos Judiciais e Garantias',
  'ATIVO'::"GrupoContabil", 'DEVEDORA'::"NaturezaContabil", 'ANALITICA'::"TipoContaContabil",
  p.nivel + 1, true, p.id, true, false, now(), now()
FROM "ContaContabil" p
WHERE p.codigo = '1.2'
  AND NOT EXISTS (
    SELECT 1 FROM "ContaContabil" c WHERE c."empresaId" = p."empresaId" AND c.codigo = '1.2.9001'
  );

-- ── Naturezas travadas ─────────────────────────────────────────────────────────
-- 1) Plano hierárquico (grupo "7. Investimento" com 7.01): próximo código livre do grupo 7.
DO $$
DECLARE
  r RECORD;
  prox INT;
  def RECORD;
BEGIN
  FOR r IN
    SELECT s."empresaId", s.id AS sub
    FROM "NaturezaSubgrupo" s
    WHERE s.nome = '7. Investimento'
      AND EXISTS (SELECT 1 FROM "NaturezaFinanceira" n WHERE n."empresaId" = s."empresaId" AND n.codigo = '7.01')
  LOOP
    FOR def IN
      SELECT * FROM (VALUES
        (1, 'deposito-judicial', 'Depósitos judiciais e garantias', 'SAIDA'),
        (2, 'levantamento-deposito-judicial', 'Levantamento de depósitos judiciais', 'ENTRADA')
      ) AS t(ord, chave, nome, tipo)
      ORDER BY ord
    LOOP
      IF NOT EXISTS (SELECT 1 FROM "NaturezaFinanceira" n WHERE n."empresaId" = r."empresaId" AND n."sistemaChave" = def.chave) THEN
        SELECT COALESCE(MAX(split_part(n.codigo, '.', 2)::INT), 0) + 1 INTO prox
        FROM "NaturezaFinanceira" n
        WHERE n."empresaId" = r."empresaId" AND n.codigo ~ '^7\.[0-9]+$';
        INSERT INTO "NaturezaFinanceira" (
          id, "empresaId", codigo, nome, tipo, grupo, "subgrupoId", ativo, "afetaResultado",
          "sistema", "sistemaChave", "aplicavelRequisicao", cif, ordem, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text, r."empresaId", '7.' || lpad(prox::text, 2, '0'), def.nome,
          def.tipo::"NaturezaTipo", 'INVESTIMENTO'::"NaturezaGrupo", r.sub, true, false,
          true, def.chave, false, false, 700 + prox, now(), now()
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2) Demais empresas com naturezas travadas (sem plano com código): sem código.
INSERT INTO "NaturezaFinanceira" (
  id, "empresaId", nome, tipo, grupo, ativo, "afetaResultado", "sistema", "sistemaChave",
  "aplicavelRequisicao", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, e.id, d.nome, d.tipo::"NaturezaTipo", 'INVESTIMENTO'::"NaturezaGrupo",
  true, false, true, d.chave, false, now(), now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('deposito-judicial', 'Depósitos Judiciais e Garantias', 'SAIDA'),
  ('levantamento-deposito-judicial', 'Levantamento de Depósitos Judiciais', 'ENTRADA')
) AS d(chave, nome, tipo)
WHERE EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n
    WHERE n."empresaId" = e.id AND n."sistema" = true AND n."sistemaChave" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NaturezaFinanceira" n WHERE n."empresaId" = e.id AND n."sistemaChave" = d.chave
  );

-- 3) Depósito → conta 1.2.9001 (quando a natureza ainda não tem conta e a 1.2.9001 está livre).
UPDATE "ContaContabil" c
SET "naturezaFinanceiraId" = n.id, "updatedAt" = now()
FROM "NaturezaFinanceira" n
WHERE n."sistemaChave" = 'deposito-judicial'
  AND c."empresaId" = n."empresaId"
  AND c.codigo = '1.2.9001'
  AND c."naturezaFinanceiraId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ContaContabil" x WHERE x."naturezaFinanceiraId" = n.id);

-- 4) Levantamento → contrapartida 1.2.9001 (o recebível do levantamento é o próprio depósito).
UPDATE "NaturezaFinanceira" n
SET "contaContrapartidaId" = c.id, "updatedAt" = now()
FROM "ContaContabil" c
WHERE n."sistemaChave" = 'levantamento-deposito-judicial'
  AND n."contaContrapartidaId" IS NULL
  AND c."empresaId" = n."empresaId"
  AND c.codigo = '1.2.9001';
