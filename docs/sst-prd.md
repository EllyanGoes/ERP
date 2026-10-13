# PRD — Módulo SST (Saúde e Segurança do Trabalho)

> Status: proposta (out/2026). Implementação pendente de aprovação do dono.
> Princípio central: **SST é um módulo de registros com validade e evidência**, não de tarefas.
> Executar continua sendo no Projetos; **comprovar** passa a ser aqui.

## 1. Contexto e objetivo

Hoje a SST do grupo está espalhada e desestruturada:

- O levantamento de proteção de máquinas (NR-12) virou um projeto com 35 cartões — bom para
  executar, mas não diz qual máquina está regular, qual laudo a cobre, nem guarda a evidência.
- PGR, PCMSO, LTCAT, AEP e documentação da CIPA são cartões de um quadro; a validade de cada um
  não é controlada em lugar nenhum.
- EPI, ASO, exames, treinamentos obrigatórios e acidentes **não existem** como cadastro.
- O GED (`Documento`) tem validade e alerta, mas sem a visão "por norma / por empresa / por
  responsável" que uma fiscalização pede.

Numa auditoria fiscal do trabalho o auditor pede exatamente o que o ERP não guarda: **quem recebeu
qual EPI e quando, se o ASO está vigente, se o treinamento de NR-12 do operador existe, se a
máquina X tem laudo e proteção, e a CAT do acidente Y**. Hoje a resposta vive em pastas, planilhas
e na cabeça do técnico de segurança.

**Objetivo:** um módulo que torne o grupo **auditável** em SST, com quatro propriedades:

1. Todo item obrigatório tem **validade** e o sistema avisa antes de vencer.
2. Toda obrigação tem **evidência anexada** (termo assinado, certificado, laudo, foto).
3. Tudo é **por empresa** (Tramontin, Cimento e Mix, Atlas…) e por **colaborador/máquina/setor**.
4. Existe um **painel de conformidade** que responde "estamos regulares?" em uma tela.

**Fora do objetivo:** substituir o SESMT/consultoria (quem elabora PGR/PCMSO continua sendo o
técnico/médico); eSocial (eventos S-2210/S-2220/S-2240 ficam para uma fase futura, ver §12);
gestão de ponto/jornada.

## 2. Personas e usos

| Persona | O que faz no módulo |
|---|---|
| **Técnico de segurança** (operador principal) | Cadastra EPIs, registra entregas, agenda exames, lança treinamentos, abre e investiga incidentes, mantém inventário de máquinas e laudos. |
| **RH** | Vê pendências do colaborador (ASO vencido, EPI não entregue, treinamento faltando) na admissão, mudança de função e demissão. |
| **Almoxarifado** | Dá saída do EPI do estoque; a entrega registrada no SST baixa o item. |
| **Gerente / dono** | Painel de conformidade por empresa; aprova compras de EPI; recebe alertas de vencimento crítico. |
| **CIPA** | Registra reuniões, inspeções e mapa de risco; acompanha ações. |
| **Auditor (externo, leitura)** | Relatórios prontos: EPI por colaborador, ASOs vigentes, treinamentos, máquinas × NR-12, acidentes. Sem login — exportado em PDF/planilha. |

## 3. Normas cobertas (escopo funcional por norma)

| Norma | O que o módulo controla |
|---|---|
| **NR-01** (GRO/PGR) | Documento PGR por empresa com validade (2 anos; 1 ano se grau de risco 3/4), inventário de riscos por função/setor (GHE), plano de ação ligado ao Projetos. |
| **NR-04 / NR-05** | SESMT/CIPA: composição, mandato, atas de reunião, eleição, treinamento dos cipeiros. |
| **NR-06** | **EPI**: cadastro com CA, validade do CA, vida útil; entrega com termo assinado (ficha de EPI), troca, devolução; EPI obrigatório por função/GHE. |
| **NR-07** | **PCMSO** e **ASO**: exames admissional, periódico, mudança de risco, retorno, demissional; periodicidade por função/risco; exames complementares (audiometria, espirometria…). |
| **NR-09 / NR-15 / NR-16** | Agentes ambientais e laudos: LTCAT, laudo de insalubridade/periculosidade, avaliações quantitativas, com validade. |
| **NR-10 / NR-12 / NR-35 / NR-33 / NR-11** | **Treinamentos obrigatórios** por função (carga horária, validade, reciclagem) e **máquinas/equipamentos** com inventário, apreciação de risco, laudo, proteções e status. |
| **NR-17** | AEP/AET por setor/função, com validade. |
| **NR-23** | Brigada de incêndio, extintores (validade/recarga), AVCB. |
| **NR-24 / NR-18** | Checklists de inspeção (instalações, obras). |
| **CAT / acidentes** | Registro de incidentes e acidentes, investigação, CAT emitida, dias perdidos, ação corretiva. |

Cada item acima é um **tipo de registro com validade**; o painel agrega por norma.

## 4. Modelo de dados (Prisma; migrations idempotentes, sem `db push` em produção)

Convenções do projeto: `empresaId` escopado (como RH/Compras), autoria carimbada pelo proxy
(`criadoPor`/`atualizadoPor`), exclusão destrutiva vira lixeira (`salvarNaLixeira`), anexos no GED.
Prefixo `Sst` nos modelos.

### 4.1 Base: funções, riscos, GHE

```prisma
// Função/cargo SST — o Colaborador já tem `cargo` (texto); aqui vira cadastro
// com os requisitos (EPI, exames, treinamentos) herdados pelo colaborador.
model SstFuncao {
  id          String  @id @default(cuid())
  empresaId   String
  nome        String
  cbo         String?
  grauRisco   Int?        // 1–4 (NR-04)
  ativo       Boolean @default(true)
  requisitosEpi         SstFuncaoEpi[]
  requisitosExame       SstFuncaoExame[]
  requisitosTreinamento SstFuncaoTreinamento[]
  colaboradores SstColaboradorFuncao[]
  @@unique([empresaId, nome])
}

// Vínculo colaborador × função SST com vigência (mudança de função gera
// exame de mudança de risco e revisa EPI/treinamentos).
model SstColaboradorFuncao {
  id            String   @id @default(cuid())
  colaboradorId String
  funcaoId      String
  inicio        DateTime
  fim           DateTime?
  setorId       String?
  @@index([colaboradorId, fim])
}

// Risco ocupacional (inventário do PGR), agrupado por GHE.
model SstRisco {
  id         String @id @default(cuid())
  empresaId  String
  agente     String   // ex.: Ruído, Sílica, Calor, Queda de altura
  tipo       SstTipoRisco // FISICO | QUIMICO | BIOLOGICO | ERGONOMICO | ACIDENTE
  fonte      String?
  medidas    String?  // controle existente (EPC/EPI/administrativa)
  severidade Int?     // 1–5
  probabilidade Int?  // 1–5
  ghes       SstGheRisco[]
}

model SstGhe { // Grupo Homogêneo de Exposição
  id        String @id @default(cuid())
  empresaId String
  nome      String
  setorId   String?
  funcoes   SstFuncao[] // n:n implícita
  riscos    SstGheRisco[]
}
```

### 4.2 EPI (NR-06)

```prisma
model SstEpi {
  id            String   @id @default(cuid())
  empresaId     String
  itemId        String?  // Item do almoxarifado (quando o EPI é estocado)
  nome          String
  ca            String?  // Certificado de Aprovação
  caValidade    DateTime?
  vidaUtilDias  Int?     // troca programada
  fabricante    String?
  ativo         Boolean  @default(true)
  requisitos    SstFuncaoEpi[]
  entregas      SstEpiEntrega[]
  @@unique([empresaId, ca])
}

model SstFuncaoEpi {
  funcaoId  String
  epiId     String
  obrigatorio Boolean @default(true)
  quantidade  Int     @default(1)
  @@id([funcaoId, epiId])
}

// Ficha de EPI: uma linha por entrega/troca/devolução. O termo assinado é o
// anexo (Documento no GED, categoria "Termo de EPI"); assinatura digital opcional.
model SstEpiEntrega {
  id              String   @id @default(cuid())
  empresaId       String
  colaboradorId   String
  epiId           String
  tipo            SstTipoEntregaEpi // ENTREGA | TROCA | DEVOLUCAO
  quantidade      Int      @default(1)
  data            DateTime
  motivo          String?  // desgaste, perda, dano, periódica
  vencimentoUso   DateTime? // data + vidaUtilDias (troca prevista)
  movimentacaoEstoqueId String? // saída no almoxarifado (quando itemId)
  documentoId     String?  // termo assinado (GED)
  assinaturaUrl   String?  // assinatura em tela (Vercel Blob), opcional
  @@index([colaboradorId, data])
  @@index([epiId])
}
```

### 4.3 Saúde ocupacional (NR-07)

```prisma
model SstExameTipo {   // Clínico, Audiometria, Espirometria, Hemograma…
  id        String @id @default(cuid())
  empresaId String
  nome      String
  periodicidadeMeses Int? // default; a função pode sobrescrever
}

model SstFuncaoExame {
  funcaoId   String
  exameTipoId String
  periodicidadeMeses Int
  @@id([funcaoId, exameTipoId])
}

model SstAso {
  id            String   @id @default(cuid())
  empresaId     String
  colaboradorId String
  tipo          SstTipoAso // ADMISSIONAL | PERIODICO | MUDANCA_RISCO | RETORNO | DEMISSIONAL
  data          DateTime
  validade      DateTime?  // próximo periódico
  resultado     SstResultadoAso // APTO | INAPTO | APTO_RESTRICOES
  restricoes    String?
  medico        String?
  crm           String?
  documentoId   String?    // ASO digitalizado (GED)
  exames        SstAsoExame[]
  @@index([colaboradorId, validade])
}

model SstAsoExame {
  asoId       String
  exameTipoId String
  data        DateTime
  resultado   String?
  documentoId String?
  @@id([asoId, exameTipoId])
}
```

### 4.4 Treinamentos (NR-10/12/35/33/11, CIPA, brigada)

```prisma
model SstTreinamentoTipo {
  id         String @id @default(cuid())
  empresaId  String
  nome       String   // "NR-12 Operador de máquinas", "NR-35 Trabalho em altura"
  norma      String?
  cargaHoraria Int?
  validadeMeses Int?  // reciclagem
}

model SstFuncaoTreinamento {
  funcaoId        String
  treinamentoTipoId String
  @@id([funcaoId, treinamentoTipoId])
}

// Turma: um evento de treinamento com N participantes.
model SstTreinamento {
  id              String   @id @default(cuid())
  empresaId       String
  tipoId          String
  data            DateTime
  instrutor       String?
  entidade        String?
  cargaHoraria    Int?
  listaPresencaDocumentoId String?
  participantes   SstTreinamentoParticipante[]
}

model SstTreinamentoParticipante {
  treinamentoId  String
  colaboradorId  String
  validade       DateTime?   // data + validadeMeses
  certificadoDocumentoId String?
  aprovado       Boolean @default(true)
  @@id([treinamentoId, colaboradorId])
  @@index([colaboradorId, validade])
}
```

### 4.5 Máquinas e equipamentos (NR-12) e instalações

```prisma
// Inventário SST da máquina. Liga ao ativo do Engeman (CODAPL) quando existir,
// como já faz AtivoCriticidade — o Engeman segue sendo o cadastro-mestre.
model SstMaquina {
  id            String   @id @default(cuid())
  empresaId     String
  codApl        String?  // ativo no Engeman
  nome          String
  local         String?
  setorId       String?
  fabricante    String?
  anoFabricacao Int?
  status        SstStatusMaquina // NAO_AVALIADA | NAO_CONFORME | EM_ADEQUACAO | CONFORME | INTERDITADA | DESATIVADA
  apreciacaoRiscoDocumentoId String?   // apreciação de risco (NR-12 item 12.3)
  manualDocumentoId          String?
  protecoes     SstMaquinaProtecao[]
  inspecoes     SstInspecao[]
  tarefaId      String?  // tarefa do Projetos que executa a adequação (vínculo manual)
  @@index([empresaId, status])
}

model SstMaquinaProtecao { // cada proteção/dispositivo exigido
  id          String @id @default(cuid())
  maquinaId   String
  descricao   String   // "Enclausuramento da correia", "Botão de emergência", "Intertravamento"
  tipo        String?  // FIXA | MOVEL_INTERTRAVADA | DISPOSITIVO | SINALIZACAO
  conforme    Boolean  @default(false)
  evidenciaDocumentoId String? // foto/laudo
  verificadoEm DateTime?
}

// Inspeções periódicas (extintores, máquinas, instalações, checklists).
model SstInspecao {
  id          String   @id @default(cuid())
  empresaId   String
  tipo        String   // EXTINTOR | MAQUINA | INSTALACAO | CHECKLIST_NR18 | CIPA
  maquinaId   String?
  descricao   String
  data        DateTime
  proxima     DateTime?
  resultado   SstResultadoInspecao // CONFORME | NAO_CONFORME
  itens       Json?    // checklist respondido
  responsavelId String?
  documentoId String?
}
```

### 4.6 Documentos legais e programas (PGR, PCMSO, LTCAT, AEP, AVCB…)

Não cria tabela nova: usa o **GED** (`Documento`) com uma categoria raiz "SST" e subcategorias
por norma, mais um cadastro leve que diz **o que é obrigatório por empresa**:

```prisma
model SstObrigacao {
  id          String   @id @default(cuid())
  empresaId   String
  nome        String   // PGR, PCMSO, LTCAT, AEP, AVCB, Laudo elétrico…
  norma       String?
  categoriaGedId String   // onde o documento vigente vive
  periodicidadeMeses Int? // 12, 24…
  responsavelId String?
  documentoVigenteId String? // resolvido pela validade mais recente da categoria
  @@unique([empresaId, nome])
}
```

O painel lê `Documento.validade`/`status` da categoria e reporta vigente / vence em X dias /
vencido / **inexistente** (obrigação sem documento é o pior caso e precisa aparecer).

### 4.7 Incidentes, acidentes e CAT

```prisma
model SstIncidente {
  id            String   @id @default(cuid())
  empresaId     String
  numero        String   // SST-INC-0001
  tipo          SstTipoIncidente // QUASE_ACIDENTE | ACIDENTE_SEM_AFASTAMENTO | ACIDENTE_COM_AFASTAMENTO | TRAJETO | DOENCA_OCUPACIONAL
  data          DateTime
  local         String?
  setorId       String?
  maquinaId     String?
  colaboradorId String?
  descricao     String
  parteCorpo    String?
  agente        String?
  diasAfastamento Int?
  catNumero     String?
  catEmitidaEm  DateTime?
  catDocumentoId String?
  investigacao  String?  // causas (5 porquês / árvore de causas)
  status        SstStatusIncidente // ABERTO | EM_INVESTIGACAO | ACAO_DEFINIDA | ENCERRADO
  acoes         SstAcaoCorretiva[]
  evidencias    String[] // documentoIds (fotos)
  @@unique([empresaId, numero])
}

model SstAcaoCorretiva {
  id           String @id @default(cuid())
  incidenteId  String?
  inspecaoId   String?
  descricao    String
  responsavelId String?
  prazo        DateTime?
  concluidaEm  DateTime?
  tarefaId     String?  // espelho no Projetos (opcional)
}
```

### 4.8 CIPA / SESMT

```prisma
model SstCipaMandato {
  id        String @id @default(cuid())
  empresaId String
  inicio    DateTime
  fim       DateTime
  membros   SstCipaMembro[]
  reunioes  SstCipaReuniao[]
  ataEleicaoDocumentoId String?
}
model SstCipaMembro { mandatoId String; colaboradorId String; papel String /* PRESIDENTE | VICE | TITULAR | SUPLENTE | SECRETARIO */; representa String /* EMPREGADOR | EMPREGADOS */; @@id([mandatoId, colaboradorId]) }
model SstCipaReuniao { id String @id @default(cuid()); mandatoId String; data DateTime; ataDocumentoId String?; pauta String?; }
```

### 4.9 Enums

`SstTipoRisco`, `SstTipoEntregaEpi`, `SstTipoAso`, `SstResultadoAso`, `SstStatusMaquina`,
`SstResultadoInspecao`, `SstTipoIncidente`, `SstStatusIncidente` — todos `DO $$ … EXCEPTION WHEN
duplicate_object` na migration.

## 5. Motor de conformidade (o coração do módulo)

Uma função pura `conformidadeColaborador(colaboradorId, hoje)` e outra `conformidadeEmpresa(empresaId)`
que cruzam **requisitos da função** × **registros existentes** e devolvem pendências tipadas:

| Pendência | Regra |
|---|---|
| `EPI_NAO_ENTREGUE` | função exige EPI e não há entrega vigente (última entrega sem devolução e dentro da vida útil). |
| `EPI_VENCIDO` | entrega com `vencimentoUso` < hoje, ou CA do EPI vencido. |
| `ASO_INEXISTENTE` / `ASO_VENCIDO` | sem ASO vigente para a função; periódico vencido; mudança de função sem exame de mudança de risco; demitido sem demissional. |
| `EXAME_PENDENTE` | exame complementar exigido pela função fora da periodicidade. |
| `TREINAMENTO_FALTANDO` / `TREINAMENTO_VENCIDO` | função exige treinamento sem participação vigente. |
| `MAQUINA_NAO_CONFORME` | máquina ativa com status ≠ CONFORME ou proteção `conforme=false`. |
| `OBRIGACAO_INEXISTENTE` / `OBRIGACAO_VENCIDA` | PGR/PCMSO/LTCAT… sem documento vigente. |
| `INSPECAO_ATRASADA` | `proxima` < hoje. |
| `CAT_NAO_EMITIDA` | acidente com afastamento sem CAT em 24h úteis (ou doença ocupacional). |
| `CIPA_SEM_MANDATO` | empresa obrigada (dimensionamento NR-05) sem mandato vigente. |

Cada pendência tem **severidade** (CRITICA: ASO vencido, máquina interditada operando, CAT não
emitida; ALTA: EPI/treinamento vencido; MEDIA: vence em ≤30 dias; BAIXA: informativa) e **link
para resolver** (tela do colaborador/máquina/obrigação).

Os painéis, o cron e os relatórios consomem esse motor; não há lógica de conformidade na UI.

## 6. Processos (fluxos)

### 6.1 Admissão / mudança de função / demissão (gatilho do RH)
- Ao vincular colaborador a uma função SST → gera pendências: ASO admissional, entrega dos EPIs
  obrigatórios, treinamentos obrigatórios. Aparecem na ficha do colaborador e no painel.
- Mudança de função → encerra o vínculo anterior, exige exame de mudança de risco e revisa
  EPI/treinamento (o que já é vigente permanece).
- Demissão (`Colaborador.ativo=false`) → pendência de ASO demissional e devolução de EPIs.

### 6.2 Entrega de EPI
1. Técnico escolhe colaborador → vê os EPIs obrigatórios da função com status (entregue/vencido/faltando).
2. Registra entrega (quantidade, motivo), colaborador assina em tela (opcional) ou anexa termo.
3. Se o EPI tem `itemId`, gera **saída de estoque** do local "EPI/Almoxarifado" (reusa a
   movimentação de saída já existente; sem saldo → hard block, como no resto do estoque).
4. `vencimentoUso` calculado; cron avisa a troca.
5. Ficha de EPI do colaborador = relatório da NR-06 (imprimível, com as assinaturas).

### 6.3 ASO e exames
- Agenda: lista de quem vence nos próximos 60 dias, por clínica/data; exportável para a clínica.
- Lançamento do ASO com anexo; exames complementares como linhas.
- Resultado INAPTO ou com restrições → pendência crítica e aviso ao RH e gestor do setor.

### 6.4 Treinamentos
- Turma com lista de presença e certificados; validade por participante.
- "Quem precisa de reciclagem nos próximos 90 dias" por tipo.

### 6.5 Máquinas (NR-12)
- Importa/sincroniza o inventário do Engeman (mesmo caminho do `AtivoCriticidade`).
- Para cada máquina: apreciação de risco, lista de proteções exigidas, evidência por proteção, status.
- Botão "Criar tarefa de adequação" → cria tarefa no projeto escolhido (Projetos) e guarda
  `tarefaId`; concluir a tarefa **não** muda o status da máquina (quem muda é o técnico, com
  evidência) — isso preserva o princípio "executar ≠ comprovar".
- Migração do levantamento atual: os 35 cartões do projeto "Reforma e Auditoria do Trabalho"
  viram `SstMaquina` (nome/local da descrição; coluna "Concluído" → status CONFORME a confirmar
  com evidência; demais → EM_ADEQUACAO/NAO_CONFORME).

### 6.6 Incidentes
- Registro rápido (quem, onde, o quê, foto) → investigação → ações corretivas (com espelho
  opcional no Projetos) → encerramento. CAT: número, data, PDF anexado.
- Indicadores: taxa de frequência e gravidade (precisa de horas trabalhadas — vem da folha do RH
  ou de um lançamento mensal simples por empresa).

### 6.7 Obrigações documentais
- Tela "Obrigações" por empresa: cada linha é PGR/PCMSO/LTCAT/AEP/AVCB/laudos com documento
  vigente, validade, responsável e botão "Anexar nova versão" (vai para o GED com versão).

## 7. Telas (rotas em `/sst/*`, padrão do sistema: CreateDrawer, DataTable com persistência,
SelectMenu/Combobox, DatePicker, EscClose)

| Rota | Conteúdo |
|---|---|
| `/sst` | **Painel de conformidade**: cartões por norma (verde/amarelo/vermelho), contagem de pendências por severidade, vencimentos dos próximos 30/60/90 dias, acidentes do ano, taxa de frequência. Filtro por empresa (EmpresaTag). |
| `/sst/colaboradores` | Lista com semáforo (EPI / ASO / treinamentos) por pessoa; filtro por setor/função/pendência. |
| `/sst/colaboradores/[id]` | Ficha SST: função e histórico, EPIs (entregar/trocar/devolver, ficha imprimível), ASOs e exames, treinamentos, incidentes, pendências. |
| `/sst/epis` | Cadastro de EPIs (CA, validade, vida útil, item de estoque) e entregas em lote (vários colaboradores de uma vez). |
| `/sst/saude` | Agenda de exames (vencimentos), lançamento de ASO, tipos de exame. |
| `/sst/treinamentos` | Tipos, turmas, participantes, reciclagens a vencer. |
| `/sst/maquinas` | Inventário NR-12 com status, proteções e evidências; vínculo com Engeman e Projetos. |
| `/sst/inspecoes` | Checklists e inspeções periódicas (extintores, máquinas, instalações). |
| `/sst/incidentes` | Registro, investigação, CAT, ações. |
| `/sst/obrigacoes` | PGR/PCMSO/LTCAT/AEP/AVCB… por empresa, com documento vigente. |
| `/sst/cipa` | Mandato, membros, reuniões/atas. |
| `/sst/configuracoes` | Funções SST e requisitos (EPI/exames/treinamentos), GHE e riscos, tipos. |

Permissão: módulo `sst` em `modules.ts` com recursos `painel`, `colaboradores`, `epis`, `saude`,
`treinamentos`, `maquinas`, `inspecoes`, `incidentes`, `obrigacoes`, `cipa`, `configuracoes`
(ações ver/inserir/editar/excluir). Leitura cruzada: RH vê a ficha SST do colaborador
(`requireModuloAny(["sst","rh"])`); Almoxarifado vê entregas que baixaram estoque.

## 8. Integrações com o que já existe

| Módulo | Integração |
|---|---|
| **RH / Colaborador** | Mesmo cadastro de pessoa; setor; admissão/demissão disparam pendências. `Colaborador.cargo` (texto) passa a sugerir a `SstFuncao`. |
| **GED (Documento)** | Todo anexo (termo, ASO, certificado, laudo, foto, CAT, ata) é um `Documento` em categoria SST; validade/alerta/versão já existem; `colaboradorId` já existe no GED. |
| **Almoxarifado** | EPI com `itemId` → entrega gera saída de estoque; compra de EPI segue o fluxo normal de Compras (SC → cotação → pedido). |
| **PCM / Engeman** | `SstMaquina.codApl` liga ao ativo; status de conformidade pode aparecer na tela do ativo/PCM. |
| **Projetos** | Adequações e ações corretivas criam tarefas (vínculo por id, sem FK — Projetos é standalone por decisão). |
| **Notificações / Telegram** | Pendências CRÍTICAS e vencimentos em 30/7/0 dias: sino + toast para o responsável; Telegram DM para o técnico e o gerente (reusa `sendTelegramDM`). |
| **Cron** | `sst-vencimentos` diário (como `projetos-prazos`): recalcula conformidade por empresa, grava um snapshot (`SstConformidadeSnapshot` — data, empresa, contagens por pendência) para o histórico/gráfico, e dispara avisos. |
| **Lixeira** | Exclusões destrutivas (entrega, ASO, incidente) passam por `salvarNaLixeira`. |

## 9. Relatórios (PDF/planilha — os que um auditor pede)

1. Ficha de EPI por colaborador (NR-06) com assinaturas.
2. Relação de ASOs vigentes/vencidos por empresa/setor.
3. Treinamentos por colaborador (com validade) e por norma.
4. Inventário de máquinas × NR-12 (status, proteções, laudo).
5. Obrigações documentais por empresa (vigência).
6. Acidentes do período + CAT + indicadores (frequência/gravidade).
7. Painel de conformidade (snapshot da data) — "foto" para a auditoria.

Reusa `pdf-cotacao`-style builders e `useRelatorioCache` para os lentos.

## 10. Fases

| Fase | Entrega | Por que primeiro |
|---|---|---|
| **1 — Base + EPI + ASO + Obrigações** | Funções/requisitos, EPI (cadastro, entrega com termo, saída de estoque), ASO/exames com agenda, obrigações documentais no GED, ficha do colaborador, painel v1, cron de vencimentos. | Maior exposição em auditoria; reaproveita RH, GED e estoque; tudo tabular, sem integração externa. |
| **2 — Treinamentos + Máquinas (NR-12)** | Turmas/certificados, inventário de máquinas ligado ao Engeman, proteções com evidência, migração dos 35 cartões do projeto atual, vínculo com Projetos. | Fecha o caso concreto que motivou o módulo. |
| **3 — Incidentes/CAT + Inspeções + CIPA** | Registro e investigação, ações corretivas, checklists periódicos, extintores/AVCB, mandato e atas. | Completa o ciclo "prevenção → ocorrência → ação". |
| **4 — Indicadores e eSocial** | TF/TG com horas da folha, histórico de conformidade, exportação S-2210 (CAT), S-2220 (ASO), S-2240 (agentes nocivos) via provedor ou arquivo. | eSocial exige base madura; só faz sentido com fases 1–3 preenchidas. |

Cada fase: migration idempotente + rotas + telas + permissão, commitadas juntas; deploy aplica.

## 11. Riscos e decisões abertas (para o dono)

1. **Quem opera?** O módulo pressupõe um técnico de segurança (interno ou terceirizado) lançando
   dados com disciplina. Sem dono do processo, vira cadastro morto. → Definir responsável por empresa.
2. **EPI sai do estoque ou não?** Proposta: sim, quando o EPI tem `itemId`. Alternativa: só registrar
   a entrega e deixar o estoque como está (menos travas, menos rastreio).
3. **Assinatura do termo de EPI**: em tela (canvas → Blob) ou papel digitalizado? Proposta: os dois,
   com a digitalizada como padrão inicial.
4. **Função SST × cargo do RH**: criar cadastro novo (`SstFuncao`) ou transformar `Colaborador.cargo`
   em cadastro compartilhado? Proposta: cadastro novo referenciando o cargo por nome, para não
   mexer no RH/folha agora.
5. **Máquinas: fonte da verdade** é o Engeman (sincroniza) ou o ERP (cadastra à mão)? Proposta:
   Engeman quando houver `codApl`; manual para o resto.
6. **Projeto "Reforma e Auditoria do Trabalho"**: migrar os cartões de máquina para `SstMaquina`
   e deixar o projeto só com as tarefas de execução, ou manter os dois em paralelo? Proposta:
   migrar e manter o vínculo `tarefaId`.
7. **Multiempresa**: obrigações (PGR/PCMSO/CIPA) são por CNPJ; colaborador é de uma empresa.
   Confirmar que Cimento e Mix e Atlas entram desde a fase 1.
8. **LGPD**: ASO/exames são dado sensível de saúde. Proposta: resultado só APTO/INAPTO/RESTRIÇÕES no
   sistema; laudos médicos ficam no GED marcados `confidencial` (já existe) e só o módulo `sst`
   + RH abrem.

## 12. Fora de escopo (explicitamente)

- Elaboração técnica de PGR/PCMSO/LTCAT (continua com o SESMT/consultoria; o módulo guarda e
  controla validade).
- Controle de ponto/jornada e horas extras.
- Gestão de obras (NR-18) além de checklists.
- Transmissão ao eSocial antes da fase 4.
- App mobile dedicado — as telas seguem o `mobile-web-prd.md` (web responsiva).

## 13. Métricas de sucesso

- 100% dos colaboradores ativos com função SST atribuída (fase 1, 60 dias).
- 0 ASOs vencidos sem pendência aberta; aviso 30 dias antes em 100% dos casos.
- Ficha de EPI gerada em < 1 min por colaborador, com termo anexado.
- Inventário NR-12 com status e evidência para 100% das máquinas da Tramontin (fase 2).
- "Estamos regulares?" respondido pelo painel em uma tela, por empresa, para a próxima auditoria.
