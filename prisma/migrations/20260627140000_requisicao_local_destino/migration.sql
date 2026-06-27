-- RequisicaoMaterial: local de DESTINO opcional. Quando preenchido, atender a
-- requisição vira uma TRANSFERÊNCIA (saída na origem + entrada no destino), em vez
-- de baixa/consumo. Usado pela liberação de embalagem do almoxarifado p/ a produção.
ALTER TABLE "RequisicaoMaterial" ADD COLUMN IF NOT EXISTS "localDestinoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterial"
    ADD CONSTRAINT "RequisicaoMaterial_localDestinoId_fkey"
    FOREIGN KEY ("localDestinoId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "RequisicaoMaterial_localDestinoId_idx" ON "RequisicaoMaterial"("localDestinoId");
