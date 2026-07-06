// Adapter Focus NFe (https://focusnfe.com.br/doc/) para o contrato FiscalProvider.
// Auth: HTTP Basic com o token como usuário e senha vazia. O `ref` (idempotência)
// é o NotaFiscal.id. Endpoints e nomes de campo seguem a doc v2 da Focus; a
// emissão real em homologação (F0) é o teste de aderência — ajustar aqui se a
// doc divergir, sem tocar o resto do módulo.

import type {
  AmbienteFiscal,
  CredencialFiscal,
  DadosEmitente,
  DocumentoDFe,
  EventoFiscalNormalizado,
  FiscalProvider,
  NfePayload,
  ResultadoEmissao,
  ResultadoEvento,
  TipoManifestacao,
} from "@/lib/fiscal/provider";

const BASE: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://api.focusnfe.com.br",
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br",
};

type FocusJson = Record<string, unknown>;

async function focusFetch(
  cred: Pick<CredencialFiscal, "token" | "ambiente">,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; json: FocusJson | null; raw: Response }> {
  const res = await fetch(`${BASE[cred.ambiente]}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cred.token}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  let json: FocusJson | null = null;
  try {
    json = (await res.clone().json()) as FocusJson;
  } catch {
    json = null;
  }
  return { status: res.status, json, raw: res };
}

// ── Mapeamentos ───────────────────────────────────────────────────────────────

function mapStatus(json: FocusJson): ResultadoEmissao {
  const status = String(json.status ?? "");
  switch (status) {
    case "autorizado":
      return {
        situacao: "AUTORIZADA",
        chave: String(json.chave_nfe ?? json.chave ?? "").replace(/^NFe/, ""),
        protocolo: String(json.protocolo ?? json.numero_protocolo ?? ""),
        xmlPath: (json.caminho_xml_nota_fiscal as string) ?? null,
        danfePath: (json.caminho_danfe as string) ?? null,
      };
    case "cancelado":
      return { situacao: "CANCELADA", protocolo: (json.protocolo as string) ?? null };
    case "erro_autorizacao":
      return {
        situacao: "REJEITADA",
        codigo: (json.status_sefaz as string) ?? null,
        mensagem: String(json.mensagem_sefaz ?? json.mensagem ?? "Rejeitada pela SEFAZ"),
      };
    case "denegado":
      return {
        situacao: "DENEGADA",
        codigo: (json.status_sefaz as string) ?? null,
        mensagem: String(json.mensagem_sefaz ?? "Denegada pela SEFAZ"),
      };
    case "processando_autorizacao":
    default:
      return { situacao: "PROCESSANDO", provedorRef: String(json.ref ?? "") };
  }
}

function mapNfeParaFocus(cnpjEmitente: string, nota: NfePayload): FocusJson {
  const d = nota.destinatario;
  const cpfCnpj = (d.cpfCnpj ?? "").replace(/\D/g, "");
  return {
    natureza_operacao: nota.naturezaOperacao,
    serie: nota.serie,
    numero: nota.numero,
    data_emissao: nota.dataEmissao,
    tipo_documento: nota.tipoOperacao, // 0 entrada | 1 saída
    finalidade_emissao: nota.finalidade,
    consumidor_final: nota.consumidorFinal ? 1 : 0,
    presenca_comprador: nota.presencial ? 1 : 9,
    cnpj_emitente: cnpjEmitente,
    local_destino: d.endereco && d.endereco.uf ? undefined : undefined, // Focus calcula
    // Destinatário
    ...(cpfCnpj.length === 14 ? { cnpj_destinatario: cpfCnpj } : cpfCnpj.length === 11 ? { cpf_destinatario: cpfCnpj } : {}),
    nome_destinatario: d.nome,
    indicador_inscricao_estadual_destinatario: d.indIE,
    ...(d.ie ? { inscricao_estadual_destinatario: d.ie } : {}),
    ...(d.email ? { email_destinatario: d.email } : {}),
    ...(d.endereco
      ? {
          logradouro_destinatario: d.endereco.logradouro,
          numero_destinatario: d.endereco.numero,
          ...(d.endereco.complemento ? { complemento_destinatario: d.endereco.complemento } : {}),
          bairro_destinatario: d.endereco.bairro,
          municipio_destinatario: d.endereco.municipio,
          uf_destinatario: d.endereco.uf,
          cep_destinatario: d.endereco.cep.replace(/\D/g, ""),
          codigo_municipio_destinatario: d.endereco.codigoMunicipioIBGE,
        }
      : {}),
    // Totais
    valor_produtos: nota.totais.vProdutos,
    valor_desconto: nota.totais.vDesconto,
    valor_frete: nota.totais.vFrete,
    valor_seguro: nota.totais.vSeguro,
    valor_outras_despesas: nota.totais.vOutro,
    icms_base_calculo: nota.totais.vBcIcms,
    icms_valor_total: nota.totais.vIcms,
    icms_valor_total_st: nota.totais.vIcmsSt,
    valor_ipi: nota.totais.vIpi,
    valor_pis: nota.totais.vPis,
    valor_cofins: nota.totais.vCofins,
    valor_total: nota.totais.vTotal,
    modalidade_frete: nota.modalidadeFrete,
    ...(nota.chaveReferenciada
      ? { notas_referenciadas: [{ chave_nfe: nota.chaveReferenciada }] }
      : {}),
    ...(nota.observacoes ? { informacoes_adicionais_contribuinte: nota.observacoes } : {}),
    items: nota.itens.map((i) => ({
      numero_item: i.ordem,
      codigo_produto: i.codigo,
      descricao: i.descricao,
      codigo_ncm: i.ncm.replace(/\D/g, ""),
      ...(i.cest ? { cest: i.cest.replace(/\D/g, "") } : {}),
      codigo_barras_comercial: i.gtin,
      codigo_barras_tributavel: i.gtin,
      cfop: i.cfop.replace(/\D/g, ""),
      unidade_comercial: i.unidade,
      unidade_tributavel: i.unidade,
      quantidade_comercial: i.quantidade,
      quantidade_tributavel: i.quantidade,
      valor_unitario_comercial: i.vUnitario,
      valor_unitario_tributavel: i.vUnitario,
      ...(i.vDesconto ? { valor_desconto: i.vDesconto } : {}),
      valor_bruto: i.vTotal,
      icms_origem: i.origem,
      // CRT 1 (Simples) usa CSOSN; regime normal usa CST — o motor de
      // tributação já grava o código certo em cstIcms.
      ...(nota.crt === 1
        ? { icms_situacao_tributaria: i.cstIcms ?? "102" }
        : {
            icms_situacao_tributaria: i.cstIcms ?? "00",
            ...(i.vBcIcms != null ? { icms_base_calculo: i.vBcIcms } : {}),
            ...(i.aliqIcms != null ? { icms_aliquota: i.aliqIcms } : {}),
            ...(i.vIcms != null ? { icms_valor: i.vIcms } : {}),
          }),
      ...(i.cstIpi ? { ipi_situacao_tributaria: i.cstIpi, ...(i.vIpi != null ? { ipi_valor: i.vIpi } : {}) } : {}),
      pis_situacao_tributaria: i.cstPis ?? "07",
      ...(i.aliqPis != null ? { pis_aliquota_porcentual: i.aliqPis, pis_base_calculo: i.vTotal } : {}),
      ...(i.vPis != null ? { pis_valor: i.vPis } : {}),
      cofins_situacao_tributaria: i.cstCofins ?? "07",
      ...(i.aliqCofins != null ? { cofins_aliquota_porcentual: i.aliqCofins, cofins_base_calculo: i.vTotal } : {}),
      ...(i.vCofins != null ? { cofins_valor: i.vCofins } : {}),
      ...(i.cClassTrib ? { codigo_classificacao_tributaria: i.cClassTrib } : {}),
    })),
  };
}

const MANIFESTO: Record<TipoManifestacao, string> = {
  CIENCIA: "ciencia",
  CONFIRMACAO: "confirmacao",
  DESCONHECIMENTO: "desconhecimento",
  NAO_REALIZADA: "nao_realizada",
};

function mapEvento(status: number, json: FocusJson | null): ResultadoEvento {
  if (status >= 200 && status < 300) {
    const st = String(json?.status ?? "");
    if (st === "erro" || st === "rejeitado") {
      return { status: "REJEITADO", mensagem: String(json?.mensagem ?? json?.mensagem_sefaz ?? "Evento rejeitado") };
    }
    return {
      status: "REGISTRADO",
      protocolo: (json?.protocolo as string) ?? null,
      xmlPath: (json?.caminho_xml as string) ?? (json?.caminho_xml_cancelamento as string) ?? null,
      mensagem: (json?.mensagem_sefaz as string) ?? null,
    };
  }
  return {
    status: "REJEITADO",
    mensagem: String(json?.mensagem ?? json?.mensagem_sefaz ?? `Erro HTTP ${status} no provedor`),
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const focusNfeProvider: FiscalProvider = {
  nome: "FOCUS_NFE",

  async emitirNfe(cred, ref, nota) {
    const { status, json } = await focusFetch(cred, `/v2/nfe?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      body: mapNfeParaFocus(cred.cnpjEmitente, nota),
    });
    if (status === 422 || status === 400) {
      // erro de validação do próprio provedor (antes da SEFAZ)
      const erros = Array.isArray(json?.erros)
        ? (json?.erros as FocusJson[]).map((e) => `${e.campo ?? ""}: ${e.mensagem ?? ""}`).join("; ")
        : String(json?.mensagem ?? "Payload rejeitado pelo provedor");
      return { situacao: "REJEITADA", codigo: String(json?.codigo ?? status), mensagem: erros };
    }
    if (status >= 500) return { situacao: "ERRO", mensagem: `Provedor indisponível (HTTP ${status})` };
    if (json && json.status) return mapStatus(json);
    return { situacao: "PROCESSANDO", provedorRef: ref };
  },

  async consultar(cred, ref) {
    const { status, json } = await focusFetch(cred, `/v2/nfe/${encodeURIComponent(ref)}?completa=1`);
    if (status === 404) return { situacao: "ERRO", mensagem: "Nota não encontrada no provedor" };
    if (!json) return { situacao: "ERRO", mensagem: `Resposta inválida do provedor (HTTP ${status})` };
    return mapStatus(json);
  },

  async cancelar(cred, ref, justificativa) {
    const { status, json } = await focusFetch(cred, `/v2/nfe/${encodeURIComponent(ref)}`, {
      method: "DELETE",
      body: { justificativa },
    });
    return mapEvento(status, json);
  },

  async cartaCorrecao(cred, ref, correcao) {
    const { status, json } = await focusFetch(cred, `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, {
      method: "POST",
      body: { correcao },
    });
    return mapEvento(status, json);
  },

  async inutilizar(cred, p) {
    const { status, json } = await focusFetch(cred, `/v2/nfe/inutilizacao`, {
      method: "POST",
      body: {
        cnpj: cred.cnpjEmitente,
        serie: String(p.serie),
        numero_inicial: String(p.numeroInicial),
        numero_final: String(p.numeroFinal),
        justificativa: p.justificativa,
      },
    });
    return mapEvento(status, json);
  },

  // Consulta de notas recebidas/destinadas (Distribuição DF-e via Focus).
  // Cursor: NSU do ambiente nacional. Consumido pelo cron fiscal-dfe (F2).
  async distribuicaoDFe(cred, ultimoNsu) {
    const { status, json, raw } = await focusFetch(
      cred,
      `/v2/nfes_recebidas?cnpj=${cred.cnpjEmitente}&nsu_maior_que=${encodeURIComponent(ultimoNsu)}`,
    );
    if (status >= 400) throw new Error(`Distribuição DF-e falhou (HTTP ${status}): ${json?.mensagem ?? raw.statusText}`);
    const lista = (Array.isArray(json) ? (json as unknown as FocusJson[]) : (json?.data as FocusJson[]) ?? []) as FocusJson[];
    let maiorNsu = ultimoNsu;
    const documentos: DocumentoDFe[] = lista.map((doc) => {
      const nsu = String(doc.nsu ?? "");
      if (nsu && BigInt(nsu || "0") > BigInt(maiorNsu || "0")) maiorNsu = nsu;
      const temXmlCompleto = Boolean(doc.caminho_xml ?? doc.caminho_xml_nota_fiscal);
      return {
        chave: String(doc.chave_nfe ?? doc.chave ?? "").replace(/^NFe/, ""),
        nsu,
        tipoDocumento: temXmlCompleto ? "NFE" : "RESUMO_NFE",
        emitenteCnpj: String(doc.cnpj_emitente ?? "").replace(/\D/g, ""),
        emitenteNome: String(doc.nome_emitente ?? doc.razao_social_emitente ?? ""),
        emitenteUf: (doc.uf_emitente as string) ?? null,
        dataEmissao: (doc.data_emissao as string) ?? null,
        valorTotal: doc.valor_total != null ? Number(doc.valor_total) : null,
        situacaoSefaz: (doc.situacao as string) ?? null,
        xmlPath: (doc.caminho_xml as string) ?? (doc.caminho_xml_nota_fiscal as string) ?? null,
      };
    });
    return { documentos, ultimoNsu: maiorNsu };
  },

  async manifestar(cred, chave, evento, justificativa) {
    const { status, json } = await focusFetch(cred, `/v2/nfes_recebidas/${chave}/manifesto`, {
      method: "POST",
      body: { tipo: MANIFESTO[evento], ...(justificativa ? { justificativa } : {}) },
    });
    return mapEvento(status, json);
  },

  async baixarArquivo(cred, path) {
    const res = await fetch(`${BASE[cred.ambiente]}${path.startsWith("/") ? path : `/${path}`}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${cred.token}:`).toString("base64")}` },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Download falhou (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  },

  // Cria/atualiza a empresa na conta Focus (master token) e devolve os tokens
  // de emissão por ambiente. O certificado A1 é enviado depois, pela própria
  // tela da Focus ou por PUT com arquivo_certificado_base64 + senha.
  async sincronizarEmpresa(masterToken, ambiente, e) {
    const body = {
      nome: e.razaoSocial,
      nome_fantasia: e.nomeFantasia ?? undefined,
      cnpj: e.cnpj.replace(/\D/g, ""),
      inscricao_estadual: e.ie ?? undefined,
      inscricao_municipal: e.im ?? undefined,
      regime_tributario: e.crt,
      email: e.email ?? undefined,
      telefone: e.telefone ?? undefined,
      logradouro: e.endereco.logradouro,
      numero: e.endereco.numero,
      complemento: e.endereco.complemento ?? undefined,
      bairro: e.endereco.bairro,
      municipio: e.endereco.municipio,
      uf: e.endereco.uf,
      cep: e.endereco.cep.replace(/\D/g, ""),
      codigo_municipio: e.endereco.codigoMunicipioIBGE,
      habilita_nfe: true,
    };
    const cred = { token: masterToken, ambiente };
    // tenta criar; se já existe (409/422 com cnpj duplicado), atualiza
    let { status, json } = await focusFetch(cred, `/v2/empresas`, { method: "POST", body });
    if (status === 422 || status === 409) {
      const busca = await focusFetch(cred, `/v2/empresas?cnpj=${body.cnpj}`);
      const existente = Array.isArray(busca.json) ? (busca.json as unknown as FocusJson[])[0] : null;
      if (existente?.id != null) {
        ({ status, json } = await focusFetch(cred, `/v2/empresas/${existente.id}`, { method: "PUT", body }));
        json = { ...existente, ...(json ?? {}) };
      }
    }
    if (status >= 400 || !json) {
      throw new Error(`Falha ao sincronizar empresa no provedor (HTTP ${status}): ${JSON.stringify(json?.erros ?? json?.mensagem ?? "")}`);
    }
    return {
      provedorEmpresaRef: String(json.id ?? body.cnpj),
      tokenHomologacao: (json.token_homologacao as string) ?? null,
      tokenProducao: (json.token_producao as string) ?? null,
    };
  },

  parseWebhook(body) {
    if (!body || typeof body !== "object") return null;
    const b = body as FocusJson;
    const ref = String(b.ref ?? "");
    if (!ref) return null;
    return { ref, resultado: mapStatus(b) };
  },
};
