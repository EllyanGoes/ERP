// Trava de roteamento de dinheiro: uma forma ELETRÔNICA (Pix, cartão,
// transferência, boleto…) não pode cair numa conta tipo CAIXA (dinheiro
// físico). Só vale quando a empresa tem ao menos um banco cadastrado — sem
// banco, o Caixa é a única conta possível. Espelha a trava do PDV/balcão e
// serve à baixa de Contas a Pagar e ao recebimento manual de Contas a Receber.

type DbRoteamento = {
  contaBancaria: {
    findFirst(args: { where: { empresaId: string; tipo: { not: "CAIXA" }; ativo: true; compensacao: false }; select: { id: true } }): Promise<{ id: string } | null>;
    findMany(args: { where: { id: { in: string[] } }; select: { id: true; tipo: true; ehTerceiro: true } }): Promise<{ id: string; tipo: string; ehTerceiro: boolean }[]>;
  };
  formaPagamento: {
    findMany(args: { select: { nome: true; tipo: true } }): Promise<{ nome: string; tipo: string }[]>;
  };
};

export type LinhaRoteamento = { forma: string | null; contaBancariaId: string };

/**
 * Retorna a primeira linha (forma informada e NÃO dinheiro) cuja conta de
 * destino é o Caixa — ou null se tudo certo / a empresa não tem banco. Linhas
 * sem forma definida não são bloqueadas.
 */
export async function formaEletronicaNoCaixa(
  db: DbRoteamento,
  empresaId: string,
  linhas: LinhaRoteamento[],
): Promise<LinhaRoteamento | null> {
  // A transitória de compensação não conta como banco de verdade — sem ela,
  // uma empresa só-caixa não deve ter a trava ativada.
  const temBanco = await db.contaBancaria.findFirst({
    where: { empresaId, tipo: { not: "CAIXA" }, ativo: true, compensacao: false },
    select: { id: true },
  });
  if (!temBanco) return null;

  const contaIds = Array.from(new Set(linhas.map((l) => l.contaBancariaId)));
  const [contasInfo, formasInfo] = await Promise.all([
    db.contaBancaria.findMany({ where: { id: { in: contaIds } }, select: { id: true, tipo: true, ehTerceiro: true } }),
    db.formaPagamento.findMany({ select: { nome: true, tipo: true } }),
  ]);
  const ehDinheiro = (forma: string | null) => {
    if (!forma) return false;
    const f = formasInfo.find((x) => x.nome === forma);
    return f ? f.tipo === "DINHEIRO" : /dinheiro|esp[ée]cie/i.test(forma);
  };
  // Conta de TERCEIROS é isenta da trava (o terceiro pode usar várias contas).
  const contaEhCaixa = (id: string) => id === "caixa-geral" || contasInfo.some((c) => c.id === id && c.tipo === "CAIXA" && !c.ehTerceiro);

  return linhas.find((l) => l.forma != null && l.forma !== "" && !ehDinheiro(l.forma) && contaEhCaixa(l.contaBancariaId)) ?? null;
}
