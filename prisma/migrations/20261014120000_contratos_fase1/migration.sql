-- Contratos — fase 1 (docs/contratos-prd.md). Idempotente.
DO $$ BEGIN CREATE TYPE "TipoContrato" AS ENUM ('FORNECIMENTO','SERVICO','LOCACAO','SOFTWARE_ASSINATURA','SEGURO','PLANO_SAUDE','TRANSPORTE','OBRA','VENDA_RECORRENTE','VENDA_A_ORDEM','TERCEIRIZACAO','OUTRO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LadoContrato" AS ENUM ('DESPESA','RECEITA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StatusContrato" AS ENUM ('MINUTA','EM_APROVACAO','VIGENTE','EM_RENOVACAO','SUSPENSO','ENCERRADO','RESCINDIDO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoRenovacao" AS ENUM ('NENHUMA','AUTOMATICA','MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ModalidadeValorContrato" AS ENUM ('FIXO_MENSAL','FIXO_UNICO','POR_MEDICAO','POR_CONSUMO','ESTIMADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PeriodicidadeContrato" AS ENUM ('MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoReajuste" AS ENUM ('NENHUM','INDICE','PERCENTUAL','NEGOCIADO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "IndiceReajuste" AS ENUM ('IPCA','IGPM','INPC','SELIC','OUTRO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoAditivo" AS ENUM ('PRAZO','VALOR','OBJETO','REAJUSTE','OUTRO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TipoEventoContrato" AS ENUM ('CRIADO','APROVADO','ASSINADO','ATIVADO','ADITIVO','REAJUSTE_PROJETADO','REAJUSTE_APLICADO','JANELA_AVISO_PREVIO','FIM_VIGENCIA','RENOVADO','ENCERRADO','RESCINDIDO','SUSPENSO','REATIVADO','ALERTA_ENVIADO','OBSERVACAO'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Contrato" (
  "id" TEXT NOT NULL, "empresaId" TEXT NOT NULL, "numero" TEXT NOT NULL, "titulo" TEXT NOT NULL,
  "tipo" "TipoContrato" NOT NULL, "lado" "LadoContrato" NOT NULL DEFAULT 'DESPESA',
  "fornecedorId" TEXT, "clienteId" TEXT, "responsavelId" TEXT NOT NULL, "centroCustoId" TEXT, "naturezaFinanceiraId" TEXT,
  "objeto" TEXT, "status" "StatusContrato" NOT NULL DEFAULT 'MINUTA',
  "inicio" TIMESTAMP(3) NOT NULL, "fim" TIMESTAMP(3),
  "renovacao" "TipoRenovacao" NOT NULL DEFAULT 'NENHUMA', "renovacaoMeses" INTEGER, "avisoPrevioDias" INTEGER,
  "modalidade" "ModalidadeValorContrato" NOT NULL DEFAULT 'FIXO_MENSAL', "valor" DECIMAL(15,2), "valorTotalEstimado" DECIMAL(15,2),
  "periodicidade" "PeriodicidadeContrato", "diaVencimento" INTEGER, "primeiroVencimento" TIMESTAMP(3),
  "reajusteTipo" "TipoReajuste" NOT NULL DEFAULT 'NENHUM', "reajusteIndice" "IndiceReajuste", "reajustePercentual" DECIMAL(7,4), "reajusteMesBase" INTEGER, "reajusteProximo" TIMESTAMP(3),
  "multaRescisoria" TEXT, "garantia" TEXT, "documentoId" TEXT, "assinadoEm" TIMESTAMP(3), "observacoes" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[], "encerradoEm" TIMESTAMP(3), "motivoEncerramento" TEXT,
  "criadoPor" TEXT, "atualizadoPor" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Contrato_empresaId_numero_key" ON "Contrato"("empresaId","numero");
CREATE INDEX IF NOT EXISTS "Contrato_empresaId_status_fim_idx" ON "Contrato"("empresaId","status","fim");
CREATE INDEX IF NOT EXISTS "Contrato_fornecedorId_idx" ON "Contrato"("fornecedorId");
CREATE INDEX IF NOT EXISTS "Contrato_clienteId_idx" ON "Contrato"("clienteId");
CREATE INDEX IF NOT EXISTS "Contrato_responsavelId_idx" ON "Contrato"("responsavelId");
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_naturezaFinanceiraId_fkey" FOREIGN KEY ("naturezaFinanceiraId") REFERENCES "NaturezaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ContratoAditivo" (
  "id" TEXT NOT NULL, "contratoId" TEXT NOT NULL, "numero" INTEGER NOT NULL, "tipo" "TipoAditivo" NOT NULL, "efeitoEm" TIMESTAMP(3) NOT NULL, "descricao" TEXT NOT NULL,
  "novoFim" TIMESTAMP(3), "novoValor" DECIMAL(15,2), "novaPeriodicidade" "PeriodicidadeContrato", "novoReajusteTipo" "TipoReajuste", "novoReajusteIndice" "IndiceReajuste", "novoReajustePercentual" DECIMAL(7,4),
  "documentoId" TEXT, "assinadoEm" TIMESTAMP(3), "aplicadoEm" TIMESTAMP(3), "criadoPor" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContratoAditivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContratoAditivo_contratoId_numero_key" ON "ContratoAditivo"("contratoId","numero");
DO $$ BEGIN ALTER TABLE "ContratoAditivo" ADD CONSTRAINT "ContratoAditivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ContratoEvento" (
  "id" TEXT NOT NULL, "contratoId" TEXT NOT NULL, "tipo" "TipoEventoContrato" NOT NULL, "data" TIMESTAMP(3) NOT NULL, "descricao" TEXT NOT NULL, "dados" JSONB,
  "projetado" BOOLEAN NOT NULL DEFAULT false, "usuarioId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContratoEvento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContratoEvento_contratoId_data_idx" ON "ContratoEvento"("contratoId","data");
DO $$ BEGIN ALTER TABLE "ContratoEvento" ADD CONSTRAINT "ContratoEvento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;
CREATE INDEX IF NOT EXISTS "Documento_contratoId_idx" ON "Documento"("contratoId");
DO $$ BEGIN ALTER TABLE "Documento" ADD CONSTRAINT "Documento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "DocumentoCategoria"(id,nome,slug,"exigeValidade","diasAlerta",ordem,ativo) VALUES
 ('cat_contratos_aditivos','Contratos — Aditivos','contratos-aditivos',false,30,31,true),
 ('cat_contratos_garantias','Contratos — Garantias e apólices','contratos-garantias',true,60,32,true)
ON CONFLICT (slug) DO NOTHING;
