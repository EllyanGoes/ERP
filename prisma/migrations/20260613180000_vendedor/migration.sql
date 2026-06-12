-- Cadastro próprio de vendedores (sem login no ERP) + vínculo no pedido de
-- venda para saber quem fez a venda. Compartilhado no grupo, como Motorista.
CREATE TABLE IF NOT EXISTS "Vendedor" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "telefone"  TEXT,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Vendedor_ativo_idx" ON "Vendedor"("ativo");

ALTER TABLE "PedidoVenda" ADD COLUMN IF NOT EXISTS "vendedorId" TEXT;
CREATE INDEX IF NOT EXISTS "PedidoVenda_vendedorId_idx" ON "PedidoVenda"("vendedorId");

DO $do$ BEGIN
  ALTER TABLE "PedidoVenda"
    ADD CONSTRAINT "PedidoVenda_vendedorId_fkey"
    FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
