// Testes da função pura de roteamento de requisição. Sem framework: rode com
//   npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/pcp/rotear-requisicao.test.ts
// Sai com código !=0 se algum caso falhar.
import assert from "node:assert/strict";
import { rotearDestinoRequisicao, type ItemRoteamento } from "./rotear-requisicao";

const direto = (cat: string): ItemRoteamento => ({ categoriaEstoque: cat, compoeCusto: true, fabril: false, capitaliza: false });
const indireto: ItemRoteamento = { categoriaEstoque: "ALMOXARIFADO", compoeCusto: true, fabril: true, capitaliza: false };
const generico: ItemRoteamento = { categoriaEstoque: "ALMOXARIFADO", compoeCusto: true, fabril: false, capitaliza: false };
// Ferramental permanente / material de obra (capitaliza) — também marcado fabril para
// provar que capitaliza VENCE o teste de centro.
const capitalizavel: ItemRoteamento = { categoriaEstoque: "ALMOXARIFADO", compoeCusto: false, fabril: true, capitaliza: true };

const casos: Array<[string, () => void]> = [
  ["argila (MATERIA_PRIMA) em qualquer centro → PEP_MD", () => {
    assert.equal(rotearDestinoRequisicao({ item: direto("MATERIA_PRIMA"), centroFabril: true }), "PEP_MD");
    assert.equal(rotearDestinoRequisicao({ item: direto("MATERIA_PRIMA"), centroFabril: false }), "PEP_MD");
    assert.equal(rotearDestinoRequisicao({ item: direto("MATERIA_PRIMA"), centroFabril: null }), "PEP_MD");
  }],
  ["INSUMO e EMBALAGEM que compõem custo → PEP_MD", () => {
    assert.equal(rotearDestinoRequisicao({ item: direto("INSUMO") }), "PEP_MD");
    assert.equal(rotearDestinoRequisicao({ item: direto("EMBALAGEM") }), "PEP_MD");
  }],
  ["material que NÃO compõe custo não é PEP-MD direto", () => {
    assert.equal(rotearDestinoRequisicao({ item: { categoriaEstoque: "INSUMO", compoeCusto: false, fabril: false, capitaliza: false } }), "DESPESA");
  }],
  ["rolamento (fabril) na extrusora (centro fabril) → CIF", () => {
    assert.equal(rotearDestinoRequisicao({ item: indireto, centroFabril: true }), "CIF");
  }],
  ["o MESMO rolamento na frota (centro não-fabril) → DESPESA", () => {
    assert.equal(rotearDestinoRequisicao({ item: indireto, centroFabril: false }), "DESPESA");
  }],
  ["EPI (fabril) no forno (fabril) → CIF", () => {
    assert.equal(rotearDestinoRequisicao({ item: { categoriaEstoque: "ALMOXARIFADO", compoeCusto: true, fabril: true, capitaliza: false }, centroFabril: true }), "CIF");
  }],
  ["material de escritório (não-fabril) → DESPESA", () => {
    assert.equal(rotearDestinoRequisicao({ item: generico, centroFabril: false }), "DESPESA");
    assert.equal(rotearDestinoRequisicao({ item: generico }), "DESPESA");
  }],
  ["override manual natureza.cif → CIF (item não-direto)", () => {
    assert.equal(rotearDestinoRequisicao({ item: generico, naturezaCif: true }), "CIF");
  }],
  ["direto vence o override: PEP_MD mesmo com natureza.cif", () => {
    assert.equal(rotearDestinoRequisicao({ item: direto("MATERIA_PRIMA"), naturezaCif: true }), "PEP_MD");
  }],
  ["indireto SEM centro → INDEFINIDO (sinaliza, não adivinha)", () => {
    assert.equal(rotearDestinoRequisicao({ item: indireto }), "INDEFINIDO");
    assert.equal(rotearDestinoRequisicao({ item: indireto, centroFabril: null }), "INDEFINIDO");
  }],
  ["ferramental de alto valor (capitaliza) no forno → IMOBILIZADO (não CIF)", () => {
    assert.equal(rotearDestinoRequisicao({ item: capitalizavel, centroFabril: true }), "IMOBILIZADO");
  }],
  ["material de obra (capitaliza) em área fabril → IMOBILIZADO (precede o teste de fabril/centro)", () => {
    assert.equal(rotearDestinoRequisicao({ item: capitalizavel, centroFabril: true }), "IMOBILIZADO");
    assert.equal(rotearDestinoRequisicao({ item: capitalizavel, centroFabril: false }), "IMOBILIZADO");
    assert.equal(rotearDestinoRequisicao({ item: capitalizavel }), "IMOBILIZADO");
  }],
];

let falhas = 0;
for (const [nome, fn] of casos) {
  try { fn(); console.log(`  ok  ${nome}`); }
  catch (e) { falhas++; console.error(`FAIL  ${nome}\n      ${(e as Error).message}`); }
}
console.log(`\n${casos.length - falhas}/${casos.length} casos passaram.`);
if (falhas > 0) process.exit(1);
