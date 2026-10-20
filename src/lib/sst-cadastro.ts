// Dados do cadastro que a cautela de EPI imprime. Sem eles a ficha não é
// registrada nem impressa (tela e servidor usam a mesma regra).
export type CadastroCautela = {
  cpf: string | null; rg: string | null; matricula: string | null; dataAdmissao: string | Date | null;
  setor: unknown | null; cargo: string | null; temFuncao: boolean;
};

export function camposFaltandoCautela(c: CadastroCautela): string[] {
  return [
    !c.cpf && "CPF", !c.rg && "RG", !c.matricula && "Matrícula", !c.dataAdmissao && "Admissão", !c.setor && "Setor",
    !c.temFuncao && !c.cargo && "Cargo",
  ].filter(Boolean) as string[];
}
