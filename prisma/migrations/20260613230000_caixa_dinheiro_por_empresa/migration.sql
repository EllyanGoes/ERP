-- Conta "Caixa em Dinheiro" por empresa: destino padrão dos recebimentos em
-- dinheiro (substitui o antigo `caixa-geral` fixo, que era da Tramontin e
-- vazava o caixa entre empresas). A Tramontin mantém o id histórico
-- `caixa-geral`; as demais usam `caixa-<empresaId>`. Idempotente.
INSERT INTO "ContaBancaria" (id, "empresaId", nome, tipo, "saldoInicial", ativo, "createdAt", "updatedAt")
SELECT
  CASE WHEN e.id = 'emp_tramontin' THEN 'caixa-geral' ELSE 'caixa-' || e.id END,
  e.id,
  'Caixa em Dinheiro',
  'CAIXA'::"TipoContaBancaria",
  0,
  true,
  now(),
  now()
FROM "Empresa" e
WHERE e.ativo = true
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      tipo = EXCLUDED.tipo,
      ativo = true,
      "updatedAt" = now();
