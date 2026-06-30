-- As localizações já mapeadas (matriz do concorrente) passam a contar como canal
-- "Loja física" (LOCALIZACAO). Backfill idempotente: só cria se ainda não há um
-- canal de localização para o concorrente.
INSERT INTO "ConcorrenteCanal"
  (id, "empresaId", "concorrenteId", tipo, valor, cep, logradouro, numero, complemento, bairro, cidade, estado, latitude, longitude, "geoManual", "geoReferencia", "createdAt", "updatedAt")
SELECT
  'cc_' || replace(gen_random_uuid()::text,'-',''), c."empresaId", c.id, 'LOCALIZACAO',
  COALESCE(NULLIF(c."nomeFantasia",''), c."razaoSocial", 'Loja'),
  c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.estado,
  c.latitude, c.longitude, c."geoManual", c."geoReferencia", now(), now()
FROM "Concorrente" c
WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ConcorrenteCanal" k WHERE k."concorrenteId"=c.id AND k.tipo='LOCALIZACAO');
