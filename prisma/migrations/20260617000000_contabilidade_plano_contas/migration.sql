-- Módulo Contabilidade — plano de contas contábil. Idempotente.
-- Contas com natureza devedora/credora, grupo (Ativo/Passivo/PL/Resultado) e
-- hierarquia sintética × analítica. Clientes e fornecedores ganham uma conta
-- analítica própria; estoque fica só sintético.

-- ── Enums ──────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GrupoContabil') THEN
    CREATE TYPE "GrupoContabil" AS ENUM ('ATIVO', 'PASSIVO', 'PATRIMONIO_LIQUIDO', 'RESULTADO');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NaturezaContabil') THEN
    CREATE TYPE "NaturezaContabil" AS ENUM ('DEVEDORA', 'CREDORA');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoContaContabil') THEN
    CREATE TYPE "TipoContaContabil" AS ENUM ('SINTETICA', 'ANALITICA');
  END IF;
END $$;

-- ── Tabela ───────────────────────────────────────────────────────────────────--
CREATE TABLE IF NOT EXISTS "ContaContabil" (
  "id"               TEXT NOT NULL,
  "empresaId"        TEXT NOT NULL DEFAULT 'emp_tramontin',
  "codigo"           TEXT NOT NULL,
  "nome"             TEXT NOT NULL,
  "grupo"            "GrupoContabil" NOT NULL,
  "natureza"         "NaturezaContabil" NOT NULL,
  "tipo"             "TipoContaContabil" NOT NULL,
  "nivel"            INTEGER NOT NULL,
  "aceitaLancamento" BOOLEAN NOT NULL DEFAULT false,
  "paiId"            TEXT,
  "clienteId"        TEXT,
  "fornecedorId"     TEXT,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContaContabil_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_empresaId_codigo_key" ON "ContaContabil"("empresaId", "codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_clienteId_key" ON "ContaContabil"("clienteId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContaContabil_fornecedorId_key" ON "ContaContabil"("fornecedorId");
CREATE INDEX IF NOT EXISTS "ContaContabil_empresaId_idx" ON "ContaContabil"("empresaId");
CREATE INDEX IF NOT EXISTS "ContaContabil_paiId_idx" ON "ContaContabil"("paiId");
CREATE INDEX IF NOT EXISTS "ContaContabil_grupo_idx" ON "ContaContabil"("grupo");

-- ── Seed do plano padrão (1/2/2.3/3) ───────────────────────────────────────────
INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId")
VALUES
  ('cc_1',     'emp_tramontin', '1',     'Ativo',                        'ATIVO',              'DEVEDORA', 'SINTETICA', 1, false, NULL),
  ('cc_1_1',   'emp_tramontin', '1.1',   'Ativo Circulante',             'ATIVO',              'DEVEDORA', 'SINTETICA', 2, false, 'cc_1'),
  ('cc_1_1_1', 'emp_tramontin', '1.1.1', 'Caixa e Bancos',               'ATIVO',              'DEVEDORA', 'SINTETICA', 3, false, 'cc_1_1'),
  ('cc_1_1_2', 'emp_tramontin', '1.1.2', 'Clientes',                     'ATIVO',              'DEVEDORA', 'SINTETICA', 3, false, 'cc_1_1'),
  ('cc_1_1_3', 'emp_tramontin', '1.1.3', 'Estoques',                     'ATIVO',              'DEVEDORA', 'SINTETICA', 3, false, 'cc_1_1'),
  ('cc_2',     'emp_tramontin', '2',     'Passivo',                      'PASSIVO',            'CREDORA',  'SINTETICA', 1, false, NULL),
  ('cc_2_1',   'emp_tramontin', '2.1',   'Passivo Circulante',           'PASSIVO',            'CREDORA',  'SINTETICA', 2, false, 'cc_2'),
  ('cc_2_1_1', 'emp_tramontin', '2.1.1', 'Fornecedores',                 'PASSIVO',            'CREDORA',  'SINTETICA', 3, false, 'cc_2_1'),
  ('cc_2_3',   'emp_tramontin', '2.3',   'Patrimônio Líquido',           'PATRIMONIO_LIQUIDO', 'CREDORA',  'SINTETICA', 2, false, 'cc_2'),
  ('cc_2_3_1', 'emp_tramontin', '2.3.1', 'Capital Social',               'PATRIMONIO_LIQUIDO', 'CREDORA',  'SINTETICA', 3, false, 'cc_2_3'),
  ('cc_2_3_2', 'emp_tramontin', '2.3.2', 'Lucros/Prejuízos Acumulados',  'PATRIMONIO_LIQUIDO', 'CREDORA',  'SINTETICA', 3, false, 'cc_2_3'),
  ('cc_3',     'emp_tramontin', '3',     'Resultado',                    'RESULTADO',          'CREDORA',  'SINTETICA', 1, false, NULL),
  ('cc_3_1',   'emp_tramontin', '3.1',   'Receitas',                     'RESULTADO',          'CREDORA',  'SINTETICA', 2, false, 'cc_3'),
  ('cc_3_2',   'emp_tramontin', '3.2',   'Custos',                       'RESULTADO',          'DEVEDORA', 'SINTETICA', 2, false, 'cc_3'),
  ('cc_3_3',   'emp_tramontin', '3.3',   'Despesas',                     'RESULTADO',          'DEVEDORA', 'SINTETICA', 2, false, 'cc_3')
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- ── Backfill: conta analítica por CLIENTE (sob 1.1.2) ──────────────────────────
INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","clienteId")
SELECT
  'ccli_' || c."id",
  'emp_tramontin',
  '1.1.2.' || lpad((COALESCE(base.maxnum, 0) + row_number() OVER (ORDER BY c."razaoSocial", c."id"))::text, 4, '0'),
  c."razaoSocial",
  'ATIVO', 'DEVEDORA', 'ANALITICA', 4, true, 'cc_1_1_2', c."id"
FROM "Cliente" c
CROSS JOIN (
  SELECT MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)) AS maxnum
  FROM "ContaContabil" WHERE "paiId" = 'cc_1_1_2'
) base
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."clienteId" = c."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;

-- ── Backfill: conta analítica por FORNECEDOR (sob 2.1.1) ───────────────────────
INSERT INTO "ContaContabil"
  ("id","empresaId","codigo","nome","grupo","natureza","tipo","nivel","aceitaLancamento","paiId","fornecedorId")
SELECT
  'cforn_' || f."id",
  'emp_tramontin',
  '2.1.1.' || lpad((COALESCE(base.maxnum, 0) + row_number() OVER (ORDER BY f."razaoSocial", f."id"))::text, 4, '0'),
  f."razaoSocial",
  'PASSIVO', 'CREDORA', 'ANALITICA', 4, true, 'cc_2_1_1', f."id"
FROM "Fornecedor" f
CROSS JOIN (
  SELECT MAX(CAST(split_part("codigo", '.', 4) AS INTEGER)) AS maxnum
  FROM "ContaContabil" WHERE "paiId" = 'cc_2_1_1'
) base
WHERE NOT EXISTS (SELECT 1 FROM "ContaContabil" cc WHERE cc."fornecedorId" = f."id")
ON CONFLICT ("empresaId","codigo") DO NOTHING;
