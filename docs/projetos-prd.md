# PRD — Módulo de Gestão de Projetos (estilo Trello/Asana/ClickUp)

> Status: proposta (planejamento). Implementação pendente.
> Princípio central: **um gerenciador de projetos completo e autônomo dentro do ERP** — quadros,
> tarefas, kanban, comentários e visões múltiplas, no padrão dos apps famosos (Trello, Asana,
> ClickUp, Monday). **Sem integração com os demais módulos** (decisão do dono, 13/08/2026): nada de
> apropriação de custo, vínculo com compras/financeiro ou capitalização. É colaboração e execução.

## 1. Contexto e objetivo

As equipes organizam iniciativas (obras, manutenções, melhorias, campanhas, rotinas de setor) fora
do ERP — papel, WhatsApp, planilhas ou apps externos (Trello etc.), sem login unificado, sem
permissões da casa e longe de onde o trabalho acontece. Objetivo: um módulo de **Gestão de
Projetos** que substitua esses apps para uso interno, com a experiência que os usuários já
conhecem:

- **Projetos (quadros)** com membros, cor/ícone e favoritos;
- **Tarefas** com responsável, datas, prioridade, etiquetas, checklist, comentários e anexos;
- **Visões**: Kanban (padrão), Lista, Calendário e Linha do tempo;
- **Minhas Tarefas**: caixa de entrada pessoal cruzando todos os projetos;
- **Atividade**: histórico do que aconteceu em cada tarefa/projeto;
- **Notificações** in-app (padrão do ERP) para atribuições, menções e prazos.

Não-objetivo: gestão de custo/orçamento, apontamento de horas, faturamento, dependências com
caminho crítico. Ver §9.

## 2. Decisões de arquitetura

- **Standalone por design.** Nenhuma FK para documentos de outros módulos. Se um dia quiserem
  "anexar" um pedido/minuta numa tarefa, será um link de texto (URL interna) — não uma relação.
- **Multiempresa flexível:** projetos pertencem ao **grupo**, não a uma empresa — obra e campanha
  atravessam empresas e os apps famosos não têm esse conceito. `Projeto` fica **fora do escopo
  automático por empresa** (sem `empresaId`; acesso via lib própria, mesmo raciocínio do
  [[custo-por-empresa]] às avessas). A visibilidade é por **membros** (§3.1): quem participa vê.
- **Permissões em duas camadas:** módulo `projetos` em `src/lib/modules.ts` libera o acesso à área
  (recursos: `projetos`, `tarefas`, `relatorios`); dentro dela, a autorização é **por projeto**
  (dono/membro; projetos podem ser marcados `visibilidade: PUBLICO` para leitura de qualquer um com
  o módulo). ADMIN vê tudo.
- **Padrões da casa:** autoria pelo proxy (`criadoPor`/`atualizadoPor`), migrations idempotentes,
  DatePicker compartilhado, popups com `EscClose` + clique-fora, filtros persistidos
  (`usePersistedState`), notificações via `notificarUsuario`, exclusão destrutiva com snapshot na
  `Lixeira` (tipo `PROJETO`).
- **Tempo real não é requisito da F1:** atualização otimista + refetch em foco (padrão da sessão)
  resolve o uso interno; colaboração simultânea agressiva (websocket) fica registrada como evolução.

## 3. Modelo de dados (Prisma)

### 3.1 Projeto e membros

```prisma
enum VisibilidadeProjeto { PRIVADO PUBLICO }   // PRIVADO: só membros; PUBLICO: leitura p/ quem tem o módulo
enum StatusProjeto       { ATIVO ARQUIVADO }

model Projeto {
  id            String              @id @default(cuid())
  nome          String
  descricao     String?
  cor           String?             // hex p/ o card e o cabeçalho
  icone         String?             // nome de ícone lucide
  visibilidade  VisibilidadeProjeto @default(PRIVADO)
  status        StatusProjeto       @default(ATIVO)   // arquivar, nunca sumir
  donoId        String              // Usuario; único que arquiva/exclui e gerencia membros
  criadoPor     String?
  atualizadoPor String?
  colunas       ProjetoColuna[]
  membros       ProjetoMembro[]
  etiquetas     ProjetoEtiqueta[]
}

model ProjetoMembro {
  id        String @id @default(cuid())
  projetoId String
  usuarioId String
  papel     String @default("MEMBRO")   // ADMIN (gerencia colunas/etiquetas/membros) | MEMBRO
  favorito  Boolean @default(false)     // estrela por usuário
  @@unique([projetoId, usuarioId])
}
```

### 3.2 Colunas (listas do kanban) e etiquetas — customizáveis por projeto

```prisma
model ProjetoColuna {
  id        String  @id @default(cuid())
  projetoId String
  nome      String                  // "A fazer", "Em andamento", "Aguardando peça"...
  ordem     Int
  cor       String?
  concluiTarefa Boolean @default(false) // colunas "done": mover p/ cá marca concluída
}

model ProjetoEtiqueta {
  id        String @id @default(cuid())
  projetoId String
  nome      String
  cor       String
}
```

Projeto novo nasce com 3 colunas padrão ("A fazer", "Em andamento", "Concluído" — a última com
`concluiTarefa`). Colunas livres são o que torna o kanban "estilo Trello" em vez de um enum fixo.

### 3.3 Tarefas

```prisma
enum PrioridadeTarefa { BAIXA MEDIA ALTA URGENTE }

model Tarefa {
  id            String   @id @default(cuid())
  projetoId     String
  colunaId      String
  titulo        String
  descricao     String?  @db.Text     // markdown simples
  ordem         Int                   // posição na coluna (drag & drop)
  prioridade    PrioridadeTarefa @default(MEDIA)
  responsavelId String?               // Usuario (F1: um responsável; multi-assignee é evolução)
  dataInicio    DateTime?
  prazo         DateTime?
  concluidaEm   DateTime?             // setada ao entrar em coluna concluiTarefa
  arquivada     Boolean  @default(false)
  criadoPor     String?
  atualizadoPor String?
  etiquetas     TarefaEtiqueta[]      // N:N com ProjetoEtiqueta
  checklist     TarefaChecklistItem[]
  comentarios   TarefaComentario[]
  anexos        AnexoTarefa[]
  @@index([projetoId, colunaId, ordem])
  @@index([responsavelId, prazo])
}

model TarefaEtiqueta {
  tarefaId   String
  etiquetaId String
  @@id([tarefaId, etiquetaId])
}

model TarefaChecklistItem {
  id       String  @id @default(cuid())
  tarefaId String
  texto    String
  feito    Boolean @default(false)
  ordem    Int
}

model TarefaComentario {
  id        String   @id @default(cuid())
  tarefaId  String
  autorId   String
  texto     String   @db.Text   // @menções por login → notificação
  createdAt DateTime @default(now())
  editadoEm DateTime?
}

model AnexoTarefa { /* padrão AnexoTitulo/AnexosSection: nome, mime, tamanho, blob/storage, autor */ }
```

### 3.4 Atividade (auditoria leve, estilo feed do Trello)

```prisma
model TarefaAtividade {
  id        String   @id @default(cuid())
  projetoId String
  tarefaId  String?
  autorId   String
  tipo      String   // CRIOU | MOVEU | ATRIBUIU | COMENTOU | CONCLUIU | PRAZO_ALTERADO | ...
  detalhe   Json?    // {de: "A fazer", para: "Em andamento"}
  createdAt DateTime @default(now())
  @@index([tarefaId, createdAt])
  @@index([projetoId, createdAt])
}
```

Gravada pelas próprias rotas de escrita (não por trigger); alimenta o feed da tarefa e a aba
Atividade do projeto.

## 4. Telas

Área nova `/projetos` no shell (ícone próprio na sidebar).

### 4.1 Home de projetos (`/projetos`)

Grade de cards estilo Trello: favoritos primeiro, depois "Meus projetos" e "Públicos"; card com
cor/ícone, nº de tarefas abertas/atrasadas e avatares dos membros. Botão "Novo projeto" abre
CreateDrawer (nome, cor, visibilidade, membros). Arquivados numa aba separada.

### 4.2 Projeto (`/projetos/[id]`) — alternador de visões no topo

- **Kanban (padrão):** colunas com drag & drop de cartões (ordem persiste via PATCH) e das
  próprias colunas; cartão mostra título, etiquetas coloridas, prazo (vermelho se vencido),
  checklist "3/5", avatar do responsável e clipe se tem anexo. "+ Adicionar tarefa" inline no pé
  da coluna (título + Enter, como no Trello). Colunas com contagem e menu (renomear, cor, limite
  WIP visual, arquivar).
- **Lista:** DataTable padrão da casa (colunas persistidas/redimensionáveis) agrupada por coluna
  do kanban — título, responsável, prioridade, etiquetas, prazo, status; edição rápida inline de
  responsável/prazo/prioridade.
- **Calendário:** grade mensal com as tarefas no dia do prazo; arrastar entre dias muda o prazo.
- **Linha do tempo:** barras horizontais `dataInicio→prazo` por tarefa, agrupadas por responsável
  (Gantt leve, sem dependências); zoom semana/mês.
- **Atividade:** feed cronológico do projeto.

Filtros persistentes por visão: responsável, etiqueta, prioridade, prazo (atrasadas/semana), texto.

### 4.3 Cartão da tarefa (popup central, estilo Trello)

Abre por cima de qualquer visão (rota `?tarefa=<id>` p/ link compartilhável; `EscClose` +
clique-fora): título editável, descrição markdown com preview, responsável, datas (DatePicker),
prioridade, etiquetas (picker com criação inline), checklist com progresso, anexos
(`AnexosSection`), comentários com @menção, feed de atividade da tarefa, ações (mover, copiar,
arquivar).

### 4.4 Minhas Tarefas (`/projetos/minhas-tarefas`)

Caixa pessoal cruzando todos os projetos do usuário: Atrasadas / Hoje / Esta semana / Sem prazo,
com link direto pro cartão. É a tela de chegada de quem só executa.

### 4.5 Notificações

`notificarUsuario` (toast + sino existentes): tarefa atribuída a você, @menção em comentário,
comentário em tarefa sua, prazo vencendo (cron diário 07h, agrupado por projeto: "3 tarefas vencem
hoje em Obra do Galpão").

## 5. APIs

```
GET/POST          /api/projetos                          home (cards agregados) / criar
GET/PATCH/DELETE  /api/projetos/[id]                     detalhe / editar / arquivar; DELETE só dono, via Lixeira
CRUD              /api/projetos/[id]/colunas             + PATCH reordenar
CRUD              /api/projetos/[id]/etiquetas
CRUD              /api/projetos/[id]/membros             só dono/ADMIN do projeto
GET/POST          /api/projetos/[id]/tarefas             lista com filtros / criar
GET/PATCH/DELETE  /api/projetos/tarefas/[tarefaId]       cartão completo / editar / arquivar
POST              /api/projetos/tarefas/[tarefaId]/mover  {colunaId, ordem} — drag & drop (transação reordena)
CRUD              /api/projetos/tarefas/[tarefaId]/checklist | /comentarios | /anexos
GET               /api/projetos/minhas-tarefas
GET               /api/projetos/[id]/atividade?cursor=
```

Guards: `requireModulo("projetos")` + helper `podeVerProjeto/podeEditarProjeto(userId, projetoId)`
(membro/dono/público/ADMIN) em toda rota. Escrita granular via `temPermissao` onde fizer sentido
(`projetos.tarefas.editar`).

## 6. Detalhes de implementação que importam

- **Drag & drop:** `@dnd-kit` (leve, sem dependência de estilo) para cartões e colunas; `ordem`
  como inteiro espaçado (1024, 2048...) com renormalização na transação de mover — evita reescrever
  a coluna toda a cada drag.
- **Descrição/comentários markdown:** render com o mesmo sanitizador usado no restante do app;
  @menção resolvida contra membros do projeto.
- **Calendário e timeline:** componentes próprios (grid CSS), sem lib de calendário pesada; a
  timeline reusa a lógica de barras do board de PCP como referência visual.
- **Concluída:** `concluidaEm` é derivada da coluna (`concluiTarefa`) — mover de volta reabre
  (limpa o campo). Nada de status duplicado tarefa×coluna.
- **Arquivar em vez de excluir** para projeto, coluna e tarefa (exclusão real só de tarefa/projeto
  pelo dono, com snapshot na Lixeira).

## 7. Fases de implementação

- **F1 — Kanban funcional:** models núcleo (projeto, membro, coluna, etiqueta, tarefa, checklist),
  home, kanban com drag & drop, cartão da tarefa (sem comentários), permissões, Lixeira.
- **F2 — Colaboração:** comentários com @menção, anexos, feed de atividade, notificações.
- **F3 — Visões:** Lista, Calendário, Minhas Tarefas, filtros persistidos, cron de prazos.
- **F4 — Refinos:** Linha do tempo, templates de projeto (copiar estrutura), limite WIP por coluna,
  arquivamento em massa, atalhos de teclado no board.

## 8. Fora de escopo (explícito)

Integração com outros módulos do ERP (custos, compras, financeiro, capex — decisão do dono);
apontamento de horas; dependências entre tarefas/caminho crítico; automações estilo Butler;
convidados externos (só usuários do ERP); apps mobile nativos (o módulo deve funcionar bem no
mobile-web, ver `mobile-web-prd.md`).

## 9. Questões em aberto

1. **Tempo real:** refetch em foco basta para o uso do grupo, ou colaboração simultânea no mesmo
   board é frequente o bastante para justificar SSE/polling curto já na F2?
2. **Multi-responsável** por tarefa na F1 ou um responsável basta (padrão Trello é multi, Asana é
   um)?
3. **Quem pode criar projetos:** qualquer usuário com o módulo, ou papel específico?
4. **Templates prontos** (ex.: "Manutenção de forno", "Obra civil") já na F1 para adoção mais
   rápida?
