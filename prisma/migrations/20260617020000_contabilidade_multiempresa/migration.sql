-- Plano de contas contábil POR EMPRESA. Cada empresa tem seu próprio plano e
-- suas próprias contas analíticas de clientes/fornecedores. Idempotente.

-- ── Unicidade por empresa (clientes/fornecedores podem repetir entre empresas) ─
DROP INDEX IF EXISTS "ContaContabil_clienteId_key";
DROP INDEX IF EXISTS "ContaContabil_fornecedorId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_clienteId_key" ON "ContaContabil"("empresaId", "clienteId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_fornecedorId_key" ON "ContaContabil"("empresaId", "fornecedorId");

-- ── Seed do plano padrão para TODAS as empresas (idempotente) ─────────────────
-- ids determinísticos "<empresaId>:<codigo>"; emp_tramontin já tem o plano
-- (ids "cc_*") e é pulado pelo ON CONFLICT (empresaId, codigo).
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
SELECT
  e."id" || ':' || c.codigo,
  e."id",
  c.codigo, c.nome, c.grupo::"GrupoContabil", c.natureza::"NaturezaContabil", 'SINTETICA'::"TipoContaContabil", c.nivel, false,
  CASE WHEN c.pai IS NULL THEN NULL ELSE e."id" || ':' || c.pai END
FROM "Empresa" e
CROSS JOIN (VALUES
  ('1',     'Ativo',                        'ATIVO',              'DEVEDORA', 1, NULL::text),
  ('1.1',   'Ativo Circulante',             'ATIVO',              'DEVEDORA', 2, '1'),
  ('1.1.1', 'Caixa e Bancos',               'ATIVO',              'DEVEDORA', 3, '1.1'),
  ('1.1.2', 'Clientes',                     'ATIVO',              'DEVEDORA', 3, '1.1'),
  ('1.1.3', 'Estoques',                     'ATIVO',              'DEVEDORA', 3, '1.1'),
  ('2',     'Passivo',                      'PASSIVO',            'CREDORA',  1, NULL),
  ('2.1',   'Passivo Circulante',           'PASSIVO',            'CREDORA',  2, '2'),
  ('2.1.1', 'Fornecedores',                 'PASSIVO',            'CREDORA',  3, '2.1'),
  ('2.3',   'Patrimônio Líquido',           'PATRIMONIO_LIQUIDO', 'CREDORA',  2, '2'),
  ('2.3.1', 'Capital Social',               'PATRIMONIO_LIQUIDO', 'CREDORA',  3, '2.3'),
  ('2.3.2', 'Lucros/Prejuízos Acumulados',  'PATRIMONIO_LIQUIDO', 'CREDORA',  3, '2.3'),
  ('3',     'Resultado',                    'RESULTADO',          'CREDORA',  1, NULL),
  ('3.1',   'Receitas',                     'RESULTADO',          'CREDORA',  2, '3'),
  ('3.2',   'Custos',                       'RESULTADO',          'DEVEDORA', 2, '3'),
  ('3.3',   'Despesas',                     'RESULTADO',          'DEVEDORA', 2, '3')
) AS c(codigo, nome, grupo, natureza, nivel, pai)
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- ── Backfill: conta analítica por CLIENTE em cada empresa (sob 1.1.2) ─────────
WITH pais AS (
  SELECT "empresaId", "id" AS pai_id, "codigo" AS pai_cod, "nivel" AS pai_nivel
  FROM "ContaContabil" WHERE "codigo" = '1.1.2'
),
base AS (
  SELECT "paiId", COALESCE(MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)), 0) AS maxnum
  FROM "ContaContabil" WHERE "codigo" LIKE '1.1.2.%' GROUP BY "paiId"
)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","clienteId")
SELECT
  'ccli_' || p."empresaId" || '_' || cl."id",
  p."empresaId",
  '1.1.2.' || lpad((COALESCE(b.maxnum, 0) + row_number() OVER (PARTITION BY p."empresaId" ORDER BY cl."razaoSocial", cl."id"))::text, 4, '0'),
  cl."razaoSocial", 'ATIVO', 'DEVEDORA', 'ANALITICA', p.pai_nivel + 1, true, p.pai_id, cl."id"
FROM pais p
CROSS JOIN "Cliente" cl
LEFT JOIN base b ON b."paiId" = p.pai_id
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId" = p."empresaId" AND cc."clienteId" = cl."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- ── Backfill: conta analítica por FORNECEDOR em cada empresa (sob 2.1.1) ──────
WITH pais AS (
  SELECT "empresaId", "id" AS pai_id, "codigo" AS pai_cod, "nivel" AS pai_nivel
  FROM "ContaContabil" WHERE "codigo" = '2.1.1'
),
base AS (
  SELECT "paiId", COALESCE(MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)), 0) AS maxnum
  FROM "ContaContabil" WHERE "codigo" LIKE '2.1.1.%' GROUP BY "paiId"
)
INSERT INTO "ContaContabil" ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","fornecedorId")
SELECT
  'cforn_' || p."empresaId" || '_' || f."id",
  p."empresaId",
  '2.1.1.' || lpad((COALESCE(b.maxnum, 0) + row_number() OVER (PARTITION BY p."empresaId" ORDER BY f."razaoSocial", f."id"))::text, 4, '0'),
  f."razaoSocial", 'PASSIVO', 'CREDORA', 'ANALITICA', p.pai_nivel + 1, true, p.pai_id, f."id"
FROM pais p
CROSS JOIN "Fornecedor" f
LEFT JOIN base b ON b."paiId" = p.pai_id
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."empresaId" = p."empresaId" AND cc."fornecedorId" = f."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;
