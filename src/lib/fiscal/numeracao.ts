// Numeração fiscal — vive NO BANCO (SerieFiscal), nunca no provedor: trocar de
// provedor não pode reiniciar/colidir numeração (estratégia híbrida do PRD).
// A reserva é atômica (UPDATE ... RETURNING) e deve rodar NA MESMA transação
// que cria a NotaFiscal — rollback devolve o número junto.
//
// Rejeição NÃO queima número (a nota reenvia com o mesmo); número descartado
// (nota EM_DIGITACAO excluída após reserva) vai para inutilização.

import { Prisma } from "@prisma/client";
import type { ModeloDocFiscal } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export class SerieFiscalError extends Error {}

/**
 * Reserva o próximo número da série de forma atômica. Chamar dentro da
 * transação que cria/envia a NotaFiscal.
 */
export async function proximoNumeroFiscal(
  tx: Tx,
  p: { empresaId: string; modelo: ModeloDocFiscal; serie: number; ambiente: string },
): Promise<number> {
  const rows = await tx.$queryRaw<{ numero: number }[]>`
    UPDATE "SerieFiscal"
       SET "proximoNumero" = "proximoNumero" + 1,
           "updatedAt" = now()
     WHERE "empresaId" = ${p.empresaId}
       AND "modelo" = ${p.modelo}::"ModeloDocFiscal"
       AND "serie" = ${p.serie}
       AND "ambiente" = ${p.ambiente}
       AND "ativo" = true
     RETURNING "proximoNumero" - 1 AS numero
  `;
  const numero = rows[0]?.numero;
  if (numero == null) {
    throw new SerieFiscalError(
      `Série ${p.serie} (${p.modelo}, ${p.ambiente.toLowerCase()}) não cadastrada ou inativa para a empresa.`,
    );
  }
  return numero;
}
