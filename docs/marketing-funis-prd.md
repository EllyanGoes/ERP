# PRD — Marketing: Funis, Campanhas, Leads e Tracking (estilo Funnelytics)

> Status: aprovado (planejamento). Implementação da Fase 1 em andamento.
> Princípio central: **um Funnelytics dentro do ERP** — desenhar o funil no canvas, projetar
> resultados (forecast) e sobrepor os números reais vindos de tracking web, lançamentos manuais,
> dados do próprio ERP (Clientes/Pedidos) e, no futuro, das APIs de anúncios (Meta/Google/TikTok).

## 1. Contexto e objetivo

O módulo Marketing hoje tem apenas Inteligência Comercial (concorrentes, preços, geomarketing).
Não existe nenhuma gestão de campanhas, leads ou funis de aquisição: os leads chegam por WhatsApp,
indicação e anúncios, e nada disso é registrado nem medido até virar Cliente/Pedido no ERP.

Objetivo: um conjunto de processos de funil de vendas no módulo Marketing, similar ao Funnelytics.io:

- **Canvas de funis** — editor visual drag-and-drop (React Flow) para desenhar a jornada: fontes de
  tráfego, páginas/landing pages, ações/eventos e etapas offline (visita de vendedor, orçamento, pedido).
- **Forecast/simulação** — volume nos nós-fonte + taxa de conversão nas arestas → projeção de leads,
  vendas e receita ao longo do funil.
- **Tracking real** — snippet JS instalado nos sites do grupo registra pageviews/eventos num endpoint
  público; os números reais são sobrepostos no canvas.
- **Leads/oportunidades (CRM-lite)** — cadastro de leads com etapa de pipeline (kanban), origem/UTM,
  timeline e conversão em Cliente/PedidoVenda do ERP.
- **Fontes de números reais**: tracking web, lançamento manual por nó/período, dados do ERP e
  (fase futura) métricas de campanha das APIs de ads.

**Decisões confirmadas:**

- **Multiempresa: compartilhado pelo grupo**, no padrão da Inteligência Comercial — nenhum model novo
  entra em `MODELOS_ESCOPADOS` (`src/lib/prisma.ts`); `empresaId` existe apenas como tag de origem com
  `@default("emp_tramontin")`. Filtro por empresa nas telas é visual/opcional, nunca obrigatório.
- Canvas persistido como **JSON do React Flow** (`Funil.canvas`), com **tabela derivada `FunilNo`**
  sincronizada no save — precedente: `FluxoProducaoVersao.grafo Json` do PCP.
- Etapas de lead em **tabela configurável** (`EtapaLead`), não enum — pipeline ajustável sem migração.
- Tracking **sem IP nem user-agent cru** (LGPD by design); cookies first-party; retenção de eventos
  crus por 90 dias com agregados diários permanentes.
- Autoria `criadoPor`/`atualizadoPor` carimbada pelo proxy (basta as colunas existirem nos models).

## 2. Modelo de dados (Prisma; migrations idempotentes via MCP, sem `db push`)

### 2.1 Decisão estrutural: canvas JSON + espelho flat de nós

O grafo fica em `Funil.canvas Json` (`{ nodes, edges }` do React Flow) — o desenho é livre, muda a
cada drag e não precisa de joins. Porém tracking, lançamentos manuais e métricas precisam referenciar
nós sem parsear JSON de todos os funis: no save, a API **deriva e faz upsert em `FunilNo`** (chave
`funilId + noId`, onde `noId` é o id estável do node no React Flow). Nós removidos do canvas são
soft-removidos (`ativo=false`) para não perder métricas históricas.

### 2.2 Funis

```prisma
enum StatusFunil { RASCUNHO ATIVO ARQUIVADO }

model Funil {
  id            String      @id @default(cuid())
  empresaId     String      @default("emp_tramontin") // tag, NÃO escopado
  nome          String
  descricao     String?
  status        StatusFunil @default(RASCUNHO)
  canvas        Json        @default("{\"nodes\":[],\"edges\":[]}")
  forecast      Json?       // parâmetros globais de forecast (período, volume padrão)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  criadoPor     String?
  atualizadoPor String?
  ativo         Boolean     @default(true)
  empresa       Empresa     @relation(fields: [empresaId], references: [id])
  nos           FunilNo[]
  leads         Lead[]
  lancamentos   LancamentoManualMetrica[]
  metricasDiarias MetricaNoDiaria[]
}

enum TipoFunilNo { FONTE PAGINA ACAO ETAPA_OFFLINE }

// Espelho flat dos nós do canvas — escrito SOMENTE pelo PUT do funil.
model FunilNo {
  id      String      @id @default(cuid())
  funilId String
  noId    String      // id do node no JSON do React Flow (estável)
  tipo    TipoFunilNo
  rotulo  String
  // Cópia do node.data relevante p/ matching e vínculos:
  //   PAGINA        → { urlPatterns: ["/lp-promo*", "https://site.com/obrigado"] }
  //   ACAO          → { eventoNome: "form_submit" }
  //   FONTE         → { plataforma, campanhaId? }
  //   ETAPA_OFFLINE → { etapaLeadId?, vinculoErp?: { tipo: "PEDIDO_VENDA"|"CLIENTE_NOVO", filtros } }
  config  Json?
  ativo   Boolean     @default(true)
  funil   Funil       @relation(fields: [funilId], references: [id], onDelete: Cascade)
  @@unique([funilId, noId])
  @@index([tipo])
}
```

### 2.3 Campanhas

```prisma
model Campanha {
  id            String    @id @default(cuid())
  empresaId     String    @default("emp_tramontin")
  nome          String
  plataforma    String    // META | GOOGLE | TIKTOK | ORGANICO | INDICACAO | WHATSAPP | OUTRO
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?   // chave principal do matching UTM→campanha (case-insensitive)
  idExterno     String?   // id na plataforma de ads (Fase 5)
  orcamento     Decimal?  @db.Decimal(15, 2)
  dataInicio    DateTime?
  dataFim       DateTime?
  observacoes   String?
  ativo         Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  criadoPor     String?
  atualizadoPor String?
  empresa       Empresa   @relation(fields: [empresaId], references: [id])
  leads         Lead[]
  sessoes       TrackingSessao[]
  metricasAds   MetricaCampanhaDiaria[]
  @@index([utmCampaign])
  @@index([plataforma])
}
```

`plataforma` é String livre (padrão `ConcorrenteCanal.tipo`) — novos canais sem migração.

### 2.4 Leads (CRM-lite)

```prisma
// Pipeline configurável (kanban) — global ao grupo, uma pipeline compartilhada.
model EtapaLead {
  id    String  @id @default(cuid())
  nome  String
  ordem Int     @default(0)
  cor   String? // hex p/ coluna do kanban
  ganho Boolean @default(false) // etapa terminal de sucesso
  ativo Boolean @default(true)
  leads Lead[]
}

enum StatusLead { ABERTO GANHO PERDIDO }

model Lead {
  id            String     @id @default(cuid())
  empresaId     String     @default("emp_tramontin")
  nome          String
  email         String?
  telefone      String?
  empresaNome   String?    // empresa do lead (texto livre)
  cidade        String?
  estado        String?
  status        StatusLead @default(ABERTO)
  motivoPerda   String?
  valorEstimado Decimal?   @db.Decimal(15, 2)
  // Origem / atribuição
  campanhaId    String?
  utmSource     String?
  utmMedium     String?
  utmCampaign   String?
  origemLivre   String?    // "indicação do fulano", quando sem campanha
  // Pipeline
  funilId       String?
  etapaId       String?
  // Conversão no ERP
  clienteId     String?
  pedidoVendaId String?    // primeiro pedido gerado
  convertidoEm  DateTime?
  // Ponte com tracking (identify)
  visitanteId   String?
  responsavelId String?    // Usuario responsável pelo follow-up
  observacoes   String?
  ativo         Boolean    @default(true)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  criadoPor     String?
  atualizadoPor String?
  empresa       Empresa      @relation(fields: [empresaId], references: [id])
  campanha      Campanha?    @relation(fields: [campanhaId], references: [id])
  funil         Funil?       @relation(fields: [funilId], references: [id])
  etapa         EtapaLead?   @relation(fields: [etapaId], references: [id])
  cliente       Cliente?     @relation(fields: [clienteId], references: [id])
  pedidoVenda   PedidoVenda? @relation(fields: [pedidoVendaId], references: [id])
  eventos       LeadEvento[]
  @@index([status])   @@index([etapaId])   @@index([campanhaId])
  @@index([funilId])  @@index([clienteId]) @@index([email]) @@index([visitanteId])
}

model LeadEvento {
  id        String   @id @default(cuid())
  leadId    String
  tipo      String   // CRIACAO | MUDANCA_ETAPA | NOTA | CONTATO | GANHO | PERDIDO | CONVERSAO_CLIENTE | CONVERSAO_PEDIDO
  descricao String?
  dados     Json?    // { deEtapaId, paraEtapaId } etc.
  criadoPor String?
  createdAt DateTime @default(now())
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  @@index([leadId, createdAt])
}
```

### 2.5 Tracking web (volume alto → mínimo de colunas)

```prisma
model SiteRastreado {
  id        String   @id @default(cuid()) // = "siteId" público usado no snippet
  nome      String
  dominios  String[] @default([])          // allowlist p/ validação de Origin/CORS
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())
}

model TrackingVisitante {
  id         String   @id            // cuid gerado pelo snippet (cookie _erp_vid)
  leadId     String?                 // preenchido no "identify" (form com email)
  primeiroEm DateTime @default(now())
  ultimoEm   DateTime @default(now())
  @@index([leadId])
}

model TrackingSessao {
  id          String    @id          // gerado pelo snippet (cookie _erp_sid)
  visitanteId String
  siteId      String
  inicio      DateTime  @default(now())
  ultimoEm    DateTime  @default(now())
  referrer    String?
  utmSource   String?   // UTMs capturadas no 1º pageview da sessão
  utmMedium   String?
  utmCampaign String?
  utmTerm     String?
  utmContent  String?
  campanhaId  String?   // resolvido na ingestão (match utmCampaign / ?cid=)
  dispositivo String?   // "mobile" | "desktop" (derivado do UA; UA cru NÃO armazenado)
  campanha    Campanha? @relation(fields: [campanhaId], references: [id])
  @@index([visitanteId]) @@index([campanhaId]) @@index([inicio])
}

model TrackingEvento {
  id          String   @id @default(cuid())
  sessaoId    String
  visitanteId String   // desnormalizado p/ agregação sem join
  siteId      String
  tipo        String   // "pageview" | "evento"
  nome        String?  // nome do evento custom (tipo=evento)
  path        String   // pathname normalizado (sem querystring)
  createdAt   DateTime @default(now())
  @@index([createdAt])                 // purge/agregação por dia
  @@index([siteId, path, createdAt])   // matching URL→nó
  @@index([sessaoId])
  @@index([visitanteId, createdAt])    // path-analysis (Fase 4)
}
```

### 2.6 Métricas agregadas, manuais e de ads

```prisma
// Agregado diário por nó — o canvas (modo análise) lê DAQUI, nunca dos eventos crus.
// Populado pelo cron (TRACKING/ERP/ADS); lançamentos manuais são consultados à parte.
model MetricaNoDiaria {
  id         String   @id @default(cuid())
  funilId    String
  noId       String   // FunilNo.noId
  data       DateTime @db.Date
  fonte      String   // "TRACKING" | "ERP" | "ADS"
  visitantes Int      @default(0) // únicos no dia
  sessoes    Int      @default(0)
  eventos    Int      @default(0) // pageviews/eventos totais
  conversoes Int      @default(0) // p/ nós ERP: qtde pedidos/clientes novos
  receita    Decimal  @default(0) @db.Decimal(15, 2)
  funil      Funil    @relation(fields: [funilId], references: [id], onDelete: Cascade)
  @@unique([funilId, noId, data, fonte])
  @@index([funilId, data])
}

// Lançamento manual por nó/período — auditável, não se mistura ao agregado.
model LancamentoManualMetrica {
  id         String   @id @default(cuid())
  empresaId  String   @default("emp_tramontin")
  funilId    String
  noId       String
  dataInicio DateTime @db.Date
  dataFim    DateTime @db.Date
  visitantes Int?     // lança só o que tem — métricas nulláveis
  leads      Int?
  conversoes Int?
  receita    Decimal? @db.Decimal(15, 2)
  observacao String?
  createdAt  DateTime @default(now())
  criadoPor  String?
  empresa    Empresa  @relation(fields: [empresaId], references: [id])
  funil      Funil    @relation(fields: [funilId], references: [id], onDelete: Cascade)
  @@index([funilId, noId, dataInicio])
}

// Métricas importadas das APIs de ads (Fase 5 — estrutura pronta desde já).
model MetricaCampanhaDiaria {
  id         String   @id @default(cuid())
  campanhaId String
  data       DateTime @db.Date
  spend      Decimal  @default(0) @db.Decimal(15, 2)
  impressoes Int      @default(0)
  cliques    Int      @default(0)
  conversoes Int      @default(0)
  bruto      Json?    // payload cru da API p/ auditoria
  campanha   Campanha @relation(fields: [campanhaId], references: [id], onDelete: Cascade)
  @@unique([campanhaId, data])
  @@index([data])
}
```

Alterações em models existentes: `Cliente.leads Lead[]`, `PedidoVenda.leads Lead[]` e relações
inversas em `Empresa` (`funis`, `campanhas`, `leadsMarketing`, `lancamentosMetrica`).

## 3. Arquitetura do tracking (Fase 3)

### 3.1 Rotas públicas

`src/middleware.ts` bloqueia toda API fora de `PUBLIC_PREFIXES`. Mudança mínima: adicionar
`"/api/t"` à lista, com comentário no bloco de documentação (padrão dos webhooks: "valida siteId +
Origin allowlist").

- `GET /api/t/s.js` — serve o snippet (template TS interpolado com a URL base;
  `Content-Type: application/javascript`; `Cache-Control: public, max-age=3600`).
- `POST /api/t/e` — ingestão em batch; `OPTIONS` para preflight CORS.

### 3.2 Snippet

```html
<script async src="https://<erp>/api/t/s.js" data-site="SITE_ID"></script>
```

- Cookies first-party: `_erp_vid` (visitante, 1 ano, `SameSite=Lax`) e `_erp_sid` (sessão, renovada
  a cada evento, expira com 30 min de inatividade).
- Pageview no load + em mudanças da History API (SPAs).
- API global: `window.erp("track", "nome_evento")` e `window.erp("identify", { email })`.
- UTMs capturadas da querystring no primeiro pageview da sessão.
- Envio via `navigator.sendBeacon` com fallback `fetch(..., { keepalive: true })`.
- Payload mínimo: `{ site, vid, sid, tipo, nome?, path, ref?, utm? }`. **Sem IP e sem UA cru.**

### 3.3 Ingestão (`POST /api/t/e`)

1. Valida `siteId` ativo e `Origin` contra `SiteRastreado.dominios` (**fail-closed**); responde CORS
   dinâmico (`Access-Control-Allow-Origin` = origin validada).
2. Rate limit por IP+site (janela em memória por instância) + cap de payload (10 KB / 20 eventos).
3. Upsert `TrackingVisitante` / `TrackingSessao`; na criação da sessão resolve `campanhaId` por match
   case-insensitive de `utmCampaign` — ou pelo parâmetro `cid` (link "oficial" gerado na tela da Campanha).
4. `createMany` de `TrackingEvento`; `identify` com email tenta casar `Lead.email` e grava
   `TrackingVisitante.leadId`.
5. Usa `prismaSemEscopo` (rota sem sessão de usuário — mesmo padrão do webhook do WhatsApp).

### 3.4 Matching evento→nó e agregação

O matching acontece **na agregação, não na ingestão** (ingestão fica O(1)):

- Nós `PAGINA` casam por `config.urlPatterns` (glob simples com `*`); nós `ACAO` por `config.eventoNome`.
- **Cron diário** `GET /api/cron/marketing-agrega-tracking` (protegido por `CRON_SECRET`): para cada
  funil ATIVO agrega o dia anterior de `TrackingEvento` → upsert em `MetricaNoDiaria` (fonte=TRACKING).
  Idempotente (delete+insert do dia) e com janela retroativa de 3 dias (pega edições de urlPatterns).
  O mesmo cron purga eventos crus com mais de 90 dias.
- **"Hoje" on-the-fly**: o endpoint de métricas soma `MetricaNoDiaria` do período + consulta crua só de
  `createdAt >= hoje 00:00` (segurada pelo índice `[siteId, path, createdAt]`).
- Taxas nas arestas (modo análise, v1): razão simples `contagem(nóDestino)/contagem(nóOrigem)` —
  rotulada na UI como "taxa aproximada". Fase 4: path-analysis real por `visitanteId`.

## 4. Canvas (React Flow)

Base: `@xyflow/react` v12 (já instalado), padrões de `src/components/pcp/editor/FluxoEditor.tsx`
(toolbar, `NodeConfigSheet` lateral) e `src/components/documentacao/ProcessoDiagram.tsx`.

- **Nós customizados** (`src/components/marketing/funil/nodes.tsx`): `FonteNode` (ícone/cor por
  plataforma), `PaginaNode` (URL/patterns), `AcaoNode` (evento), `EtapaOffNode` (etapa de lead ou
  vínculo ERP). Config no `node.data`, editada num sheet lateral.
- **Aresta customizada** (`edges.tsx`): label vazia no modo desenho; `taxa %` editável no modo
  forecast (persistida em `edge.data.taxa`); taxa real no modo análise (com delta vs forecast).
- **3 modos** (toggle na toolbar, como o Funnelytics):
  - **Desenho** — edição livre (arrastar, ligar, configurar);
  - **Forecast** — volume nos nós-fonte, % nas arestas, propagação downstream **client-side pura**
    (motor testável em `forecast.ts`), receita projetada por `valorMedio` do nó;
  - **Análise** — overlay de números reais por nó (badge visitantes/conversões) vindos de
    `GET /api/marketing/funis/[id]/metricas?de=&ate=&fontes=tracking,manual,erp`, com `DatePicker`
    compartilhado de período.
- **Persistência**: auto-save com debounce de 2 s **+** botão Salvar explícito. O
  `PUT /api/marketing/funis/[id]` valida o canvas com Zod e sincroniza `FunilNo` na mesma transação.

## 5. Fluxos principais

1. **Campanha**: cadastrar com plataforma + UTMs (e futuramente id externo); a tela gera o link
   oficial com `?cid=` para usar nos anúncios.
2. **Funil**: criar em `/marketing/funis` (CreateDrawer) → desenhar no canvas → ativar. Nós FONTE
   podem apontar para uma Campanha; nós ETAPA_OFFLINE para uma EtapaLead ou vínculo ERP.
3. **Lead**: entra manualmente (ou via identify do tracking, F3) com origem/campanha → percorre o
   kanban de etapas (cada movimento vira `LeadEvento`) → **converter**: cria `Cliente` pré-preenchido
   ou vincula um existente (`ComboboxWithCreate`), opcionalmente vincula o primeiro `PedidoVenda`.
4. **Métricas manuais**: em qualquer nó, lançar contagens por período (alcance do anúncio, visitas,
   contatos no WhatsApp) — aparecem no modo análise como fonte MANUAL.
5. **Análise**: escolher período e fontes; o canvas mostra números por nó e taxas nas arestas;
   painel lateral com resumo (leads, vendas, receita, CAC quando houver orçamento/spend).

## 6. Módulo, permissões e arquivos

- `src/lib/modules.ts` — novos recursos no módulo `marketing`: `funis`, `campanhas`, `leads`
  (ver/inserir/editar/excluir). Permissões `marketing.<recurso>.<acao>`.
- `src/components/layout/Sidebar.tsx` — nova `SubSection` `kind: "Funis & Leads"` (adicionar à union)
  com itens Funis, Campanhas e Leads no módulo marketing.
- `src/lib/route-registry.ts` — 3 entradas (group Marketing) com keywords: funil, campanha, lead,
  crm, funnelytics, pipeline, kanban.
- APIs em `src/app/api/marketing/` com `export const dynamic = "force-dynamic"` e
  `requireModulo("marketing")` nas mutações; Zod em `src/lib/validations/marketing-*.ts`;
  soft-delete (`ativo=false`).
- Reuso: `CreateDrawer`/`useCreateFlow`, `ComboboxWithCreate`, `shared/DatePicker`,
  `usePersistedState`, `DataTable`, `PageHeader`.
- Nenhuma dependência nova na Fase 1–4 (React Flow, recharts e date-fns já instalados).

## 7. Roadmap (MoSCoW)

| Fase | MoSCoW | Escopo |
|---|---|---|
| **F1 Fundação** | MUST | Migration completa (inclui tabelas de tracking), CRUD de campanhas/etapas/leads (lista + kanban + timeline + conversão em Cliente/Pedido), canvas modo desenho, lançamento manual, modo análise com fontes MANUAL + leads por etapa |
| **F2 Forecast** | MUST | Motor de propagação puro (`forecast.ts`), volumes/taxas no canvas, painel de projeção (leads/vendas/receita), CAC com orçamento da campanha |
| **F3 Tracking** | MUST | Snippet `GET /api/t/s.js`, ingestão `POST /api/t/e`, middleware (`/api/t` público), CRUD de sites rastreados, cron agrega + purge, atribuição UTM→campanha, identify→lead, overlay TRACKING no canvas |
| **F4 ERP** | SHOULD | `vinculoErp` nos nós offline (PedidoVenda/Cliente agregados no cron, fonte=ERP), path-analysis por visitante nas arestas, painel de marketing consolidado (recharts) |
| **F5 Ads APIs** | COULD | Meta Marketing API / Google Ads / TikTok → `MetricaCampanhaDiaria` (spend/impressões/cliques), ROAS/CPL no canvas e na tela de campanhas; OAuth em Configurações → Integrações |
| **WON'T (v1)** | — | Heatmaps, gravação de sessão, testes A/B, e-mail marketing |

## 8. Riscos e pontos de atenção

1. **LGPD/privacidade** — mitigado por design: sem IP/UA cru, cookie first-party, identify só com
   email fornecido em formulário. Banner de consentimento é responsabilidade do site rastreado
   (documentar na tela de instalação). Considerar hash do email no identify.
2. **Endpoint público `/api/t`** — superfície de ataque. Fail-closed (siteId + Origin allowlist),
   cap de payload desde o dia 1. Rate limit em memória é fraco em serverless (janela por instância);
   se houver abuso, mover contagem para Postgres/Upstash.
3. **Volume de `TrackingEvento`** — colunas mínimas, retenção 90 dias, agregados permanentes. Plano B
   se explodir: partição por mês ou ingestão via Edge Function (a interface `/api/t/e` não muda).
4. **Taxas de aresta > 100%** em fluxos não lineares (razão simples) — rotular como "aproximada" até
   a path-analysis da Fase 4.
5. **Drift JSON ↔ FunilNo** — `FunilNo` só é escrito pelo PUT do funil (transação única). Renomear/
   reconfigurar nó preserva histórico (mesmo `noId`); deletar e recriar gera `noId` novo (histórico
   órfão) — aceito na v1, soft-delete preserva o agregado.
6. **OAuth das APIs de ads (F5)** — token Meta expira em 60 dias; Google Ads exige developer token
   aprovado. Reusar o padrão de `api/configuracoes/integracoes` para credenciais.

## 9. Verificação

- `npx tsc --noEmit` limpo.
- Migration idempotente: aplicar 2× local sem erro; prod via MCP (nunca `db push`).
- Fluxo end-to-end: criar campanha → criar funil, desenhar os 4 tipos de nó, salvar, recarregar
  (canvas persiste, `FunilNo` sincronizado) → criar lead com campanha/etapa, mover no kanban
  (timeline registra) → converter em Cliente → lançar métrica manual num nó → modo análise mostra
  os números.
- Permissões: usuário sem `marketing.*` não vê o menu nem acessa as APIs.
