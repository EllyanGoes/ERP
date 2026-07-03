# PRD — Layout mobile (web) do ERP

> Estado atual: o ERP é **desktop-first**. O shell (`src/app/(erp)/layout.tsx`) usa
> `Sidebar` em dois níveis (`src/components/layout/Sidebar.tsx` — strip de 64px +
> flyout redimensionável de 160–400px), `TabBar` com abas estilo navegador
> (`src/components/layout/TabBar.tsx`), `EmpresaSelector` e `CommandPalette`. Não há
> infraestrutura mobile: nenhum `useIsMobile`/`useMediaQuery`, só ~23 usos de
> breakpoints `sm:/md:` em todo o app, e as listagens (`src/components/shared/DataTable.tsx`,
> `src/components/ui/table.tsx`) apenas rolam lateralmente (`overflow-x-auto`), sem
> colapso de colunas nem modo cards. `CreateDrawer`/`Sheet`
> (`src/components/shared/CreateDrawer.tsx`) têm larguras fixas (`max-w-xl/3xl/5xl`),
> inviáveis em ~375px. Em telas de celular o app hoje é praticamente inutilizável.

Este documento descreve a **primeira versão** de uma experiência mobile **pela web**
(sem app nativo), usando o **ClickUp como referência** de UX (navegação por bottom tab
bar, listas em cards, ações curtas e tocáveis).

## Objetivo
Entregar uma experiência mobile **web** (PWA-ready) com **shell próprio** — navegação
repensada para o toque — que cobre um **subconjunto curado de workflows de alto valor**,
**reutilizando as APIs (`/api/...`) e a lógica de domínio (`src/lib/...`) já existentes**.
O mobile **complementa** o desktop: não tenta reproduzir telas densas (lançamentos
contábeis, PDV completo, cadastros longos), que continuam canônicas no desktop.

## Princípios
- **Shell dedicado, domínio compartilhado**: UI e navegação mobile são próprias, mas
  **zero duplicação de regra de negócio** — todo dado vem dos mesmos endpoints e libs.
- **Mobile = subset curado**: só o que faz sentido no celular. Telas fora do escopo
  redirecionam ou avisam ("abra no desktop"), nunca quebram.
- **Toque primeiro**: alvos ≥44px, bottom nav alcançável com o polegar, ações por
  gesto/swipe onde couber.
- **Leitura > digitação**: priorizar consulta, decisão e ações curtas (aprovar, conferir,
  marcar entrega) em vez de formulários longos.
- **Multiempresa preservado**: `EmpresaSelector` e o escopo de grupo (cookie `erp_escopo`)
  precisam existir no shell mobile (ver [[escopo-cross-empresa]] e [[multiempresa-projeto]]).
- **Sessão e permissões idênticas**: mesmo `session-context` e `canAccess(moduleId)`; o
  mobile só expõe os módulos a que o usuário tem acesso.

---

## Arquitetura proposta

### Roteamento
Novo prefixo **`/m`** com `src/app/m/layout.tsx` próprio (bottom tab bar + topbar enxuta),
separado do shell desktop em `src/app/(erp)/layout.tsx`.
- **Recomendação**: prefixo `/m` (URLs e shell explicitamente separados; não há risco de
  vazar o `Sidebar`/`TabBar` desktop para o mobile).
- **Alternativa documentada**: route group `(mobile)` com layout escolhido condicionalmente.
  Preterida por acoplar as duas árvores de shell na mesma URL.

### Detecção e entrada
`middleware.ts` detecta user-agent mobile e **sugere/redireciona** para `/m`, com um cookie
de "preferir desktop" como **escape hatch** (mesmo espírito do toggle de escopo). Login e
auth são reaproveitados sem alteração.

### Infra nova mínima
- **Hook `useIsMobile()`** (novo, em `src/hooks`) baseado em
  `matchMedia("(max-width: 767px)")`, para componentes de conteúdo compartilhados
  alternarem tabela↔cards.
- **Bottom tab bar** fixa (novo componente) com 4–5 destinos derivados dos fluxos
  prioritários: **Início/Dashboard · Aprovações · Buscar · Entregas/Campo · Mais**.
- **"Mais"** abre um `Sheet` com o restante dos módulos permitidos, reusando
  `route-registry.ts` e `canAccess` (`src/lib/modules.ts`).
- **Buscar** = `CommandPalette` em tela cheia, reusando `route-registry` e
  `src/components/ui/command.tsx`.
- **Sheets/Drawers fullscreen** em mobile: ajustar `src/components/ui/sheet.tsx` e
  `CreateDrawer` para `w-full` abaixo de `md`.
- **Sem `TabBar` desktop** no mobile; navegação por pilha/voltar.

### Conteúdo compartilhado responsivo
Onde for barato, telas de conteúdo (detalhe de pedido, cliente, produto) são reaproveitadas
com `useIsMobile` + breakpoints. Listagens densas ganham um **modo cards** (novo componente,
ex.: `MobileList`/`CardList`) em vez do `DataTable`.

---

## Fases (fatias finas, valor cedo)

### M0 — Fundação do shell
`src/app/m/layout.tsx`, bottom tab bar, topbar com `EmpresaSelector`, hook `useIsMobile`,
middleware de entrada + escape hatch, e a aba "Mais" listando os módulos permitidos. Sem
telas de negócio ainda além do esqueleto navegável.

### M1 — Aprovações  *(primeira entrega de valor)*
Lista "Minhas Aprovações" + detalhe da cotação/pedido com ações **Aprovar/Reprovar**
tocáveis. Complementa o canal Telegram já existente (ver [[aprovacao-compras-na-cotacao]]):
o usuário abre o detalhe completo e decide pelo celular.

### M2 — Dashboards / Relatórios
Dashboard inicial + fluxo de caixa e indicadores em cards/charts (`recharts` já é usado),
somente leitura.

### M3 — Consultas
Busca e detalhe de **produto, cliente, pedido e posição de estoque** — leitura em campo.

### M4 — Operação de campo
Agenda de entregas, conferências/doc. de entrada e PDV/balcão simplificado (ações tocáveis).
Avaliar caso a caso o que realmente cabe no celular.

### Transversal
PWA (manifest + ícones), estados de offline/erro, e telas fora de escopo com aviso.

---

## Mapeamento de reuso
- **APIs**: `src/app/api/aprovacoes/...`, `src/app/api/suprimentos/cotacoes/...`, e os
  endpoints de dashboards/consultas existentes — consumidos sem alteração.
- **Domínio**: `src/lib/*` (ex.: `src/lib/aprovacao-cotacao.ts`),
  `src/lib/route-registry.ts`, `session-context`, `canAccess` de `src/lib/modules.ts`.
- **UI base**: `src/components/ui/{sheet,dialog,command,button,card,badge}.tsx`. Criar
  variantes mobile só onde necessário (bottom nav, card list, sheet fullscreen).

## Fora de escopo (v1)
Lançamentos contábeis, conciliação OFX, telas densas de cadastro/configuração e edição longa
de formulários — permanecem **desktop-only**, com aviso no mobile.

## Critérios de aceite
- Acesso por UA mobile cai no shell `/m` com bottom nav e escape hatch para desktop.
- Multiempresa/escopo (`erp_escopo`) funcionam no mobile.
- **M1**: aprovar/reprovar uma cotação inteiramente pelo celular, refletindo no desktop.
- Nenhuma regra de negócio duplicada — tudo via API/lib existentes.
- Telas fora de escopo não quebram: redirecionam ou avisam.

## Questões em aberto
- Conjunto final de abas da bottom bar (4 vs 5) e o que entra em "Mais".
- PWA agora ou depois — incluindo push notifications de aprovação?
- Profundidade do PDV/balcão mobile em M4.
