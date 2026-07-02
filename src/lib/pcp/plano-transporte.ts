// Planejamento por transporte da OP (dialog "Planejar por transporte" do Fluxo
// de Produção): quantos vagões/vagonetas e a carga (peças) de cada produto por
// vagão. Cheio = 1 produto; meiado = 2+ produtos no mesmo vagão.

export type PlanoTransporteCarga = { itemId: string; pecas: number };
export type PlanoTransporteRow = {
  veiculo: "VAGAO" | "VAGONETA";
  nVagoes: number;
  cargas: PlanoTransporteCarga[];
};

// Sanitiza o payload vindo do client: mantém só linhas completas (nº de vagões
// > 0 e ao menos uma carga com produto e peças > 0). Retorna null quando não
// sobra nada — o campo fica NULL no banco em vez de lixo.
export function sanitizarPlanoTransporte(raw: unknown): PlanoTransporteRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: PlanoTransporteRow[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || (r.veiculo !== "VAGAO" && r.veiculo !== "VAGONETA")) continue;
    const nVagoes = Math.floor(Number(r.nVagoes));
    if (!Number.isFinite(nVagoes) || nVagoes <= 0) continue;
    const cargas = (Array.isArray(r.cargas) ? (r.cargas as Record<string, unknown>[]) : [])
      .map((c) => ({ itemId: typeof c?.itemId === "string" ? c.itemId : "", pecas: Number(c?.pecas) }))
      .filter((c) => c.itemId && Number.isFinite(c.pecas) && c.pecas > 0);
    if (!cargas.length) continue;
    rows.push({ veiculo: r.veiculo, nVagoes, cargas });
  }
  return rows.length ? rows : null;
}
