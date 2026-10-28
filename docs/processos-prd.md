# PRD — Módulo de Processos Externos (jurídicos e administrativos)

> Status: proposta (28/10/2026). Implementação pendente de aprovação do dono.
> Princípio central: **processo é algo que anda FORA da empresa** (num órgão, num tribunal, num
> cartório) **e que a empresa precisa acompanhar sem perder prazo**. O módulo não substitui o
> sistema do órgão nem o advogado: é a ficha única do processo, com a linha do tempo, os prazos
> que geram aviso e os documentos à mão.

## 1. Contexto e objetivo

Hoje o grupo acompanha processos externos de cabeça, por e-mail e por PDF solto. Exemplo real:
a regularização fundiária da Fazenda Luciana no **Amapá Terras** (processo nº 101401119/2026,
aberto em 14/10/2026 pelo SICARF-AP). Os documentos (memorial e planta SIGEF, cadastro, recibo,
cópia do processo, dados de acesso) foram para o GED em 28/10, mas:

- **Ninguém é avisado** quando o órgão pede complemento, quando vence um prazo de manifestação
  ou quando o processo está parado há meses.
- **O histórico não existe**: "protocolei em 14/10", "a vistoria foi marcada", "saiu parecer"
  ficam no WhatsApp de quem acompanhou.
- **Acesso a portais** (SICARF, PJe, e-CAC, SEMA, prefeitura) circula em PDF ou bilhete, com
  senha em texto aberto (o PDF do SICARF tinha CPF e senha).
- Não há visão consolidada: quantos processos estão ativos, o que tem prazo esta semana, quanto
  está em discussão (multas, ações trabalhistas, cobranças).

Tipos de processo que entram (todos com a mesma mecânica):

| Tipo | Exemplos no grupo |
|---|---|
| Fundiário / imobiliário | Amapá Terras (regularização), INCRA/SIGEF, cartório de registro de imóveis, ITR |
| Ambiental / licenciamento | Licença de operação (SEMA/IMAP), outorga de água, licença de lavra (ANM) para argila |
| Administrativo | Alvará, Corpo de Bombeiros (AVCB — projetos de incêndio já no GED), prefeitura, vigilância sanitária |
| Fiscal / tributário | Auto de infração SEFAZ/Receita, parcelamento, restituição, defesa administrativa |
| Judicial | Trabalhista, cível (cobrança, indenização), execução fiscal |
| Trabalhista administrativo | Fiscalização do MTE, notificação, TAC |

**Objetivo:** que nenhum prazo de processo externo vença sem aviso e que qualquer pessoa
autorizada consiga responder, em uma tela, "**em que pé está, o que falta, quem cuida e onde
estão os papéis**".

## 2. Personas e usos

| Persona | O que precisa |
|---|---|
| Dono / diretoria | Painel: processos ativos, prazos da semana, valores em risco, parados há muito tempo. |
| Administrativo / jurídico interno | Cadastrar, lançar andamentos, anexar o que o órgão mandou, controlar prazos. |
| Advogado / despachante externo | (fase 3) Receber o link do processo e registrar andamento — sem login completo no ERP. |
| Financeiro | Custas, taxas, honorários e multas do processo como contas a pagar ligadas a ele. |
| SST / RH | Processos trabalhistas e fiscalizações ligados ao colaborador. |

## 3. Conceitos

- **Processo**: o caso acompanhado. Tem órgão, número, tipo, interessado, responsável e situação.
  Um processo pode ter **vários números** (protocolo, número judicial, recibo do portal).
- **Andamento**: fato datado na linha do tempo — o que aconteceu, com anexo opcional. É o
  equivalente ao "movimento processual". Pode **criar um prazo**.
- **Prazo**: data-limite com responsável e antecedência de aviso. Fica pendente até ser
  **cumprido** (com andamento que comprova) ou **dispensado** (com motivo).
- **Parte**: quem está no processo além da empresa — órgão, autor/réu, advogado, perito,
  despachante. Pode ser um Fornecedor/Cliente/Colaborador do ERP ou só um nome.
- **Credencial de acesso**: login de portal ligado ao processo, guardado **criptografado** e só
  visível para quem tem a permissão.

## 4. Modelo de dados (Prisma; migrations idempotentes, sem `db push` em produção)

Modelos com `empresaId` entram em `MODELOS_ESCOPADOS` e recebem autoria (`criadoPor/atualizadoPor`).

### 4.1 Processo

```prisma
model Processo {
  id              String   @id @default(cuid())
  empresaId       String
  codigo          String               // PRC-0001 (sequência da empresa)
  titulo          String               // "Regularização fundiária — Fazenda Luciana"
  tipo            TipoProcesso         // FUNDIARIO | AMBIENTAL | ADMINISTRATIVO | FISCAL | JUDICIAL | TRABALHISTA | OUTRO
  orgao           String               // "Amapá Terras (Instituto de Terras do Amapá)"
  esfera          String?              // ESTADUAL | FEDERAL | MUNICIPAL | JUDICIAL
  numero          String?              // número principal (101401119/2026)
  numerosExtras   Json?                // [{ rotulo: "Recibo SICARF", valor: "8D9C01-…" }]
  portalUrl       String?              // https://sicarf.amapaterras.ap.gov.br
  polo            String?              // AUTOR | REU | INTERESSADO | REQUERENTE (judicial/adm.)
  interessadoTipo String               // EMPRESA | PESSOA
  interessadoNome String               // "Ellyan Antonio Sampaio Goes" quando é pessoa física
  assunto         String?
  situacao        SituacaoProcesso     // EM_ANDAMENTO | AGUARDANDO_ORGAO | AGUARDANDO_EMPRESA | SUSPENSO | ENCERRADO_FAVORAVEL | ENCERRADO_DESFAVORAVEL | ARQUIVADO
  fase            String?              // texto livre: "Análise técnica", "Vistoria", "Recurso"
  abertoEm        DateTime?
  encerradoEm     DateTime?
  responsavelId   String?              // Usuario (recebe os alertas)
  advogado        String?              // nome / OAB / escritório (texto na v1)
  valorCausa      Decimal? @db.Decimal(15, 2)   // multa, causa, débito em discussão
  riscoPerda      String?              // PROVAVEL | POSSIVEL | REMOTA (CPC 25 — provisão contábil)
  confidencial    Boolean  @default(false)
  imovel          String?              // vínculo leve com o bem (ex.: "Fazenda Luciana") — Imobilizado na fase 2
  imobilizadoId   String?
  colaboradorId   String?              // trabalhista
  fornecedorId    String?
  clienteId       String?
  contratoId      String?
  tags            String[] @default([])
  observacoes     String?
  diasSemAndamentoAlerta Int @default(60)   // "parado há N dias" — por processo
  // relações: andamentos, prazos, partes, credenciais, documentos (Documento.processoId)
  @@unique([empresaId, codigo])
  @@index([empresaId, situacao])
}
```

### 4.2 Andamento (linha do tempo)

```prisma
model ProcessoAndamento {
  id          String   @id @default(cuid())
  processoId  String
  data        DateTime
  tipo        TipoAndamento   // PROTOCOLO | MOVIMENTACAO | EXIGENCIA | MANIFESTACAO | DECISAO | AUDIENCIA | VISTORIA | PAGAMENTO | OUTRO
  descricao   String
  documentoId String?         // anexo no GED (categoria do processo)
  origem      String @default("MANUAL")  // MANUAL | PORTAL (fase 4) | EXTERNO (link do advogado)
  usuario     String?
  createdAt   DateTime @default(now())
}
```

### 4.3 Prazo

```prisma
model ProcessoPrazo {
  id           String   @id @default(cuid())
  processoId   String
  descricao    String           // "Apresentar certidão de inteiro teor"
  vence        DateTime
  avisoDias    Int      @default(5)
  responsavelId String?
  status       String   @default("PENDENTE")  // PENDENTE | CUMPRIDO | DISPENSADO
  cumpridoEm   DateTime?
  andamentoId  String?          // andamento que cumpriu / que originou
  motivo       String?          // dispensa
}
```

### 4.4 Partes e credenciais

```prisma
model ProcessoParte {
  id          String @id @default(cuid())
  processoId  String
  papel       String          // ORGAO | AUTOR | REU | ADVOGADO | PERITO | DESPACHANTE | TECNICO | OUTRO
  nome        String
  documento   String?         // CPF/CNPJ/OAB
  contato     String?         // e-mail / telefone
  fornecedorId String?
  clienteId    String?
  colaboradorId String?
}

model ProcessoCredencial {
  id          String @id @default(cuid())
  processoId  String
  portal      String          // "SICARF-AP"
  url         String?
  login       String
  segredo     String          // AES-256-GCM com chave em env (CREDENCIAIS_KEY); nunca volta na listagem
  observacao  String?
  atualizadoEm DateTime @updatedAt
}
```

Ver a senha = ação explícita ("mostrar"), registrada em log (quem e quando), só com a permissão
`processos.credenciais.ver`. Copiar para a área de transferência sem exibir.

### 4.5 Ligações com o que já existe

- `Documento.processoId String?` — documentos do GED aparecem na aba Documentos do processo.
  Os 8 documentos da Fazenda Luciana já no GED (categoria "Imóveis e Terrenos") são ligados ao
  processo PRC-0001 na migração inicial.
- `ContaPagar.processoId String?` — custas, taxas (DAE, emolumentos), honorários, multas.
- Agenda do Projetos: prazos entram no feed ICS (Mac/Google), como os prazos de tarefa.
- Contratos: processo pode nascer de um contrato (cobrança, rescisão litigiosa).

## 5. Motor (`src/lib/processos.ts`)

1. **`pendenciasProcesso(p, hoje)`** → lista tipada (padrão `PendenciaSst`): `PRAZO_VENCIDO`,
   `PRAZO_VENCE_EM_BREVE` (≤ avisoDias), `SEM_ANDAMENTO` (> diasSemAndamentoAlerta),
   `AGUARDANDO_EMPRESA` (situação pede ação nossa), `SEM_RESPONSAVEL`, `SEM_DOCUMENTO`.
2. **Cron diário `processos-prazos`** (padrão `contratos-vencimentos`): um **resumo por
   responsável** no sino (e Telegram, se configurado) — "3 prazos esta semana, 1 vencido, 2
   processos parados" — em vez de um aviso por item.
3. **Andamento com prazo**: ao lançar uma `EXIGENCIA` ou `DECISAO`, a tela oferece "criar prazo"
   já com a data (ex.: +15 dias). Cumprir o prazo = lançar o andamento de resposta e marcar.
4. **Situação automática**: lançar `EXIGENCIA` muda para `AGUARDANDO_EMPRESA`; lançar
   `MANIFESTACAO`/`PROTOCOLO` muda para `AGUARDANDO_ORGAO`. Editável.

## 6. Telas (`/processos/*`; CreateDrawer, filtros persistidos, DataTable)

- **Painel** (`/processos`): cartões — ativos, prazos nos próximos 7 dias, vencidos, parados,
  valor em discussão por risco; lista "o que fazer esta semana"; por tipo e por órgão.
- **Lista** (`/processos/lista`): código, título, órgão, número, situação, próximo prazo,
  último andamento (há N dias), responsável. Agrupar por tipo/órgão/responsável.
- **Processo** (`/processos/[id]`): cabeçalho (situação, fase, número com copiar, link do
  portal); abas **Linha do tempo** (andamentos + prazos intercalados, anexar arquivo no próprio
  andamento), **Prazos**, **Documentos** (GED), **Partes**, **Acesso** (credenciais, com
  permissão), **Financeiro** (fase 2).
- Atalhos: "Lançar andamento" e "Novo prazo" sempre visíveis; ⌘K encontra processo pelo número.

## 7. Permissões (`modules.ts`)

Módulo `processos`: `painel.ver`, `processos.ver`, `processos.editar`, `processos.credenciais.ver`,
`processos.confidenciais.ver`. Processo confidencial só aparece para o responsável, quem tem
`processos.confidenciais.ver` e ADMIN (mesmo modelo do GED confidencial).

## 8. Fases

| Fase | Entrega | Esforço |
|---|---|---|
| **1 — Base** | `Processo`, `ProcessoAndamento`, `ProcessoPrazo`, `ProcessoParte`, `Documento.processoId`; painel, lista, página com linha do tempo/prazos/documentos/partes; cron de prazos com resumo; permissões; lixeira. **Cadastrar o processo do Amapá Terras** com os 8 documentos ligados e o andamento "14/10 — cadastro enviado ao SICARF (recibo 8D9C01-8D49001-2026)". | ~4 dias |
| **2 — Acesso e financeiro** | `ProcessoCredencial` criptografada (migrar o acesso do SICARF e **apagar o PDF com senha** do GED); `ContaPagar.processoId` e aba Financeiro (custas, honorários, multas); prazos na Agenda/ICS; vínculo com Imobilizado. | ~3 dias |
| **3 — Externo** | Link do processo para advogado/despachante registrar andamento e anexar (token, como a OS pública), sem acesso ao resto do ERP. Relatório para a contabilidade (provisões por risco — CPC 25). | ~2 dias |
| **4 — Captura automática** | Consulta automática onde houver API pública (DataJud/CNJ para judiciais); para portais sem API (SICARF), lembrete periódico "conferir o portal" em vez de raspagem. | sob demanda |

## 9. Decisões abertas (para o dono)

1. **Processos em nome de pessoa física** (Fazenda Luciana está no seu CPF): ficam no módulo da
   empresa com `interessadoTipo = PESSOA`, marcados confidenciais? Ou numa "empresa" separada
   (patrimônio pessoal), como a Carteira B3 do módulo Investimentos? **Recomendo:** mesma
   estrutura, confidencial por padrão quando o interessado é pessoa física.
2. **Credenciais de portal no ERP** (criptografadas, com log de quem viu) ou só um campo "onde
   está a senha" apontando para o gerenciador de senhas da empresa? **Recomendo** guardar no ERP
   criptografado — hoje a alternativa real é PDF com senha aberta.
3. **Valor em discussão e risco de perda** entram na v1? Servem para a contabilidade provisionar
   (CPC 25). Recomendo campo na v1, relatório na fase 3.
4. **Quem cadastra**: só administrativo/diretoria, ou qualquer usuário pode abrir e o
   administrativo assume? Recomendo só quem tem `processos.editar`.
5. **Alertas**: sino + Telegram, ou também e-mail? Recomendo sino + Telegram (já existentes).

## 10. Fora de escopo

Peticionamento eletrônico; cálculo de prazos processuais em dias úteis com feriados forenses
(v1 usa data informada); raspagem de portais com login; gestão de honorários por êxito;
substituir o advogado ou o sistema do tribunal.

## 11. Métricas de sucesso

- 100% dos processos ativos com responsável, número e pelo menos um documento.
- Zero prazo vencido sem registro (cumprido, dispensado ou justificado).
- Nenhum processo "parado" sem alguém olhar há mais de 60 dias.
- Nenhuma senha de portal em PDF ou mensagem — todas no cofre do módulo.
