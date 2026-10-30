-- CA por produto do EPI (variação de tamanho/cor) e CA gravado na entrega.
ALTER TABLE "SstEpiItem" ADD COLUMN IF NOT EXISTS "ca" TEXT;
ALTER TABLE "SstEpiItem" ADD COLUMN IF NOT EXISTS "caValidade" TIMESTAMP(3);
ALTER TABLE "SstEpiItem" ADD COLUMN IF NOT EXISTS "fabricante" TEXT;
ALTER TABLE "SstEpiEntrega" ADD COLUMN IF NOT EXISTS "ca" TEXT;
