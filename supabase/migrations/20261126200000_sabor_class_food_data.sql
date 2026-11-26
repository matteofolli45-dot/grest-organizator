ALTER TABLE public.sabor_incontri
  ADD COLUMN IF NOT EXISTS celiaci_classe_1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS celiaci_classe_2 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS celiaci_classe_3 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS celiaci_classe_4 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS celiaci_classe_5 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranti_classe_1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranti_classe_2 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranti_classe_3 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranti_classe_4 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranti_classe_5 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intolleranze_classe_1 text,
  ADD COLUMN IF NOT EXISTS intolleranze_classe_2 text,
  ADD COLUMN IF NOT EXISTS intolleranze_classe_3 text,
  ADD COLUMN IF NOT EXISTS intolleranze_classe_4 text,
  ADD COLUMN IF NOT EXISTS intolleranze_classe_5 text;

DO $$
DECLARE
  classe integer;
  vincolo text;
BEGIN
  FOR classe IN 1..5 LOOP
    vincolo := format('sabor_classe_%s_dati_alimentari_check', classe);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = vincolo
        AND conrelid = 'public.sabor_incontri'::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.sabor_incontri ADD CONSTRAINT %I CHECK (
          celiaci_classe_%s >= 0
          AND celiaci_classe_%s <= bambini_classe_%s
          AND intolleranti_classe_%s >= 0
          AND intolleranti_classe_%s <= bambini_classe_%s
        )',
        vincolo, classe, classe, classe, classe, classe, classe
      );
    END IF;
  END LOOP;
END $$;
