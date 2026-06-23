-- Fase/estado em que o insumo da BOM é consumido (custeio por fase).
-- null = consumido na primeira etapa de produção.
ALTER TABLE "EngenhariaInsumo" ADD COLUMN IF NOT EXISTS "estadoConsumo" "EstadoWIP";
