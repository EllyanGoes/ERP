// Sequenciamento finito no forno (gargalo) — carregamento guloso (FIFO).
// O forno processa uma ordem de cada vez; cada ordem ocupa ciclos = ceil(qtd/capacidade).
// O tempo é cumulativo: o início de uma ordem é o fim da anterior.

export interface OpParaSequenciar {
  id: string;
  numero: string;
  produto: string | null;
  quantidade: number; // milheiros
}
export interface ParamsForno {
  capacidade: number; // milheiros por ciclo
  cicloHoras: number; // duração de um ciclo (h)
  horasDia: number; // horas de forno disponíveis por dia
}
export interface ItemCronograma {
  id: string;
  numero: string;
  produto: string | null;
  quantidade: number;
  ciclos: number;
  inicioHoras: number;
  fimHoras: number;
  inicioDia: number;
  fimDia: number;
}
export interface Cronograma {
  itens: ItemCronograma[];
  totalCiclos: number;
  totalHoras: number;
  totalDias: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sequenciarForno(ops: OpParaSequenciar[], p: ParamsForno): Cronograma {
  let cum = 0;
  const itens: ItemCronograma[] = [];
  for (const op of ops) {
    const ciclos = p.capacidade > 0 ? Math.ceil(op.quantidade / p.capacidade) : 0;
    const horas = ciclos * p.cicloHoras;
    const inicioHoras = cum;
    const fimHoras = cum + horas;
    cum = fimHoras;
    itens.push({
      id: op.id,
      numero: op.numero,
      produto: op.produto,
      quantidade: op.quantidade,
      ciclos,
      inicioHoras: round1(inicioHoras),
      fimHoras: round1(fimHoras),
      inicioDia: p.horasDia > 0 ? round1(inicioHoras / p.horasDia) : 0,
      fimDia: p.horasDia > 0 ? round1(fimHoras / p.horasDia) : 0,
    });
  }
  return {
    itens,
    totalCiclos: itens.reduce((a, i) => a + i.ciclos, 0),
    totalHoras: round1(cum),
    totalDias: p.horasDia > 0 ? round1(cum / p.horasDia) : 0,
  };
}
