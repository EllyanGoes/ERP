-- Histórico de status do fluxo de compras (docs/compras-fluxo-unico-prd.md §4.1).
-- Gravado por trigger para não depender de cada rota, webhook ou script que muda status.

CREATE TABLE IF NOT EXISTS "CompraStatusLog" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "empresaId"     TEXT NOT NULL,
  "documentoTipo" TEXT NOT NULL,
  "documentoId"   TEXT NOT NULL,
  "statusDe"      TEXT,
  "statusPara"    TEXT NOT NULL,
  "usuario"       TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompraStatusLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompraStatusLog_documentoTipo_documentoId_idx" ON "CompraStatusLog" ("documentoTipo", "documentoId");
CREATE INDEX IF NOT EXISTS "CompraStatusLog_criadoEm_idx" ON "CompraStatusLog" ("criadoEm");

CREATE OR REPLACE FUNCTION compra_status_log() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO "CompraStatusLog" ("empresaId", "documentoTipo", "documentoId", "statusDe", "statusPara", "usuario")
    VALUES (
      NEW."empresaId", TG_ARGV[0], NEW."id",
      CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::text END,
      NEW."status"::text,
      COALESCE(NEW."atualizadoPor", NEW."criadoPor")
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compra_status_log_sc ON "NecessidadeCompra";
CREATE TRIGGER compra_status_log_sc AFTER INSERT OR UPDATE OF "status" ON "NecessidadeCompra"
  FOR EACH ROW EXECUTE FUNCTION compra_status_log('SC');

DROP TRIGGER IF EXISTS compra_status_log_ct ON "CotacaoCompra";
CREATE TRIGGER compra_status_log_ct AFTER INSERT OR UPDATE OF "status" ON "CotacaoCompra"
  FOR EACH ROW EXECUTE FUNCTION compra_status_log('CT');

DROP TRIGGER IF EXISTS compra_status_log_pc ON "PedidoCompra";
CREATE TRIGGER compra_status_log_pc AFTER INSERT OR UPDATE OF "status" ON "PedidoCompra"
  FOR EACH ROW EXECUTE FUNCTION compra_status_log('PC');

DROP TRIGGER IF EXISTS compra_status_log_de ON "ConferenciaCompra";
CREATE TRIGGER compra_status_log_de AFTER INSERT OR UPDATE OF "status" ON "ConferenciaCompra"
  FOR EACH ROW EXECUTE FUNCTION compra_status_log('DE');
