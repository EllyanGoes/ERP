-- Documento de Entrada — três capacidades novas (fatura SANTA APOLONIA):
-- 1. Item COMPONENTE (pai/filho): ConferenciaCompraItem.paiId — o filho decompõe
--    o preço do pai (não movimenta estoque, não entra no líquido/CP).
-- 2. Pagamento JÁ REALIZADO (entrada/sinal): valor/data/forma/conta no DE; na
--    conclusão vira título quitado e as parcelas incidem sobre o restante.
-- 3. Grade de duplicatas EDITADA manualmente: parcelasCustom (JSON) substitui
--    calcularParcelas na conclusão. Idempotente.

ALTER TABLE "ConferenciaCompraItem" ADD COLUMN IF NOT EXISTS "paiId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConferenciaCompraItem_paiId_fkey') THEN
    ALTER TABLE "ConferenciaCompraItem"
      ADD CONSTRAINT "ConferenciaCompraItem_paiId_fkey"
      FOREIGN KEY ("paiId") REFERENCES "ConferenciaCompraItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ConferenciaCompraItem_paiId_idx" ON "ConferenciaCompraItem"("paiId");

ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "valorPagoAntecipado" DECIMAL(15,2);
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "dataPagoAntecipado" TIMESTAMP(3);
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "formaPagoAntecipadoId" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "contaPagoAntecipadoId" TEXT;
ALTER TABLE "ConferenciaCompra" ADD COLUMN IF NOT EXISTS "parcelasCustom" JSONB;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConferenciaCompra_formaPagoAntecipadoId_fkey') THEN
    ALTER TABLE "ConferenciaCompra"
      ADD CONSTRAINT "ConferenciaCompra_formaPagoAntecipadoId_fkey"
      FOREIGN KEY ("formaPagoAntecipadoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConferenciaCompra_contaPagoAntecipadoId_fkey') THEN
    ALTER TABLE "ConferenciaCompra"
      ADD CONSTRAINT "ConferenciaCompra_contaPagoAntecipadoId_fkey"
      FOREIGN KEY ("contaPagoAntecipadoId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
