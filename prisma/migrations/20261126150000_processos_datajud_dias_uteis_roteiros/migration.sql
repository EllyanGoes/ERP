-- Processos externos — Fase 1.5 (docs/processos-prd.md, "Ideias do Astrea").
-- Idempotente: re-rodar não muda nada.

-- ── Item 1: captura automática pelo DataJud (CNJ) ─────────────────────────────
-- O número CNJ é o próprio "numero" do processo (reaproveitado); aqui só o controle.
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudTribunal" TEXT;
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudUltimaConsulta" TIMESTAMP(3);
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudUltimoErro" TEXT;
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudClasse" TEXT;
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudOrgaoJulgador" TEXT;
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "datajudAssuntos" TEXT;
CREATE INDEX IF NOT EXISTS "Processo_datajudAtivo_idx" ON "Processo"("datajudAtivo");

-- Andamentos: origem (já existia, default MANUAL), chave de dedup, importância, resumo da IA.
ALTER TABLE "ProcessoAndamento" ADD COLUMN IF NOT EXISTS "externoId" TEXT;
ALTER TABLE "ProcessoAndamento" ADD COLUMN IF NOT EXISTS "importancia" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "ProcessoAndamento" ADD COLUMN IF NOT EXISTS "resumoIa" TEXT;
ALTER TABLE "ProcessoAndamento" ADD COLUMN IF NOT EXISTS "codigoMovimento" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessoAndamento_processoId_externoId_key" ON "ProcessoAndamento"("processoId", "externoId");
CREATE INDEX IF NOT EXISTS "ProcessoAndamento_importancia_data_idx" ON "ProcessoAndamento"("importancia", "data");

-- ── Item 2: prazo em dias úteis ──────────────────────────────────────────────
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "diasUteis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "prazoDias" INTEGER;
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "inicioContagem" TIMESTAMP(3);
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "suspensaoForense" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProcessoPrazo" ADD COLUMN IF NOT EXISTS "fundamento" TEXT;

-- ── Item 3: roteiros (tarefas padrão) por tipo de processo ───────────────────
CREATE TABLE IF NOT EXISTS "ProcessoRoteiro" (
  "id"        TEXT NOT NULL,
  "tipo"      TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "descricao" TEXT,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcessoRoteiro_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoRoteiro_tipo_ativo_idx" ON "ProcessoRoteiro"("tipo", "ativo");

CREATE TABLE IF NOT EXISTS "ProcessoRoteiroEtapa" (
  "id"            TEXT NOT NULL,
  "roteiroId"     TEXT NOT NULL,
  "ordem"         INTEGER NOT NULL DEFAULT 0,
  "titulo"        TEXT NOT NULL,
  "responsavelId" TEXT,
  "dias"          INTEGER NOT NULL DEFAULT 0,
  "diasUteis"     BOOLEAN NOT NULL DEFAULT true,
  "base"          TEXT NOT NULL DEFAULT 'ABERTURA',
  "avisoDias"     INTEGER NOT NULL DEFAULT 3,
  CONSTRAINT "ProcessoRoteiroEtapa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProcessoRoteiroEtapa_roteiroId_ordem_idx" ON "ProcessoRoteiroEtapa"("roteiroId", "ordem");
DO $$ BEGIN
  ALTER TABLE "ProcessoRoteiroEtapa" ADD CONSTRAINT "ProcessoRoteiroEtapa_roteiroId_fkey"
    FOREIGN KEY ("roteiroId") REFERENCES "ProcessoRoteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessoRoteiroEtapa" ADD CONSTRAINT "ProcessoRoteiroEtapa_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Roteiros iniciais (ids fixos; prazos são referência editável — conferir a lei/edital de cada caso).
INSERT INTO "ProcessoRoteiro" ("id", "tipo", "nome", "descricao") VALUES
  ('rot_auto_sefaz', 'FISCAL', 'Auto de infração (SEFAZ)', 'Defesa administrativa de auto de infração estadual. Confira no auto o prazo de impugnação/pagamento com desconto.'),
  ('rot_notif_mte', 'TRABALHISTA', 'Notificação / auto do MTE', 'Fiscalização do trabalho: reunir documentos e apresentar defesa ou cumprir a notificação.'),
  ('rot_acao_trab', 'JUDICIAL', 'Ação trabalhista', 'Reclamação trabalhista: da citação à audiência. Prazos dependem da notificação e da pauta da vara.'),
  ('rot_lic_amb', 'AMBIENTAL', 'Licenciamento ambiental', 'Pedido ou renovação de licença ambiental. A renovação deve ser pedida antes do vencimento da licença vigente (veja a condicionante).')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProcessoRoteiroEtapa" ("id", "roteiroId", "ordem", "titulo", "dias", "diasUteis", "base", "avisoDias") VALUES
  ('rot_auto_sefaz_1', 'rot_auto_sefaz', 1, 'Enviar o auto ao contador / advogado tributário', 2, true, 'CIENCIA', 1),
  ('rot_auto_sefaz_2', 'rot_auto_sefaz', 2, 'Decidir: pagar com desconto, parcelar ou defender', 10, false, 'CIENCIA', 3),
  ('rot_auto_sefaz_3', 'rot_auto_sefaz', 3, 'Reunir notas, livros e comprovantes citados no auto', 15, false, 'CIENCIA', 3),
  ('rot_auto_sefaz_4', 'rot_auto_sefaz', 4, 'Protocolar impugnação (conferir o prazo no auto)', 30, false, 'CIENCIA', 5),
  ('rot_notif_mte_1', 'rot_notif_mte', 1, 'Separar documentos pedidos na notificação (folha, ponto, ASO, EPI)', 3, true, 'CIENCIA', 1),
  ('rot_notif_mte_2', 'rot_notif_mte', 2, 'Revisar com RH/SST e corrigir o que for possível', 7, true, 'CIENCIA', 2),
  ('rot_notif_mte_3', 'rot_notif_mte', 3, 'Apresentar documentos / defesa (conferir o prazo na notificação)', 10, true, 'CIENCIA', 3),
  ('rot_acao_trab_1', 'rot_acao_trab', 1, 'Enviar a notificação/citação ao advogado', 2, true, 'CIENCIA', 1),
  ('rot_acao_trab_2', 'rot_acao_trab', 2, 'Levantar ficha, contrato, ponto, holerites e rescisão do reclamante', 5, true, 'CIENCIA', 2),
  ('rot_acao_trab_3', 'rot_acao_trab', 3, 'Definir preposto e testemunhas', 10, true, 'CIENCIA', 3),
  ('rot_acao_trab_4', 'rot_acao_trab', 4, 'Contestação / audiência (ajustar à data marcada pela vara)', 15, true, 'CIENCIA', 5),
  ('rot_lic_amb_1', 'rot_lic_amb', 1, 'Conferir condicionantes da licença vigente', 5, true, 'ABERTURA', 2),
  ('rot_lic_amb_2', 'rot_lic_amb', 2, 'Contratar/atualizar estudos e relatórios técnicos', 30, false, 'ABERTURA', 5),
  ('rot_lic_amb_3', 'rot_lic_amb', 3, 'Pagar taxa e protocolar o pedido no órgão', 45, false, 'ABERTURA', 5),
  ('rot_lic_amb_4', 'rot_lic_amb', 4, 'Acompanhar vistoria e exigências do órgão', 90, false, 'ABERTURA', 7)
ON CONFLICT ("id") DO NOTHING;
