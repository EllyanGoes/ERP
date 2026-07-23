/**
 * Wrapper CLI do import da planilha CONTAS A PAGAR — a lógica e os DADOS vivem
 * em src/lib/import-planilha-cp.ts (compartilhados com a rota admin
 * POST /api/admin/import-planilha-cp, usada para rodar EM produção).
 *
 * Uso: npx tsx scripts/import-contas-pagar-planilha.ts [--dry]
 */
import { prismaSemEscopo } from "../src/lib/prisma";
import { executarImportPlanilhaCp } from "../src/lib/import-planilha-cp";

async function main() {
  const dry = process.argv.includes("--dry");
  const dbUrl = process.env.DATABASE_URL ?? "";
  console.log(`DB: ${dbUrl.replace(/:\/\/[^@]*@/, "://***@") || "(default .env)"}`);
  console.log(dry ? "── DRY RUN (nada será gravado) ──" : "── IMPORT REAL ──");

  const r = await executarImportPlanilhaCp({ dry });
  for (const l of r.log) console.log(`  ${l}`);

  console.log("\n══ RESUMO ══");
  const fmt = (v: number | undefined) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  console.log(`Títulos criados: Tramontin ${r.criados["emp_tramontin"]} (R$ ${fmt(r.totais["emp_tramontin"])}) · Atlas ${r.criados["emp_atlas"]} (R$ ${fmt(r.totais["emp_atlas"])})`);
  console.log(`Pulados (idempotência/colisão): ${r.pulados} · Restantes: ${r.restantes}`);
  console.log("Por destino de passivo:");
  for (const [k, v] of Object.entries(r.porPassivo).sort()) console.log(`  ${k}: R$ ${fmt(v)}`);
  if (r.fornecedoresCriados.length) console.log(`Fornecedores criados: ${r.fornecedoresCriados.join(" · ")}`);
  if (r.colaboradoresSemMatch.length) console.log(`Colaboradores SEM match (foram sem vínculo → Consignados): ${r.colaboradoresSemMatch.join(", ")}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prismaSemEscopo.$disconnect());
