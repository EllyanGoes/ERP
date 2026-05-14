-- Migrate StatusCotacaoCompra: drop old enum, create new 3-value enum

-- Step 1: Drop the default first, then convert column to text
ALTER TABLE "CotacaoCompra" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "CotacaoCompra" ALTER COLUMN "status" TYPE TEXT;

-- Step 2: Drop the old enum
DROP TYPE "StatusCotacaoCompra";

-- Step 3: Create new simplified enum
CREATE TYPE "StatusCotacaoCompra" AS ENUM ('PENDENTE', 'EM_ANALISE', 'CONCLUIDA');

-- Step 4: Migrate existing data
UPDATE "CotacaoCompra" SET status = 'PENDENTE'   WHERE status IN ('RASCUNHO');
UPDATE "CotacaoCompra" SET status = 'EM_ANALISE' WHERE status IN ('AGUARDANDO_APROVACAO');
UPDATE "CotacaoCompra" SET status = 'CONCLUIDA'  WHERE status IN ('APROVADA', 'REPROVADA', 'CANCELADA');

-- Step 5: Set default and convert back to enum
ALTER TABLE "CotacaoCompra"
  ALTER COLUMN "status" TYPE "StatusCotacaoCompra"
  USING status::"StatusCotacaoCompra",
  ALTER COLUMN "status" SET DEFAULT 'PENDENTE'::"StatusCotacaoCompra";
