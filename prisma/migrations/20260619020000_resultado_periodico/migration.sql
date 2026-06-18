-- Reestruturação do grupo Resultado (CMV/CPV periódico — Fase 1). Idempotente.
-- CMV e CPV viram SINTÉTICAS totalizadoras com a analítica do custo da venda
-- embaixo; cria a estrutura periódica futura (Compras, Fretes, MOD, CIF, WIP…)
-- marcada inativa (ativo=false) para não poluir o DRE; unifica a receita de venda.

-- 1) Sintéticas CMV (3.2.1) e CPV (3.2.2) sob 3.2 Custos.
WITH s(codigo, nome) AS (
  VALUES ('3.2.1', 'CMV — Custo das Mercadorias Vendidas'),
         ('3.2.2', 'CPV — Custo dos Produtos Vendidos')
)
INSERT INTO "ContaContabil" (id,"empresaId",codigo,nome,grupo,natureza,tipo,nivel,"aceitaLancamento","paiId",ativo)
SELECT 'cc_'||p."empresaId"||'_'||replace(s.codigo,'.','_'), p."empresaId", s.codigo, s.nome,
       'RESULTADO'::"GrupoContabil", p.natureza, 'SINTETICA'::"TipoContaContabil", p.nivel+1, false, p.id, true
FROM s JOIN "ContaContabil" p ON p.codigo = '3.2' AND p.grupo = 'RESULTADO'
ON CONFLICT ("empresaId", codigo) DO NOTHING;

-- 2) Analíticas ATIVAS que o motor perpétuo alimenta na venda.
WITH a(codigo, nome, paicodigo) AS (
  VALUES ('3.2.1.0001', 'Custo das mercadorias vendidas', '3.2.1'),
         ('3.2.2.0001', 'Custo dos produtos vendidos', '3.2.2')
)
INSERT INTO "ContaContabil" (id,"empresaId",codigo,nome,grupo,natureza,tipo,nivel,"aceitaLancamento","paiId",ativo)
SELECT 'cc_'||p."empresaId"||'_'||replace(a.codigo,'.','_'), p."empresaId", a.codigo, a.nome,
       'RESULTADO'::"GrupoContabil", p.natureza, 'ANALITICA'::"TipoContaContabil", p.nivel+1, true, p.id, true
FROM a JOIN "ContaContabil" p ON p.codigo = a.paicodigo AND p.grupo = 'RESULTADO'
ON CONFLICT ("empresaId", codigo) DO NOTHING;

-- 3) Estrutura periódica futura (Fase 2) — mapeada mas INATIVA (ativo=false).
WITH ph(codigo, nome, paicodigo, tipo) AS (
  VALUES
    ('3.2.1.9001', 'Compras de Mercadorias', '3.2.1', 'ANALITICA'),
    ('3.2.1.9002', 'Fretes e Seguros sobre Compras', '3.2.1', 'ANALITICA'),
    ('3.2.1.9003', '(-) Impostos Recuperáveis sobre Compras', '3.2.1', 'ANALITICA'),
    ('3.2.1.9004', '(-) Devoluções e Abatimentos', '3.2.1', 'ANALITICA'),
    ('3.2.1.9005', '(+/-) Variação de Estoque (EI - EF)', '3.2.1', 'ANALITICA'),
    ('3.2.2.1', 'Consumo de Matérias-Primas e Insumos', '3.2.2', 'SINTETICA'),
    ('3.2.2.2', 'Mão de Obra Direta (MOD)', '3.2.2', 'SINTETICA'),
    ('3.2.2.3', 'Custos Indiretos de Fabricação (CIF)', '3.2.2', 'SINTETICA'),
    ('3.2.2.4', 'Variação de Produtos em Elaboração e Acabados', '3.2.2', 'SINTETICA')
)
INSERT INTO "ContaContabil" (id,"empresaId",codigo,nome,grupo,natureza,tipo,nivel,"aceitaLancamento","paiId",ativo)
SELECT 'cc_'||p."empresaId"||'_'||replace(ph.codigo,'.','_'), p."empresaId", ph.codigo, ph.nome,
       'RESULTADO'::"GrupoContabil", p.natureza, ph.tipo::"TipoContaContabil", p.nivel+1,
       (ph.tipo = 'ANALITICA'), p.id, false
FROM ph JOIN "ContaContabil" p ON p.codigo = ph.paicodigo AND p.grupo = 'RESULTADO'
ON CONFLICT ("empresaId", codigo) DO NOTHING;

-- 4) Repointar as partidas históricas para as novas analíticas (sem mudar totais).
UPDATE "PartidaContabil" pa SET "contaId" = novo.id
FROM "ContaContabil" velho
JOIN "ContaContabil" novo ON novo."empresaId" = velho."empresaId" AND novo.codigo = '3.2.1.0001'
WHERE velho.codigo = '3.2.9002' AND pa."contaId" = velho.id;

UPDATE "PartidaContabil" pa SET "contaId" = novo.id
FROM "ContaContabil" velho
JOIN "ContaContabil" novo ON novo."empresaId" = velho."empresaId" AND novo.codigo = '3.2.2.0001'
WHERE velho.codigo = '3.2.9003' AND pa."contaId" = velho.id;

-- Receita unificada: tudo em 3.1.9002 "Receita de Vendas".
UPDATE "PartidaContabil" pa SET "contaId" = novo.id
FROM "ContaContabil" velho
JOIN "ContaContabil" novo ON novo."empresaId" = velho."empresaId" AND novo.codigo = '3.1.9002'
WHERE velho.codigo = '3.1.0002' AND pa."contaId" = velho.id;

-- 5) Desativar as contas esvaziadas/redundantes (CMV/CPV antigas, receita por
--    natureza, e as contas de formação de custo zeradas). 3.2.9001 (Custo de
--    Produção) permanece ativa pois está ligada ao motor de produção.
UPDATE "ContaContabil"
SET ativo = false
WHERE grupo = 'RESULTADO'
  AND codigo IN ('3.2.9002','3.2.9003','3.1.0002','3.2.0001','3.2.0002','3.2.0003');
