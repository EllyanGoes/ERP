-- GED no padrão Drive: categorias viram PASTAS com hierarquia (paiId) e
-- estrela (favorito) por usuário. Idempotente: re-rodar não muda nada.

-- 1) Hierarquia de pastas
ALTER TABLE "DocumentoCategoria" ADD COLUMN IF NOT EXISTS "paiId" TEXT;
ALTER TABLE "DocumentoCategoria" ADD COLUMN IF NOT EXISTS "criadoPorId" TEXT;
CREATE INDEX IF NOT EXISTS "DocumentoCategoria_paiId_idx" ON "DocumentoCategoria"("paiId");
DO $$ BEGIN
  ALTER TABLE "DocumentoCategoria" ADD CONSTRAINT "DocumentoCategoria_paiId_fkey"
    FOREIGN KEY ("paiId") REFERENCES "DocumentoCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Estrela por usuário
CREATE TABLE IF NOT EXISTS "DocumentoFavorito" (
  "usuarioId"   TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoFavorito_pkey" PRIMARY KEY ("usuarioId", "documentoId")
);
CREATE INDEX IF NOT EXISTS "DocumentoFavorito_documentoId_idx" ON "DocumentoFavorito"("documentoId");
DO $$ BEGIN
  ALTER TABLE "DocumentoFavorito" ADD CONSTRAINT "DocumentoFavorito_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "DocumentoFavorito" ADD CONSTRAINT "DocumentoFavorito_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Pastas-pai que faltam (ids/slugs fixos; o código acha o pai pelo slug)
INSERT INTO "DocumentoCategoria" ("id", "nome", "slug", "diasAlerta", "exigeValidade", "ordem", "ativo")
SELECT 'cat_sst', 'SST', 'sst', 30, false,
       (SELECT COALESCE(MIN("ordem"), 40) FROM "DocumentoCategoria" WHERE "nome" LIKE 'SST — %'), true
WHERE NOT EXISTS (SELECT 1 FROM "DocumentoCategoria" WHERE "id" = 'cat_sst' OR "slug" = 'sst');

INSERT INTO "DocumentoCategoria" ("id", "nome", "slug", "diasAlerta", "exigeValidade", "ordem", "ativo")
SELECT 'cat_rh', 'RH', 'rh', 30, false,
       (SELECT COALESCE(MIN("ordem"), 90) FROM "DocumentoCategoria" WHERE "nome" LIKE 'RH — %'), true
WHERE NOT EXISTS (SELECT 1 FROM "DocumentoCategoria" WHERE "id" = 'cat_rh' OR "slug" = 'rh');

-- 4) "Pai — Filho" vira filho dentro do pai (id e slug NUNCA mudam; só nome e
--    paiId). Só mexe em quem ainda tem " — " no nome e está na raiz.
DO $$
DECLARE
  r        RECORD;
  v_pre    TEXT;
  v_resto  TEXT;
  v_pai    TEXT;
  v_slug   TEXT;
BEGIN
  FOR r IN
    SELECT "id", "nome", "ordem" FROM "DocumentoCategoria"
    WHERE "paiId" IS NULL AND position(' — ' in "nome") > 0
    ORDER BY "ordem", "nome"
  LOOP
    v_pre   := btrim(split_part(r."nome", ' — ', 1));
    v_resto := btrim(substring(r."nome" from position(' — ' in r."nome") + 3));
    IF v_pre = '' OR v_resto = '' THEN CONTINUE; END IF;

    SELECT "id" INTO v_pai FROM "DocumentoCategoria"
    WHERE "paiId" IS NULL AND lower("nome") = lower(v_pre) AND "id" <> r."id"
    ORDER BY ("id" LIKE 'cat\_%') DESC, "ordem"
    LIMIT 1;

    IF v_pai IS NULL THEN
      -- prefixo sem pasta-pai conhecida: cria uma (id cat_<slug>)
      v_slug := btrim(lower(regexp_replace(
        translate(v_pre, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'),
        '[^a-zA-Z0-9]+', '-', 'g')), '-');
      IF EXISTS (SELECT 1 FROM "DocumentoCategoria" WHERE "slug" = v_slug) THEN
        v_slug := v_slug || '-pasta';
      END IF;
      v_pai := 'cat_' || replace(v_slug, '-', '_');
      INSERT INTO "DocumentoCategoria" ("id", "nome", "slug", "diasAlerta", "exigeValidade", "ordem", "ativo")
      VALUES (v_pai, v_pre, v_slug, 30, false, r."ordem", true)
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE "DocumentoCategoria" SET "paiId" = v_pai, "nome" = v_resto WHERE "id" = r."id";
    v_pai := NULL;
  END LOOP;
END $$;
