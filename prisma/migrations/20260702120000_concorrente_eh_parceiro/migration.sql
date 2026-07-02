-- Parceria comercial vira campo próprio do Concorrente (estrela no mapa),
-- desacoplada do vínculo clienteId — dá pra tornar/desfazer parceiro sem
-- mexer no vínculo com a base de clientes.
ALTER TABLE "Concorrente" ADD COLUMN IF NOT EXISTS "ehParceiro" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: quem veio da base de clientes (vínculo clienteId) já era tratado
-- como parceiro — herda a flag. Idempotente (re-execução não muda nada).
UPDATE "Concorrente" SET "ehParceiro" = true WHERE "clienteId" IS NOT NULL AND NOT "ehParceiro";
