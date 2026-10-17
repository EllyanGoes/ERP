-- Cadastro de instrutores de treinamento (externos ou colaboradores internos).
CREATE TABLE IF NOT EXISTS "SstInstrutor" (
  "id" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "entidade" TEXT,
  "registro" TEXT,
  "colaboradorId" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoPor" TEXT,
  "atualizadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SstInstrutor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SstInstrutor_empresaId_nome_idx" ON "SstInstrutor"("empresaId", "nome");
DO $$ BEGIN
  ALTER TABLE "SstInstrutor" ADD CONSTRAINT "SstInstrutor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SstTreinamento" ADD COLUMN IF NOT EXISTS "instrutorId" TEXT;
DO $$ BEGIN
  ALTER TABLE "SstTreinamento" ADD CONSTRAINT "SstTreinamento_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "SstInstrutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Semeia com os instrutores já digitados nas turmas (um por empresa+nome) e liga as turmas.
-- Se o nome bate com um colaborador da empresa, vira instrutor interno.
INSERT INTO "SstInstrutor" ("id", "empresaId", "nome", "entidade", "colaboradorId", "updatedAt")
SELECT 'sstinst_' || substr(md5(g."empresaId" || g.nome), 1, 20), g."empresaId", g.nome, g.entidade,
       (SELECT c.id FROM "Colaborador" c WHERE upper(trim(c.nome)) = g.nome LIMIT 1), now()
FROM (
  SELECT t."empresaId", upper(trim(t.instrutor)) AS nome,
         (array_agg(nullif(trim(t.entidade), '') ORDER BY t.data DESC))[1] AS entidade
  FROM "SstTreinamento" t
  WHERE coalesce(trim(t.instrutor), '') <> ''
  GROUP BY t."empresaId", upper(trim(t.instrutor))
) g
ON CONFLICT ("id") DO NOTHING;

UPDATE "SstTreinamento" t SET "instrutorId" = 'sstinst_' || substr(md5(t."empresaId" || upper(trim(t.instrutor))), 1, 20)
WHERE t."instrutorId" IS NULL AND coalesce(trim(t.instrutor), '') <> ''
  AND EXISTS (SELECT 1 FROM "SstInstrutor" i WHERE i.id = 'sstinst_' || substr(md5(t."empresaId" || upper(trim(t.instrutor))), 1, 20));
