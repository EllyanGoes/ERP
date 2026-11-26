// Testes do cofre de credenciais (AES-256-GCM). Sem framework: rode com
//   npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/processos-cofre.test.ts
// Sai com código !=0 se algum caso falhar.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chaveCofre, cifrar, decifrar, mascarar } from "./processos-cofre";

const chave = randomBytes(32);
const outra = randomBytes(32);

// Cifra e decifra (inclui acentos/emoji e vazio)
for (const t of ["s3nh@F0rte!", "José — çãõ 🔐", "", "a".repeat(5000)]) {
  assert.equal(decifrar(cifrar(t, chave), chave), t);
}

// IV aleatório: o mesmo texto gera cifras diferentes (e IVs diferentes)
const a = cifrar("mesma senha", chave), b = cifrar("mesma senha", chave);
assert.notEqual(a, b);
assert.notEqual(a.split(".")[1], b.split(".")[1]);
assert.equal(Buffer.from(a.split(".")[1], "base64").length, 12);
assert.equal(Buffer.from(a.split(".")[2], "base64").length, 16);
assert.ok(a.startsWith("v1."));
assert.ok(!a.includes("mesma senha"));

// Tag adulterada falha
const [v, iv, tag, ct] = a.split(".");
const tagRuim = Buffer.from(tag, "base64"); tagRuim[0] ^= 0xff;
assert.throws(() => decifrar([v, iv, tagRuim.toString("base64"), ct].join("."), chave));
// Cifra adulterada falha
const ctRuim = Buffer.from(ct, "base64"); ctRuim[0] ^= 0x01;
assert.throws(() => decifrar([v, iv, tag, ctRuim.toString("base64")].join("."), chave));
// IV adulterado falha
const ivRuim = Buffer.from(iv, "base64"); ivRuim[0] ^= 0x01;
assert.throws(() => decifrar([v, ivRuim.toString("base64"), tag, ct].join("."), chave));
// Chave errada falha
assert.throws(() => decifrar(a, outra));
// Formato inválido / sem chave
assert.throws(() => decifrar("lixo", chave));
assert.throws(() => cifrar("x", null));
assert.throws(() => decifrar(a, null));

// Leitura da chave pela env
assert.equal(chaveCofre(undefined), null);
assert.equal(chaveCofre(""), null);
assert.equal(chaveCofre(randomBytes(16).toString("base64")), null); // 16 bytes não serve
assert.equal(chaveCofre(chave.toString("base64"))?.equals(chave), true);

// Máscara nunca devolve o valor inteiro
assert.equal(mascarar("12345678900"), "12•••••00");
assert.ok(!mascarar("usuario@empresa.com").includes("usuario@empresa"));
assert.equal(mascarar("ab"), "••••");

console.log("processos-cofre: ok");
