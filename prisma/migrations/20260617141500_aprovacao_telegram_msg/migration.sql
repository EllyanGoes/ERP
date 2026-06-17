-- Mensagem do Telegram (DM ao aprovador) na pendência de aprovação, para editar
-- a mensagem ao aprovar/reprovar (novo status, sem botões). Idempotente.
ALTER TABLE "AprovacaoSC" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "AprovacaoSC" ADD COLUMN IF NOT EXISTS "telegramMsgId" INTEGER;
