/**
 * Multiempresa — Fase 1.
 *
 * Id fixo da Tramontin, criado/normalizado pela migration
 * 20260609120000_multiempresa_fase1. Enquanto a sessão ainda não carrega a
 * empresa ativa (Fase 2), toda numeração e todo registro novo pertencem à
 * Tramontin — o banco garante isso via DEFAULT 'emp_tramontin' nas colunas
 * empresaId; a Sequencia (PK composta empresaId+prefixo) recebe o id pela
 * cláusula where dos upserts de numeração.
 */
export const EMPRESA_PADRAO_ID = "emp_tramontin";
