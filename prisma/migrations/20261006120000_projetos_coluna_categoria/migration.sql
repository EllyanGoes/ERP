-- Categoria de status das colunas de projeto (INICIO | ANDAMENTO | FIM). Idempotente.
ALTER TABLE "ProjetoColuna" ADD COLUMN IF NOT EXISTS "categoria" TEXT NOT NULL DEFAULT 'ANDAMENTO';

-- Backfill: coluna de conclusão = FIM; a primeira coluna (menor ordem, não
-- conclusiva) de cada projeto = INICIO; o resto fica ANDAMENTO (default).
UPDATE "ProjetoColuna" SET "categoria" = 'FIM' WHERE "concluiTarefa" = true AND "categoria" <> 'FIM';
UPDATE "ProjetoColuna" c SET "categoria" = 'INICIO'
WHERE c."concluiTarefa" = false AND c."categoria" = 'ANDAMENTO'
  AND NOT EXISTS (SELECT 1 FROM "ProjetoColuna" x WHERE x."projetoId" = c."projetoId" AND x."categoria" = 'INICIO')
  AND c."id" = (
    SELECT y."id" FROM "ProjetoColuna" y
    WHERE y."projetoId" = c."projetoId" AND y."concluiTarefa" = false AND y."arquivada" = false
    ORDER BY y."ordem" ASC LIMIT 1
  );
