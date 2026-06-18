-- Conta de PL "Saldos de Abertura" (2.3.3) — contrapartida do lançamento de
-- abertura de estoque (e outros saldos iniciais). Idempotente, por empresa.
INSERT INTO "ContaContabil" (id,"empresaId",codigo,nome,grupo,natureza,tipo,nivel,"aceitaLancamento","paiId",ativo)
SELECT 'cc_'||p."empresaId"||'_2_3_3', p."empresaId",'2.3.3','Saldos de Abertura',
  'PATRIMONIO_LIQUIDO'::"GrupoContabil",'CREDORA'::"NaturezaContabil",'ANALITICA'::"TipoContaContabil", p.nivel+1, true, p.id, true
FROM "ContaContabil" p WHERE p.codigo='2.3' AND p.grupo='PATRIMONIO_LIQUIDO'
ON CONFLICT ("empresaId", codigo) DO NOTHING;
