// Testes de prazos em dias úteis/corridos. Sem framework: rode com
//   npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/dias-uteis.test.ts
// Sai com código !=0 se algum caso falhar.
import assert from "node:assert/strict";
import { calcularVencimento, ehDiaUtil, emSuspensaoForense, feriadosAno, pascoa } from "./dias-uteis";

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Páscoa e móveis
assert.equal(iso(pascoa(2024)), "2024-03-31");
assert.equal(iso(pascoa(2025)), "2025-04-20");
assert.equal(iso(pascoa(2026)), "2026-04-05");
const f26 = feriadosAno(2026);
assert.equal(f26.get("2026-02-16"), "Carnaval (segunda)");
assert.equal(f26.get("2026-02-17"), "Carnaval (terça)");
assert.equal(f26.get("2026-04-03"), "Sexta-feira Santa");
assert.equal(f26.get("2026-06-04"), "Corpus Christi");

// Fixos nacionais, Amapá e Macapá
assert.equal(ehDiaUtil("2026-11-20"), false); // Consciência Negra (sexta)
assert.equal(ehDiaUtil("2026-03-19"), false); // São José (quinta)
assert.equal(ehDiaUtil("2026-02-04"), false); // aniversário de Macapá (quarta)
assert.equal(ehDiaUtil("2026-10-05"), false); // criação do Estado do Amapá (segunda)
assert.equal(ehDiaUtil("2026-03-18"), true);
assert.equal(ehDiaUtil("2026-03-21"), false); // sábado
assert.equal(ehDiaUtil("2026-12-08"), true); // Dia da Justiça só conta no judicial
assert.equal(ehDiaUtil("2026-12-08", { judicial: true }), false);

// Dias úteis: intimação na sexta 06/03/2026, 15 dias úteis (pula 19/03) → 30/03
assert.equal(iso(calcularVencimento("2026-03-06", 15, { uteis: true })), "2026-03-30");
// Dias corridos: vence na Sexta-feira Santa → prorroga para segunda 06/04
assert.equal(iso(calcularVencimento("2026-04-01", 2, { uteis: false })), "2026-04-06");
// Corridos: início na sexta, 1º dia da contagem é o próximo útil (segunda)
assert.equal(iso(calcularVencimento("2026-03-13", 1, { uteis: false })), "2026-03-16");
// Corridos simples, sem feriado: 30 dias de 01/06/2026 → 01/07/2026 (quarta)
assert.equal(iso(calcularVencimento("2026-06-01", 30, { uteis: false })), "2026-07-01");
// Fim de ano sem suspensão: 10 úteis de 15/12/2026 (pula Natal e fim de semana) → 30/12
assert.equal(iso(calcularVencimento("2026-12-15", 10, { uteis: true })), "2026-12-30");
// Judicial com suspensão 20/12–20/01 (CPC 220): 3 dias antes, recomeça em 21/01/2027 → 29/01/2027
assert.equal(iso(calcularVencimento("2026-12-15", 10, { uteis: true, suspensaoForense: true })), "2027-01-29");
assert.equal(emSuspensaoForense("2026-12-20"), true);
assert.equal(emSuspensaoForense("2027-01-20"), true);
assert.equal(emSuspensaoForense("2027-01-21"), false);
// Prazo zero: o próprio dia, ou o próximo útil
assert.equal(iso(calcularVencimento("2026-03-21", 0, { uteis: true })), "2026-03-23");

console.log("dias-uteis: ok");
