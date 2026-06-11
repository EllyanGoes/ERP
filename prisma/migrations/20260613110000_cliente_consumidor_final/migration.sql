-- Alinha o banco ao schema (Cliente.cpfCnpj é opcional no Prisma; produção já
-- está assim — em bancos locais antigos a coluna ainda era NOT NULL).
ALTER TABLE "Cliente" ALTER COLUMN "cpfCnpj" DROP NOT NULL;

-- Cliente genérico "Consumidor Final" para venda balcão sem cadastro
-- (cliente com pressa que não quer se cadastrar). Cadastro compartilhado
-- entre as empresas do grupo, id fixo para o atalho no formulário do pedido.
INSERT INTO "Cliente" (id, "tipoPessoa", "razaoSocial", status, observacoes, "createdAt", "updatedAt")
VALUES (
  'cli_consumidor_final',
  'FISICA',
  'Consumidor Final',
  'ATIVO',
  'Cliente genérico para venda balcão sem cadastro.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;
