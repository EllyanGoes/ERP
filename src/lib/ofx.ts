// Parser leve de OFX (SGML, OFX 1.x) — extrai as transações (STMTTRN).
// Sem dependência externa: cobre o formato usado pelos bancos brasileiros.

export type TransacaoOFX = {
  fitId: string | null;
  data: Date;
  valor: number;       // sinalizado: + crédito (entrada), - débito (saída)
  descricao: string | null;
};

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

function parseDataOFX(raw: string | null): Date | null {
  if (!raw) return null;
  // DTPOSTED tipicamente "YYYYMMDD" ou "YYYYMMDDHHMMSS[-3:GMT]"
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function parseValorOFX(raw: string | null): number {
  if (!raw) return 0;
  // OFX usa ponto decimal; alguns exportadores usam vírgula.
  const normalizado = raw.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(normalizado);
  return isNaN(n) ? 0 : n;
}

export function parseOFX(conteudo: string): TransacaoOFX[] {
  const blocos = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];
  const transacoes: TransacaoOFX[] = [];
  for (const bloco of blocos) {
    const data = parseDataOFX(tag(bloco, "DTPOSTED"));
    if (!data) continue;
    const valor = parseValorOFX(tag(bloco, "TRNAMT"));
    const descricao = tag(bloco, "NAME") || tag(bloco, "MEMO");
    transacoes.push({
      fitId: tag(bloco, "FITID"),
      data,
      valor,
      descricao,
    });
  }
  return transacoes;
}
