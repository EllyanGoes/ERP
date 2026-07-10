-- Renomeia a empresa 'emp_atalaia' -> 'emp_atlas' (a razão social já era ATLAS).
-- PK referenciada por dezenas de FKs: cria a linha nova, migra TODAS as colunas
-- que apontam para Empresa (por FK e por convenção de nome "empresaId"), apaga a
-- antiga e restaura os campos únicos. O id do caixa em dinheiro acompanha, porque
-- o helper contaCaixaIdDaEmpresa() deriva `caixa-${empresaId}`.
-- Idempotente: no-op se 'emp_atalaia' não existe ou 'emp_atlas' já existe.

DO $$
DECLARE
  v_slug text; v_cnpj text; v_cliente text; v_fornecedor text;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Empresa" WHERE id = 'emp_atalaia')
     OR EXISTS (SELECT 1 FROM "Empresa" WHERE id = 'emp_atlas') THEN
    RETURN;
  END IF;

  SELECT slug, cnpj, "clienteId", "fornecedorId"
    INTO v_slug, v_cnpj, v_cliente, v_fornecedor
    FROM "Empresa" WHERE id = 'emp_atalaia';

  -- Cópia com os campos únicos neutralizados (restaurados após o DELETE da antiga).
  INSERT INTO "Empresa"
  SELECT (jsonb_populate_record(e, jsonb_build_object(
            'id', 'emp_atlas', 'slug', null, 'cnpj', v_cnpj || '-tmp',
            'clienteId', null, 'fornecedorId', null))).*
  FROM "Empresa" e WHERE e.id = 'emp_atalaia';

  -- 1) Toda coluna com FK para Empresa(id).
  FOR r IN
    SELECT rt.relname AS tabela, a.attname AS coluna
    FROM pg_constraint fk
    JOIN pg_class rt ON rt.oid = fk.conrelid
    JOIN pg_class ct ON ct.oid = fk.confrelid
    JOIN unnest(fk.conkey) AS ck(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = ck.attnum
    WHERE ct.relname = 'Empresa' AND fk.contype = 'f'
  LOOP
    EXECUTE format('UPDATE %I SET %I = %L WHERE %I = %L',
                   r.tabela, r.coluna, 'emp_atlas', r.coluna, 'emp_atalaia');
  END LOOP;

  -- 2) Colunas "empresaId"/"estoqueOrigemEmpresaId" sem FK (ex.: ContaContabil).
  FOR r IN
    SELECT c.table_name AS tabela, c.column_name AS coluna
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('empresaId', 'estoqueOrigemEmpresaId')
  LOOP
    EXECUTE format('UPDATE %I SET %I = %L WHERE %I = %L',
                   r.tabela, r.coluna, 'emp_atlas', r.coluna, 'emp_atalaia');
  END LOOP;

  DELETE FROM "Empresa" WHERE id = 'emp_atalaia';
  UPDATE "Empresa"
     SET slug = v_slug, cnpj = v_cnpj, "clienteId" = v_cliente, "fornecedorId" = v_fornecedor
   WHERE id = 'emp_atlas';

  -- Caixa em dinheiro derivado do id da empresa (contaCaixaIdDaEmpresa).
  -- Mesmo padrão copia -> migra referências -> apaga (PK referenciada por FKs).
  IF EXISTS (SELECT 1 FROM "ContaBancaria" WHERE id = 'caixa-emp_atalaia')
     AND NOT EXISTS (SELECT 1 FROM "ContaBancaria" WHERE id = 'caixa-emp_atlas') THEN
    INSERT INTO "ContaBancaria"
    SELECT (jsonb_populate_record(cb, '{"id": "caixa-emp_atlas"}'::jsonb)).*
    FROM "ContaBancaria" cb WHERE cb.id = 'caixa-emp_atalaia';
  END IF;
  UPDATE "ContaContabil" SET "contaBancariaId" = 'caixa-emp_atlas' WHERE "contaBancariaId" = 'caixa-emp_atalaia';
  FOR r IN
    SELECT rt.relname AS tabela, a.attname AS coluna
    FROM pg_constraint fk
    JOIN pg_class rt ON rt.oid = fk.conrelid
    JOIN pg_class ct ON ct.oid = fk.confrelid
    JOIN unnest(fk.conkey) AS ck(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = ck.attnum
    WHERE ct.relname = 'ContaBancaria' AND fk.contype = 'f'
  LOOP
    EXECUTE format('UPDATE %I SET %I = %L WHERE %I = %L',
                   r.tabela, r.coluna, 'caixa-emp_atlas', r.coluna, 'caixa-emp_atalaia');
  END LOOP;
  DELETE FROM "ContaBancaria" WHERE id = 'caixa-emp_atalaia';
END $$;
