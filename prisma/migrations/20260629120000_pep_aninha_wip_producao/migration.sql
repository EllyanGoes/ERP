-- Aninha as contas de estoque de WIP de PRODUÇÃO dentro da sintética PEP
-- (1.1.3.0005 "Estoque de Produto em Processo"). Antes elas nasciam soltas como
-- irmãs em 1.1.3 (o motor de conta-por-local criava toda conta sob 1.1.3, sem
-- distinguir produção). O Balanço agrega filhos por PREFIXO de código, então
-- além de reparentar (paiId/nivel) é preciso RENUMERAR p/ 1.1.3.0005.NNNN.
--
-- Escopo: locais de WIP de produção = categoria "WIP" (úmido/seco/queimado) ou o
-- genérico "Produção (WIP)". A embalagem liberada à produção (cat. EMBALAGEM) NÃO
-- é WIP e permanece em 1.1.3. Idempotente: contas já movidas deixam de casar o
-- filtro (paiId já é o da PEP e o código passa a ter 5 segmentos).
DO $$
DECLARE
  emp   RECORD;
  pep   RECORD;
  wip   RECORD;
  prox  INT;
BEGIN
  FOR emp IN
    SELECT DISTINCT "empresaId" AS id
      FROM "ContaContabil"
     WHERE codigo = '1.1.3.0005' AND tipo = 'SINTETICA'
  LOOP
    SELECT id, codigo, nivel INTO pep
      FROM "ContaContabil"
     WHERE "empresaId" = emp.id AND codigo = '1.1.3.0005'
     LIMIT 1;

    -- próximo sufixo livre sob a PEP (último segmento do código do filho)
    SELECT COALESCE(MAX((regexp_replace(codigo, '^.*\.', ''))::int), 0) INTO prox
      FROM "ContaContabil"
     WHERE "paiId" = pep.id;

    FOR wip IN
      SELECT c.id
        FROM "ContaContabil" c
        JOIN "LocalEstoque" l ON l.id = c."localEstoqueId"
       WHERE c."empresaId" = emp.id
         AND c.codigo ~ '^1\.1\.3\.[0-9]{4}$'        -- analítica nível-4 direto sob 1.1.3
         AND c."paiId" <> pep.id
         AND ( 'WIP' = ANY(l."categoriasAceitas"::text[]) OR l.nome = 'Produção (WIP)' )
       ORDER BY c.codigo
    LOOP
      prox := prox + 1;
      UPDATE "ContaContabil"
         SET "paiId" = pep.id,
             nivel   = pep.nivel + 1,
             codigo  = pep.codigo || '.' || lpad(prox::text, 4, '0')
       WHERE id = wip.id;
    END LOOP;
  END LOOP;
END $$;
