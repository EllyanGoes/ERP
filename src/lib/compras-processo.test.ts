// Testes da fase do processo de compras. Sem framework: rode com
//   npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/compras-processo.test.ts
// Sai com código !=0 se algum caso falhar.
import assert from "node:assert/strict";
import {
  agruparItens, colunaDoCartao, colunaDoDocumento, destinoDoArraste, entradaNaColuna, faseDoProcesso, numeroDigitado,
  totalDaProposta, validarPropostas, vencedorDaCompra, type DocumentosDoProcesso, type EtapaCompra,
} from "./compras-processo";

const s = (status: string) => ({ status });
const pc = (status: string, entrada: string | null = null) => ({ status, entrada: entrada ? s(entrada) : null });
const base: DocumentosDoProcesso = { sc: null, cotacoes: [], pedidos: [], entradasAvulsas: [] };
const fase = (d: Partial<DocumentosDoProcesso>) => faseDoProcesso({ ...base, ...d });

// O cartão anda pelas 4 fases.
assert.deepEqual(fase({ sc: s("APROVADA") }), { etapa: "solicitacao", concluido: false });
assert.deepEqual(fase({ sc: s("EM_COTACAO"), cotacoes: [s("EM_ANALISE")] }), { etapa: "cotacao", concluido: false });
assert.deepEqual(
  fase({ sc: s("EM_PEDIDO"), cotacoes: [s("CONCLUIDA")], pedidos: [pc("CONFIRMADO")] }),
  { etapa: "pedido", concluido: false },
);
assert.deepEqual(
  fase({ sc: s("EM_PEDIDO"), cotacoes: [s("CONCLUIDA")], pedidos: [pc("RECEBIDO", "EM_CONFERENCIA")] }),
  { etapa: "entrada", concluido: false },
);
assert.deepEqual(
  fase({ sc: s("TOTALMENTE_ATENDIDA"), cotacoes: [s("CONCLUIDA")], pedidos: [pc("RECEBIDO", "CONCLUIDA")] }),
  { etapa: "entrada", concluido: true },
);

// Divisão: fica na fase menos avançada que ainda tem trabalho.
assert.equal(fase({ sc: s("EM_PEDIDO"), pedidos: [pc("RECEBIDO", "EM_CONFERENCIA"), pc("CONFIRMADO")] }).etapa, "pedido");

// Atendida em parte volta para a SC; pedido todo cancelado também.
assert.equal(fase({ sc: s("PARCIALMENTE_ATENDIDA"), pedidos: [pc("RECEBIDO", "CONCLUIDA")] }).etapa, "solicitacao");
assert.deepEqual(
  fase({ sc: s("EM_PEDIDO"), cotacoes: [s("CONCLUIDA")], pedidos: [pc("CANCELADO")] }),
  { etapa: "solicitacao", concluido: false },
);

// SC com status defasado, mas tudo já recebido: processo encerrado.
assert.deepEqual(fase({ sc: s("EM_PEDIDO"), pedidos: [pc("RECEBIDO", "CONCLUIDA")] }), { etapa: "entrada", concluido: true });

// Processos sem SC.
assert.equal(fase({ pedidos: [pc("EM_TRANSITO")] }).etapa, "pedido");
assert.deepEqual(fase({ entradasAvulsas: [s("PENDENTE")] }), { etapa: "entrada", concluido: false });

// Colunas por quem deve agir.
assert.equal(colunaDoDocumento("solicitacao", "APROVADA"), "montagem");
assert.equal(colunaDoDocumento("cotacao", "EM_ANALISE"), "montagem");
assert.equal(colunaDoDocumento("cotacao", "AGUARDANDO_APROVACAO"), "aprovacao");
assert.equal(colunaDoDocumento("pedido", "AGUARDANDO_APROVACAO"), "aprovacao");
assert.equal(colunaDoDocumento("pedido", "RASCUNHO"), "montagem");
for (const st of ["AGUARDANDO_PAGAMENTO", "CONFIRMADO", "EM_TRANSITO", "ENVIADO"]) assert.equal(colunaDoDocumento("pedido", st), "entrega");
assert.equal(colunaDoDocumento("entrada", "DIVERGENCIA"), "conferencia");
assert.equal(colunaDoCartao("pedido", "RECEBIDO", true), "conferencia");

// Tempo na coluna: só mudança de coluna conta.
const d = (n: number) => new Date(2026, 0, n);
const log = (statusDe: string | null, statusPara: string, dia: number) => ({ statusDe, statusPara, criadoEm: d(dia) });
assert.deepEqual(entradaNaColuna("cotacao", d(1), []), d(1));
assert.deepEqual(entradaNaColuna("cotacao", d(1), [log("PENDENTE", "EM_ANALISE", 5)]), d(1));
assert.deepEqual(entradaNaColuna("cotacao", d(1), [log("EM_ANALISE", "AGUARDANDO_APROVACAO", 5)]), d(5));
assert.deepEqual(entradaNaColuna("cotacao", d(1), [log(null, "PENDENTE", 1), log("PENDENTE", "AGUARDANDO_APROVACAO", 3), log("AGUARDANDO_APROVACAO", "EM_ANALISE", 8)]), d(8));

// Arrastar: só para a próxima coluna, e sempre levando ao lugar certo.
const cartao = (etapa: EtapaCompra, status: string, concluido = false) => ({ etapa, status, concluido, coluna: colunaDoCartao(etapa, status, concluido), atual: { id: "X" } });
assert.deepEqual(destinoDoArraste(cartao("solicitacao", "APROVADA"), "aprovacao"), { href: "/suprimentos/cotacoes/nova?necessidadeId=X" });
assert.ok("erro" in destinoDoArraste(cartao("solicitacao", "RASCUNHO"), "aprovacao")!);
assert.deepEqual(destinoDoArraste(cartao("pedido", "CONFIRMADO"), "conferencia"), { href: "/suprimentos/conferencias/novo?pedidoId=X" });
const aprovar = destinoDoArraste(cartao("cotacao", "AGUARDANDO_APROVACAO"), "entrega")!;
assert.ok("href" in aprovar && aprovar.href === "/suprimentos/cotacoes/X" && !!aprovar.aviso);
assert.ok("erro" in destinoDoArraste(cartao("pedido", "CONFIRMADO"), "montagem")!);
assert.ok("erro" in destinoDoArraste(cartao("solicitacao", "APROVADA"), "entrega")!);
assert.ok("erro" in destinoDoArraste(cartao("entrada", "CONCLUIDA", true), "entrega")!);
assert.equal(destinoDoArraste(cartao("pedido", "CONFIRMADO"), "entrega"), null);

// Propostas.
assert.equal(numeroDigitado("1.234,50"), 1234.5);
assert.equal(numeroDigitado("1234.5"), 1234.5);
assert.equal(numeroDigitado(" "), null);
assert.equal(numeroDigitado("abc"), null);
assert.deepEqual(agruparItens([{ itemId: "A", quantidade: 2 }, { itemId: "A", quantidade: 3 }]), [{ itemId: "A", quantidade: 5 }]);
const itens = [{ itemId: "A", quantidade: 2 }, { itemId: "B", quantidade: 1 }];
const barata = { fornecedorId: "F1", precos: { A: 10, B: 5 }, frete: 3, vrDesconto: 1 };
const cara = { fornecedorId: "F2", precos: { A: 20, B: 5 } };
const faltando = { fornecedorId: "F3", precos: { A: 1, B: null } };
assert.equal(totalDaProposta(itens, barata), 27);
assert.equal(vencedorDaCompra(itens, [cara, barata]), "F1");
assert.equal(vencedorDaCompra(itens, [cara, barata], "F2"), "F2");
assert.equal(vencedorDaCompra(itens, [cara, barata, faltando], "F3"), "F1");
assert.equal(vencedorDaCompra(itens, [faltando]), null);
assert.equal(validarPropostas(itens, [barata], true), null);
assert.equal(validarPropostas(itens, [faltando], false), null);
assert.ok(validarPropostas(itens, [faltando], true));
assert.ok(validarPropostas(itens, [], true));
assert.equal(validarPropostas(itens, [], false), null);
assert.ok(validarPropostas(itens, [barata, barata], false));
assert.ok(validarPropostas(itens, [{ fornecedorId: "F9", precos: { A: 1, B: 1 }, vrDesconto: 99 }], false));

console.log("compras-processo: ok");
