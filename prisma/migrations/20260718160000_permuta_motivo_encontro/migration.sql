-- Permuta deixa de ser subsistema com conta transitória própria e vira um
-- MOTIVO do Encontro de Contas (mesmo motor, mesmo lançamento atômico
-- D Fornecedor / C Cliente — muda só a semântica exibida). A coluna
-- ContaBancaria.permuta cai: nenhuma conta "Permutas a liquidar" chegou a ser
-- criada (verificado em prod antes desta migration) e o código que a criava
-- foi removido. Idempotente.

ALTER TABLE "Compensacao" ADD COLUMN IF NOT EXISTS "motivo" TEXT NOT NULL DEFAULT 'COMPENSACAO';

ALTER TABLE "ContaBancaria" DROP COLUMN IF EXISTS "permuta";
