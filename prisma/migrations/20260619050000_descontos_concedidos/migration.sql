-- Descontos concedidos nos pedidos como dedução da receita. Cria a conta redutora
-- 3.1.9003 (DEVEDORA, sob 3.1) e uma seção de DRE "(-) Deduções da Receita"
-- (SUBTRAI), vinculando a conta a ela. Idempotente.

-- 1) Conta redutora de receita (DEVEDORA).
INSERT INTO "ContaContabil" (id,"empresaId",codigo,nome,grupo,natureza,tipo,nivel,"aceitaLancamento","paiId",ativo)
SELECT 'cc_'||p."empresaId"||'_3_1_9003', p."empresaId",'3.1.9003','(-) Descontos Concedidos',
  'RESULTADO'::"GrupoContabil",'DEVEDORA'::"NaturezaContabil",'ANALITICA'::"TipoContaContabil", p.nivel+1, true, p.id, true
FROM "ContaContabil" p WHERE p.codigo='3.1' AND p.grupo='RESULTADO'
ON CONFLICT ("empresaId", codigo) DO NOTHING;

-- 2) Seção de DRE de deduções (SUBTRAI), ao fim da ordem (reordenável por drag).
INSERT INTO "DRESecao" (id,"empresaId",nome,operacao,ordem)
SELECT 'dre_'||e.id||'_deducoes', e.id, '(-) Deduções da Receita', 'SUBTRAI'::"DREOperacao",
  COALESCE((SELECT MAX(ordem) FROM "DRESecao" s WHERE s."empresaId"=e.id),0)+1
FROM "Empresa" e
WHERE NOT EXISTS (SELECT 1 FROM "DRESecao" s WHERE s."empresaId"=e.id AND s.nome='(-) Deduções da Receita');

-- 3) Vincular a conta de desconto à seção de deduções.
UPDATE "ContaContabil" cc SET "dreSecaoId" = s.id
FROM "DRESecao" s
WHERE cc.codigo='3.1.9003' AND s."empresaId"=cc."empresaId" AND s.nome='(-) Deduções da Receita'
  AND (cc."dreSecaoId" IS NULL OR cc."dreSecaoId" <> s.id);
