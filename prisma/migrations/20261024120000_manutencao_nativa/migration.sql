-- Manutenção nativa (docs/manutencao-prd.md): ativos, solicitações, OS, planos e medidores.
-- Substitui o Engeman. Idempotente.

ALTER TABLE "RequisicaoMaterial" ADD COLUMN IF NOT EXISTS     "ordemServicoId" TEXT;

CREATE TABLE IF NOT EXISTS "ManutFamilia" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutFamilia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutAtivo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codApl" INTEGER NOT NULL,
    "paiId" TEXT,
    "tag" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'EQUIPAMENTO',
    "familiaId" TEXT,
    "localizacao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPERANDO',
    "setorId" TEXT,
    "centroCustoId" TEXT,
    "imobilizadoId" TEXT,
    "fornecedorId" TEXT,
    "fabricante" TEXT,
    "modelo" TEXT,
    "numeroSerie" TEXT,
    "numeroPatrimonio" TEXT,
    "placa" TEXT,
    "anoFabricacao" INTEGER,
    "dataAquisicao" TIMESTAMP(3),
    "garantiaAte" TIMESTAMP(3),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutAtivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutAtivoPeca" (
    "id" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL DEFAULT 1,
    "observacao" TEXT,

    CONSTRAINT "ManutAtivoPeca_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutTipo" (
    "id" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "natureza" TEXT NOT NULL,
    "contaComoFalha" BOOLEAN NOT NULL DEFAULT false,
    "prioridade" INTEGER NOT NULL DEFAULT 3,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutTipo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutCatalogo" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutCatalogo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutEquipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "externa" BOOLEAN NOT NULL DEFAULT false,
    "custoHora" DECIMAL(10,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutEquipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutEquipeMembro" (
    "equipeId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,

    CONSTRAINT "ManutEquipeMembro_pkey" PRIMARY KEY ("equipeId","colaboradorId")
);

CREATE TABLE IF NOT EXISTS "ManutSolicitacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ativoId" TEXT,
    "localTexto" TEXT,
    "descricao" TEXT NOT NULL,
    "ativoParado" BOOLEAN NOT NULL DEFAULT false,
    "paradoDesde" TIMESTAMP(3),
    "prioridade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "ordemId" TEXT,
    "motivoRecusa" TEXT,
    "solicitanteId" TEXT,
    "solicitanteNome" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'USUARIO',
    "origemId" TEXT,
    "triadoPor" TEXT,
    "triadoEm" TIMESTAMP(3),
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutSolicitacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutOrdem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ativoId" TEXT,
    "localTexto" TEXT,
    "tipoId" TEXT NOT NULL,
    "planoId" TEXT,
    "planoAtivoId" TEXT,
    "planoRef" TEXT,
    "equipeId" TEXT,
    "responsavelId" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "descricao" TEXT NOT NULL,
    "programadaPara" TIMESTAMP(3),
    "prazo" TIMESTAMP(3),
    "horasEstimadas" DECIMAL(10,2),
    "exigeParada" BOOLEAN NOT NULL DEFAULT false,
    "iniciadaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "encerradaPor" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "concluidaPor" TEXT,
    "paradaInicio" TIMESTAMP(3),
    "paradaFim" TIMESTAMP(3),
    "observacaoTecnica" TEXT,
    "centroCustoId" TEXT,
    "leituraMedidor" DECIMAL(15,2),
    "custoMaoObra" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "custoMaterial" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "custoTerceiros" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "codOrdLegado" INTEGER,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutOrdem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutOrdemServico" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "servicoId" TEXT,
    "sintomaId" TEXT,
    "causaId" TEXT,
    "tipoResposta" TEXT NOT NULL DEFAULT 'NENHUMA',
    "faixaMin" DECIMAL(15,3),
    "faixaMax" DECIMAL(15,3),
    "resposta" TEXT,
    "conforme" BOOLEAN,
    "executado" BOOLEAN NOT NULL DEFAULT false,
    "tempoHoras" DECIMAL(10,2),
    "legadoId" INTEGER,

    CONSTRAINT "ManutOrdemServico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutOrdemMaterial" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "itemId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,
    "unidade" TEXT,
    "valorTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL DEFAULT 'PREVISTO',
    "legadoId" TEXT,

    CONSTRAINT "ManutOrdemMaterial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutApontamento" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "nome" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "custoHora" DECIMAL(10,2),
    "observacao" TEXT,
    "legadoId" INTEGER,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutApontamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutOrdemTerceiro" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "descricao" TEXT NOT NULL,
    "pedidoCompraId" TEXT,
    "contaPagarId" TEXT,
    "valor" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutOrdemTerceiro_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutOrdemEvento" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalhe" TEXT,
    "usuario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutOrdemEvento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutPlano" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "equipeId" TEXT,
    "horasEstimadas" DECIMAL(10,2),
    "exigeParada" BOOLEAN NOT NULL DEFAULT false,
    "antecedenciaDias" INTEGER NOT NULL DEFAULT 3,
    "toleranciaPct" INTEGER NOT NULL DEFAULT 10,
    "baseNaConclusao" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "criadoPor" TEXT,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutPlano_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutPlanoTarefa" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "ativoId" TEXT,
    "servicoId" TEXT,
    "tipoResposta" TEXT NOT NULL DEFAULT 'OK_NOK',
    "faixaMin" DECIMAL(15,3),
    "faixaMax" DECIMAL(15,3),

    CONSTRAINT "ManutPlanoTarefa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutPlanoMaterial" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "ManutPlanoMaterial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutPlanoAtivo" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "gatilho" TEXT NOT NULL DEFAULT 'CALENDARIO',
    "intervaloDias" INTEGER,
    "medidorId" TEXT,
    "intervaloMedida" DECIMAL(15,2),
    "ultimaExecucao" TIMESTAMP(3),
    "ultimaMedida" DECIMAL(15,2),
    "proximoVencimento" TIMESTAMP(3),
    "proximaMedida" DECIMAL(15,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoRef" TEXT,

    CONSTRAINT "ManutPlanoAtivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutMedidor" (
    "id" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'h',
    "acumulado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "legadoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutMedidor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManutLeitura" (
    "id" TEXT NOT NULL,
    "medidorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "origem" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutLeitura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManutFamilia_legadoId_key" ON "ManutFamilia"("legadoId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutAtivo_codApl_key" ON "ManutAtivo"("codApl");

CREATE INDEX IF NOT EXISTS "ManutAtivo_empresaId_paiId_idx" ON "ManutAtivo"("empresaId", "paiId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutAtivo_empresaId_tag_key" ON "ManutAtivo"("empresaId", "tag");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutAtivoPeca_ativoId_itemId_key" ON "ManutAtivoPeca"("ativoId", "itemId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutTipo_sigla_key" ON "ManutTipo"("sigla");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutTipo_legadoId_key" ON "ManutTipo"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutCatalogo_tipo_ativo_idx" ON "ManutCatalogo"("tipo", "ativo");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutCatalogo_tipo_legadoId_key" ON "ManutCatalogo"("tipo", "legadoId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutEquipe_legadoId_key" ON "ManutEquipe"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutSolicitacao_empresaId_status_idx" ON "ManutSolicitacao"("empresaId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutSolicitacao_empresaId_numero_key" ON "ManutSolicitacao"("empresaId", "numero");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdem_codOrdLegado_key" ON "ManutOrdem"("codOrdLegado");

CREATE INDEX IF NOT EXISTS "ManutOrdem_empresaId_status_idx" ON "ManutOrdem"("empresaId", "status");

CREATE INDEX IF NOT EXISTS "ManutOrdem_ativoId_concluidaEm_idx" ON "ManutOrdem"("ativoId", "concluidaEm");

CREATE INDEX IF NOT EXISTS "ManutOrdem_planoId_idx" ON "ManutOrdem"("planoId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdem_empresaId_numero_key" ON "ManutOrdem"("empresaId", "numero");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdem_planoAtivoId_planoRef_key" ON "ManutOrdem"("planoAtivoId", "planoRef");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdemServico_legadoId_key" ON "ManutOrdemServico"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutOrdemServico_ordemId_idx" ON "ManutOrdemServico"("ordemId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutOrdemMaterial_legadoId_key" ON "ManutOrdemMaterial"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutOrdemMaterial_ordemId_idx" ON "ManutOrdemMaterial"("ordemId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutApontamento_legadoId_key" ON "ManutApontamento"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutApontamento_ordemId_idx" ON "ManutApontamento"("ordemId");

CREATE INDEX IF NOT EXISTS "ManutApontamento_colaboradorId_inicio_idx" ON "ManutApontamento"("colaboradorId", "inicio");

CREATE INDEX IF NOT EXISTS "ManutOrdemTerceiro_ordemId_idx" ON "ManutOrdemTerceiro"("ordemId");

CREATE INDEX IF NOT EXISTS "ManutOrdemEvento_ordemId_createdAt_idx" ON "ManutOrdemEvento"("ordemId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutPlano_legadoId_key" ON "ManutPlano"("legadoId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutPlano_empresaId_codigo_key" ON "ManutPlano"("empresaId", "codigo");

CREATE INDEX IF NOT EXISTS "ManutPlanoTarefa_planoId_seq_idx" ON "ManutPlanoTarefa"("planoId", "seq");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutPlanoMaterial_planoId_itemId_key" ON "ManutPlanoMaterial"("planoId", "itemId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutPlanoAtivo_legadoRef_key" ON "ManutPlanoAtivo"("legadoRef");

CREATE INDEX IF NOT EXISTS "ManutPlanoAtivo_planoId_idx" ON "ManutPlanoAtivo"("planoId");

CREATE INDEX IF NOT EXISTS "ManutPlanoAtivo_ativoId_idx" ON "ManutPlanoAtivo"("ativoId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManutMedidor_legadoId_key" ON "ManutMedidor"("legadoId");

CREATE INDEX IF NOT EXISTS "ManutLeitura_medidorId_data_idx" ON "ManutLeitura"("medidorId", "data");

CREATE INDEX IF NOT EXISTS "RequisicaoMaterial_ordemServicoId_idx" ON "RequisicaoMaterial"("ordemServicoId");

DO $$ BEGIN
  ALTER TABLE "RequisicaoMaterial" ADD CONSTRAINT "RequisicaoMaterial_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "ManutOrdem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_familiaId_fkey" FOREIGN KEY ("familiaId") REFERENCES "ManutFamilia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_imobilizadoId_fkey" FOREIGN KEY ("imobilizadoId") REFERENCES "Imobilizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivo" ADD CONSTRAINT "ManutAtivo_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivoPeca" ADD CONSTRAINT "ManutAtivoPeca_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutAtivoPeca" ADD CONSTRAINT "ManutAtivoPeca_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutEquipeMembro" ADD CONSTRAINT "ManutEquipeMembro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "ManutEquipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutEquipeMembro" ADD CONSTRAINT "ManutEquipeMembro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutSolicitacao" ADD CONSTRAINT "ManutSolicitacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutSolicitacao" ADD CONSTRAINT "ManutSolicitacao_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutSolicitacao" ADD CONSTRAINT "ManutSolicitacao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "ManutTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ManutPlano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "ManutEquipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdem" ADD CONSTRAINT "ManutOrdem_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemServico" ADD CONSTRAINT "ManutOrdemServico_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemServico" ADD CONSTRAINT "ManutOrdemServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ManutCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemServico" ADD CONSTRAINT "ManutOrdemServico_sintomaId_fkey" FOREIGN KEY ("sintomaId") REFERENCES "ManutCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemServico" ADD CONSTRAINT "ManutOrdemServico_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "ManutCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemMaterial" ADD CONSTRAINT "ManutOrdemMaterial_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemMaterial" ADD CONSTRAINT "ManutOrdemMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutApontamento" ADD CONSTRAINT "ManutApontamento_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutApontamento" ADD CONSTRAINT "ManutApontamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemTerceiro" ADD CONSTRAINT "ManutOrdemTerceiro_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemTerceiro" ADD CONSTRAINT "ManutOrdemTerceiro_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutOrdemEvento" ADD CONSTRAINT "ManutOrdemEvento_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ManutOrdem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlano" ADD CONSTRAINT "ManutPlano_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlano" ADD CONSTRAINT "ManutPlano_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "ManutTipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlano" ADD CONSTRAINT "ManutPlano_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "ManutEquipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoTarefa" ADD CONSTRAINT "ManutPlanoTarefa_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ManutPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoTarefa" ADD CONSTRAINT "ManutPlanoTarefa_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoTarefa" ADD CONSTRAINT "ManutPlanoTarefa_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "ManutCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoMaterial" ADD CONSTRAINT "ManutPlanoMaterial_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ManutPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoMaterial" ADD CONSTRAINT "ManutPlanoMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoAtivo" ADD CONSTRAINT "ManutPlanoAtivo_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "ManutPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoAtivo" ADD CONSTRAINT "ManutPlanoAtivo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutPlanoAtivo" ADD CONSTRAINT "ManutPlanoAtivo_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "ManutMedidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutMedidor" ADD CONSTRAINT "ManutMedidor_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "ManutAtivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ManutLeitura" ADD CONSTRAINT "ManutLeitura_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "ManutMedidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
