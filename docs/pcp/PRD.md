# PRD — Módulo de PCP (Planejamento e Controle da Produção)

**Produto:** ERP EllyanGoes · **Módulo:** PCP · **Segmento:** Cerâmica Vermelha (tijolos/blocos), operação tipo Tramontin
**Versão do documento:** 1.1 · **Data:** 2026-06-05 · **Autor:** PM (sênior, sistemas industriais)
**Status:** MVP + Execução + WIP no estoque **em produção**; engenharia do produto + integração de itens em andamento (ver Revisão 1.1)

---

## Revisão 1.1 — Ajustes do chão de fábrica (2026-06-05)

> Após colocar o MVP + Execução no ar, o usuário validou contra a operação real e apontou
> 7 ajustes. Esta seção registra a **correção do modelo**; o roadmap (seção 16) foi atualizado.

**Já entregue e em produção:** editor visual de fluxo (React Flow), Centros de Trabalho,
Ordens de Produção + apontamento por etapa (perdas, biomassa) e **WIP no estoque**
(movimentação automática por estágio, itens de WIP auto-criados).

**Ajustes a incorporar (correção de modelo):**

1. **Fluxo é compartilhado entre produtos.** Um fluxo de produção (o "caminho" pela fábrica)
   vale para **vários produtos** — não é 1 fluxo por produto. → Desacoplar `FluxoProducao` do
   produto; o **produto referencia** um fluxo. *(altera seções 5 e 6)*
2. **Engenharia / Estrutura do Produto (BOM).** O que muda entre produtos é a **estrutura de
   engenharia** (lista de insumos e quantidades): um tijolo leva mais argila, outro menos; além
   de **embalagem** (pallet, fita PET, grampo). Cadastro novo, **por produto**, ligado a `Item`s
   reais. *(nova seção 5A; alimenta o MRP — seção 6)*
3. **Insumos que são misturas.** Há insumos **intermediários** compostos (ex.: massa preparada =
   argila + caco + água) que **continuam sendo estoque de insumo** das etapas seguintes. →
   Modelar **insumo-mistura** (semi-acabado que entra como insumo). *(seção 5: novo papel de nó)*
4. **Insumos vindos de resíduos da operação.** Há insumos que **nascem como subproduto/resíduo**
   de operações (ex.: caco de tijolo da quebra) e **retornam** como insumo. → Modelar **saída de
   subproduto** numa operação, que dá entrada num estoque de insumo (laço de reaproveitamento).
   *(seções 5 e 8)*
5. **OP direcionada às operações.** As ordens devem ser **distribuídas às operações** (centro de
   trabalho/operador), que produzem e **apontam o que produziram**. → **Fila de produção por
   operação** (cada área vê suas etapas a executar e aponta). *(expande seção 8)*
6. **Materiais e locais ainda não integrados.** No editor, os nós de estoque/insumo/PA usam
   **texto livre** — precisam apontar para **`Item` real** e **`LocalEstoque` real**. → Seletor de
   Item/Local no editor e na engenharia. *(seção 5.2; pré-requisito do MRP)*
7. **Ciclos de operação em horas → lead time acumulado.** Cada operação tem **duração em horas**;
   o lead time total é a **soma** ao longo das etapas (ex.: ~144 h ≈ 6 dias). → `tempoCicloHoras`
   por etapa + cálculo de **previsão de conclusão** (início + Σ ciclos). *(refina 5.3/5.4 e 5.9)*

**Decisão de demanda (MPS):** valem as **3 fontes** — **pedidos de venda**, **estoque mín/máx** e
**previsão manual** — todas **configuráveis**, com **previsão manual como padrão** (caso mais
comum). *(resolve a suposição 6)*

---

## Suposições explícitas (premissas de partida)

> Estas são decisões assumidas para destravar o desenho. Onde marcado **(confirmar)**, validar com o usuário antes da fase correspondente.

1. **Produção MTS (make-to-stock)** em fluxo contínuo com etapas em batelada; o **forno de queima** é a restrição principal, seguido da **secagem**.
2. **Restrição/gargalo** é modelada com **capacidade finita** apenas no forno e na secagem; demais etapas (preparação, conformação) são tratadas como capacidade efetivamente infinita e programadas a partir do gargalo. **(confirmar granularidade do ciclo do forno: batelada com tempo de ciclo fixo por carga × contínuo por hora)**.
3. **UOM de planejamento = milheiro (1.000 peças)**; movimentação física por **vagão/vagoneta**; estoque por **unidade**. As conversões usam o cadastro existente `Unidade`/`ItemUnidade`/`UnidadeConversao`. **(confirmar a UOM base por estágio)**.
4. **Estados de WIP** controlados: **úmido → seco → queimado → acabado**.
5. **WIP reaproveita o módulo de Estoque atual** (itens + `MovimentacaoEstoque`), não um livro paralelo (decisão do usuário).
6. **Demanda do MTS** vem de **3 fontes configuráveis** — pedidos de venda confirmados, reposição por estoque mín/máx do produto acabado e **previsão manual (padrão)**. *(decidido — ver Revisão 1.1)*
7. **Perdas (trincas/refugo)** são percentuais por etapa, com concentração esperada em **secagem** e **queima**; perdas são baixadas como movimento de estoque do WIP do estágio. **(confirmar se perda é por etapa ou só na queima)**.
8. **Insumo de queima = biomassa (caroço de açaí)**, com consumo medido por ciclo de forno e KPI de **consumo por milheiro**.
9. **Ativos do forno/secador** existem no **Engeman** (CMMS, somente leitura) e são referenciados por `codApl`; a disponibilidade do forno usa `AtivoRegime.horasPorDia`.
10. **Editor visual = React Flow (`@xyflow/react`)**; o grafo desenhado é a **fonte de verdade** (JSONB versionado) e é **projetado** para um roteiro estruturado que alimenta MPS/MRP/programação.
11. **Multiusuário, web, desktop-first** (chão de fábrica usa terminais/tablets); 1 filial no MVP (multifilial já existe no ERP e é herdado).
12. **Idioma:** PT-BR. **Moeda:** BRL. **Fuso:** America/Belém.

---

## 1. Visão geral e objetivo do módulo

O **PCP** dá à cerâmica a capacidade de **planejar, programar e controlar** a produção de tijolos/blocos do recebimento da matéria-prima até o produto acabado, com o **forno como restrição central**. O coração do módulo é um **editor visual de fluxos de produção** (estilo n8n): o usuário **desenha o próprio esquema produtivo** — estoques de matéria-prima/insumos → operações → buffers de WIP → produto acabado — e esse desenho vira o **roteiro** que alimenta planejamento (MPS), necessidades (MRP), programação com capacidade finita, apontamento e indicadores.

**Objetivo de negócio:** reduzir perdas (trincas na secagem/queima), **maximizar a ocupação do forno**, dar **visibilidade de WIP** por estágio e **rastrear o consumo de biomassa por milheiro** — convertendo um chão de fábrica gerido por experiência em um processo planejado e medido.

**Objetivo de produto:** ser o sistema onde o PCP **modela visualmente** a fábrica uma vez (por produto), e a partir daí **programa, libera e acompanha** ordens de produção com números confiáveis.

---

## 2. Problema e oportunidade

**Hoje (dores):**
- **Perdas por trincas** na secagem e na queima sem medição por etapa nem causa — o refugo aparece só no final.
- **Ociosidade/sobre-carga do forno** (o ativo mais caro e o gargalo) sem visibilidade de ocupação nem sequenciamento.
- **Falta de visibilidade de WIP**: não se sabe quanto há de produto úmido, seco e queimado em pátio a cada momento.
- **Consumo de biomassa** (caroço de açaí) sem rastreio por milheiro — custo de queima opaco.
- **Planejamento informal**: a sequência de produção vive na cabeça do encarregado; difícil simular, repetir e auditar.

**Oportunidade:**
- Modelar o fluxo **uma vez** e reutilizar como template por produto (6 furos, 8 furos, bloco…).
- **Programar o gargalo** (forno) para reduzir ociosidade e priorizar o que tem demanda.
- **Medir perdas por etapa** para atacar as maiores (tipicamente secagem/queima).
- **Custo de queima por milheiro** explícito → negociação de biomassa e eficiência energética.
- **Giro de WIP** visível → menos capital parado em pátio e menos retrabalho.

---

## 3. Personas e jornadas

| Persona | Objetivo | Dores | Jornada-chave |
|---|---|---|---|
| **Planejador / PCP** | Plano viável que respeita o forno | Não enxerga capacidade nem WIP | Desenha o fluxo → define demanda (MPS) → roda MRP → programa o forno → libera ordens |
| **Supervisor de chão** | Cumprir o programa do dia | Replaneja "no grito" | Vê a fila do forno e o WIP por estágio → ajusta sequência → acompanha perdas |
| **Operador de massa** | Preparar massa na quantidade certa | Falta/sobra de caco e água | Recebe ordem da etapa de preparação → aponta produção e consumo |
| **Operador de secagem** | Secar sem trincar | Janela de secagem no olho | Carrega vagonetas → registra entrada/saída do secador → aponta perdas (trincas) |
| **Operador de forno** | Queimar com biomassa suficiente | Curva e biomassa no improviso | Carrega vagões → registra ciclo (entrada/queima/saída) → aponta biomassa e perdas |
| **Compras / Estoque** | Não faltar insumo (biomassa, caco) | Compra reativa | Recebe necessidades do MRP → compra → abastece WIP/insumos |

**Jornada central (planejador):** "Quero produzir 200 milheiros de tijolo 6 furos esta semana." → seleciona o **fluxo publicado** do produto → o sistema **explode** insumos (argila, água, caco, biomassa) já considerando **perdas** → mostra a **ocupação do forno** e avisa se não cabe → o planejador **sequencia** e **libera** as ordens → o chão **aponta** etapa a etapa → dashboards mostram aderência, perdas e biomassa/milheiro.

---

## 4. Objetivos e métricas (KPIs)

| KPI | Definição | Meta inicial |
|---|---|---|
| **Aderência ao plano** | Ordens concluídas no prazo ÷ planejadas | ≥ 90% |
| **Ocupação do forno** | Horas de forno em queima ÷ horas disponíveis (`AtivoRegime.horasPorDia`) | ≥ 85% |
| **Lead time por etapa** | Tempo médio entrada→saída por estágio (preparação, secagem, queima…) | Baseline + redução |
| **Perdas por etapa** | Refugo ÷ entrada, por estágio (úmido/seco/queimado) | Reduzir secagem/queima |
| **Consumo de biomassa por milheiro** | kg de caroço de açaí ÷ milheiros queimados | Baseline + redução |
| **Giro de WIP** | Saídas do estágio ÷ WIP médio do estágio | Aumentar |
| **OTIF de produção** | Ordens no prazo e na quantidade | ≥ 90% |

---

## 5. CRIAÇÃO DE FLUXOS DE PRODUÇÃO (seção central)

> Esta é a funcionalidade-âncora do módulo e o foco do MVP. É um **editor visual drag-and-drop** (React Flow / `@xyflow/react`) onde o usuário desenha o esquema de produção da fábrica, conectando estoques, operações e buffers de WIP até o produto acabado — exatamente como o fluxograma operacional da Tramontin.

### 5.1 O que faz / por que importa
**O que faz:** permite desenhar, em um canvas com zoom/pan/minimapa, o **grafo de produção**: nós (estoques, operações, transportes, buffers, inspeções) ligados por **arestas de fluxo de material**. Cada nó é configurável; o grafo é **validado**, **salvo**, **versionado** e **publicado** como roteiro.
**Por que importa:** transforma o conhecimento tácito do chão em um **modelo executável e reutilizável**, que alimenta planejamento, programação e custo. É a diferença entre "produzir de cabeça" e "produzir por um plano medido".

### 5.2 Tipos de nós
| Nó | Representa | Exemplos no chão |
|---|---|---|
| **Estoque / Insumo** | Estoque de MP e insumos (vínculo a um `Item` + `LocalEstoque`) | Matéria-prima (argila), caroço de açaí, caco de tijolo, água, pallets, fita PET |
| **Operação** | Etapa produtiva em um centro de trabalho | Extração, sazonamento, homogeneização, laminar, extrusão, corte, secagem, queima, embalar |
| **Transporte** | Movimentação por vagoneta/vagão | Carregamento nas vagonetas, carregamento dos vagões, transferência de entrada/saída |
| **Buffer / Espera de WIP** | Pulmão de produto em processo (carrega um `EstadoWIP`) | Pátio úmido, pátio seco, pré-forno (queimado) |
| **Inspeção** | Ponto de qualidade / portão | Inspeção visual de trincas pós-secagem |
| **Estocagem / Produto Acabado** | Saída para estoque de PA (vínculo a `Item` + `LocalEstoque`) | Estoque de produto acabado |

**Arestas** = fluxo de material (origem→destino). Evolução futura: tipar aresta material × energia.

### 5.3 Configuração por etapa (painel lateral)
Ao selecionar um nó, abre um painel (Sheet) com campos por tipo:
- **Recurso / centro de trabalho** (`CentroTrabalho`, com link opcional ao ativo Engeman via `codApl`).
- **Tempo de setup** (min) e **tempo de ciclo** (por unidade / por milheiro / por vagão).
- **Capacidade** (un/h, milheiros/ciclo) e **perdas esperadas (%)**.
- **Predecessoras/sucessoras** — derivadas das conexões (somente leitura).
- **Vínculo de insumos** por etapa (água, caco, biomassa, argila) → consumo por unidade/milheiro/ciclo/vagão (para MRP e custo).

**Regras de negócio:**
- Um nó de **Operação** deve ter ≥1 entrada e ≥1 saída (exceto fontes/sinks).
- **Capacidade** é obrigatória em operações que serão programadas (mínimo: o gargalo).
- **Perdas** ajustam o gross-up do MRP (necessidade = saída ÷ (1 − perda)).

### 5.4 Etapas de longa duração com janela (secagem e queima)
**O que faz:** nós de **secagem** e **queima** ganham campos extras: **duração mínima/máxima**, **curva de temperatura/tempo** (quando aplicável) e **lote por vagão/vagoneta**.
**Por que importa:** são as etapas que **causam as trincas** e que **definem o gargalo**; a janela e a curva são parâmetros de qualidade e de capacidade.
**Regras:** a janela mín/máx limita o sequenciamento; o lote por vagão converte milheiros↔vagões para a capacidade do forno.

### 5.5 Vínculo de insumos por etapa
**O que faz:** cada operação pode declarar consumos (ex.: queima consome X kg de biomassa por milheiro; preparação consome Y de caco e Z de água por milheiro).
**Por que importa:** habilita **cálculo de necessidade (MRP)** e **custo por milheiro** (biomassa, água, caco).
**Regras:** consumo é por base declarada (POR_UN | POR_MILHEIRO | POR_CICLO | POR_VAGAO); o item vem do cadastro `Item`.

### 5.6 Templates reutilizáveis por produto + versionamento
**O que faz:** cada fluxo pertence a um **produto** (tijolo 6 furos, 8 furos, bloco…) e é **versionado** (RASCUNHO → PUBLICADA → ARQUIVADA), com histórico.
**Por que importa:** o mesmo desenho vira padrão reaproveitável; mudanças de processo ficam auditáveis.
**Regras:** uma versão **publicada que já gerou ordem de produção é imutável** — editar **bifurca** uma nova versão. Só **versões publicadas** alimentam o planejamento.

### 5.7 Validação automática
**O que faz:** ao editar e ao publicar, o sistema valida: **nós sem conexão** (órfãos), **≥1 fonte** (estoque/insumo) e **≥1 sink** (PA), **ausência de ciclos** (ordenação topológica → ordem das etapas), **capacidade incoerente** e **gargalos óbvios** (a operação de menor capacidade é destacada; esperado: o forno).
**Por que importa:** impede roteiros inválidos de irem para o planejamento; mostra o gargalo de cara.
**Regras:** publicação é **bloqueada** se houver erro estrutural; avisos (warnings) não bloqueiam.

### 5.8 Vínculo do fluxo ao roteiro (MPS/MRP/programação)
**O que faz:** ao publicar, o grafo (JSONB) é **projetado** em tabelas estruturadas de **operações** e **insumos** (ordem topológica, capacidades, perdas, vínculos), que são o **roteiro/BOM de processo** consumido por MPS, MRP e programação.
**Por que importa:** separa "como o usuário desenha" (grafo fiel) de "como o sistema planeja" (linhas planas, indexadas).
**Regras:** a projeção é regenerada inteira a cada publicação; o endpoint de publicação é o **único** escritor.

### 5.9 Simulação do fluxo
**O que faz:** antes de produzir, estima **lead time** (soma de etapas + fila no forno), **ocupação do forno** e **nível de WIP** por estágio para um volume hipotético.
**Por que importa:** responde "se eu mandar 200 milheiros, cabe no forno desta semana? Quanto WIP vou acumular?".
**Regras:** usa as capacidades/janelas do roteiro publicado + `AtivoRegime.horasPorDia` do forno. (Fase 4.)

### 5.10 Decisão técnica do editor
- **Biblioteca:** **React Flow (`@xyflow/react`, MIT)** — equivalente React do que o n8n faz (o n8n usa Vue). Nós custom, arestas, minimapa, zoom/pan prontos; isolado por `next/dynamic` (`ssr:false`) para não pesar outros bundles.
- **Persistência:** o `{nodes, edges}` do React Flow é salvo como **JSONB** em `FluxoProducaoVersao.grafo` (fonte de verdade) e **projetado** para tabelas normalizadas na publicação. Justificativa: fidelidade de canvas (posições/handles/config) + consultas de planejamento indexáveis, sem manter um grafo normalizado em SQL.

---

## 6. Planejamento mestre (MPS) e cálculo de necessidades (MRP)

**MPS — O que faz:** define a demanda de **produto acabado** por período (semana/mês), a partir de **pedidos de venda confirmados** (por `dataEntrega`) e/ou **reposição mín/máx** (campos `estoqueMinimo/Maximo` do `Item`) e/ou **previsão manual**.
**Por que importa:** é o "o que produzir e quando" que dirige tudo abaixo.

**MRP — O que faz:** para cada linha do MPS, percorre o **roteiro publicado** de trás para frente aplicando **perdas (gross-up)** e calcula a **necessidade bruta** de cada estágio de WIP e de cada **insumo** (argila, água, caco, **biomassa**); abate o **saldo disponível** (`EstoqueItem`) → **necessidade líquida**.
**Por que importa:** dimensiona compras de biomassa/caco e produção de cada estágio.
**Regras:** necessidade de entrada = saída ÷ (1 − perda da etapa); biomassa por milheiro vem dos vínculos de insumo da etapa de queima. (Fase 3.)

---

## 7. Programação e sequenciamento com capacidade finita

**O que faz:** carrega a produção necessária nos **ciclos do forno** (e na **secagem**) respeitando a capacidade finita (milheiros/ciclo, duração da janela), gerando início/fim por ordem e por ciclo de forno; etapas a montante são **back-scheduled** a partir do slot do forno.
**Por que importa:** é o que **reduz ociosidade** e torna o plano **viável** no gargalo.
**Regras:** capacidade do forno/secador vem do `CentroTrabalho` (e `AtivoRegime.horasPorDia` do `codApl`); algoritmo inicial = **carregamento finito guloso** no gargalo (explicável), sem solver. (Fase 4.)

---

## 8. Apontamento e controle de produção por etapa

**O que faz:** o chão registra, por **ordem de produção** e **etapa**: quantidade de entrada/saída, **perdas (trincas/refugo)**, **vagonetas/vagões** usados, início/fim e responsável. Cada apontamento que cruza um estágio gera **movimentação de estoque do WIP** (baixa no estágio anterior, entrada no próximo).
**Por que importa:** dá visibilidade de WIP em tempo real, mede perdas por etapa e fecha o ciclo plano→real.
**Regras:**
- WIP é modelado como **itens** com saldo no **estoque atual**; cada transição reusa a receita de transação já consolidada (Sequência → Lote → `EstoqueItem` → `MovimentacaoEstoque`) com **`origem = PRODUCAO`** (extensão aditiva e nullable em `MovimentacaoEstoque`, sem backfill) e `ordemProducaoId` de proveniência.
- **Perdas** são baixadas como movimento (AJUSTE/SAIDA) no item de WIP do estágio.
- **Biomassa** consumida no forno é apontada e alimenta o KPI de consumo/milheiro (`ConsumoBiomassa`). (Fase 2.)

**Caso de uso real:** operador do forno fecha um ciclo: aponta 18 milheiros queimados (de 20 carregados → 10% de perda), 1.350 kg de biomassa, 9 vagões. O sistema baixa 20 milheiros de WIP "seco", entra 18 de WIP "queimado", registra 2 de perda e 75 kg/milheiro de biomassa.

---

## 9. Gestão de capacidade e gargalos (forno como restrição)

**O que faz:** trata o **forno** (e a **secagem**) como recursos de capacidade finita; mostra **ocupação** por período e **fila** de ordens; destaca o gargalo no editor e nos dashboards.
**Por que importa:** o forno define o ritmo da fábrica; gerir o gargalo é gerir a fábrica.
**Regras:** disponibilidade do forno = `AtivoRegime.horasPorDia` do `codApl` do forno (já no schema, vindo do PCM); capacidade por ciclo no `CentroTrabalho`.

---

## 10. Dashboards e indicadores

Painéis (recharts, padrão do PCM dashboard): **ocupação do forno** por período, **WIP por estágio** (úmido/seco/queimado), **perdas por etapa**, **consumo de biomassa por milheiro**, **aderência ao plano** e **OTIF de produção**. Filtros por produto, período e centro de trabalho. (Fase 3.)

---

## 11. Requisitos não funcionais

- **Desempenho do editor:** fluido até ~200 nós; canvas isolado por code-splitting (`next/dynamic`, `ssr:false`).
- **Persistência:** grafo em JSONB; projeção transacional na publicação (escritor único).
- **Stack:** Next.js 14 (App Router), React 18, Prisma 6 + PostgreSQL; Tailwind; lucide-react; recharts; React Flow.
- **Segurança/permissões:** módulo `pcp` no modelo `modulo.recurso.acao` (ver/inserir/editar/excluir); rotas atrás do middleware de sessão.
- **Auditoria:** versionamento de fluxos; movimentações de estoque imutáveis (saldoAntes/Depois) com `origem` e proveniência da ordem.
- **Disponibilidade:** deploy Vercel; migrações aplicadas no build (`prisma migrate deploy`).
- **Confiabilidade do dado:** WIP no mesmo livro do estoque comercial → relatórios existentes (posição, movimentações, inventário, curva ABC) passam a enxergar produção sem stack paralela.

---

## 12. Integrações

- **ERP (interno):** `Item` (MP/WIP/PA), `Unidade`/`ItemUnidade`/`UnidadeConversao` (milheiro↔un↔vagão), `LocalEstoque`, `EstoqueItem`, `MovimentacaoEstoque`/`LoteMovimentacao`, `Sequencia` (numeração OP-AAAA-NNNN), `Configuracao`.
- **Engeman (CMMS, somente leitura):** ativos do forno/secador por `codApl`; disponibilidade via `AtivoRegime`. Sem escrita.
- **Compras/Estoque:** necessidades do MRP podem originar **Solicitações de Compra** (biomassa, caco) no fluxo de compras existente.
- **Balança/pesagem:** **fora do MVP**; ponto de extensão futuro para pesagem de biomassa/argila.

---

## 13. Fora de escopo

- Solver de otimização multifábrica / multi-gargalo.
- Escala automática de turnos e mão de obra.
- Ingestão IoT da curva real do forno (sensores).
- Custeio contábil completo (rateios) — o módulo entrega custo direto de insumos por milheiro; contabilidade fica no Financeiro.
- Integração com balança/pesagem automática (futuro).

---

## 14. Premissas, dependências e riscos

**Dependências:** cadastro de `Item` para MP/insumos/WIP/PA; `LocalEstoque` para pátios (úmido/seco/forno); ativos do forno/secador no Engeman (`codApl`); biblioteca React Flow.

**Riscos:**
| Risco | Impacto | Mitigação |
|---|---|---|
| Complexidade do editor assustar o usuário | Adoção baixa | MVP focado; fluxo semente pronto; validação guiada |
| Modelagem de WIP poluir o estoque comercial | Confusão de relatórios | `LocalEstoque` e itens WIP claramente separados; filtro por `origem=PRODUCAO` |
| Ciclo do forno mal modelado | Programação irreal | Confirmar granularidade antes da Fase 4; começar simples (guloso) |
| Dados de capacidade/perda imprecisos no início | Plano otimista | Calibrar com apontamento real (Fase 2) antes de confiar no MRP/scheduling |
| Migração nova em produção | Build/deploy | Migração hand-written revisada; `migrate deploy` no build |

---

## 15. Requisitos por prioridade (MoSCoW) + critérios de aceitação

### Must (MVP — agora)
- **M1. Editor visual de fluxo** (React Flow): arrastar os 6 tipos de nó, conectar, configurar etapa, validar, **salvar/recarregar**, **versionar/publicar**.
  - *Aceitação:* desenhar o fluxo da Tramontin; salvar; recarregar idêntico; publicar gera versão; validação aponta nó órfão e destaca o gargalo.
- **M2. Centros de Trabalho (CRUD)** com link opcional ao ativo Engeman (`codApl`).
  - *Aceitação:* criar/editar/excluir centro; vincular o forno a um `codApl`.
- **M3. Registro do módulo** (Sidebar/permissões/rotas).
  - *Aceitação:* "PCP" aparece no menu para quem tem permissão; rotas abrem.

### Should (Fase 2–3)
- **S1. Ordem de Produção** a partir de um fluxo publicado + **apontamento por etapa** com **WIP no estoque** e perdas.
  - *Aceitação:* criar OP; apontar etapa move WIP (baixa/entrada) e registra perda; biomassa apontada.
- **S2. MPS + MRP** com perdas e necessidade de biomassa.
  - *Aceitação:* demanda de 200 milheiros explode insumos com gross-up de perda e abate saldo.
- **S3. Dashboards** (ocupação do forno, WIP, biomassa/milheiro).

### Could (Fase 4)
- **C1. Programação finita** no forno/secagem.
- **C2. Simulação** (lead time, ocupação, WIP).

### Won't (agora)
- Solver multifábrica, escala de turno automática, IoT da curva do forno.

---

## 16. Roadmap em fases

| Fase | Entrega | Itens / ajustes |
|---|---|---|
| **0–1 — MVP** ✅ produção | Editor de fluxo + fundação | React Flow; registro do módulo; migração #1; CRUD Centros de Trabalho; editor (nós, config, validação, versionar); fluxo semente |
| **2 — Execução** ✅ produção | Produzir e mover WIP | Ordem de Produção + apontamento por etapa; **WIP no estoque** (itens WIP auto-criados + `MovimentacaoEstoque` com `ordemProducaoId`); `ConsumoBiomassa` (KPI biomassa/milheiro) |
| **3 — Engenharia & integração real** (próxima) | Estrutura do produto + itens reais | **Fluxo compartilhado** entre produtos; **Engenharia/BOM por produto** (insumos + quantidades + embalagem pallet/fita/grampo) com `Item`s reais; **Item/`LocalEstoque` reais no editor** (substitui texto livre). *Ajustes 1, 2, 6* |
| **4 — Operação dirigida** | OP no chão | **Fila de produção por operação/centro** (cada área vê e aponta suas etapas); **apontamento de subproduto/resíduo** (caco) que vira insumo; **insumo-mistura** (massa) como semi-acabado. *Ajustes 3, 4, 5* |
| **5 — Planejamento** | Planejar | MPS (**3 fontes configuráveis, padrão manual**) + MRP (perdas, biomassa, embalagem); **lead time por ciclos em horas** (Σ etapas → previsão de conclusão). *Ajuste 7* |
| **6 — Dashboards** | Medir | Ocupação do forno, WIP por estágio, biomassa/milheiro, perdas por etapa, aderência, OTIF |
| **7 — Otimização** | Programar o gargalo | Sequenciamento finito (forno/secagem) + simulação (lead time, ocupação, WIP) |

---

*Documento vivo (v1.1). A **Revisão 1.1** (topo) registra os 7 ajustes do chão de fábrica e a decisão de demanda; o roadmap acima reflete a nova ordem das fases.*
