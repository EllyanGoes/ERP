/**
 * Backfill de consistência contábil/financeira — wrapper de linha de comando do
 * motor em src/lib/backfill-consistencia.ts (a lógica vive lá; em produção o
 * mesmo motor roda pelo endpoint admin POST /api/contabilidade/backfill-consistencia,
 * ou pelo botão "Backfill de consistência" no Diário Contábil).
 *
 * Uso: npx tsx scripts/backfill-consistencia.ts [--dry]
 */
import { prismaSemEscopo } from "../src/lib/prisma";
import { executarBackfillConsistencia } from "../src/lib/backfill-consistencia";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`Backfill de consistência ${dry ? "(DRY RUN)" : ""} — banco: ${process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@")}`);
  const { log, erros } = await executarBackfillConsistencia({ dry });
  for (const l of log) console.log(l);
  if (erros.length) {
    console.log(`\n⚠ ${erros.length} erro(s) — itens pulados (rodar de novo após corrigir):`);
    for (const e of erros) console.log(`  - ${e}`);
  } else {
    console.log("\n✓ Backfill concluído sem erros.");
  }
  await prismaSemEscopo.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
