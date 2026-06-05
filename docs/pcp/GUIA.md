# Guia do Módulo PCP — Como usar

> **PCP = Planejamento e Controle da Produção.** Este guia ensina, do zero, como usar o módulo
> para a cerâmica: do desenho do processo até o acompanhamento da produção. Linguagem simples,
> passo a passo. (Versão 1.0 — acompanha o ERP EllyanGoes.)

---

## 1. O que o PCP faz

O PCP organiza a sua produção de tijolos/blocos **da matéria-prima ao produto acabado**, tendo o
**forno como o ponto mais importante** (o gargalo). Com ele você consegue:

- **Desenhar** o processo da fábrica num quadro visual (estilo fluxograma).
- **Cadastrar a "receita"** de cada produto (quanta argila, água, biomassa, embalagem…).
- **Planejar** o que produzir e **calcular o que precisa comprar**.
- **Abrir ordens de produção** e **apontar** o que foi feito em cada etapa (com perdas e biomassa).
- Ver o **produto em processo (WIP)** virar saldo no seu estoque, automaticamente.
- **Acompanhar indicadores** e **programar o forno**.

Tudo fica no menu **PCP**.

---

## 2. Conceitos-chave (glossário rápido)

| Termo | O que é |
|---|---|
| **Centro de trabalho** | Um recurso da produção: forno, secador, prensa, extrusora… Pode ser ligado a um ativo do Engeman. |
| **Fluxo de produção** | O "caminho" pela fábrica, desenhado no editor: estoques → operações → buffers de WIP → produto acabado. **Um fluxo serve para vários produtos.** |
| **WIP (produto em processo)** | O material **entre** as etapas: **úmido → seco → queimado → acabado**. |
| **Engenharia / Estrutura (BOM)** | A "receita" de **cada produto**: qual fluxo ele usa + a lista de **insumos** (argila, água, caco, biomassa, pallet, fita, grampo) com **quantidades**. |
| **Ordem de Produção (OP)** | Uma ordem para produzir **X de um produto**, seguindo um fluxo publicado. Vem com as **etapas** para apontar. |
| **Apontamento** | Registrar, por etapa, o que foi produzido: **entrada, saída, perda**, biomassa e subproduto. |
| **MPS (Plano Mestre)** | **O que produzir**, por produto e mês (a demanda). |
| **MRP** | A partir da demanda e da estrutura (BOM), calcula a **necessidade de insumos** e quanto **falta comprar**. |
| **Gargalo** | O **forno** (e a secagem). É a restrição que define o ritmo da fábrica. |

---

## 3. Primeiros passos (a ordem de configuração)

Configure **uma vez**, nesta ordem. Depois é só o dia a dia (ordens + apontamento).

1. **Centros de Trabalho** — cadastre o forno, o secador e os demais recursos.
2. **Fluxos de Produção** — desenhe o processo no editor e **publique**.
3. **Engenharia do Produto** — para cada produto, ligue o fluxo + a lista de insumos.
4. **Planejamento (MPS)** — informe a demanda (quanto produzir, por mês).
5. **Calcular necessidades (MRP)** — veja o que precisa comprar.
6. **Ordens de Produção** — abra e **libere** as ordens.
7. **Operações (fila)** — o chão de fábrica aponta as etapas.
8. **Dashboard / Sequenciamento** — acompanhe os números e programe o forno.

---

## 4. Tela a tela

### 4.1 Centros de Trabalho
**Para que serve:** cadastrar os recursos da produção.
**Como usar:** clique em **Novo centro**, dê um **código** e **nome** (ex.: `FORNO-01`, "Forno de
Queima"), escolha o **tipo** (Forno, Secagem…) e, se quiser, a **capacidade** (ex.: 20 milheiros/ciclo).
O campo **Ativo Engeman (codApl)** liga o centro a um equipamento do Engeman (opcional).
> 💡 Cadastre o forno como tipo **Forno** com a capacidade — isso alimenta a simulação e o sequenciamento.

### 4.2 Fluxos de Produção (o editor visual)
**Para que serve:** desenhar **como** a fábrica produz. O mesmo fluxo vale para vários produtos.
**Como usar:**
1. Clique em **Criar exemplo** (já vem o fluxo da Tramontin pronto) ou **Novo fluxo**.
2. No editor, **arraste** os nós da paleta para o quadro e **conecte-os** (puxando das bolinhas):
   - **Estoque / Insumo** (matéria-prima, biomassa, caco, água, pallets…) → ligado a um **Item real**.
   - **Operação** (preparação, secagem, queima…) → com **centro de trabalho, capacidade, perda %,
     ciclo em horas** e, na queima, o **subproduto** (ex.: caco) gerado.
   - **Buffer de WIP** (pátio úmido/seco/queimado) → com o **estado**.
   - **Transporte** (vagoneta/vagão), **Inspeção**, **Produto Acabado**.
3. Clique num nó para **configurá-lo** no painel da direita.
4. A barra de cima mostra a **validação ao vivo** (nós soltos, ciclos, gargalo destacado).
5. **Salvar** guarda um rascunho; **Publicar** valida e cria uma versão oficial (só fluxos
   publicados geram ordens).
> 💡 Defina o **estado de saída** nas operações que mudam o WIP (secagem→seco, queima→queimado,
> embalar→acabado) — é isso que move o WIP no estoque depois.

### 4.3 Engenharia do Produto (a "receita" / BOM)
**Para que serve:** dizer, **por produto**, qual fluxo ele usa e **o que ele consome**.
**Como usar:**
1. **Nova engenharia** → escolha o **produto** (busca) e o **fluxo** publicado.
2. No detalhe, adicione os **insumos** (busca de Item): argila, água, caco, biomassa, **pallet,
   fita, grampo**… com a **quantidade** e a **base** (por milheiro/unidade/ciclo/vagão) e a
   **categoria** (matéria-prima, mistura, embalagem, energia).
3. **Salvar.**
> 💡 É aqui que cada produto fica diferente: tijolo 6 furos leva mais argila, outro menos, etc.

### 4.4 Planejamento (MPS / MRP)
**Para que serve:** dizer **o que produzir** e descobrir **o que comprar**.
**Como usar:**
1. **Nova demanda** → produto + **mês** + quantidade (milheiros). (Padrão **manual**.)
2. Clique em **Calcular necessidades (MRP)**.
3. A tabela mostra, por insumo: **bruta** (demanda × estrutura), **em estoque** e **a comprar**
   (o que falta). Produtos **sem engenharia** aparecem num aviso.
> 💡 O MRP usa a **Engenharia (BOM)** + o **saldo de estoque**. Cadastre a engenharia antes.

### 4.5 Ordens de Produção
**Para que serve:** mandar produzir de fato.
**Como usar:**
1. **Nova ordem** → escolha um **fluxo publicado** + a quantidade → a ordem nasce com as **etapas**
   (cópia do fluxo, em ordem).
2. **Liberar** a ordem (fica disponível para o chão).
3. No detalhe, você vê o **progresso**, o **lead time previsto** (soma dos ciclos), as
   **movimentações de estoque** geradas e o **consumo de biomassa**.

### 4.6 Operações (fila do chão de fábrica)
**Para que serve:** o operador ver **o que produzir** e **apontar** o que fez.
**Como usar:**
1. As etapas a executar aparecem **agrupadas por centro de trabalho**.
2. Clique numa etapa → abre a ordem.
3. Aponte: **entrada, saída, perda**, vagões e — na queima — **biomassa** e **subproduto** →
   **Concluir etapa**.
> Ao concluir uma etapa que **muda de estado**, o sistema **baixa o WIP do estágio anterior e dá
> entrada no próximo** (ou no produto acabado), automaticamente, no estoque.

### 4.7 Dashboard
**Para que serve:** acompanhar os números.
**Mostra:** ordens abertas/concluídas, **perda total** e por etapa, **biomassa por milheiro**,
**a comprar (MRP)**, **produção por estágio** (úmido/seco/queimado/acabado), fila por centro e a
**simulação de capacidade do forno** (cabe a demanda no horizonte?).

### 4.8 Sequenciamento (forno)
**Para que serve:** programar o **gargalo** — em que ordem e **quando** cada OP passa no forno.
**Como usar:** ajuste os **parâmetros do forno** (capacidade/ciclo, ciclo em horas, horas/dia,
data de início). A tabela mostra cada ordem com **ciclos**, **início e fim em dias** e a
**previsão de término**. As ordens entram **uma de cada vez** (capacidade finita).

---

## 5. O caminho completo (exemplo: tijolo 6 furos)

1. **Centros:** cadastrei o **Forno** (20 milheiros/ciclo).
2. **Fluxo:** "Criar exemplo" → ajustei a queima (estado de saída = queimado, ciclo = 24h, subproduto = caco) → **Publiquei**.
3. **Engenharia:** produto **Tijolo 6 furos** → fluxo + insumos (argila 2000/milheiro, água, biomassa, **1 pallet/milheiro**).
4. **Planejamento:** demanda **200 milheiros** em julho → **Calcular MRP** → "preciso comprar 300.000 de argila, 200 pallets…".
5. **Ordem:** nova ordem de 200 milheiros do fluxo → **Liberar**.
6. **Operações:** o operador da secagem aponta; depois o do forno aponta (entrada 200, saída 184,
   perda 16, biomassa 1350 kg, caco 8) → **Concluir**.
7. **Estoque:** o WIP "queimado" e o **caco** aparecem em **Almoxarifado → Posição de Estoque**
   (local "Produção (WIP)").
8. **Dashboard / Sequenciamento:** acompanho perdas, biomassa/milheiro e quando a ordem fica pronta.

---

## 6. Dúvidas frequentes

**Um fluxo serve para vários produtos?** Sim. O **fluxo** é o caminho; a **Engenharia** é o que
muda entre produtos (insumos e quantidades).

**Onde vejo o produto em processo (WIP)?** Em **Almoxarifado → Posição de Estoque / Movimentações**,
no local **"Produção (WIP)"**. Os itens de WIP são criados automaticamente e **não** aparecem no
catálogo de venda.

**O caco/resíduo volta para o estoque?** Sim. Se a operação tem um **subproduto** configurado, ao
apontar a quantidade ele **entra** no estoque como insumo.

**Por que minha ordem não aparece na fila (Operações)?** A ordem precisa estar **Liberada** (e o
fluxo, **publicado**).

**O MRP não explodiu meu produto.** Falta a **Engenharia (BOM)** dele — cadastre em
**Engenharia do Produto**.

**Edição do fluxo depois de publicado?** Editar cria uma **nova versão**; as ordens já abertas
continuam na versão que usaram.

---

*Dúvidas ou ajustes no processo? O módulo é vivo — fale com quem cuida do sistema.*
