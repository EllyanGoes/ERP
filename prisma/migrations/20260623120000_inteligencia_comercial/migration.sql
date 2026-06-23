-- Inteligência Comercial (IC): cadastro de concorrentes + preços + geolocalização. Idempotente.

CREATE TABLE IF NOT EXISTS "Concorrente" (
  "id"           TEXT PRIMARY KEY,
  "empresaId"    TEXT NOT NULL DEFAULT 'emp_tramontin',
  "tipoPessoa"   "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
  "razaoSocial"  TEXT NOT NULL,
  "nomeFantasia" TEXT,
  "cpfCnpj"      TEXT,
  "ehFornecedor" BOOLEAN NOT NULL DEFAULT false,
  "ehRevendedor" BOOLEAN NOT NULL DEFAULT false,
  "email"        TEXT,
  "telefone"     TEXT,
  "celular"      TEXT,
  "site"         TEXT,
  "cep"          TEXT,
  "logradouro"   TEXT,
  "numero"       TEXT,
  "complemento"  TEXT,
  "bairro"       TEXT,
  "cidade"       TEXT,
  "estado"       TEXT,
  "latitude"     DOUBLE PRECISION,
  "longitude"    DOUBLE PRECISION,
  "observacoes"  TEXT,
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Concorrente_empresaId_idx" ON "Concorrente"("empresaId");
CREATE INDEX IF NOT EXISTS "Concorrente_cidade_idx"    ON "Concorrente"("cidade");
CREATE INDEX IF NOT EXISTS "Concorrente_ativo_idx"     ON "Concorrente"("ativo");

CREATE TABLE IF NOT EXISTS "ConcorrentePreco" (
  "id"            TEXT PRIMARY KEY,
  "empresaId"     TEXT NOT NULL DEFAULT 'emp_tramontin',
  "concorrenteId" TEXT NOT NULL,
  "itemId"        TEXT,
  "produtoNome"   TEXT NOT NULL,
  "preco"         DECIMAL(15,2) NOT NULL,
  "unidade"       TEXT,
  "dataColeta"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observacao"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ConcorrentePreco_empresaId_idx"     ON "ConcorrentePreco"("empresaId");
CREATE INDEX IF NOT EXISTS "ConcorrentePreco_concorrenteId_idx" ON "ConcorrentePreco"("concorrenteId");
CREATE INDEX IF NOT EXISTS "ConcorrentePreco_itemId_idx"        ON "ConcorrentePreco"("itemId");

-- FKs (idempotentes via checagem no catálogo)
DO $$ BEGIN
  ALTER TABLE "Concorrente"
    ADD CONSTRAINT "Concorrente_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConcorrentePreco"
    ADD CONSTRAINT "ConcorrentePreco_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConcorrentePreco"
    ADD CONSTRAINT "ConcorrentePreco_concorrenteId_fkey"
    FOREIGN KEY ("concorrenteId") REFERENCES "Concorrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConcorrentePreco"
    ADD CONSTRAINT "ConcorrentePreco_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
