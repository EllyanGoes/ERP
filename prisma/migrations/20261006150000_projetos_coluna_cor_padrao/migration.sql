-- Cor padrão das colunas de projeto sem cor, pela categoria (Notion-like). Idempotente.
UPDATE "ProjetoColuna" SET "cor" = CASE "categoria" WHEN 'INICIO' THEN '#9ca3af' WHEN 'FIM' THEN '#22c55e' ELSE '#3b82f6' END
WHERE "cor" IS NULL;
