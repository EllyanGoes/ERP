-- Preço de referência dos exames (fatura Clínica Saúde Integrada, 02/10/2026).
ALTER TABLE "SstExameTipo" ADD COLUMN IF NOT EXISTS "preco" DECIMAL(12,2);
ALTER TABLE "SstExameTipo" ADD COLUMN IF NOT EXISTS "clinico" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SstExameTipo" t SET "preco" = v.preco
FROM (VALUES ('sstex_espiro', 75.00), ('sstex_audio', 100.00), ('sstex_rxtorax', 55.00), ('sstex_eeg', 85.00),
             ('sstex_ecg', 45.00), ('sstex_hemo', 14.08), ('sstex_glic', 6.16), ('sstex_visual', 75.00)) v(id, preco)
WHERE t.id = v.id AND t."preco" IS NULL;

-- Consulta clínica do ASO (preço do ASO) — uma por empresa que já usa exames.
INSERT INTO "SstExameTipo" ("id", "empresaId", "nome", "periodicidadeMeses", "ativo", "preco", "clinico")
SELECT 'sstex_clinico_' || substr(md5(e."empresaId"), 1, 12), e."empresaId", 'Exame clínico (ASO)', NULL, true,
       CASE WHEN e."empresaId" = 'emp_tramontin' THEN 50.00 ELSE NULL END, true
FROM (SELECT DISTINCT "empresaId" FROM "SstExameTipo") e
WHERE NOT EXISTS (SELECT 1 FROM "SstExameTipo" x WHERE x."empresaId" = e."empresaId" AND x."clinico")
ON CONFLICT DO NOTHING;
