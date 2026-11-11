// Cadastro genérico do atalho "Consumidor final (sem cadastro)" no pedido de
// venda (seed da migração 20260613110000), compartilhado entre as empresas.
// É somente leitura: editá-lo renomeia o atalho para todo mundo — incidente
// 03/11/2026, virou "WALTER" e as vendas sem cadastro da Cimento e Mix saíram
// no nome dele. Cliente real se cadastra como novo.
export const CONSUMIDOR_FINAL_ID = "cli_consumidor_final";

export const MSG_CONSUMIDOR_FINAL_TRAVADO =
  "\"Consumidor Final\" é o cadastro genérico das vendas sem cadastro e não pode ser alterado. Cadastre o cliente como novo.";
