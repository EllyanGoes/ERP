-- ═══════════════════════════════════════════════════════════════════════════
-- FILIAL INTEGRADA À EMPRESA (matriz automática)
--
-- 1. Filial ganha empresaId (dona) e flag matriz.
-- 2. Cada Empresa ganha (ou adota, por CNPJ igual) uma Filial MATRIZ espelhada
--    do próprio cadastro — empresa sem outras filiais não precisa cadastrar
--    nada. A matriz é sincronizada pela tela de Empresas do Grupo.
-- 3. Filiais "vazias" (razão social em branco — placeholder criado só para
--    destravar o campo obrigatório das solicitações) são fundidas na matriz
--    da sua empresa: locais de estoque, solicitações e vínculos de
--    colaboradores são re-apontados e a filial vazia é removida.
-- 4. Locais de estoque sem filial passam a apontar para a matriz da empresa.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "Filial" ADD COLUMN IF NOT EXISTS "empresaId" TEXT NOT NULL DEFAULT 'emp_tramontin';
ALTER TABLE "Filial" ADD COLUMN IF NOT EXISTS "matriz" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Filial_empresaId_idx" ON "Filial"("empresaId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Filial" ADD CONSTRAINT "Filial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Matriz por empresa (cria ou adota filial existente com o mesmo CNPJ)
DO $$
DECLARE e RECORD; v_matriz TEXT;
BEGIN
  FOR e IN SELECT * FROM "Empresa" LOOP
    SELECT id INTO v_matriz FROM "Filial" WHERE "empresaId" = e.id AND matriz LIMIT 1;

    IF v_matriz IS NULL AND e.cnpj IS NOT NULL THEN
      SELECT id INTO v_matriz FROM "Filial" WHERE cnpj = e.cnpj LIMIT 1;
      IF v_matriz IS NOT NULL THEN
        UPDATE "Filial" SET "empresaId" = e.id, matriz = true WHERE id = v_matriz;
      END IF;
    END IF;

    IF v_matriz IS NULL THEN
      INSERT INTO "Filial" (id, "empresaId", matriz, "razaoSocial", "nomeFantasia", cnpj, ie, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado, ativo, "createdAt", "updatedAt")
      VALUES ('fil_' || e.id, e.id, true, e."razaoSocial", e."nomeFantasia", e.cnpj, e.ie, e.email, e.telefone, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.estado, true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Fusão das filiais "vazias" na matriz da sua empresa
DO $$
DECLARE v_lixo RECORD; v_matriz TEXT;
BEGIN
  FOR v_lixo IN SELECT id, "empresaId" FROM "Filial" WHERE btrim(coalesce("razaoSocial", '')) = '' AND NOT matriz LOOP
    SELECT id INTO v_matriz FROM "Filial" WHERE "empresaId" = v_lixo."empresaId" AND matriz LIMIT 1;
    IF v_matriz IS NULL THEN CONTINUE; END IF;

    UPDATE "LocalEstoque" SET "filialId" = v_matriz WHERE "filialId" = v_lixo.id;
    UPDATE "NecessidadeCompra" SET "filialId" = v_matriz WHERE "filialId" = v_lixo.id;
    INSERT INTO "_ColaboradorToFilial" ("A", "B")
      SELECT "A", v_matriz FROM "_ColaboradorToFilial" WHERE "B" = v_lixo.id
      ON CONFLICT DO NOTHING;
    DELETE FROM "_ColaboradorToFilial" WHERE "B" = v_lixo.id;
    DELETE FROM "Filial" WHERE id = v_lixo.id;
  END LOOP;
END $$;

-- Locais de estoque sem filial → matriz da empresa do local
UPDATE "LocalEstoque" l
SET "filialId" = f.id
FROM "Filial" f
WHERE l."filialId" IS NULL
  AND f."empresaId" = l."empresaId"
  AND f.matriz;
