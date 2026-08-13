# PRD — Gestão de Documentos Importantes (GED + Google Drive)

> Status: proposta (planejamento). Implementação pendente.
> Princípio central: **o Google Drive é o cofre; o ERP é o índice e o cérebro** — os arquivos vivem
> num Drive Compartilhado do Workspace (backup, preview, busca e permissões nativas do Google) e o
> ERP guarda os metadados que o Drive não entende: categoria, empresa, validade, responsável,
> vínculos com cadastros e os **alertas de vencimento** que hoje ninguém controla.

## 1. Contexto e objetivo

Os documentos "de verdade" do grupo — contratos, certidões negativas (CNDs), licenças ambientais e
de operação, alvarás, AVCB, apólices de seguro, procurações, atos societários, laudos, ARTs, CRLVs
da frota, CNHs de motoristas, certificados digitais A1 — vivem espalhados: pastas soltas no Drive
de cada um, e-mail, WhatsApp e papel. Ninguém sabe com certeza **onde está a via vigente** nem
**quando vence** — e certidão vencida trava licitação, financiamento e renovação de cadastro em
cliente grande.

O ERP já tem anexos operacionais (títulos: `AnexoTitulo`; tarefas: `AnexoTarefa`; propostas:
`AnexoCotacaoFornecedor`) em Vercel Blob — esses continuam como estão: são comprovantes colados a
um documento do sistema. O que falta é a camada de **documentos institucionais**, com ciclo de
vida próprio.

Objetivo: um módulo **Documentos** que responda três perguntas:
1. **Onde está?** — acervo único, categorizado, com busca e a via vigente inequívoca;
2. **Vale até quando?** — validade controlada, alertas antes do vencimento e fluxo de renovação;
3. **Quem pode ver?** — confidencialidade por documento, com auditoria de acesso.

## 2. Decisões de arquitetura

### 2.1 Storage: Google Drive (Drive Compartilhado), não Vercel Blob

| Critério | Vercel Blob (atual dos anexos) | **Google Drive (escolhido)** |
|---|---|---|
| Custo | pago por GB/tráfego | já incluso no Workspace |
| Preview/OCR | nenhum | nativo (PDF, imagens, Office) + busca full-text do Google |
| Versões | não | nativo (histórico por arquivo) |
| Acesso fora do ERP | link público opaco | app do Drive no celular, compartilhamento controlado |
| Backup/retensão | por nossa conta | Vault/retention do Workspace |
| Risco | — | dependência da API do Google (mitigada: metadados no ERP; arquivo acessível direto no Drive mesmo com o ERP fora) |

- **Um Drive Compartilhado** ("ERP — Documentos"), propriedade da organização (não de um usuário
  — pessoa que sai da empresa não leva os arquivos junto).
- **Autenticação: Service Account** com acesso de `Gerenciador de conteúdo` ao Drive Compartilhado
  (JSON da SA em env `GOOGLE_SA_KEY`; sem OAuth por usuário na F1 — o ERP é quem lê/escreve, e a
  permissão de ver documento é a do módulo/documento no ERP). Upload/download passam pelo backend
  (proxy stream) — o usuário não precisa nem de conta Google para usar a tela.
- **Estrutura de pastas gerida pelo ERP** (uma pasta por empresa → subpasta por categoria):
  `ERP — Documentos/Tramontin/Certidões/...`. O ERP cria as pastas sob demanda e guarda os IDs.
  Editar/renomear direto no Drive é possível mas desencorajado; um cron de reconciliação (§7)
  detecta arquivo movido/apagado e marca o registro como "arquivo não encontrado" em vez de quebrar.
- **Fallback**: `provider` no modelo (`DRIVE | BLOB`). Se a env da SA não estiver configurada, o
  módulo funciona 100% com Vercel Blob (mesmo fluxo dos anexos atuais) — útil em dev e como plano B.

### 2.2 Demais decisões

- **Multiempresa**: `Documento.empresaId` com escopo automático do proxy (documento é da empresa;
  documentos "do grupo" ficam na empresa dona ou duplicados por vínculo — decisão em aberto §10).
- **Permissões**: módulo novo `documentos` em `src/lib/modules.ts` (recursos: `documentos`,
  `categorias`, `relatorios`). Duas camadas: módulo dá acesso à área; documento marcado
  **confidencial** só aparece para os usuários listados em `DocumentoAcesso` (+ ADMIN). Todo
  download/visualização grava `DocumentoLog` (auditoria — quem viu o quê e quando).
- **Versão vigente única**: upload de nova via cria `DocumentoVersao`, o registro aponta para a
  vigente; as anteriores ficam no histórico (e no versionamento do próprio Drive).
- **Padrões da casa**: autoria pelo proxy, migrations idempotentes, exclusão com snapshot na
  `Lixeira` (tipo `DOCUMENTO` — snapshot dos metadados; o arquivo vai para uma pasta
  `_lixeira/` no Drive, não é apagado), DataTable com filtros persistidos, CreateDrawer, EscClose,
  notificações via `notificarUsuario` + resumo diário no Telegram (mesmo canal dos crons).

## 3. Modelo de dados (Prisma)

```prisma
enum StatusDocumento { VIGENTE VENCE_EM_BREVE VENCIDO EM_RENOVACAO ARQUIVADO }
// VIGENTE/VENCE_EM_BREVE/VENCIDO são derivados de `validade` (recomputados pelo cron
// diário e na leitura); EM_RENOVACAO/ARQUIVADO são manuais.

model DocumentoCategoria {
  id            String  @id @default(cuid())
  nome          String                    // Certidões, Licenças, Contratos, Societário, Seguros, Frota, Pessoas...
  slug          String  @unique
  diasAlerta    Int     @default(30)      // antecedência padrão de alerta da categoria
  exigeValidade Boolean @default(false)   // ex.: certidão sem validade não pode ser salva
  ordem         Int     @default(0)
  ativo         Boolean @default(true)
}

model Documento {
  id            String            @id @default(cuid())
  empresaId     String
  categoriaId   String
  titulo        String                       // "CND Federal", "Licença de Operação IMAP nº..."
  descricao     String?
  numero        String?                      // nº da certidão/apólice/contrato
  emissor       String?                      // Receita Federal, SEMA, seguradora...
  emissao       DateTime?
  validade      DateTime?                    // motor dos alertas
  diasAlerta    Int?                         // override do padrão da categoria
  status        StatusDocumento @default(VIGENTE)
  confidencial  Boolean         @default(false)
  responsavelId String?                      // Usuario dono da renovação (recebe os alertas)
  // Vínculos opcionais com cadastros (documento aparece na tela da entidade)
  fornecedorId  String?
  clienteId     String?
  colaboradorId String?
  imobilizadoId String?                      // frota/equipamento (CRLV, laudo, apólice)
  // Arquivo vigente
  versaoVigenteId String?  @unique
  tags          String[]                     // busca livre
  criadoPor     String?
  atualizadoPor String?
  @@index([empresaId, categoriaId])
  @@index([validade])
  @@index([fornecedorId]) @@index([colaboradorId]) @@index([imobilizadoId])
}

model DocumentoVersao {
  id           String   @id @default(cuid())
  documentoId  String
  versao       Int                           // 1, 2, 3...
  provider     String   @default("DRIVE")    // DRIVE | BLOB
  driveFileId  String?                       // id no Drive (provider DRIVE)
  url          String?                       // blob url (provider BLOB) / webViewLink cacheado
  nome         String                        // nome do arquivo
  mime         String
  tamanho      Int
  observacao   String?                       // "renovada em jan/2027"
  criadoPor    String?
  createdAt    DateTime @default(now())
  @@unique([documentoId, versao])
}

model DocumentoAcesso {                      // só p/ confidencial = true
  documentoId String
  usuarioId   String
  @@id([documentoId, usuarioId])
}

model DocumentoLog {
  id          String   @id @default(cuid())
  documentoId String
  usuarioId   String
  acao        String                         // VISUALIZOU | BAIXOU | UPLOAD_VERSAO | EDITOU | RENOVOU
  createdAt   DateTime @default(now())
  @@index([documentoId, createdAt])
}

model EmpresaDrive {                         // config por empresa (pasta raiz no Drive Compartilhado)
  id             String  @id @default(cuid())
  empresaId      String  @unique
  drivePastaId   String                      // pasta da empresa
  pastasCategoria Json   @default("{}")      // {"certidoes": "<folderId>", ...} — cache dos IDs
}
```

Categorias nascem com **seed** (Certidões, Licenças e Alvarás, Contratos, Societário/Jurídico,
Seguros, Frota e Equipamentos, Pessoas, Fiscal/Contábil, Outros) e são editáveis por ADMIN.

## 4. Integração Google Drive (`src/lib/drive.ts`)

- Cliente da API v3 com a Service Account (`googleapis` já resolve JWT; sem SDK pesado no front).
- `garantirPasta(empresaId, categoriaSlug)` → cria/acha a pasta e cacheia o ID em `EmpresaDrive`.
- `uploadDocumento(...)` → `files.create` (resumable p/ >5MB) na pasta certa, nome padronizado
  `[NUMERO] Titulo — vN.ext`; retorna `fileId`.
- `streamDocumento(fileId)` → `files.get(alt=media)` com stream pro response (download/preview
  autenticados pelo ERP; nunca linka `webContentLink` público).
- `previewUrl(fileId)` → `webViewLink` aberto em nova aba **apenas** para quem tem conta no
  Workspace (opcional por documento; o caminho padrão é o proxy).
- `moverParaLixeira(fileId)` → move p/ `_lixeira/` (não `files.delete`).
- Erros da API (quota/5xx): retry com backoff; upload que falhou não cria `DocumentoVersao` órfã
  (ordem: Drive primeiro, banco depois; sobra no Drive é limpa pelo cron de reconciliação).

## 5. Alertas de vencimento (o coração do módulo)

- Cron diário `/api/cron/documentos-vencimentos` (junto dos demais no `vercel.json`):
  1. Recomputa `status` (VIGENTE → VENCE_EM_BREVE quando `validade - hoje <= diasAlerta`; →
     VENCIDO quando passou).
  2. Notifica (in-app) o **responsável** do documento em marcos (diasAlerta, 7 dias, 1 dia,
     no vencimento e semanalmente após vencido) — sem spam diário.
  3. Envia **resumo por Telegram** ao canal da diretoria: "3 documentos vencem em 30 dias: CND
     Federal (Tramontin, 15/09), ...".
- Ação "**Renovar**" no documento: marca EM_RENOVACAO, pede a nova via; o upload da nova versão
  com validade futura volta o status para VIGENTE e registra `RENOVOU` no log.

## 6. Telas

- **`/documentos`** — DataTable padrão: título, categoria, empresa, número, emissor, validade
  (chip colorido: verde vigente, âmbar vence em breve, vermelho vencido), responsável, cadeado se
  confidencial. Filtros persistidos (categoria, status, empresa, responsável, busca). Cards de
  resumo no topo: Vencidos / Vencem em 30 dias / Em renovação. Criação via CreateDrawer com upload
  (drag & drop) + metadados.
- **`/documentos/[id]`** — detalhe: preview embutido (iframe do proxy p/ PDF/imagem), metadados
  editáveis, botão Renovar, histórico de versões (baixar antigas), vínculos, quem pode ver
  (confidencial), e o log de acessos (só gestor/ADMIN).
- **Abas "Documentos" nas entidades**: tela do fornecedor, colaborador e imobilizado ganham a
  listagem dos documentos vinculados (mesma API com filtro) — certidão do fornecedor junto do
  fornecedor, CNH junto do colaborador, CRLV junto do veículo.
- **Vencimentos** (`/documentos/vencimentos`): agenda dos próximos 90 dias agrupada por mês —
  a tela de "o que precisa de ação".

## 7. APIs

```
GET/POST          /api/documentos                       lista filtrada / cria (multipart: arquivo + metadados)
GET/PATCH/DELETE  /api/documentos/[id]                  detalhe+log VISUALIZOU / edita / lixeira (Drive → _lixeira)
POST              /api/documentos/[id]/versoes           nova via (multipart) — vira a vigente
GET               /api/documentos/[id]/arquivo?versao=   stream do arquivo (log BAIXOU)
POST              /api/documentos/[id]/renovar           marca EM_RENOVACAO
GET/POST/PATCH    /api/documentos/categorias             ADMIN
GET               /api/documentos/vencimentos            agenda 90 dias
GET               /api/cron/documentos-vencimentos       alertas (CRON_SECRET)
GET               /api/cron/documentos-reconciliar       semanal: confere driveFileId de todos (arquivo movido/apagado → flag)
```

Guards: `requireModulo("documentos")`; confidencial checa `DocumentoAcesso`; abas nas entidades
usam `requireModuloAny(["documentos", <módulo da entidade>])`.

## 8. Fases

- **F1 — Acervo:** models + seed de categorias, lib do Drive (com fallback Blob), lista + drawer
  de criação + detalhe com preview/versões, permissões e confidencial, Lixeira.
- **F2 — Vencimentos:** cron de status/alertas, tela Vencimentos, ação Renovar, resumo Telegram.
- **F3 — Vínculos:** abas nas telas de fornecedor/colaborador/imobilizado; filtros por entidade.
- **F4 — Refinos:** log de acesso na tela, reconciliação semanal com o Drive, importação em massa
  (apontar uma pasta do Drive existente e classificar os arquivos), relatório de compliance
  (checklist de documentos obrigatórios por empresa — quais faltam/vencidos).

## 9. Fora de escopo (explícito)

Assinatura eletrônica (Clicksign/DocuSign — PRD próprio se surgir); OCR/extração automática de
validade (fica anotado como evolução — a busca full-text do Drive já ajuda); migrar os anexos
operacionais existentes (títulos/tarefas/propostas) para o Drive; edição colaborativa de Google
Docs (o módulo trata arquivos, não documentos vivos); sincronização bidirecional completa com o
Drive (o ERP é a fonte da verdade dos metadados; o cron só detecta divergência).

## 10. Questões em aberto (decidir antes da F1)

1. **Documentos do grupo** (ex.: apólice guarda-chuva): registrar na empresa "dona" com vínculo às
   demais, ou permitir `empresaId` nulo = grupo (fora do escopo automático, como Projetos)?
2. **Conta do Workspace**: qual conta/organização cria o Drive Compartilhado e a Service Account —
   TI do grupo tem Workspace corporativo ou usa contas Gmail avulsas? (Se for Gmail avulso, Drive
   Compartilhado não existe — o plano B é uma pasta na conta + SA com acesso, ou ficar no Blob.)
3. **Quem pode criar documento**: qualquer usuário com o módulo, ou papel restrito (jurídico/adm)
   com os demais só consultando?
4. **Checklist de compliance** (F4): quais documentos são obrigatórios por empresa? (lista do
   contador/jurídico define o seed.)
