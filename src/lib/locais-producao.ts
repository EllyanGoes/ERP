// Nomes canônicos de locais de estoque da PRODUÇÃO. Constantes puras (client-safe):
// não importam Prisma nem libs de servidor, então servem tanto no front quanto no back.

/**
 * Local de embalagem liberada do almoxarifado p/ a produção. É o ÚNICO destino de
 * transferência ("Liberar para") válido numa Requisição de Material — qualquer outro
 * destino (WIP, depósitos) é consumo, não transferência.
 */
export const LOCAL_EMBALAGEM_PRODUCAO_NOME = "Estoque de Embalagem (Produção)";
