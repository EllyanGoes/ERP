-- Encargos na baixa (juros/multa/tarifa/taxa com naturezas TRAVADAS) + módulo de
-- cartões (administradoras/maquinetas/taxas) + espelho contábil de transferências.
-- Aditivo e idempotente.

-- Enums novos
ALTER TYPE "TipoContaBancaria" ADD VALUE IF NOT EXISTS 'CARTAO';
ALTER TYPE "OrigemLancamento" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA_CAIXA';

-- Naturezas travadas do sistema (referenciadas pelo motor via chave estável)
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "sistema" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NaturezaFinanceira" ADD COLUMN IF NOT EXISTS "sistemaChave" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "NaturezaFinanceira_empresaId_sistemaChave_key"
  ON "NaturezaFinanceira"("empresaId", "sistemaChave");

-- Taxa/tarifa retida na baixa (título quitado pelo original; taxa nunca contamina o principal)
ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "valorTaxa" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "ContaPagar"   ADD COLUMN IF NOT EXISTS "taxaNaturezaId" TEXT;
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "valorTaxa" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "taxaNaturezaId" TEXT;

-- Rastro da venda no cartão (maquineta usada) no lançamento de caixa
ALTER TABLE "LancamentoCaixa" ADD COLUMN IF NOT EXISTS "maquinetaId" TEXT;

-- Cadastro de adquirência
CREATE TABLE IF NOT EXISTS "AdministradoraCartao" (
  "id"              TEXT NOT NULL,
  "empresaId"       TEXT NOT NULL DEFAULT 'emp_tramontin',
  "nome"            TEXT NOT NULL,
  "cnpj"            TEXT,
  "contaBancariaId" TEXT NOT NULL,
  "ativo"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdministradoraCartao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdministradoraCartao_empresaId_nome_key" ON "AdministradoraCartao"("empresaId", "nome");
CREATE INDEX IF NOT EXISTS "AdministradoraCartao_empresaId_idx" ON "AdministradoraCartao"("empresaId");

CREATE TABLE IF NOT EXISTS "Maquineta" (
  "id"               TEXT NOT NULL,
  "empresaId"        TEXT NOT NULL DEFAULT 'emp_tramontin',
  "administradoraId" TEXT NOT NULL,
  "nome"             TEXT NOT NULL,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Maquineta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Maquineta_empresaId_nome_key" ON "Maquineta"("empresaId", "nome");
CREATE INDEX IF NOT EXISTS "Maquineta_administradoraId_idx" ON "Maquineta"("administradoraId");
CREATE INDEX IF NOT EXISTS "Maquineta_empresaId_idx" ON "Maquineta"("empresaId");

CREATE TABLE IF NOT EXISTS "TaxaMaquineta" (
  "id"              TEXT NOT NULL,
  "maquinetaId"     TEXT NOT NULL,
  "tipoForma"       "TipoFormaPagamento" NOT NULL,
  "taxaPct"         DECIMAL(5,2) NOT NULL,
  "diasCompensacao" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TaxaMaquineta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaxaMaquineta_maquinetaId_tipoForma_key" ON "TaxaMaquineta"("maquinetaId", "tipoForma");

DO $$ BEGIN
  ALTER TABLE "AdministradoraCartao" ADD CONSTRAINT "AdministradoraCartao_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Maquineta" ADD CONSTRAINT "Maquineta_administradoraId_fkey"
    FOREIGN KEY ("administradoraId") REFERENCES "AdministradoraCartao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Maquineta" ADD CONSTRAINT "Maquineta_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TaxaMaquineta" ADD CONSTRAINT "TaxaMaquineta_maquinetaId_fkey"
    FOREIGN KEY ("maquinetaId") REFERENCES "Maquineta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed das naturezas travadas, por empresa (chave estável; re-rodar não duplica).
INSERT INTO "NaturezaFinanceira" (id, "empresaId", nome, tipo, grupo, ativo, "sistema", "sistemaChave", "aplicavelRequisicao", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e.id, n.nome, n.tipo::"NaturezaTipo", n.grupo::"NaturezaGrupo",
  true, true, n.chave, false, now(), now()
FROM "Empresa" e
CROSS JOIN (VALUES
  ('Juros Pagos',            'SAIDA',   'DESPESA_OPERACIONAL', 'juros-pagos'),
  ('Multa Paga',             'SAIDA',   'DESPESA_OPERACIONAL', 'multa-paga'),
  ('Tarifa Bancária',        'SAIDA',   'DESPESA_OPERACIONAL', 'tarifa-bancaria'),
  ('Juros Recebidos',        'ENTRADA', 'RECEITA_OPERACIONAL', 'juros-recebidos'),
  ('Taxa de Cartão',         'SAIDA',   'DESPESA_OPERACIONAL', 'taxa-cartao'),
  ('Deságio de Antecipação', 'SAIDA',   'DESPESA_OPERACIONAL', 'desagio-antecipacao')
) AS n(nome, tipo, grupo, chave)
WHERE NOT EXISTS (
  SELECT 1 FROM "NaturezaFinanceira" nf WHERE nf."empresaId" = e.id AND nf."sistemaChave" = n.chave
);
