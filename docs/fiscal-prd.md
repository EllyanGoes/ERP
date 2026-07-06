# PRD — Módulo Fiscal (Emissor de NF + Consultores de Entrada e Saída)

> Status: aprovado (planejamento). Implementação pendente.
> Princípio central: **camada oficial/externa, apartada dos módulos gerenciais** — o equivalente fiscal
> do par "contabilidade gerencial (interna) × contabilidade oficial (externa)" dos grandes ERPs.

## 1. Contexto e objetivo

O ERP tem forte gestão interna (estoque, financeiro, contabilidade gerencial, PCP), mas **nenhuma
capacidade fiscal**: zero XML, SEFAZ, DANFE, série/numeração fiscal ou campos de imposto na saída. As
vendas circulam com a minuta (romaneio). Na entrada, a `ConferenciaCompra` registra número/série/ICMS/IPI
digitados à mão, sem importação de XML nem consulta às notas destinadas aos CNPJs do grupo.

Objetivo: um **módulo Fiscal** para **prestação de contas** — emitir documentos fiscais, receber e
acompanhar as notas destinadas, e produzir livros/apurações a partir das NFs. É a camada externa/oficial;
os módulos gerenciais seguem sendo a verdade interna.

**Regras do isolamento (decisões confirmadas):**

- A NF **não movimenta estoque, não gera título financeiro e não lança na contabilidade gerencial**.
  Isolamento total do operacional.
- Vínculo entre NF (entrada e saída) e pedidos de venda/compra **existe, mas é sempre manual** — nunca
  automático. O cruzamento gerencial × oficial vira relatório de divergências, não gatilho.
- Cálculo de impostos é **automático, mas a partir da NF**: o motor de tributação opera sobre os itens
  da nota (sugerindo CFOP/CST/alíquotas/valores), tudo revisável antes de transmitir.
- Regime tributário é **configuração por empresa** (`EmpresaFiscal.crt`) — o grupo tem regimes variados.

**Obrigações legais que o módulo passa a atender:** documento fiscal na circulação de mercadoria,
manifestação do destinatário, guarda dos XMLs por 5 anos (blob próprio, não só no provedor), e adequação
à reforma tributária — **NT 2025.002 (IBS/CBS/IS)**: campos obrigatórios em produção para regime normal a
partir de **ago/2026** (homologação desde jul/2026); Simples Nacional/MEI em jan/2027. 2026 é ano de
teste (destaque sem recolhimento).

**Escopo de documentos (faseado):** NF-e (55) primeiro; depois NFC-e (65), NFS-e, CT-e/MDF-e.

## 2. Build × API terceirizada (e escolha do provedor)

**Decisão: estratégia híbrida** — API terceirizada agora, com camada de abstração (`FiscalProvider`,
seção 4) que permite trocar de provedor ou internalizar a emissão no futuro sem tocar o resto do módulo.

Emissor próprio (SEFAZ direto, estilo ACBr) exigiria: assinatura digital de XML (certificado A1 na
aplicação), webservices por UF, contingência (SVC/EPEC), DANFE, e manutenção perpétua de leiaute — a
NT 2025.002 sozinha muda grupos, campos e regras de validação até 2033. Meses de esforço + risco
regulatório contínuo, contra ~R$100–550/mês de um provedor que absorve tudo isso.

Comparativo (pesquisa jul/2026):

| Provedor | Emissão | Entrada (DF-e) | Preço | Observações |
|---|---|---|---|---|
| **Focus NFe** ✅ | NF-e, NFC-e, NFS-e (3.000+ municípios), CT-e, MDF-e, NFCom, DC-e | Recebimento NF-e/CT-e/NFS-e + manifestação | Start R$113,90/mês (3 CNPJs, 100 notas/CNPJ, R$0,10 adicional); Growth R$548/mês (CNPJs ilimitados, 4.000 notas) | Único que cobre 100% do escopo com preço público; `ref` idempotente nativo; webhooks; homologação; sem fidelidade; 30 dias grátis |
| **Nuvem Fiscal** (2ª opção) | Todos os DFes | Distribuição DF-e + manifestação | Por consumo; faixa gratuita p/ dev | API mais moderna (OAuth2/OpenAPI), certificado hospedado, PDFs (DANFE/DACTE/DAMDFE) |
| PlugNotas (TecnoSpeed) | NF-e, NFC-e, NFS-e, MDF-e, CF-e | Parcial | Sob consulta | Foco em software houses; CT-e incerto |
| NFE.io | NF-e, NFC-e, NFS-e | Consulta de destinadas (produto à parte) | Sob consulta | **Sem CT-e/MDF-e**; docs atrás de Cloudflare; menos aderente ao escopo completo |
| Webmania | Todos os DFes | Sim | Sob consulta | Adequação IBS/CBS anunciada |

**Recomendação: Focus NFe** como provedor inicial (cobertura completa + plano de 3 CNPJs que casa com o
grupo), Nuvem Fiscal como alternativa técnica. A abstração garante a troca.

## 3. Modelo de dados (Prisma; migrations idempotentes via MCP, sem `db push`)

Todos os models novos são multiempresa (escopo automático pelo proxy; crons usam `prismaSemEscopo` com
`empresaId` explícito). Autoria `criadoPor`/`atualizadoPor` carimbada pelo proxy (basta as colunas).

### 3.1 Configuração por empresa

```prisma
model EmpresaFiscal {                     // 1:1 — não poluir Empresa (60+ relações)
  id                     String   @id @default(cuid())
  empresaId              String   @unique
  crt                    Int      @default(3)   // 1 Simples | 2 Simples excesso | 3 Regime Normal | 4 MEI
  regimeApuracao         String?                // LUCRO_REAL | LUCRO_PRESUMIDO | SIMPLES (informativo)
  cnaePrincipal          String?
  codigoMunicipioIBGE    String?                // cMunFG
  provedor               String   @default("FOCUS_NFE")
  ambiente               String   @default("HOMOLOGACAO") // por empresa: uma pode estar em produção e outra homologando
  tokenHomologacao       String?                // secret — mascarado no GET (padrão IntegracaoPagamento)
  tokenProducao          String?                // secret
  provedorEmpresaRef     String?                // id da empresa no provedor
  cscId                  String?                // NFC-e
  cscToken               String?                // secret
  certificadoValidade    DateTime?              // A1 hospedado no provedor; aqui só metadados
  certificadoStatus      String?                // OK | VENCENDO | VENCIDO | AUSENTE
  ultimoNsu              String   @default("0") // cursor da Distribuição DF-e
  manifestacaoAutomatica Boolean  @default(true) // Ciência automática nos resumos
  emiteIbsCbs            Boolean  @default(false) // liga grupos IBS/CBS (NT 2025.002)
  empresa                Empresa  @relation(fields: [empresaId], references: [id])
}

model SerieFiscal {
  id            String  @id @default(cuid())
  empresaId     String
  modelo        ModeloDocFiscal        // NFE | NFCE | NFSE | CTE | MDFE
  serie         Int
  ambiente      String                 // séries independentes por ambiente — nunca misturar
  proximoNumero Int     @default(1)
  ativo         Boolean @default(true)
  @@unique([empresaId, modelo, serie, ambiente])
}
```

**Numeração no banco, nunca no provedor** (requisito da estratégia híbrida: trocar de provedor não pode
reiniciar/colidir numeração). Helper `proximoNumeroFiscal()` em `src/lib/fiscal/numeracao.ts`:
`UPDATE "SerieFiscal" SET "proximoNumero" = "proximoNumero" + 1 WHERE ... RETURNING` **na mesma transação**
que cria a `NotaFiscal` (atômico sob concorrência; não reusar `Sequencia`, que não tem semântica de reserva
transacional). Rejeição **não queima** número (corrige e reenvia o mesmo); número descartado vai para a
fila de inutilização.

### 3.2 Documento de saída (e NF-e de entrada emitida por nós, ex.: devolução)

```prisma
enum ModeloDocFiscal { NFE NFCE NFSE CTE MDFE }
enum StatusNotaFiscal {
  EM_DIGITACAO   // rascunho editável
  ENVIANDO       // número reservado, aguardando provedor (webhook/poll)
  AUTORIZADA
  REJEITADA      // corrige e reenvia com o MESMO número
  DENEGADA       // número queimado (destinatário irregular)
  CANCELADA
  ERRO           // falha de comunicação — retry pelo cron
}

model NotaFiscal {
  id                String   @id @default(cuid())  // usado como `ref` idempotente no provedor
  empresaId         String
  modelo            ModeloDocFiscal
  serie             Int
  numero            Int
  ambiente          String                          // gravado na emissão (auditoria)
  tipoOperacao      Int      @default(1)            // 0=entrada (devolução emitida por nós) | 1=saída
  finalidade        Int      @default(1)            // 1 normal | 2 complementar | 3 ajuste | 4 devolução
  operacaoFiscalId  String?
  naturezaOperacao  String                          // texto natOp (snapshot)
  status            StatusNotaFiscal @default(EM_DIGITACAO)
  chave             String?  @unique                // 44 dígitos
  protocolo         String?
  dataEmissao       DateTime @default(now())
  dataAutorizacao   DateTime?
  codigoRejeicao    String?
  motivoRejeicao    String?
  clienteId         String?                         // FK informativa
  fornecedorId      String?                         // devolução de compra
  destSnapshot      Json                            // nome, cpfCnpj, ie, indIEDest, endereço, cMun — imutável
  vProdutos         Decimal  @default(0) @db.Decimal(15, 2)
  vDesconto         Decimal  @default(0) @db.Decimal(15, 2)
  vFrete            Decimal  @default(0) @db.Decimal(15, 2)
  vSeguro           Decimal  @default(0) @db.Decimal(15, 2)
  vOutro            Decimal  @default(0) @db.Decimal(15, 2)
  vBcIcms           Decimal  @default(0) @db.Decimal(15, 2)
  vIcms             Decimal  @default(0) @db.Decimal(15, 2)
  vIcmsSt           Decimal  @default(0) @db.Decimal(15, 2)
  vIpi              Decimal  @default(0) @db.Decimal(15, 2)
  vPis              Decimal  @default(0) @db.Decimal(15, 2)
  vCofins           Decimal  @default(0) @db.Decimal(15, 2)
  vIbs              Decimal  @default(0) @db.Decimal(15, 2)  // NT 2025.002
  vCbs              Decimal  @default(0) @db.Decimal(15, 2)  // NT 2025.002
  vTotal            Decimal  @default(0) @db.Decimal(15, 2)
  // Vínculos MANUAIS e informativos (via "importar de..." ou ação de vincular; nunca por gatilho)
  pedidoVendaId     String?
  minutaId          String?
  devolucaoId       String?
  pedidoCompraId    String?                         // NF de entrada nossa (devolução de compra)
  chaveReferenciada String?                         // NFref (devolução/complementar)
  provedorRef       String?
  xmlUrl            String?                         // @vercel/blob (guarda própria, 5 anos)
  danfeUrl          String?                         // @vercel/blob
  emailEnviadoEm    DateTime?
  itens             NotaFiscalItem[]
  eventos           NotaFiscalEvento[]
  criadoPor         String?
  atualizadoPor     String?
  @@unique([empresaId, modelo, serie, numero, ambiente])
  @@index([empresaId, status])
  @@index([pedidoVendaId])
  @@index([clienteId])
  @@index([dataEmissao])
}

model NotaFiscalItem {
  id              String   @id @default(cuid())
  notaFiscalId    String
  ordem           Int                               // nItem
  itemId          String?                           // FK informativa
  codigo          String                            // snapshot
  descricao       String
  ncm             String
  cest            String?
  gtin            String?  @default("SEM GTIN")
  cfop            String
  unidade         String
  quantidade      Decimal  @db.Decimal(15, 4)
  vUnitario       Decimal  @db.Decimal(15, 10)      // NF-e aceita 10 casas
  vDesconto       Decimal  @default(0) @db.Decimal(15, 2)
  vTotal          Decimal  @db.Decimal(15, 2)
  origem          Int      @default(0)              // origem da mercadoria (0-8)
  cstIcms         String?                           // CST ou CSOSN conforme CRT da empresa
  aliqIcms        Decimal? @db.Decimal(7, 4)
  vBcIcms         Decimal? @db.Decimal(15, 2)
  vIcms           Decimal? @db.Decimal(15, 2)
  vIcmsSt         Decimal? @db.Decimal(15, 2)
  cstIpi          String?
  vIpi            Decimal? @db.Decimal(15, 2)
  cstPis          String?
  vPis            Decimal? @db.Decimal(15, 2)
  cstCofins       String?
  vCofins         Decimal? @db.Decimal(15, 2)
  cClassTrib      String?                           // reforma tributária
  vIbs            Decimal? @db.Decimal(15, 2)
  vCbs            Decimal? @db.Decimal(15, 2)
  tributosJson    Json?                             // detalhe completo (modBC, pRedBC, ST, gIBS/gCBS…) — absorve o churn da reforma sem migration
  regraAplicadaId String?                           // auditoria: qual RegraTributacao sugeriu
  notaFiscal      NotaFiscal @relation(fields: [notaFiscalId], references: [id], onDelete: Cascade)
  @@index([notaFiscalId])
}

model NotaFiscalEvento {
  id            String   @id @default(cuid())
  notaFiscalId  String
  tipo          String                              // CANCELAMENTO | CARTA_CORRECAO
  sequencia     Int      @default(1)                // CC-e: até 20
  status        String   @default("PENDENTE")       // PENDENTE | REGISTRADO | REJEITADO
  justificativa String?                             // cancelamento (mín. 15 chars)
  correcao      String?                             // texto da CC-e
  protocolo     String?
  xmlUrl        String?
  dataEvento    DateTime @default(now())
  criadoPor     String?
  @@index([notaFiscalId])
}

model InutilizacaoNumeracao {
  id            String @id @default(cuid())
  empresaId     String
  modelo        ModeloDocFiscal
  serie         Int
  numeroInicial Int
  numeroFinal   Int
  justificativa String
  status        String @default("PENDENTE")         // PENDENTE | REGISTRADA | REJEITADA
  protocolo     String?
  xmlUrl        String?
  criadoPor     String?
}
```

### 3.3 Consultor de entrada (inbox DF-e)

```prisma
model DocumentoFiscalRecebido {
  id             String    @id @default(cuid())
  empresaId      String                             // destinatário (CNPJ da empresa)
  chave          String
  nsu            String?
  tipoDocumento  String                             // NFE | RESUMO_NFE | EVENTO | CTE
  origem         String    @default("DISTRIBUICAO") // DISTRIBUICAO | IMPORT_XML | IMPORT_CHAVE
  emitenteCnpj   String
  emitenteNome   String
  emitenteUf     String?
  fornecedorId   String?                            // sugestão por cpfCnpj — confirmação manual
  dataEmissao    DateTime?
  valorTotal     Decimal?  @db.Decimal(15, 2)
  situacaoSefaz  String?                            // AUTORIZADA | CANCELADA (evento posterior)
  manifestacao   String    @default("PENDENTE")     // PENDENTE | CIENCIA | CONFIRMADA | DESCONHECIMENTO | NAO_REALIZADA
  statusVinculo  String    @default("NOVA")         // NOVA | VINCULADA | IGNORADA
  xmlCompleto    Boolean   @default(false)          // false = só resumo (Ciência libera o XML)
  xmlUrl         String?                            // blob
  pedidoCompraId String?                            // vínculo MANUAL — sem conferência, sem estoque
  criadoPor      String?
  atualizadoPor  String?
  @@unique([empresaId, chave])
  @@index([empresaId, statusVinculo])
  @@index([fornecedorId])
}
```

### 3.4 Motor de tributação (opera sobre a NF, nunca sobre o pedido)

```prisma
model GrupoTributacao {                             // "gaveta fiscal" do produto (padrão Protheus)
  id     String @id @default(cuid())
  codigo String @unique
  nome   String                                     // ex.: "Cimento (ST)", "Argamassa", "Revenda geral"
  itens  Item[]
}

model OperacaoFiscal {                              // natureza de operação — separada do TES
  id           String  @id @default(cuid())
  empresaId    String
  codigo       String                               // VENDA, DEVOLUCAO_VENDA, REMESSA, TRANSFERENCIA, BONIFICACAO…
  descricao    String                               // vira natOp da nota
  finalidade   Int     @default(1)
  tipoOperacao Int     @default(1)
  ativo        Boolean @default(true)
  @@unique([empresaId, codigo])
}

model RegraTributacao {
  id                String   @id @default(cuid())
  empresaId         String                          // o regime (CRT) da empresa muda tudo
  operacaoFiscalId  String
  // Dimensões do match — null = "qualquer" (fallback hierárquico)
  ufDestino         String?
  dentroEstado      Boolean?
  tipoContribuinte  String?                         // CONTRIBUINTE | ISENTO | NAO_CONTRIBUINTE
  grupoTributacaoId String?
  itemId            String?                         // exceção pontual (vence o grupo)
  // Saída da regra
  cfop              String
  cstIcms           String                          // CST (CRT 3) ou CSOSN (CRT 1) — validado contra EmpresaFiscal.crt
  aliqIcms          Decimal? @db.Decimal(7, 4)
  pRedBcIcms        Decimal? @db.Decimal(7, 4)
  modBcIcms         Int?     @default(3)
  temSt             Boolean  @default(false)
  mvaSt             Decimal? @db.Decimal(7, 4)
  cstIpi            String?
  aliqIpi           Decimal? @db.Decimal(7, 4)
  cstPis            String?
  aliqPis           Decimal? @db.Decimal(7, 4)
  cstCofins         String?
  aliqCofins        Decimal? @db.Decimal(7, 4)
  cClassTrib        String?                         // reforma: classificação tributária IBS/CBS
  cBeneficio        String?
  mensagemFiscal    String?                         // infAdProd/infCpl (fundamentação legal)
  prioridade        Int      @default(0)            // desempate manual
  ativo             Boolean  @default(true)
  @@index([empresaId, operacaoFiscalId])
}
```

**Resolução** (`src/lib/fiscal/tributacao.ts`): busca as regras ativas de `(empresaId, operacaoFiscalId)`
e pontua por especificidade — `itemId` +8, `grupoTributacaoId` +4, `ufDestino` +2 (`dentroEstado` +1),
`tipoContribuinte` +1; vence a maior pontuação (desempate por `prioridade`). O seed cria uma regra geral
(tudo null) por empresa/operação como fallback. **Falha explícita se nenhuma regra casa** — nunca chuta
CST. `tipoContribuinte` deriva de `Cliente.indIE`. `regraAplicadaId` no item dá a auditoria de "por que
esse CST". Na tela de digitação, escolher a `OperacaoFiscal` + itens dispara o cálculo automático;
**tudo revisável/editável antes de transmitir** (a NF é a fonte; o cálculo é sugestão sobre ela).

**TES intocado**: `TipoOperacao` segue exclusivo do eixo gerencial de entrada ("TES é preset de
comportamento, nunca decide destino"). A `OperacaoFiscal` é o eixo fiscal, sem ponte automática.

### 3.5 Alterações em cadastros existentes (a serviço da emissão)

- `Item`: `+origem Int @default(0)`, `+gtin String?`, `+gtinTributavel String?`, `+exTipi String?`,
  `+grupoTributacaoId String?` (`ncm`/`cest` já existem).
- `Cliente` e `Fornecedor`: `+indIE Int @default(9)` (1 contribuinte, 2 isento, 9 não contribuinte),
  `+codigoMunicipioIBGE String?`, `+suframa String?` (Cliente). Backfill do código IBGE por
  (cidade, estado) via tabela IBGE em seed.
- **Nada em `ConferenciaCompra`, nada no enum `OrigemLancamento`** — isolamento do gerencial.

## 4. Camada de abstração `FiscalProvider`

`src/lib/fiscal/provider.ts` — payloads **normalizados nossos** (não o formato do provedor); `ref` =
`NotaFiscal.id` (idempotência de ponta a ponta):

```typescript
export type AmbienteFiscal = "HOMOLOGACAO" | "PRODUCAO";

export interface CredencialFiscal {       // resolvida por empresa (EmpresaFiscal)
  token: string;
  ambiente: AmbienteFiscal;
  cnpjEmitente: string;
}

export type ResultadoEmissao =
  | { situacao: "PROCESSANDO"; provedorRef: string }
  | { situacao: "AUTORIZADA"; chave: string; protocolo: string }
  | { situacao: "REJEITADA" | "DENEGADA" | "ERRO"; codigo?: string; mensagem: string };

export interface FiscalProvider {
  readonly nome: string;                  // "FOCUS_NFE"
  emitirNfe(cred: CredencialFiscal, ref: string, nota: NfePayload): Promise<ResultadoEmissao>;
  emitirNfce(cred: CredencialFiscal, ref: string, nota: NfcePayload): Promise<ResultadoEmissao>;  // F4
  emitirNfse(...): Promise<ResultadoEmissao>;                                                     // F5
  emitirCte(...): Promise<ResultadoEmissao>;                                                      // F5
  emitirMdfe(...): Promise<ResultadoEmissao>;                                                     // F5
  consultar(cred: CredencialFiscal, ref: string): Promise<ResultadoEmissao>;
  cancelar(cred: CredencialFiscal, ref: string, justificativa: string): Promise<ResultadoEvento>;
  cartaCorrecao(cred: CredencialFiscal, ref: string, correcao: string): Promise<ResultadoEvento>;
  inutilizar(cred: CredencialFiscal, p: { serie: number; numeroInicial: number; numeroFinal: number; justificativa: string }): Promise<ResultadoEvento>;
  distribuicaoDFe(cred: CredencialFiscal, ultimoNsu: string): Promise<{ documentos: DocumentoDFe[]; ultimoNsu: string; maxNsu: string }>;
  manifestar(cred: CredencialFiscal, chave: string, evento: "CIENCIA" | "CONFIRMACAO" | "DESCONHECIMENTO" | "NAO_REALIZADA", justificativa?: string): Promise<ResultadoEvento>;
  baixarXml(cred: CredencialFiscal, refOuChave: string): Promise<Buffer>;   // serviço copia p/ blob
  baixarDanfe(cred: CredencialFiscal, ref: string): Promise<Buffer>;
  sincronizarEmpresa(masterToken: string, empresa: DadosEmitente): Promise<{ provedorEmpresaRef: string; tokens: { homologacao: string; producao: string } }>;
  parseWebhook(req: Request): Promise<EventoFiscalNormalizado>;             // valida secret + normaliza
}
```

- **Adapter**: `src/lib/fiscal/providers/focus-nfe.ts` (fetch nativo, padrão das integrações
  existentes). Factory `getFiscalProvider(empresaId)` lê `EmpresaFiscal.provedor` e resolve a credencial
  (token de homologação ou produção conforme `ambiente` — por empresa).
- **Credenciais**: master token do provedor e secret do webhook na tabela `Configuracao`
  (`FOCUS_NFE_MASTER_TOKEN`, `FISCAL_WEBHOOK_SECRET` — padrão telegram/engeman); tokens por empresa em
  `EmpresaFiscal`, **mascarados no GET** (padrão `IntegracaoPagamento`).
- **Webhook**: `POST /api/webhooks/fiscal/[provedor]` → `parseWebhook()` → serviço
  `processarRetornoNota()` atualiza a `NotaFiscal`, copia XML/DANFE para o blob. Handler leve,
  `maxDuration: 60` no `vercel.json`.
- **Fallback de polling**: cron `/api/cron/fiscal-pendentes` (a cada 15 min) consulta notas presas em
  `ENVIANDO`/`ERRO` — a Vercel não tem fila e webhook pode se perder; nenhuma nota fica pendente para
  sempre.

## 5. Fluxos

### 5.1 Emissor (saída) — tudo dentro do módulo Fiscal

1. **Digitação**: `/fiscal/emitir` — escolher empresa emitente, série, `OperacaoFiscal`, destinatário
   (cliente do cadastro ou avulso), itens (produto do cadastro ou linha livre) → motor de tributação
   preenche CFOP/CST/alíquotas/valores automaticamente **a partir da NF** → revisão (tudo editável) →
   transmitir. Botão **"Importar de pedido / minuta / devolução"**: seleção manual, pré-preenche
   destinatário/itens/quantidades/preços e registra o vínculo (`pedidoVendaId`/`minutaId`/`devolucaoId`).
2. **Retorno** (webhook ou poll): `AUTORIZADA` → baixa XML/DANFE para o blob, habilita impressão/e-mail;
   `REJEITADA` → mostra código/motivo, usuário corrige e reenvia **com o mesmo número**.
3. **Devolução/complementar**: `finalidade` 2/4 + `chaveReferenciada`. Devolução de cliente
   não-contribuinte → a empresa emite NF-e de **entrada** (`tipoOperacao=0`); de compra → NF-e de
   devolução ao fornecedor com vínculo manual ao `pedidoCompraId`.
4. **NFC-e (F4)**: mesma tela em modo consumidor final, importando vendas do PDV manualmente ou em lote
   do dia. Gatilho automático no caixa fica registrado como **evolução futura opcional** — o princípio
   do módulo é manual.

### 5.2 Consultor de entrada

1. **Cron `/api/cron/fiscal-dfe`** (1×/hora — a SEFAZ pune consumo indevido da Distribuição DF-e): para
   cada empresa com `EmpresaFiscal` ativo → `distribuicaoDFe(ultimoNsu)` → upsert no inbox (idempotente
   por `[empresaId, chave]`) → avança o cursor (persistido mesmo em erro parcial). Resumos
   (`RESUMO_NFE`): se `manifestacaoAutomatica`, registra **Ciência** → XML completo no ciclo seguinte.
   Eventos de cancelamento do emitente atualizam `situacaoSefaz`.
2. **Inbox `/fiscal/entrada`**: filtros (empresa, fornecedor, período, manifestação, vínculo); ações por
   nota — manifestar (Confirmação / Desconhecimento / Operação não realizada), baixar XML/DANFE,
   **vincular manualmente a um pedido de compra**, ignorar.
3. **Conferência visual de divergências** (ao vincular): tela NF × pedido comparando itens, quantidades
   e valores — matching **sugerido** por `ProdutoFornecedor.codigoFornecedor` (já existe no schema),
   GTIN e NCM+descrição; confirmação manual grava o DePara em `ProdutoFornecedor` para a próxima;
   conversão de unidade via `ItemUnidade.fatorConversao`. **Só leitura/prestação de contas** — não cria
   conferência, estoque nem título.
4. **Import manual**: upload de XML (`fast-xml-parser`, dependência nova) ou digitação de chave
   (consulta via provedor) → mesmo pipeline com `origem: IMPORT_XML | IMPORT_CHAVE`.

### 5.3 Consultor de saída

Painel `/fiscal/saida`: filtros (status, período, cliente, modelo, série); colunas com status SEFAZ;
ações por nota — consultar, **cancelar** (valida prazo de 24h no servidor antes de chamar o provedor;
fora do prazo, orientar devolução), **CC-e** (sequência incremental; não corrige valor/quantidade/
destinatário — validado no form), download XML/DANFE (do blob), **enviar por e-mail** ao cliente
(XML + DANFE anexos), reenvio de rejeitada, **vincular a pedido de venda** (manual, informativo).
Tela separada de **inutilização** de faixas de numeração.

## 6. Prestação de contas (relatórios do módulo)

Calculados **das NFs** (nunca dos pedidos):

- **Livro de saídas** e **livro de entradas** por período/empresa: notas com CFOP, base e
  ICMS/IPI/PIS/COFINS (entradas: valores lidos do XML recebido).
- **Apuração por período**: débitos (saídas) × créditos (entradas) de ICMS/PIS/COFINS/IPI por empresa —
  demonstrativo para conferência com o contador; **não gera guia nem lançamento**.
- **Divergências** (o cruzamento gerencial × oficial que dá sentido ao módulo): NFs de saída sem vínculo
  com pedido; pedidos entregues sem NF vinculada; NFs de entrada sem manifestação ou sem vínculo;
  divergência de valores/quantidades NF × pedido vinculado.
- **Exports** CSV/PDF (`jspdf`, padrão existente). Os XMLs no blob são a fonte para o contador —
  **SPED Fiscal/Contribuições continuam com o contador (fora de escopo)**.

## 7. Módulo, permissões e arquivos

- `src/lib/modules.ts`: módulo `fiscal` (grupo próprio, apartado dos gerenciais) com recursos
  `emissao`, `entrada`, `saida`, `cadastros`, `relatorios` (ações ver/inserir/editar/excluir).
- `src/components/layout/Sidebar.tsx` + `src/lib/route-registry.ts`: seções `/fiscal/emitir`,
  `/fiscal/saida`, `/fiscal/entrada`, `/fiscal/cadastros` (EmpresaFiscal, séries, grupos, operações,
  regras), `/fiscal/relatorios`.
- Route handlers com `requireModulo("fiscal")` em `src/app/api/fiscal/...`.
- Lógica: `src/lib/fiscal/` — `provider.ts`, `providers/focus-nfe.ts`, `tributacao.ts`, `numeracao.ts`,
  `payload-nfe.ts` (montagem do payload normalizado), `xml-entrada.ts` (parse do XML recebido).
- Webhook `src/app/api/webhooks/fiscal/[provedor]/route.ts`; crons `fiscal-dfe` e `fiscal-pendentes` em
  `vercel.json` + `src/app/api/cron/`.
- Dependência nova: `fast-xml-parser`. Reuso: `@vercel/blob`, `jspdf`, `Configuracao`, padrão
  `CreateDrawer`/`ComboboxWithCreate`/`DatePicker`/`usePersistedFilters` nas telas.

## 8. Roadmap (MoSCoW)

| Fase | MoSCoW | Escopo |
|---|---|---|
| **F0 — Fundação** | Must | Models + telas de cadastro fiscal (EmpresaFiscal, séries, grupos, operações, regras); campos em Item/Cliente/Fornecedor + backfill IBGE; módulo `fiscal` registrado; adapter Focus + sincronizar empresa/certificado A1; emissão de teste em homologação. |
| **F1 — Emissor NF-e** | Must | Tela de digitação + importar de pedido/minuta; motor de tributação; webhook + cron de pendentes; painel de saída completo (cancelamento, CC-e, inutilização, XML/DANFE, e-mail). |
| **F2 — Consultor de entrada** | Must | Cron DF-e + manifestação; inbox; import XML/chave; vínculo manual + conferência visual de divergências. |
| **F3 — Prestação de contas** | Must | Livros de entrada/saída; apuração por período; relatório de divergências; exports. |
| **F4 — NFC-e + operações especiais** | Should | NFC-e (importação manual/lote do PDV, CSC); devolução, remessas, transferências, intragrupo/venda à ordem (remessa por conta e ordem ref. 5.923/6.923 + venda simbólica ref. 5.118/5.119/5.120 — **validar CFOPs com o contador**). |
| **F5 — Demais DFes** | Could | NFS-e; CT-e/**MDF-e** (⚠️ antecipar MDF-e se o contador confirmar obrigação para frota própria intermunicipal/interestadual). |
| **Transversal — Reforma (IBS/CBS)** | Must até ago/2026 | Campos `vIbs`/`vCbs`/`cClassTrib` nascem na F0/F1; ligar `emiteIbsCbs` por empresa quando o provedor liberar a NT 2025.002; cadastrar `cClassTrib` nas regras (regime normal primeiro). |

**Fora de escopo:** SPED Fiscal/Contribuições; qualquer gatilho automático a partir do operacional;
reflexo em estoque/financeiro/contabilidade gerencial; contingência offline de NFC-e (dívida declarada
da F4); apuração com geração de guia no contas a pagar.

## 9. Riscos e pontos de atenção

1. **Numeração**: contador transacional resolve concorrência; número descartado precisa de inutilização
   (obrigação até o dia 10 do mês seguinte em várias UFs) — aviso mensal de "números pulados".
2. **Modelo manual — risco operacional**: mercadoria pode circular sem NF; o relatório de divergências
   (pedido entregue × NF emitida) é o controle compensatório. Disciplina de vínculo é premissa.
3. **Webhook na Vercel**: sem fila; handler leve + cron de reconciliação a cada 15 min.
4. **Prazos de cancelamento**: 24h para NF-e (UFs variam), ~30 min para NFC-e em várias UFs — validar no
   servidor e orientar devolução/estorno documental após o prazo.
5. **Multiempresa**: certificado, CSC, série, ambiente e `ultimoNsu` são por empresa; homologação de uma
   não trava produção da outra. Homologação troca a razão social do destinatário por texto fixo — nunca
   misturar séries/numeração entre ambientes (por isso `ambiente` está nas uniques).
6. **Certificado A1 no provedor**: cláusula LGPD/confidencialidade; alerta 30 dias antes de
   `certificadoValidade`; vencido = emissão parada, visível no dashboard do módulo.
7. **Distribuição DF-e**: rate limit da SEFAZ (1×/hora respeita); resumo sem manifestação não dá XML
   completo — Ciência automática é o default correto; documentos ficam ~3 meses disponíveis no ambiente
   nacional (não deixar o cursor parar).
8. **CC-e não corrige** valores, quantidades nem destinatário — validar no formulário.
9. **Reforma tributária**: 2026 é ano de teste (destaque sem recolhimento), mas o destaque já é
   obrigação legal quando devido; a partir de ago/2026 o leiaute rejeita regime normal sem os grupos
   IBS/CBS — dependência do cronograma do provedor.

## 10. Verificação

1. `npx tsc --noEmit` sem erros novos; migrations idempotentes local + prod (MCP).
2. **F0**: emitir nota de teste em homologação para cada empresa do grupo (certificado sincronizado,
   série própria, DANFE de homologação).
3. **F1**: digitar uma NF importando de um pedido real → autorizar → DANFE → cancelar → **conferir que
   nada mudou em estoque, financeiro e contabilidade** (prova do isolamento); rejeição proposital
   (CST inválido) → corrigir → reenviar com o mesmo número.
4. **F2**: nota real de fornecedor aparecendo no inbox via DF-e → Ciência → XML completo → vincular a
   pedido de compra → tela de divergências coerente (itens casados via ProdutoFornecedor, quantidades
   convertidas).
5. **F3**: livros e apuração batendo com a soma manual das NFs do período; relatório de divergências
   acusando pedido entregue sem NF plantado de propósito.
