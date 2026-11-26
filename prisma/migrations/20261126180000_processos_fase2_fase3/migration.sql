-- Processos externos — Fases 2 (acesso e financeiro) e 3 (externo) — docs/processos-prd.md.
-- Idempotente: re-rodar não muda nada.

-- ── Cofre de credenciais (AES-256-GCM na aplicação; aqui só o texto cifrado) ────
CREATE TABLE IF NOT EXISTS "ProcessoCredencial" (
  "id"             TEXT NOT NULL,
  "processoId"     TEXT NOT NULL,
  "portal"         TEXT NOT NULL,
  "url"            TEXT,
  "usuarioCifrado" TEXT NOT NULL,
  "senhaCifrada"   TEXT NOT NULL,
  "observacao"     TEXT,
  "criadoPor"      TEXT,
  "atualizadoPor"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoCredencial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoCredencial_processoId_idx" ON "ProcessoCredencial"("processoId");
DO $$ BEGIN
  ALTER TABLE "ProcessoCredencial" ADD CONSTRAINT "ProcessoCredencial_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Log do processo (ver/copiar credencial, ações do link externo) ────────────
CREATE TABLE IF NOT EXISTS "ProcessoLog" (
  "id"           TEXT NOT NULL,
  "processoId"   TEXT NOT NULL,
  "acao"         TEXT NOT NULL,
  "referenciaId" TEXT,
  "detalhe"      TEXT,
  "usuarioId"    TEXT,
  "autor"        TEXT NOT NULL,
  "ipHash"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoLog_processoId_createdAt_idx" ON "ProcessoLog"("processoId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProcessoLog_referenciaId_acao_createdAt_idx" ON "ProcessoLog"("referenciaId", "acao", "createdAt");
CREATE INDEX IF NOT EXISTS "ProcessoLog_ipHash_acao_createdAt_idx" ON "ProcessoLog"("ipHash", "acao", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ProcessoLog" ADD CONSTRAINT "ProcessoLog_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Bens do imobilizado ligados ao processo ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProcessoBem" (
  "id"            TEXT NOT NULL,
  "processoId"    TEXT NOT NULL,
  "imobilizadoId" TEXT NOT NULL,
  "observacao"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoBem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessoBem_processoId_imobilizadoId_key" ON "ProcessoBem"("processoId", "imobilizadoId");
CREATE INDEX IF NOT EXISTS "ProcessoBem_imobilizadoId_idx" ON "ProcessoBem"("imobilizadoId");
DO $$ BEGIN
  ALTER TABLE "ProcessoBem" ADD CONSTRAINT "ProcessoBem_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoBem" ADD CONSTRAINT "ProcessoBem_imobilizadoId_fkey"
    FOREIGN KEY ("imobilizadoId") REFERENCES "Imobilizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
-- O campo legado Processo.imobilizadoId (fase 1, sem tela) vira vínculo, se apontar para bem existente.
INSERT INTO "ProcessoBem" ("id", "processoId", "imobilizadoId")
SELECT 'pb_' || p."id", p."id", p."imobilizadoId"
FROM "Processo" p JOIN "Imobilizado" i ON i."id" = p."imobilizadoId"
WHERE p."imobilizadoId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── Financeiro do processo (vínculo gerencial; não muda contabilização) ───────
ALTER TABLE "ContaPagar" ADD COLUMN IF NOT EXISTS "processoId" TEXT;
CREATE INDEX IF NOT EXISTS "ContaPagar_processoId_idx" ON "ContaPagar"("processoId");
DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "ContaReceber" ADD COLUMN IF NOT EXISTS "processoId" TEXT;
CREATE INDEX IF NOT EXISTS "ContaReceber_processoId_idx" ON "ContaReceber"("processoId");
DO $$ BEGIN
  ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Fase 3: andamento interno + link externo ──────────────────────────────────
ALTER TABLE "ProcessoAndamento" ADD COLUMN IF NOT EXISTS "interno" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ProcessoAcessoExterno" (
  "id"             TEXT NOT NULL,
  "processoId"     TEXT NOT NULL,
  "nome"           TEXT NOT NULL,
  "email"          TEXT,
  "telefone"       TEXT,
  "tokenHash"      TEXT NOT NULL,
  "validoAte"      TIMESTAMP(3),
  "revogadoEm"     TIMESTAMP(3),
  "revogadoPor"    TEXT,
  "documentoIds"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "podeLancar"     BOOLEAN NOT NULL DEFAULT true,
  "ultimoAcessoEm" TIMESTAMP(3),
  "criadoPor"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoAcessoExterno_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessoAcessoExterno_tokenHash_key" ON "ProcessoAcessoExterno"("tokenHash");
CREATE INDEX IF NOT EXISTS "ProcessoAcessoExterno_processoId_idx" ON "ProcessoAcessoExterno"("processoId");
DO $$ BEGIN
  ALTER TABLE "ProcessoAcessoExterno" ADD CONSTRAINT "ProcessoAcessoExterno_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "Processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
