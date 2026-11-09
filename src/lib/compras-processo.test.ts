// Testes da fase do processo de compras. Sem framework: rode com
//   npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/compras-processo.test.ts
// Sai com código !=0 se algum caso falhar.
import assert from "node:assert/strict";
import { destinoDoArraste, faseDoProcesso, type DocumentosDoProcesso, type EtapaCompra } from "./compras-processo";

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

// Arrastar: só para a próxima coluna, e sempre levando ao formulário certo.
const cartao = (etapa: EtapaCompra, status: string, concluido = false) => ({ etapa, status, concluido, atual: { id: "X" } });
assert.deepEqual(destinoDoArraste(cartao("solicitacao", "APROVADA"), "cotacao"), { href: "/suprimentos/cotacoes/nova?necessidadeId=X" });
assert.ok("erro" in destinoDoArraste(cartao("solicitacao", "RASCUNHO"), "cotacao")!);
assert.deepEqual(destinoDoArraste(cartao("pedido", "CONFIRMADO"), "entrada"), { href: "/suprimentos/conferencias/novo?pedidoId=X" });
const ctParaPc = destinoDoArraste(cartao("cotacao", "AGUARDANDO_APROVACAO"), "pedido")!;
assert.ok("href" in ctParaPc && ctParaPc.href === "/suprimentos/cotacoes/X" && !!ctParaPc.aviso);
assert.ok("erro" in destinoDoArraste(cartao("pedido", "CONFIRMADO"), "cotacao")!);
assert.ok("erro" in destinoDoArraste(cartao("solicitacao", "APROVADA"), "pedido")!);
assert.ok("erro" in destinoDoArraste(cartao("entrada", "CONCLUIDA", true), "pedido")!);
assert.equal(destinoDoArraste(cartao("pedido", "CONFIRMADO"), "pedido"), null);

console.log("compras-processo: ok");
